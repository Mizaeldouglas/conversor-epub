/* ---------- OCR: páginas escaneadas viram texto (Tesseract, no navegador) ---------- */
const OCR_LANG = { "pt-BR": "por", en: "eng", es: "spa" };
const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/";
let ocrLibP = null;
function loadOcrLib(){
  return ocrLibP ||= new Promise((res, rej) => {
    if (window.Tesseract) return res(window.Tesseract);
    const sc = document.createElement("script"); sc.src = TESS + "tesseract.min.js";
    sc.onload = () => window.Tesseract ? res(window.Tesseract) : rej(new Error("o leitor de OCR não carregou"));
    sc.onerror = () => { ocrLibP = null; rej(new Error("não consegui baixar o leitor de OCR (sem internet?)")); };
    document.head.appendChild(sc);
  });
}
async function ocrWorker(lang){
  const T = await loadOcrLib();
  return T.createWorker(OCR_LANG[lang] || "por", 1, {
    workerPath: TESS + "worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
    gzip: true,
    // no site, os dados do idioma vêm junto com a página; fora dele, do padrão do Tesseract
    ...(ON_SITE ? { langPath: new URL("ocr/", location.href).href.replace(/\/$/, "") } : {})
  });
}
// lê uma página desenhada e devolve as linhas no formato das linhas de texto do PDF
async function ocrPage(worker, page, p){
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(3, 2200 / vp1.width);
  const vp = page.getViewport({ scale });
  const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const { data } = await worker.recognize(c);
  c.width = c.height = 0;
  const lines = [], ref = [];
  for (const ln of data.lines || []) {
    const text = String(ln.text || "").replace(/\s+/g, " ").trim();
    if ((text.match(/\p{L}/gu) || []).length < 2 || (ln.confidence != null && ln.confidence < 25)) continue;
    // altura da linha estimada pelo próprio Tesseract (estável com ou sem letras como "g" e "p")
    const b = ln.bbox, rh = ln.rowAttributes && ln.rowAttributes.row_height, h = (rh || (b.y1 - b.y0)) / scale;
    lines.push({ page: p, kind: "line", y: vp1.height - b.y1 / scale, x0: b.x0 / scale, x1: b.x1 / scale, size: h * 0.85, text, plain: text, chars: text.replace(/\s/g, "").length, pageH: vp1.height, ocr: true });
    const ws = text.split(" ");
    ws.forEach((w, i) => ref.push({ w, p, eol: i === ws.length - 1 }));
  }
  lines.sort((a, b) => b.y - a.y);
  return { lines, ref, chars: lines.reduce((s, l) => s + l.chars, 0) };
}
const abortErr = () => { const e = new Error("Conversão cancelada."); e.name = "AbortError"; return e; };
const tick = () => new Promise(r => setTimeout(r, 0));
