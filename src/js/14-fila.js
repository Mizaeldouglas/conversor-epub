/* ---------- fila ---------- */
const STAGES = {
  pdf: [["pdf", "PDF lido", "pdf"], ["docx", "DOCX", "docx"], ["epub", "EPUB", "epub"], ["check", "Conferência", "epub"]],
  epub: [["read", "EPUB lido", "epub"], ["pages", "Páginas", "epub"], ["epub", "EPUB pronto", "epub"], ["check", "Conferência", "epub"]]
};
const fmtN = n => n.toLocaleString("pt-BR");
const fileNameOf = job => job.kind === "epub"
  ? safeFile(job.title || baseName(job.file.name)) + " (com páginas).epub"
  : safeFile((job.author ? job.author + " - " : "") + job.title) + ".epub";   // "Autor - Título", como o Kindle e o Calibre organizam
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MARK_SPLIT = /(\uE000[^\uE001]*\uE001|\uE002[^\uE003]*\uE003|[\uE004-\uE008]|\uE009[^\uE00A]*\uE00A|\uE00B)/;
// troca texto só fora dos marcadores (página, nota, itálico)
function replaceInText(text, re, to){
  let n = 0;
  const out = text.split(MARK_SPLIT).map((seg, i) => i % 2 ? seg : seg.replace(re, () => { n++; return to; })).join("");
  return [out, n];
}
const wordRe = (find, whole, cs) => new RegExp((whole ? "(?<![\\p{L}\\p{N}])" : "") + escRe(find) + (whole ? "(?![\\p{L}\\p{N}])" : ""), "gu" + (cs ? "" : "i"));
const textBlocks = job => job.src.blocks.filter(b => typeof b.text === "string");

