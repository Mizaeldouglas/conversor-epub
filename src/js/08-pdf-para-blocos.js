/* ---------- etapa 1: PDF -> blocos (texto + imagens) ---------- */
const CELL = "\uE00C";   // separa as células de uma linha de tabela (só durante a leitura)
const BUL_RE = /^[•▪◦‣●○■□▸►✓✔➢➤]\s*\S/;

// sumário interno do PDF (marcadores): título, página e nível
async function readOutline(pdf){
  const out = [];
  try {
    const walk = async (items, depth) => {
      for (const it of items || []) {
        try {
          let dest = it.dest;
          if (typeof dest === "string") dest = await pdf.getDestination(dest);
          const page = dest && dest[0] != null ? (typeof dest[0] === "object" ? await pdf.getPageIndex(dest[0]) + 1 : dest[0] + 1) : 0;
          const kids = !!(it.items && it.items.length);
          if (page && it.title && it.title.trim()) out.push({ title: it.title.trim(), page, depth, kids });
          if (kids && depth < 2) await walk(it.items, depth + 1);
        } catch {}
      }
    };
    await walk(await pdf.getOutline(), 0);
  } catch {}
  return out;
}
// usa o sumário do PDF para marcar os títulos: vale mais que o tamanho da fonte
function applyOutline(blocks, outline){
  if (outline.length < 2) return 0;
  const norm = t => stripPg(stripNotes(t)).toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]+/gu, "");
  const hits = new Map();
  for (const o of outline) {
    const t = norm(o.title); if (t.length < 2) continue;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (typeof b.text !== "string" || !/^(h1|h2|p)$/.test(b.type) || b.page == null || hits.has(i) || b.text.length > 200) continue;
      if (o.page < b.page || o.page > (b.last ?? b.page)) continue;
      const n = norm(b.text); if (!n) continue;
      const close = Math.min(n.length, t.length) / Math.max(n.length, t.length) >= 0.5;
      if (n === t || (close && (t.endsWith(n) || t.startsWith(n) || n.endsWith(t) || n.startsWith(t)))) { hits.set(i, o); break; }
    }
  }
  if (hits.size < Math.max(2, outline.length * 0.5)) return 0;
  const nested = [...hits.values()].some(o => o.depth === 0 && o.kids);
  blocks.forEach((b, i) => {
    const o = hits.get(i);
    if (o) { b.type = o.depth === 0 || (nested && o.depth === 1) ? "h1" : "h2"; delete b.demote; b.part = nested && o.depth === 0 && o.kids; }
    else if (b.type === "h1") b.type = "h2";
  });
  return hits.size;
}
// texto em duas colunas: acha o corredor vazio no meio da página
function findGutter(items, pageW){
  const its = items.filter(i => i.str && i.str.trim() && !i.dropCap);
  if (its.length < 30) return null;
  const BIN = 2, n = Math.ceil(pageW / BIN) + 1, cover = new Uint16Array(n), ys = new Set();
  for (const i of its) {
    const x = i.transform[4], w = i.width || 0;
    for (let k = Math.max(0, Math.floor(x / BIN)), e = Math.min(n - 1, Math.floor((x + w) / BIN)); k <= e; k++) cover[k]++;
    ys.add(Math.round(i.transform[5]));
  }
  const thr = Math.max(2, ys.size * 0.08);
  let best = null, run = 0;
  for (let k = Math.floor(n * 0.3); k <= Math.ceil(n * 0.7); k++) {
    if (cover[k] <= thr) { run++; if (!best || run > best.len) best = { end: k, len: run }; } else run = 0;
  }
  if (!best || best.len * BIN < 8) return null;
  const gx = (best.end - best.len / 2 + 0.5) * BIN;
  const stat = side => {
    const lines = new Map();
    for (const i of its) { const c = i.transform[4] + (i.width || 0) / 2; if ((c < gx) !== side) continue; const k = Math.round(i.transform[5]); lines.set(k, (lines.get(k) || 0) + i.str.replace(/\s/g, "").length); }
    const v = [...lines.values()], chars = v.reduce((a, b) => a + b, 0);
    return { n: v.length, avg: chars / (v.length || 1), chars };
  };
  const a = stat(true), b = stat(false);
  if (a.n < 6 || b.n < 6 || a.avg < 15 || b.avg < 15 || Math.min(a.chars, b.chars) < (a.chars + b.chars) * 0.25) return null;
  return gx;
}
// linhas seguidas com células alinhadas viram uma tabela
function findTables(pageItems, p, pageH){
  const tol = 9;
  for (let i = 0; i < pageItems.length; i++) {
    const a = pageItems[i];
    if (a.kind !== "line" || !a.cells) continue;
    let j = i;
    while (j + 1 < pageItems.length && pageItems[j + 1].kind === "line" && pageItems[j + 1].cells && pageItems[j + 1].col === a.col
      && pageItems[j].y - pageItems[j + 1].y > 0 && pageItems[j].y - pageItems[j + 1].y < a.size * 3.2) j++;
    if (j - i + 1 < 3) continue;
    const run = pageItems.slice(i, j + 1), grid = [];
    for (const l of run) for (const x of l.cellX) if (!grid.some(g => Math.abs(g - x) < tol)) grid.push(x);
    grid.sort((x, y) => x - y);
    if (grid.length < 2 || grid.length > 8 || run.some(l => l.size > a.size * 1.25)) { i = j; continue; }
    const rows = run.map(l => { const r = grid.map(() => ""); l.cells.forEach((t, k) => { const g = grid.findIndex(g => Math.abs(g - l.cellX[k]) < tol); r[g] = r[g] ? r[g] + " " + t : t; }); return r; });
    pageItems.splice(i, run.length, { page: p, kind: "table", y: a.y, col: a.col, rows, pageH });
  }
}
async function pdfToBlocks(buf, mode, onProgress, lang, opts = {}){
  const pdf = await pdfjsLib.getDocument({ data: buf, password: opts.password || undefined, isOffscreenCanvasSupported: false, fontExtraProperties: true }).promise;
  let metaTitle = "", metaAuthor = "";
  try { const m = await pdf.getMetadata(); metaTitle = (m.info && m.info.Title || "").trim(); metaAuthor = String(m.info && m.info.Author || "").trim(); } catch {}
  let pageLabels = null;
  try { pageLabels = await pdf.getPageLabels(); } catch {}
  const labelOf = p => ((pageLabels && pageLabels[p - 1] || "").trim() || String(p)).slice(0, 14);
  const items = [], ref = []; let realPages = 0, textPages = 0, hiddenChars = 0;
  const liga = newLigatureState();
  const fontStyle = new Map(), fontMono = new Map();
  let ocrW = null, ocrPages = 0, ocrError = null, imagePages = 0, columnPages = 0;
  if (opts.words === undefined && /^pt/i.test(lang || "")) opts.words = await loadWordList().catch(() => null);
  let cover = null;
  for (let p = 1; p <= pdf.numPages; p++) {
    if (opts.signal && opts.signal.aborted) { await pdf.destroy(); if (ocrW) ocrW.terminate().catch(() => {}); throw abortErr(); }
    onProgress(p, pdf.numPages);
    await tick();   // deixa a tela respirar entre as páginas
    const page = await pdf.getPage(p);
    // capa: a primeira página desenhada como imagem
    if (p === 1 && opts.cover) { try { cover = await renderPage(page); } catch (e) { console.warn("capa", e); } }
    if (mode !== "auto") {
      const r = await renderPage(page);
      if (r) items.push({ page: p, kind: "pageimg", ...r });
      page.cleanup(); continue;
    }
    const tc = await page.getTextContent({ disableNormalization: true });
    let links = [];
    try {
      for (const a of await page.getAnnotations()) {
        if (a.subtype !== "Link" || !a.rect) continue;
        if (a.url && /^(https?:|mailto:)/i.test(a.url)) links.push({ r: a.rect, url: a.url });
        else if (a.dest) {   // link para outra página do próprio PDF
          try {
            const d = typeof a.dest === "string" ? await pdf.getDestination(a.dest) : a.dest;
            const n = d && d[0] != null ? (typeof d[0] === "object" ? await pdf.getPageIndex(d[0]) + 1 : d[0] + 1) : 0;
            if (n && n !== p) links.push({ r: a.rect, url: "pg:" + labelOf(n) });
          } catch {}
        }
      }
    } catch {}
    const linkAt = (x, y) => { for (const l of links) if (x >= l.r[0] - 1 && x <= l.r[2] + 1 && y >= l.r[1] - 2 && y <= l.r[3] + 2) return l.url; return ""; };
    let ol = null, gs = { chars: [], keys: [], spaceBefore: [], real: false };
    try {
      ol = await page.getOperatorList();
      try { await ligaturePass(ol, page, liga); } catch (e) { console.warn("ligaduras p." + p, e); }
      gs = glyphStream(ol, liga);
    } catch (e) { console.warn("operações p." + p, e); }
    if (!gs.real) for (const it of tc.items) {
      const bad = liga.fonts.get(it.fontName);
      it.str = normLig(it.str || "");
      if (bad && bad.bad.size) it.str = [...it.str].map(c => bad.bad.get(c) || c).join("");
    }
    let pageRef;
    if (gs.real) {
      const hint = new Uint8Array(gs.keys.length);
      respaceItems(tc.items, gs, hint);
      if (splitGlued(gs, hint, opts.words)) respaceItems(tc.items, gs);
      pageRef = pageRefWords(tc.items, gs, p);
    }
    else pageRef = pageRefWords(tc.items, gs, p);   // sem espaços no PDF: usa a posição das letras
    // itálico/negrito pelo nome da fonte (ex.: "Minion-It", "Garamond-Bold")
    const styleOfFont = name => {
      if (!name) return 0;
      if (fontStyle.has(name)) return fontStyle.get(name);
      let st = 0;
      try {
        const f = page.commonObjs.has(name) ? page.commonObjs.get(name) : null;
        const n = String((f && f.name) || "").replace(/^[A-Z]{6}\+/, "");
        if (/italic|oblique|kursiv|inclined/i.test(n) || /[-_,]\w*?(It|Ita|Obl)$/.test(n) || (f && f.italic)) st |= 1;
        if (/bold|black|heavy|semibold|demibold/i.test(n) || /[-_,]\w*?(Bd|Sb)$/.test(n) || (f && f.bold)) st |= 2;
        if (f) fontStyle.set(name, st);
      } catch {}
      return st;
    };
    // fonte de largura fixa (código): Courier, Consolas, "…Mono", "…Code"
    const monoOfFont = name => {
      if (!name) return false;
      if (fontMono.has(name)) return fontMono.get(name);
      let m = false;
      try {
        const f = page.commonObjs.has(name) ? page.commonObjs.get(name) : null;
        const n = String((f && f.name) || "").replace(/^[A-Z]{6}\+/, "");
        m = /mono|courier|consol|menlo|inconsolata|\bcode|code\b|sourcecode|firacode|lucidaconsole|andale/i.test(n) || !!(f && f.isMonospace);
        if (f) fontMono.set(name, m);
      } catch {}
      return m;
    };
    // letra capitular: letra grande no começo do parágrafo, desenhada à parte do resto da palavra
    const caps = [];
    {
      const sz = it => Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      const szs = [];
      for (const it of tc.items) { const t = (it.str || "").trim(); if (t.length < 2) continue; for (let i = 0; i < Math.min(t.length, 40); i++) szs.push(sz(it)); }
      const pb = median(szs);
      if (pb) for (const it of tc.items) {
        const t = (it.str || "").trim(), s = sz(it);
        if (s < pb * 1.9 || !/^["“«]?\p{Lu}$/u.test(t)) continue;
        const cap = { ch: t, x: it.transform[4], y: it.transform[5], size: s, w: it.width || s * 0.6 };
        // só é capitular se houver texto normal à direita, na altura da letra
        const side = tc.items.some(o => o !== it && (o.str || "").trim() && sz(o) < s * 0.6 && o.transform[4] > cap.x + cap.w * 0.5
          && o.transform[5] >= cap.y - s * 0.15 && o.transform[5] <= cap.y + s * 1.05);
        if (side) { it.dropCap = true; caps.push(cap); }
      }
    }
    const pl = [];
    const gutter = findGutter(tc.items, page.getViewport({ scale: 1 }).width);
    for (const it of tc.items) {
      if (!it.str || it.dropCap) continue;
      const blank = !it.str.trim();
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      const x = it.transform[4], y = it.transform[5];
      // tamanhos muito diferentes (número gigante do capítulo x título): só junta se estiverem na mesma base
      const iw = it.width || 0;
      const col = gutter == null ? 0 : (x < gutter - 4 && x + iw > gutter + 4) ? -1 : x + iw / 2 < gutter ? 0 : 1;
      let ln = pl.find(l => l.col === col && Math.abs(l.y - y) < lineTol(size, l.size));
      if (!ln) { if (blank) continue; ln = { y, size, items: [], col }; pl.push(ln); }
      if (!blank) ln.size = Math.max(ln.size, size);
      ln.items.push({ x, y, w: it.width || 0, str: blank ? " " : it.str, size, blank, firstIdx: it.firstIdx ?? -1, lastIdx: it.lastIdx ?? -1, st: blank ? 0 : styleOfFont(it.fontName), mono: !blank && monoOfFont(it.fontName),
        lk: blank || !links.length ? "" : linkAt(x + iw / 2, y + size * 0.3) });
    }
    const pageItems = []; let pageChars = 0;
    const pageH = page.getViewport({ scale: 1 }).height;
    for (const ln of pl) {
      ln.items.sort((a, b) => a.x - b.x);
      let text = "", end = null, chars = 0, sizeSum = 0, prevIt = null, curSt = 0, curLk = "";
      const cellX = [];
      // linha de base: o trecho de letra maior da linha (para achar números sobrescritos de nota)
      const base = ln.items.filter(i => !i.blank).reduce((a, b) => (!a || b.size > a.size ? b : a), null);
      for (const it of ln.items) {
        if (it.blank) { if (!gs.real && text && !/\s$/.test(text)) text += " "; continue; }
        if (text && !/\s$/.test(text) && !/^\s/.test(it.str)) {
          let sp;
          if (gs.real && prevIt && prevIt.lastIdx >= 0 && it.firstIdx > prevIt.lastIdx && it.firstIdx - prevIt.lastIdx <= 4) sp = streamSpace(gs, prevIt.lastIdx, it.firstIdx);
          // trechos desenhados fora de ordem (ex.: pontuação em outra fonte): vale o espaço real do PDF antes da palavra
          else sp = (gs.real && it.firstIdx >= 0 && !!gs.spaceBefore[it.firstIdx]) || (end !== null && it.x - end > it.size * (gs.real ? 0.6 : 0.25));
          if (sp) text += " ";
          // vão bem largo entre trechos da mesma linha: outra célula (tabela)
          if (end !== null && it.x - end > it.size * 1.25) { text = styleSwitch(text, curSt, 0) + (curLk ? LK_OFF : "") + CELL; curSt = 0; curLk = ""; cellX.push(it.x); }
        }
        if (!cellX.length) cellX.push(it.x);
        const sup = opts.notes && base && it !== base && it.size < base.size * 0.8 && it.y - base.y > base.size * 0.15
          && /^\s*([0-9]{1,3}|[*†‡])\s*$/.test(it.str);
        const lead = /^\s*/.exec(it.str)[0];
        if (lead) text += lead;
        if (it.lk !== curLk) { text = styleSwitch(text, curSt, 0) + (curLk ? LK_OFF : "") + (it.lk ? LK_ON + it.lk + LK_MID : ""); curSt = 0; curLk = it.lk; }
        const want = sup ? curSt : it.st;
        if (want !== curSt) { text = styleSwitch(text, curSt, want); curSt = want; }
        text += sup ? "\uE002" + it.str.trim() + "\uE003" : it.str.slice(lead.length); end = it.x + it.w; prevIt = it;
        const n = it.str.replace(/\s/g, "").length; chars += n; sizeSum += n * it.size;
      }
      if (curSt) text = styleSwitch(text, curSt, 0);
      if (curLk) text += LK_OFF;
      text = text.replace(/\s+/g, " ").trim().replace(/\uE004(\s*)\uE005|\uE006(\s*)\uE007/g, "$1$2")
        .replace(/[\u2010\u2011]/g, "-").replace(/\u00AD(?=[\uE004-\uE007\uE00B]*$)/, "-").replace(/\u00AD/g, "");
      let cells = null;
      if (text.includes(CELL)) { cells = text.split(CELL).map(t => t.trim()); if (cells.some(t => !plainOf(t).trim())) cells = null; text = text.replace(/\s*\uE00C\s*/g, " "); }
      if (!plainOf(text).trim()) continue;
      pageChars += chars;
      const firstReal = ln.items.find(i => !i.blank) || ln.items[0];
      // linha toda em fonte de largura fixa: código; o recuo é medido pela largura de uma letra
      const realIts = ln.items.filter(i => !i.blank && i.str.trim());
      const mono = realIts.length > 0 && realIts.every(i => i.mono);
      const cw = mono ? Math.max(1, realIts.reduce((a, i) => a + i.w, 0) / Math.max(1, realIts.reduce((a, i) => a + i.str.length, 0))) : 0;
      if (mono) cells = null;
      // linha de sumário do próprio PDF: a linha inteira é um link para outra página do livro,
      // ou termina em pontinhos e número de página ("Capítulo 1 ........ 21")
      const lks = new Set(realIts.map(i => i.lk));
      const tocUrl = lks.size === 1 && /^pg:/.test(realIts[0].lk) ? realIts[0].lk : "";
      const toc = !!tocUrl || (!mono && /\S\s*(?:\.\s?){4,}\s*\d{1,4}\s*$/.test(plainOf(text)));
      if (toc) cells = null;
      pageItems.push({ mono, cw, toc, tocUrl, page: p, kind: "line", y: ln.y, x0: firstReal.x, x1: end, size: chars ? sizeSum / chars : ln.size, text, plain: plainOf(text), chars, pageH, col: ln.col,
        cells: cells && cells.length === cellX.length ? cells : null, cellX });
    }
    // capitular volta para o começo da primeira linha do parágrafo ("M" + "ira tinha" = "Mira tinha")
    for (const cap of caps) {
      const near = pageItems.filter(l => l.kind === "line" && l.x0 > cap.x + cap.w * 0.5 && l.y >= cap.y - cap.size * 0.15 && l.y <= cap.y + cap.size * 1.05);
      if (!near.length) continue;
      const first = near.reduce((a, b) => b.y > a.y ? b : a);
      const word = (/^[\uE004-\uE007]*(\p{L}*)/u.exec(first.text) || ["", ""])[1];
      const letter = cap.ch.replace(/^["“«]/, "");
      let space = false;
      if (opts.words && word) space = !opts.words.has((letter + word).toLowerCase()) && /^[aeoàéáóê]$/i.test(letter) && opts.words.has(word.toLowerCase());
      first.text = cap.ch + (space ? " " : "") + first.text; first.plain = plainOf(first.text); first.chars++;
      // na referência a letra pode ter ficado grudada ou separada: deixa igual ao texto
      if (word) { if (space) refReplace(pageRef, p, cap.ch + word, cap.ch + " " + word); else refReplace(pageRef, p, cap.ch + " " + word, cap.ch + word); }
      for (const l of near) l.x0 = Math.min(l.x0, cap.x);
      pageChars++;
    }
    const vp = page.getViewport({ scale: 1 });
    const pageArea = vp.width * vp.height;
    let imgs = [], opCount = 0;
    try { if (ol) ({ imgs, opCount } = pageImages(ol)); } catch (e) { console.warn("imagens p." + p, e); }

    if (pageChars < 25) { // página escaneada ou só ilustração
      // OCR: tenta ler o texto da página desenhada
      if (opts.ocr && !ocrError && (imgs.length || opCount > 30)) {
        try {
          if (!ocrW) { onProgress(p, pdf.numPages, "preparando o OCR"); ocrW = await ocrWorker(lang); }
          onProgress(p, pdf.numPages, "OCR");
          const r = await ocrPage(ocrW, page, p);
          if (r.chars >= 40) { items.push(...r.lines); ref.push(...r.ref); ocrPages++; textPages++; realPages++; page.cleanup(); continue; }
        } catch (e) { console.warn("OCR p." + p, e); ocrError = (e && e.message) || String(e); }
      }
      if (imgs.length || opCount > 30) { const r = await renderPage(page); if (r) { items.push({ page: p, kind: "pageimg", ...r }); if (imgs.length) imagePages++; } }
      page.cleanup(); continue;
    }
    ref.push(...pageRef); hiddenChars += pageRef.hidden; textPages++; if (gs.real) realPages++;
    for (const im of imgs) {
      if (im.bw < 30 || im.bh < 30) continue;            // enfeites pequenos
      if (im.bw * im.bh > pageArea * 0.8) continue;      // fundo / scan por trás de texto OCR
      const data = im.inline || (im.ref ? await getObj(page, im.ref) : null);
      let r = null; try { r = await imgToJpeg(data); } catch (e) { console.warn(e); }
      if (r && r.w >= 40 && r.h >= 40) pageItems.push({ page: p, kind: "img", y: im.top, key: r.w + "x" + r.h + ":" + r.blob.size, frac: im.bw * im.bh / pageArea, ...r });
    }
    pageItems.sort((a, b) => b.y - a.y);
    if (gutter != null) {   // lê a coluna da esquerda inteira antes da direita; linhas de página inteira separam os trechos
      const full = pageItems.filter(i => i.kind !== "line" || i.col === -1), out = [];
      const zone = (hi, lo) => { for (const c of [0, 1]) out.push(...pageItems.filter(i => i.kind === "line" && i.col === c && i.y < hi && i.y > lo)); };
      let top = Infinity;
      for (const f of full) { zone(top, f.y); out.push(f); top = f.y; }
      zone(top, -Infinity);
      pageItems.splice(0, pageItems.length, ...out); columnPages++;
    }
    findTables(pageItems, p, pageH);
    items.push(...pageItems);
    page.cleanup();
  }
  const numPages = pdf.numPages;
  const labels = Array.from({ length: pdf.numPages }, (_, i) => labelOf(i + 1));
  const outline = mode === "auto" ? await readOutline(pdf) : [];
  await pdf.destroy();
  if (ocrW) ocrW.terminate().catch(() => {});
  if (!items.length) throw Object.assign(new Error("Não encontrei texto nem imagens neste PDF."), { name: "EmptyPdf" });

  await tick();
  // imagens repetidas em muitas páginas (logo, cabeçalho) saem
  const seen = {};
  for (const it of items) if (it.kind === "img") (seen[it.key] ||= new Set()).add(it.page);
  let filtered = items.filter(it => it.kind !== "img" || it.frac > 0.12 || !(seen[it.key].size >= 3 && seen[it.key].size >= numPages * 0.3));

  let lines = filtered.filter(i => i.kind === "line");
  const sizes = []; for (const l of lines) for (let i = 0; i < Math.min(l.chars, 200); i++) sizes.push(Math.round(l.size * 10) / 10);
  const body = median(sizes) || 10;

  // cabeçalhos e rodapés repetidos (nome do livro, do capítulo): saem do EPUB e da conferência
  const removed = new Set(); let headersRemoved = 0;
  if (opts.headers) {
    const zone = l => l.pageH && l.y > l.pageH * 0.88 ? "t" : l.pageH && l.y < l.pageH * 0.12 ? "b" : null;
    const keyL = l => zone(l) + "|" + stripNotes(l.plain).toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
    // linhas que começam com o número de uma nota chamada na mesma página são notas, não rodapé
    const pageRefs = new Map();
    for (const l of lines) for (const m of l.text.matchAll(NOTE_RE)) { if (!pageRefs.has(l.page)) pageRefs.set(l.page, new Set()); pageRefs.get(l.page).add(m[1]); }
    const noteLike = l => { const m = /^(?:\uE002([^\uE003|]+)\uE003|([0-9]{1,3}|[*†‡]))[\s.)]*\S/.exec(l.plain); return !!(m && pageRefs.get(l.page)?.has(m[1] || m[2])); };
    const pagesBy = new Map();
    for (const l of lines) {
      if (!zone(l) || l.plain.length > 120 || PAGE_NUM_RE.test(l.plain) || noteLike(l)) continue;
      const k = keyL(l); if (!pagesBy.has(k)) pagesBy.set(k, new Set()); pagesBy.get(k).add(l.page);
    }
    for (const l of lines) {
      if (!zone(l) || l.plain.length > 120 || PAGE_NUM_RE.test(l.plain) || noteLike(l)) continue;
      if (pagesBy.get(keyL(l)).size >= 3) { removed.add(l); headersRemoved++; refReplace(ref, l.page, l.text, ""); }
    }
  }

  // notas de rodapé: número sobrescrito no texto + nota com o mesmo número no pé da mesma página
  const notesList = []; let noteSeq = 0;
  if (opts.notes) {
    const byPage = new Map();
    for (const l of lines) { if (removed.has(l)) continue; if (!byPage.has(l.page)) byPage.set(l.page, []); byPage.get(l.page).push(l); }
    for (const [p, pls] of byPage) {
      const refs = new Set();
      for (const l of pls) for (const m of l.text.matchAll(NOTE_RE)) refs.add(m[1]);
      if (!refs.size) continue;
      const zoneLines = [];
      for (const l of [...pls].sort((a, b) => a.y - b.y)) {        // de baixo para cima
        if (PAGE_NUM_RE.test(l.plain)) continue;
        if (l.pageH && l.y < l.pageH * 0.45 && l.size <= body * 0.92) zoneLines.push(l); else break;
      }
      zoneLines.reverse();
      const notes = []; let cur = null;
      for (const l of zoneLines) {
        const m = /^(?:\uE002([^\uE003|]+)\uE003\s*|([0-9]{1,3}|[*†‡])[\s.)]+)(.+)$/.exec(l.plain);
        const label = m && (m[1] || m[2]);
        if (label && refs.has(label) && !notes.some(n => n.label === label)) { cur = { label, lines: [l], text: stripNotes(m[3]) }; notes.push(cur); }
        else if (cur) { cur.lines.push(l); cur.text = joinLine(cur.text, stripNotes(l.plain)); }
      }
      for (const n of notes) {
        n.id = ++noteSeq; n.page = p; notesList.push(n);
        for (const l of n.lines) { removed.add(l); refReplace(ref, p, l.text, ""); }
        const tag = "\uE002" + n.label + "\uE003";
        const host = pls.find(l => !n.lines.includes(l) && l.text.includes(tag));
        if (host) { host.text = host.text.replace(tag, "\uE002" + n.id + "|" + n.label + "\uE003"); host.plain = plainOf(host.text); }
      }
    }
  }
  if (removed.size) { filtered = filtered.filter(l => !removed.has(l)); lines = lines.filter(l => !removed.has(l)); }

  await tick();
  const geo = {}, gk = l => l.page + ":" + (l.col > 0 ? 1 : 0);
  for (const l of lines) {
    if (Math.abs(l.size - body) > body * 0.08) continue;
    const g = (geo[gk(l)] ||= { lefts: [], rights: [], prevY: null, gaps: [] });
    g.lefts.push(Math.round(l.x0)); g.rights.push(l.x1);
    if (g.prevY !== null) { const d = g.prevY - l.y; if (d > 0 && d < body * 3) g.gaps.push(d); }
    g.prevY = l.y;
  }
  const lineGap = median([].concat(...Object.values(geo).map(g => g.gaps))) || body * 1.3;
  for (const k in geo) { const g = geo[k]; g.left = Math.min(...g.lefts); g.right = Math.max(...g.rights); }

  // palavras com hífen que o próprio livro usa ("disse-me", "guarda-chuva") mantêm o hífen na quebra de linha
  const hyphenWords = new Set();
  for (const l of lines) for (const m of l.text.matchAll(/\p{L}+-\p{L}+/gu)) hyphenWords.add(m[0].toLowerCase());
  const keepHyphen = (head, tail) => hyphenWords.has((head + "-" + tail).toLowerCase())
    || /^(lhe|lhes)$/i.test(tail) || (/^(lo|la|los|las)$/i.test(tail) && /[áéêíóôú]$/i.test(head));

  // títulos do sumário do PDF: a linha vira título mesmo na fonte do corpo
  if (outline.length >= 2) {
    const norm = t => stripNotes(t).toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]+/gu, "");
    const byPage = new Map();
    for (const l of lines) { if (!byPage.has(l.page)) byPage.set(l.page, []); byPage.get(l.page).push(l); }
    for (const o of outline) {
      const t = norm(o.title), pls = byPage.get(o.page) || [];
      if (t.length < 2) continue;
      for (let i = 0; i < pls.length; i++) {
        let acc = "", k = i;
        while (k < pls.length && !pls[k].olLevel && norm(pls[k].plain) && t.startsWith(acc + norm(pls[k].plain))) { acc += norm(pls[k].plain); k++; if (acc === t) break; }
        if (acc === t) { for (let j = i; j < k; j++) pls[j].olLevel = o.depth === 0 ? 1 : 2; break; }
      }
    }
  }
  // versos: três ou mais linhas curtas e recuadas, bem mais estreitas que o texto
  {
    let run = [], vid = 0;
    // margens do livro inteiro: numa página só de poema, a margem da própria página não diz nada
    const bodyLines = lines.filter(l => Math.abs(l.size - body) < body * 0.12);
    const pct = (arr, q) => { const v = arr.slice().sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * q))] : 0; };
    const bookRight = pct(bodyLines.map(l => l.x1), 0.9), bookLeft = pct(bodyLines.map(l => l.x0), 0.1);
    const flush = () => {
      if (run.length >= 3) {
        // mais estreito do que uma citação recuada dos dois lados seria: as linhas acabam cedo de propósito
        const g = geo[gk(run[0])], maxR = Math.max(...run.map(l => l.x1)), minL = Math.min(...run.map(l => l.x0));
        // prosa quebra a linha onde acaba o espaço; verso quebra na pontuação ou abre cada linha com maiúscula
        const frac = re => run.filter(l => re.test(l.plain.trim())).length / run.length;
        const versey = frac(/[,;.!?:…—–]["”»')]?$/u) >= 0.6 || frac(/^["“«(]?\p{Lu}/u) >= 0.75;
        const clean = run.every(l => !l.olLevel && !/^[—–-]\s/.test(l.plain));
        const onPage = g && maxR < g.right - (minL - g.left) - body * 3 && run.every(l => l.x0 >= g.left + body * 1.2);
        // poema sozinho na página: as linhas acabam bem antes da margem direita do livro e começam recuadas em relação a ela
        const inBook = bookRight > 0 && maxR < bookRight - body * 6 && minL >= bookLeft + body * 0.8 && run.length >= 4;
        if (versey && clean && (onPage || inBook)) { vid++; for (const l of run) l.verse = vid; }
        // lista cujo marcador o PDF desenhou como figura (o Chrome faz isso): linhas recuadas, alinhadas,
        // de tamanhos variados e sem pontuação no fim viram itens
        else if (g && clean && run.every(l => Math.abs(l.x0 - run[0].x0) < 2 && l.x0 >= g.left + body * 0.9 && l.x1 < g.right - body * 2)
          && run.filter(l => l.x1 < maxR - body * 3).length >= (run.length - 1) * 0.5
          && run.slice(0, -1).every(l => !/[.!?:;]["”»')]?$/u.test(l.plain.trim()))) for (const l of run) l.bulletItem = true;
      }
      run = [];
    };
    for (const l of filtered) {
      const ok = l.kind === "line" && !l.mono && Math.abs(l.size - body) < body * 0.12 && !PAGE_NUM_RE.test(l.plain) && !BUL_RE.test(l.plain);
      const last = run[run.length - 1];
      if (!ok || (last && (last.page !== l.page || last.col !== l.col || last.y - l.y <= 0 || last.y - l.y > lineGap * 1.5))) flush();
      if (ok) run.push(l);
    }
    flush();
  }
  await tick();
  const blocks = [];
  let cur = null, prev = null, lastPage = 0;
  const terminalRe = /[.!?:;»”"')\]]$/;
  const terminal = { test: t => terminalRe.test(plainOf(t.replace(/\uE002[^\uE003]*\uE003/g, "")).trimEnd()) };   // chamada de nota no fim não conta
  for (const l of filtered) {
    if (l.kind === "table") {
      const rows = l.rows.map(r => [...r]);
      if (l.page !== lastPage) { rows[0][0] = pgMark(labelOf(l.page)) + rows[0][0]; lastPage = l.page; }
      blocks.push({ type: "table", rows, page: l.page, last: l.page });
      cur = null; prev = null; continue;
    }
    if (l.kind !== "line") {
      if (l.page !== lastPage) { blocks.push({ type: "pg", label: labelOf(l.page) }); lastPage = l.page; }
      blocks.push({ type: "img", blob: l.blob, w: l.w, h: l.h, full: l.kind === "pageimg" });
      cur = null; prev = null; continue;
    }
    if (PAGE_NUM_RE.test(l.plain) && l.size < body * 1.3) continue;   // número grande é o número do capítulo, não da página
    let mark = "";
    if (l.page !== lastPage) { mark = pgMark(labelOf(l.page)); lastPage = l.page; }
    const gg = geo[gk(l)] || { left: l.x0, right: l.x1 };
    // sumário do PDF: cada entrada na sua linha; uma entrada que quebrou em duas linhas (mesmo link) continua junta
    if (l.toc && l.size < body * 1.4) {
      // só é a mesma entrada se a linha de cima foi até a margem direita (quebrou por falta de espaço)
      const pr = prev && geo[gk(prev)];
      const same = cur && cur.type === "toc" && prev && prev.page === l.page && l.tocUrl && cur.tocUrl === l.tocUrl && l.x0 > cur.x0 - 2 && pr && prev.x1 >= pr.right - body * 2.5;
      if (same) {
        // um link só para a entrada inteira, e a palavra partida no fim da linha volta a ser uma
        let a = cur.text, b = l.text;
        const open = LK_ON + l.tocUrl + LK_MID;
        if (a.endsWith(LK_OFF) && b.startsWith(open)) { a = a.slice(0, -1); b = b.slice(open.length); }
        const head = (plainOf(a).match(/(\p{L}+)-$/u) || ["", ""])[1], tail = (plainOf(b).match(/^\p{Ll}+/u) || [""])[0];
        cur.text = head && tail ? (keepHyphen(head, tail) ? a : a.replace(/-([\uE004-\uE007]*)$/, "$1")) + mark + b : a + " " + mark + b;
        cur.last = l.page;
      }
      else { cur = { type: "toc", x0: l.x0, tocUrl: l.tocUrl, text: mark + l.text.replace(/\s*(?:\.\s?){4,}\s*(\d{1,4})\s*$/, " $1"), page: l.page, last: l.page }; blocks.push(cur); }
      prev = { ...l, isHead: false }; continue;
    }
    // código: cada linha continua sendo uma linha, com o recuo de antes
    if (l.mono && l.size < body * 1.15) {
      const cont = cur && cur.type === "code" && prev && (prev.page === l.page ? prev.col === l.col && prev.y - l.y > 0 && prev.y - l.y < lineGap * 2.6 : l.page === prev.page + 1);
      if (!cont) { cur = { type: "code", x0: l.x0, cw: l.cw, text: "", page: l.page, last: l.page }; blocks.push(cur); }
      const ind = Math.max(0, Math.min(40, Math.round((l.x0 - cur.x0) / cur.cw)));
      cur.text += (cont ? BR : "") + mark + "\u00A0".repeat(ind) + l.text; cur.last = l.page;
      prev = { ...l, isHead: false }; continue;
    }
    // quebra de cena: linha só com sinais ("* * *", "#", "⁂")
    const sc = l.plain.trim();
    if (sc.length <= 20 && /^[\s*•·#~◆◇❖✦✧⁂§_=—–♦❦❧✶✱✳⁎-]+$/u.test(sc)) {
      blocks.push({ type: "scene", text: mark + sc.replace(/\s+/g, " "), page: l.page, last: l.page });
      cur = null; prev = null; continue;
    }
    let level = l.olLevel || (l.size >= body * 1.35 ? 1 : l.size >= body * 1.15 ? 2 : 0);
    // capítulo pelo texto ("Capítulo 12", "PARTE II", "Prólogo"), mesmo com a fonte do corpo
    if (!level && l.plain.length <= 70 && CHAP_RE.test(stripNotes(l.plain).trim()) && l.x1 < gg.right - body * 3
        && (!cur || !prev || prev.isHead || prev.page !== l.page || terminal.test(prev.text))) level = 1;
    if (level && l.text.length < 160) {
      const last = blocks[blocks.length - 1];
      // título em várias linhas; o número do capítulo em cima ("1", "IV", "Capítulo 3") fica na primeira linha
      const numOnly = last && /^h[12]$/.test(last.type) && NUM_HEAD.test(stripPg(last.text)) && !last.text.includes(BR);
      // as linhas seguintes do título podem ter fonte menor que o número: valem pelo tamanho da 1ª linha do título
      const cont = last && (last.type === "h" + level || last.lineLevel === level);
      if (last && (cont || numOnly) && prev && prev.page === l.page && prev.isHead && prev.y - l.y < Math.max(l.size, prev.size) * 2.2)
        { last.text += (numOnly ? BR : " ") + mark + l.plain; last.last = l.page; if (numOnly) last.lineLevel = level; }
      else blocks.push({ type: "h" + level, text: mark + l.plain, page: l.page, last: l.page });
      cur = null; prev = { ...l, isHead: true }; continue;
    }
    const g = gg;
    // versos: cada linha continua sendo uma linha
    if (l.verse) {
      if (cur && cur.verse === l.verse) { cur.text += BR + mark + l.text; cur.last = l.page; }
      else { cur = { type: "verse", verse: l.verse, text: mark + l.text, page: l.page, last: l.page }; blocks.push(cur); }
      prev = { ...l, isHead: false }; continue;
    }
    const isBul = BUL_RE.test(l.plain) || !!l.bulletItem;
    if (l.bulletItem && !BUL_RE.test(l.plain)) l.text = "• " + l.text;
    const numM = /^\(?(\d{1,2})[.)]\s+\S/.exec(l.plain), isNum = numM ? +numM[1] : null;
    let start = !cur || !prev || cur.type === "verse", sceneGap = false;
    const near = !start && prev.page === l.page && prev.col === l.col && prev.y - l.y > 0 && prev.y - l.y < lineGap * 1.55;
    // item numerado: o seguinte ("2.") abre outro bloco; linhas recuadas depois do número continuam o mesmo item
    if (!start && cur.num != null && isNum === cur.num + 1) start = true;
    // depois de um item que terminou com ponto, uma frase nova é outro parágrafo
    else if (!start && cur.num != null && isNum == null && terminal.test(prev.text) && /^\p{Lu}/u.test(l.plain)) start = true;
    else if (!start && cur.num != null && isNum == null && near && l.x0 > cur.x0 + body * 0.4 && l.x0 < cur.x0 + body * 4
      && !(terminal.test(prev.text) && prev.x1 < g.right - body * 4)) { cur.text += " " + mark + l.text; cur.last = l.page; prev = { ...l, isHead: false }; continue; }
    // item de lista: as linhas seguintes, recuadas, continuam o mesmo item
    if (!start && cur.type === "li" && !isBul && prev.page === l.page && prev.col === l.col && prev.y - l.y > 0 && prev.y - l.y < lineGap * 1.55 && l.x0 > cur.x0 + body * 0.4) start = false;
    else if (isBul || (cur && cur.type === "li")) start = true;
    else if (!start) {
      if (prev.page === l.page && prev.col === l.col) {
        const gap = prev.y - l.y;
        if (gap > lineGap * 1.55) {
          start = true;
          // linha em branco entre parágrafos do corpo: troca de cena
          if (gap > lineGap * 2.4 && Math.abs(l.size - body) < body * 0.1 && Math.abs(prev.size - body) < body * 0.1) sceneGap = true;
        }
        else if (prev.x1 < g.right - body * 4 && terminal.test(prev.text)) start = true;
        // recuo de parágrafo: comparado com a linha de cima (num trecho recuado inteiro, como uma citação, as linhas seguem juntas)
        else { const base = Math.max(g.left, prev.x0); if (l.x0 > base + body * 0.9 && l.x0 < base + body * 6) start = true; }
      } else if (terminal.test(prev.text) && l.x0 > g.left + body * 0.9) start = true;
    }
    if (!start) cur.last = l.page;
    if (start) {
      if (sceneGap) blocks.push({ type: "scene", text: "", page: l.page, last: l.page });
      cur = { type: isBul ? "li" : "p", text: mark + l.text, page: l.page, last: l.page, x0: l.x0, num: isNum }; blocks.push(cur);
    } else {
      let [ja, jb] = joinParts(cur.text, l.text), pa = plainOf(ja), pb = plainOf(jb);
      // palavra composta quebrada com o hífen repetido na linha seguinte ("terças-" / "-feiras")
      const rep2 = /\p{L}-$/u.test(pa) && /^-\p{L}/u.test(pb);
      if (rep2) { jb = jb.replace(/^((?:\uE000[^\uE001]*\uE001)?[\uE004-\uE007]*)-/, "$1"); pb = pb.slice(1); }
      if (rep2 || (/\p{L}-$/u.test(pa) && /^\p{Ll}/u.test(pb))) {
        // palavra hifenizada no fim da linha: junta (o número de página entra depois da palavra)
        const head = (pa.match(/(\p{L}+)-$/u) || ["", ""])[1];
        const tail = (pb.match(/^\p{L}+/u) || [""])[0];
        const base = rep2 || keepHyphen(head, tail) ? ja : ja.replace(/-([\uE004-\uE007]*)$/, "$1");
        const sp = jb.search(/\s/);
        cur.text = base + (mark && sp > 0 ? jb.slice(0, sp) + " " + mark + jb.slice(sp + 1) : jb);
      } else cur.text = ja + " " + mark + jb;
    }
    prev = { ...l, isHead: false };
  }
  await tick();
  // lista numerada: três ou mais parágrafos seguidos "1." "2." "3."
  for (let i = 0; i < blocks.length; i++) {
    const num = b => { const m = b && b.type === "p" && /^\(?(\d{1,2})[.)]\s+\S/.exec(stripPg(b.text)); return m ? +m[1] : null; };
    const n0 = num(blocks[i]); if (n0 == null) continue;
    let j = i; while (num(blocks[j + 1]) === n0 + (j + 1 - i)) j++;
    if (j - i >= 2) for (let k = i; k <= j; k++) blocks[k].type = "li";
    i = j;
  }
  for (const b of blocks) if (b.type === "li") b.text = b.text.replace(/^((?:\uE000[^\uE001]*\uE001)?[•▪◦‣●○■□▸►✓✔➢➤])(?=\S)/, "$1 ");
  const outlineUsed = applyOutline(blocks, outline);
  // notas entram logo depois do parágrafo que as chama; chamadas sem nota voltam a ser texto comum
  if (notesList.length) {
    const byId = new Map(notesList.map(n => [n.id, n])), out = [];
    for (const b of blocks) {
      out.push(b);
      if (typeof b.text !== "string") continue;
      for (const m of b.text.matchAll(/\uE002(\d+)\|[^\uE003]*\uE003/g)) {
        const n = byId.get(+m[1]);
        if (n) { out.push({ type: "note", id: n.id, label: n.label, text: n.text, page: n.page, last: n.page }); byId.delete(n.id); }
      }
    }
    blocks.splice(0, blocks.length, ...out);
  }
  let notesLinked = 0;
  for (const b of blocks) if (typeof b.text === "string") {
    b.text = b.text.replace(/\uE002([^\uE003|]+)\uE003/g, "$1");
    if (b.type !== "note") notesLinked += (b.text.match(/\uE002\d+\|/g) || []).length;
  }
  // se o corpo inteiro está numa fonte "itálica" ou "negrito", isso é a fonte do livro, não ênfase
  {
    let all = 0, it = 0, bd = 0;
    for (const b of blocks) if (b.type === "p") {
      let st = 0;
      for (const ch of b.text) {
        if (ch === IT_ON) st |= 1; else if (ch === IT_OFF) st &= ~1; else if (ch === BD_ON) st |= 2; else if (ch === BD_OFF) st &= ~2;
        else if (/\p{L}/u.test(ch)) { all++; if (st & 1) it++; if (st & 2) bd++; }
      }
    }
    const kill = (it > all * 0.5 ? IT_ON + IT_OFF : "") + (bd > all * 0.5 ? BD_ON + BD_OFF : "");
    if (kill) { const re = new RegExp("[" + kill + "]", "g"); for (const b of blocks) if (typeof b.text === "string") b.text = b.text.replace(re, ""); }
  }
  // sumário do PDF: o recuo de cada entrada vira o nível (0 a 3), medido a partir da entrada mais à esquerda da página
  {
    const minX = {};
    for (const b of blocks) if (b.type === "toc") minX[b.page] = Math.min(minX[b.page] ?? Infinity, b.x0);
    for (const b of blocks) if (b.type === "toc") b.level = Math.max(0, Math.min(3, Math.round((b.x0 - minX[b.page]) / (body * 1.6))));
  }
  // ligaduras sem texto: decide cada código uma vez, com o livro inteiro
  await resolveLigatures(liga, blocks.filter(b => typeof b.text === "string").map(b => b.text), lang);
  for (const b of blocks) if (typeof b.text === "string") b.text = applyLigatures(liga, b.text, "");
  const used = liga.used, unresolved = liga.unresolved;
  liga.used = {}; for (const r of ref) r.w = applyLigatures(liga, r.w, "\uFFFD");
  return { blocks, metaTitle, metaAuthor, numPages, ref, hiddenChars, ligatures: used, ligUnresolved: unresolved, cover, headersRemoved, notes: notesLinked, labels, ocrPages, ocrError, imagePages, outlineUsed, columnPages,
    approx: textPages > 0 && realPages < textPages / 2 };
}
