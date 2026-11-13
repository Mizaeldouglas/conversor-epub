/* ---------- imagens: helpers ---------- */
const OPS = pdfjsLib.OPS;
const IMG_OPS = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat, OPS.paintJpegXObject].filter(v => v !== undefined));
const toJpeg = (canvas, q) => new Promise(r => canvas.toBlob(r, "image/jpeg", q));

function getObj(page, name){
  const store = name.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise(res => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 8000);
    try { store.get(name, d => { if (!done) { done = true; clearTimeout(t); res(d); } }); }
    catch { done = true; clearTimeout(t); res(null); }
  });
}

async function imgToJpeg(img){
  if (!img || !img.width || !img.height) return null;
  const w = img.width, h = img.height;
  const src = document.createElement("canvas"); src.width = w; src.height = h;
  const sctx = src.getContext("2d");
  if (img.bitmap) sctx.drawImage(img.bitmap, 0, 0);
  else if (img.data) {
    const id = sctx.createImageData(w, h), out = id.data, d = img.data;
    if (img.kind === 3) out.set(d.subarray(0, out.length));
    else if (img.kind === 2) { for (let i = 0, j = 0; j < out.length; i += 3, j += 4) { out[j] = d[i]; out[j+1] = d[i+1]; out[j+2] = d[i+2]; out[j+3] = 255; } }
    else if (img.kind === 1) {
      const rb = (w + 7) >> 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = (d[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0, j = (y * w + x) * 4;
        out[j] = out[j+1] = out[j+2] = v; out[j+3] = 255;
      }
    } else return null;
    sctx.putImageData(id, 0, 0);
  } else return null;
  const s = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const blob = await toJpeg(c, 0.85);
  src.width = src.height = 0;
  return blob ? { blob, w: c.width, h: c.height } : null;
}

async function renderPage(page){
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(2.2, 1400 / vp1.width) });
  const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await toJpeg(c, 0.82);
  const r = blob ? { blob, w: c.width, h: c.height } : null;
  c.width = c.height = 0;
  return r;
}

function pageImages(ol){
  const out = []; let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = pdfjsLib.Util.transform(ctm, a);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (a && Array.isArray(a[0]) && a[0].length === 6) ctm = pdfjsLib.Util.transform(ctm, a[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (IMG_OPS.has(fn) && a) {
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
      out.push({ ref: typeof a[0] === "string" ? a[0] : null, inline: a[0] && typeof a[0] === "object" ? a[0] : null,
        top: Math.max(...ys), bw: Math.max(...xs) - Math.min(...xs), bh: Math.max(...ys) - Math.min(...ys) });
    }
  }
  return { imgs: out, opCount: ol.fnArray.length };
}


// imagens menores no EPUB: "small" limita o tamanho, "gray" também tira a cor (telas de tinta eletrônica)
async function shrinkJpeg(blob, mode){
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 1264 / Math.max(bmp.width, bmp.height) * (bmp.height > bmp.width ? 1.33 : 1));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    if (mode === "gray") x.filter = "grayscale(1)";
    x.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await toJpeg(c, 0.72); c.width = c.height = 0;
    if (!out || out.size >= blob.size && mode !== "gray") return null;
    return new Uint8Array(await out.arrayBuffer());
  } catch { return null; }
}


// capa gerada para livro sem capa: tecido colorido, lombada mais escura, título e autor
const COVER_CLOTH = [["#2536c7", "#1b279a"], ["#0f6b4a", "#0a4f37"], ["#7a1f3d", "#5b142c"], ["#0e5a6b", "#09414e"], ["#131833", "#0a0d1f"], ["#8f4f00", "#6b3a00"]];
async function autoCover(title, author){
  title = String(title || "").trim() || "Sem título"; author = String(author || "").trim();
  try { await Promise.all([document.fonts.load('700 100px "Literata"'), document.fonts.load('italic 400 50px "Literata"')]); } catch {}
  const W = 1200, H = 1800, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  let h = 0; for (const ch of title + author) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const [cloth, spine] = COVER_CLOTH[h % COVER_CLOTH.length];
  x.fillStyle = cloth; x.fillRect(0, 0, W, H);
  x.fillStyle = spine; x.fillRect(0, 0, 110, H);
  x.fillStyle = "rgba(255,255,255,.14)"; x.fillRect(110, 0, 3, H);
  x.fillStyle = "#ffd84a"; x.beginPath(); x.moveTo(930, 0); x.lineTo(1030, 0); x.lineTo(1030, 230); x.lineTo(980, 190); x.lineTo(930, 230); x.closePath(); x.fill();
  const serif = '"Literata", Georgia, "Times New Roman", serif';
  // título: a maior fonte em que ele cabe em até 6 linhas
  const lines = (txt, max) => { const out = []; let cur = ""; for (const w of txt.split(/\s+/)) { const t = cur ? cur + " " + w : w; if (x.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out; };
  let size = 132, ls;
  for (; size >= 64; size -= 6) { x.font = `700 ${size}px ${serif}`; ls = lines(title, 880); if (ls.length <= 6 && ls.every(l => x.measureText(l).width <= 880)) break; }
  x.fillStyle = "#fff"; x.textBaseline = "alphabetic";
  let y = 520;
  for (const l of ls.slice(0, 7)) { x.fillText(l, 200, y); y += size * 1.12; }
  x.fillStyle = "#ffd84a"; x.fillRect(200, y - size * .55, 120, 8);
  if (author) {
    x.font = `italic 400 ${Math.min(64, Math.max(44, size * .5))}px ${serif}`; x.fillStyle = "rgba(255,255,255,.88)";
    let ay = y + 60; for (const l of lines(author, 880).slice(0, 3)) { x.fillText(l, 200, ay); ay += 72; }
  }
  const blob = await toJpeg(c, 0.88); c.width = c.height = 0;
  return blob;
}