// "693_A_SAGA_DE_ZEPHYRUS_EBOOK" -> "A Saga de Zephyrus"
function cleanTitle(raw){
  const s = String(raw || "");
  let t = s.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  if (/^\d+_/.test(s)) t = t.replace(/^\d+\s+/, "");
  t = t.replace(/\s*[-–(]?\s*\b(e-?book|pdf|epub)\b\)?\s*$/i, "").trim();
  if (t && t === t.toUpperCase() && /\p{Lu}/u.test(t)) {
    const small = new Set("a o as os e de da do das dos em na no nas nos para por com sem um uma à ao".split(" "));
    t = t.toLowerCase().split(" ").map((w, i) => i && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return t || s || "Livro";
}

// imagem enviada pelo usuário -> JPEG (capa)
async function imageToJpeg(file){
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1600 / bmp.height, 1200 / bmp.width);
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
  return toJpeg(c, 0.9);
}
const blobUrls = new WeakMap();
const urlOf = blob => { if (!blob) return ""; if (!blobUrls.has(blob)) blobUrls.set(blob, URL.createObjectURL(blob)); return blobUrls.get(blob); };

// títulos que abrem capítulo (o mesmo critério do EPUB)
function chapterHeads(job){
  const B = job.src.blocks;
  const lv = B.some(b => b.type === "h1") ? "h1" : "h2";
  return B.map((b, bi) => ({ b, bi })).filter(x => x.b.type === lv).map(x => ({ bi: x.bi, text: stripPg(stripNotes(x.b.text)), demote: !!x.b.demote, part: !!x.b.part }));
}

// partes do livro: "Parte 1", "Livro II"… ou títulos com número romano quando os capítulos usam número comum
const PART_RE = /^(parte|livro|part|book)\b/i, ROMAN_RE = /^[ivxlcdm]+\.?$/i, ARABIC_RE = /^\d+[½¼¾]?\.?$/;
function markParts(B){
  const lv = B.some(b => b.type === "h1") ? "h1" : "h2";
  const hs = B.filter(b => b.type === lv && !b.demote);
  const first = b => stripNotes(b.text).replace(PG_RE, "").replace(/[\uE004-\uE007]/g, "").split(BR)[0].trim();
  const roman = hs.filter(b => ROMAN_RE.test(first(b))), arabic = hs.filter(b => ARABIC_RE.test(first(b)));
  const named = hs.filter(b => PART_RE.test(first(b)));
  let parts = named.length && named.length < hs.length ? named : [];
  if (!parts.length && roman.length >= 2 && arabic.length >= roman.length * 2) parts = roman;
  for (const b of parts) b.part = true;
  return parts.length;
}

// transforma em título de capítulo o parágrafo que começa com o texto digitado
const normFind = s => stripPg(stripNotes(s)).toLowerCase().replace(/\s+/g, " ").trim();
function findParagraph(job, text){
  const t = normFind(text); if (t.length < 3) return -1;
  return job.src.blocks.findIndex(b => b.type === "p" && normFind(b.text).startsWith(t));
}

// acha no texto do livro o trecho apontado pela conferência
function locateDiff(job, d){
  const toks = (d.epub || d.prev || "").split(" ").filter(Boolean);
  if (!toks.length) return null;
  const SEP = "(?:[\\s\\p{P}\\p{S}]|\\uE000[^\\uE001]*\\uE001|\\uE002[^\\uE003]*\\uE003|[\\uE004-\\uE008]|\\uE009[^\\uE00A]*\\uE00A|\\uE00B)+";
  const re = new RegExp(toks.map(escRe).join(SEP), "u");
  const B = job.src.blocks;
  const exact = b => b.page != null && d.p >= b.page && d.p <= (b.last ?? b.page);
  const near = b => b.page == null || (d.p >= b.page - 1 && d.p <= (b.last ?? b.page) + 1);
  const order = [...B.keys()].filter(bi => exact(B[bi])).concat([...B.keys()].filter(bi => !exact(B[bi]) && near(B[bi])));
  for (const bi of order) {
    const b = B[bi];
    if (typeof b.text !== "string") continue;
    const m = re.exec(b.text);
    if (!m) continue;
    return d.epub ? { bi, start: m.index, end: m.index + m[0].length, text: m[0] }
                  : { bi, start: m.index + m[0].length, end: m.index + m[0].length, text: "", insert: true };
  }
  return null;
}


// texto de um bloco sem os marcadores, com o mapa de volta para o texto original
const EDIT_MK = /\uE000[^\uE001]*\uE001|\uE002[^\uE003]*\uE003|\uE009[^\uE00A]*\uE00A|[\uE004-\uE007\uE00B]/g;
function blockPlain(b){
  const raw = b.text, map = []; let plain = "", last = 0;
  const take = to => { for (let i = last; i < to; i++) { map.push(i); plain += raw[i] === BR ? " " : raw[i]; } };
  for (const m of raw.matchAll(EDIT_MK)) { take(m.index); last = m.index + m[0].length; }
  take(raw.length); map.push(raw.length);
  return { plain, map };
}
// troca só o trecho que mudou; páginas, notas, itálico e links fora dele ficam como estavam
function setBlockPlain(b, neu){
  const { plain, map } = blockPlain(b);
  neu = neu.replace(/\s+/g, " ").trim();
  if (neu === plain.trim() || neu === plain) return null;
  let p = 0; while (p < plain.length && p < neu.length && plain[p] === neu[p]) p++;
  let s = 0; while (s < plain.length - p && s < neu.length - p && plain[plain.length - 1 - s] === neu[neu.length - 1 - s]) s++;
  const a = map[p], z = map[plain.length - s];
  const kept = (b.text.slice(a, z).match(EDIT_MK) || []).join("");
  b.text = b.text.slice(0, a) + neu.slice(p, neu.length - s) + kept + b.text.slice(z);
  // palavras em volta da mudança, para a conferência saber que foi você
  let i = p, j = neu.length - s;
  while (i > 0 && !/\s/.test(neu[i - 1])) i--;
  while (j < neu.length && !/\s/.test(neu[j])) j++;
  return neu.slice(i, j).trim();
}

// desfazer: guarda o livro antes de cada alteração (até 10)
function snap(job){
  if (!job.src) return;
  (job.undo ||= []).push({ blocks: job.src.blocks.map(b => ({ ...b, rows: b.rows ? b.rows.map(r => [...r]) : undefined })), ref: (job.src.ref || []).map(r => ({ ...r })),
    title: job.title, author: job.author, meta: { ...(job.meta || {}) }, coverBlob: job.coverBlob, coverOn: job.coverOn, userTexts: [...(job.userTexts || [])], reordered: job.reordered });
  if (job.undo.length > 10) job.undo.shift();
}
function undoLast(job){
  const u = job.undo && job.undo.pop(); if (!u) return;
  job.src.blocks = u.blocks; job.src.ref = u.ref; job.title = u.title; job.author = u.author; job.meta = u.meta;
  job.coverBlob = u.coverBlob; job.coverOn = u.coverOn; job.userTexts = u.userTexts; job.reordered = u.reordered; job.draft = null;
}
// troca um capítulo de lugar com o vizinho (dir: -1 sobe, 1 desce)
function moveChapter(job, bi, dir){
  const B = job.src.blocks, heads = chapterHeads(job).filter(h => !h.demote).map(h => h.bi);
  const k = heads.indexOf(bi), o = k + dir;
  if (k < 0 || o < 0 || o >= heads.length) return false;
  const a = Math.min(k, o), start = heads[a], mid = heads[a + 1], end = a + 2 < heads.length ? heads[a + 2] : B.length;
  const first = B.slice(start, mid), second = B.slice(mid, end);
  B.splice(start, end - start, ...second, ...first);
  return true;
}
window.__app.fileNameOf = fileNameOf;
