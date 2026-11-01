/* ---------- etapa 1: PDF -> blocos (texto + imagens) ---------- */
async function pdfToBlocks(buf, mode, onProgress, lang, opts = {}){
  const pdf = await pdfjsLib.getDocument({ data: buf, password: opts.password || undefined, isOffscreenCanvasSupported: false, fontExtraProperties: true }).promise;
  let metaTitle = "";
  try { const m = await pdf.getMetadata(); metaTitle = (m.info && m.info.Title || "").trim(); } catch {}
  let pageLabels = null;
  try { pageLabels = await pdf.getPageLabels(); } catch {}
  const labelOf = p => ((pageLabels && pageLabels[p - 1] || "").trim() || String(p)).slice(0, 14);
  const items = [], ref = []; let realPages = 0, textPages = 0, hiddenChars = 0;
  const liga = newLigatureState();
  const fontStyle = new Map();
  let ocrW = null, ocrPages = 0, ocrError = null, imagePages = 0;
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
    for (const it of tc.items) {
      if (!it.str || it.dropCap) continue;
      const blank = !it.str.trim();
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      const x = it.transform[4], y = it.transform[5];
      // tamanhos muito diferentes (número gigante do capítulo x título): só junta se estiverem na mesma base
      let ln = pl.find(l => Math.abs(l.y - y) < lineTol(size, l.size));
      if (!ln) { if (blank) continue; ln = { y, size, items: [] }; pl.push(ln); }
      if (!blank) ln.size = Math.max(ln.size, size);
      ln.items.push({ x, y, w: it.width || 0, str: blank ? " " : it.str, size, blank, firstIdx: it.firstIdx ?? -1, lastIdx: it.lastIdx ?? -1, st: blank ? 0 : styleOfFont(it.fontName) });
    }
    const pageItems = []; let pageChars = 0;
    const pageH = page.getViewport({ scale: 1 }).height;
    for (const ln of pl) {
      ln.items.sort((a, b) => a.x - b.x);
      let text = "", end = null, chars = 0, sizeSum = 0, prevIt = null, curSt = 0;
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
        }
        const sup = opts.notes && base && it !== base && it.size < base.size * 0.8 && it.y - base.y > base.size * 0.15
          && /^\s*([0-9]{1,3}|[*†‡])\s*$/.test(it.str);
        const lead = /^\s*/.exec(it.str)[0];
        if (lead) text += lead;
        const want = sup ? curSt : it.st;
        if (want !== curSt) { text = styleSwitch(text, curSt, want); curSt = want; }
        text += sup ? "\uE002" + it.str.trim() + "\uE003" : it.str.slice(lead.length); end = it.x + it.w; prevIt = it;
        const n = it.str.replace(/\s/g, "").length; chars += n; sizeSum += n * it.size;
      }
      if (curSt) text = styleSwitch(text, curSt, 0);
      text = text.replace(/\s+/g, " ").trim().replace(/\uE004(\s*)\uE005|\uE006(\s*)\uE007/g, "$1$2");
      if (!plainOf(text).trim()) continue;
      pageChars += chars;
      const firstReal = ln.items.find(i => !i.blank) || ln.items[0];
      pageItems.push({ page: p, kind: "line", y: ln.y, x0: firstReal.x, x1: end, size: chars ? sizeSum / chars : ln.size, text, plain: plainOf(text), chars, pageH });
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
    items.push(...pageItems);
    page.cleanup();
  }
  const numPages = pdf.numPages;
  const labels = Array.from({ length: pdf.numPages }, (_, i) => labelOf(i + 1));
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
  const geo = {};
  for (const l of lines) {
    if (Math.abs(l.size - body) > body * 0.08) continue;
    const g = (geo[l.page] ||= { lefts: [], rights: [], prevY: null, gaps: [] });
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

  await tick();
  const blocks = [];
  let cur = null, prev = null, lastPage = 0;
  const terminalRe = /[.!?:;»”"')\]]$/;
  const terminal = { test: t => terminalRe.test(plainOf(t.replace(/\uE002[^\uE003]*\uE003/g, "")).trimEnd()) };   // chamada de nota no fim não conta
  for (const l of filtered) {
    if (l.kind !== "line") {
      if (l.page !== lastPage) { blocks.push({ type: "pg", label: labelOf(l.page) }); lastPage = l.page; }
      blocks.push({ type: "img", blob: l.blob, w: l.w, h: l.h, full: l.kind === "pageimg" });
      cur = null; prev = null; continue;
    }
    if (PAGE_NUM_RE.test(l.plain) && l.size < body * 1.3) continue;   // número grande é o número do capítulo, não da página
    let mark = "";
    if (l.page !== lastPage) { mark = pgMark(labelOf(l.page)); lastPage = l.page; }
    const gg = geo[l.page] || { left: l.x0, right: l.x1 };
    // quebra de cena: linha só com sinais ("* * *", "#", "⁂")
    const sc = l.plain.trim();
    if (sc.length <= 20 && /^[\s*•·#~◆◇❖✦✧⁂§_=—–♦❦❧✶✱✳⁎-]+$/u.test(sc)) {
      blocks.push({ type: "scene", text: mark + sc.replace(/\s+/g, " "), page: l.page, last: l.page });
      cur = null; prev = null; continue;
    }
    let level = l.size >= body * 1.35 ? 1 : l.size >= body * 1.15 ? 2 : 0;
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
    const g = geo[l.page] || { left: l.x0, right: l.x1 };
    let start = !cur || !prev, sceneGap = false;
    if (!start) {
      if (prev.page === l.page) {
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
      cur = { type: "p", text: mark + l.text, page: l.page, last: l.page }; blocks.push(cur);
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
  // ligaduras sem texto: decide cada código uma vez, com o livro inteiro
  await resolveLigatures(liga, blocks.filter(b => typeof b.text === "string").map(b => b.text), lang);
  for (const b of blocks) if (typeof b.text === "string") b.text = applyLigatures(liga, b.text, "");
  const used = liga.used, unresolved = liga.unresolved;
  liga.used = {}; for (const r of ref) r.w = applyLigatures(liga, r.w, "\uFFFD");
  return { blocks, metaTitle, numPages, ref, hiddenChars, ligatures: used, ligUnresolved: unresolved, cover, headersRemoved, notes: notesLinked, labels, ocrPages, ocrError, imagePages,
    approx: textPages > 0 && realPages < textPages / 2 };
}
