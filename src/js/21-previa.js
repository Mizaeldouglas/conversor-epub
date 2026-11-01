/* ---------- prévia do EPUB na tela (com o PDF ao lado) ---------- */
const pv = { z: null, docs: [], i: 0, urls: [], job: null, side: false, pdf: null, pdfP: null, pdfPage: 1, pdfTask: null };
function closePreview(){
  $("#preview").hidden = true; document.body.classList.remove("noscroll");
  const back = pv.opener; pv.opener = null;
  if (back && back.isConnected) back.focus({ preventScroll: true });
  for (const u of pv.urls) URL.revokeObjectURL(u); pv.urls = []; $("#pvBody").innerHTML = "";
  if (pv.pdf) { pv.pdf.destroy().catch(() => {}); } pv.pdf = null; pv.pdfP = null; pv.job = null;
  $("#pvCanvas").innerHTML = "";
}
const canSide = job => !!(job && job.kind === "pdf" && !job.merged && job.file instanceof Blob && job.src && job.src.labels);
async function openPreview(blob, title, job, opt = {}){
  if (!blob) return;
  try {
    const z = await JSZip.loadAsync(blob);
    const cont = parseXml(await z.file("META-INF/container.xml").async("string"));
    const opfPath = cont.getElementsByTagNameNS("*", "rootfile")[0].getAttribute("full-path");
    const opfDir = dirOf(opfPath), opf = parseXml(await z.file(opfPath).async("string"));
    const man = new Map();
    for (const it of opf.getElementsByTagNameNS("*", "item")) man.set(it.getAttribute("id"), { href: it.getAttribute("href"), type: it.getAttribute("media-type") || "" });
    const docs = [];
    for (const r of opf.getElementsByTagNameNS("*", "itemref")) {
      const m = man.get(r.getAttribute("idref"));
      if (!m || !/html/.test(m.type)) continue;
      const path = resolvePath(opfDir, decodeURIComponent(m.href.split("#")[0]));
      const f = z.file(path); if (!f) continue;
      const s = await f.async("string");
      let doc = new DOMParser().parseFromString(s, "application/xhtml+xml");
      if (hasParseError(doc)) doc = new DOMParser().parseFromString(s, "text/html");
      const h0 = doc.querySelector("h1, h2, h3"), t = doc.querySelector("title");
      const h = h0 && h0.cloneNode(true);   // "1<br/>TÍTULO" vira "1. TÍTULO"
      if (h) for (const br of [...h.getElementsByTagName("br")]) br.replaceWith(doc.createTextNode(/[.:]\s*$/.test(br.previousSibling ? br.previousSibling.textContent : "") ? " " : ". "));
      let name = ((h && h.textContent) || (t && t.textContent) || "").replace(/\[p\. [^\]]*\]/g, "").replace(/\s+/g, " ").trim();
      if (doc.querySelector(".cover, [epub\\:type~='cover']") || /cover/i.test(path)) name = "Capa";
      const pbs = [...doc.querySelectorAll('[role="doc-pagebreak"], [epub\\:type~="pagebreak"]')].map(e => e.getAttribute("aria-label") || e.getAttribute("title") || "");
      docs.push({ path, doc, name: name.slice(0, 70) || "Parte " + (docs.length + 1), pbs });
    }
    if (!docs.length) throw new Error("vazio");
    if (pv.pdf) { pv.pdf.destroy().catch(() => {}); pv.pdf = null; pv.pdfP = null; }
    pv.z = z; pv.docs = docs; pv.job = job || null;
    $("#pvTitle").textContent = title || "Prévia";
    $("#pvToc").innerHTML = docs.map((d, i) => `<option value="${i}">${esc(d.name)}</option>`).join("");   // a posição já aparece em "3 de 8"
    $("#pvSideBtn").hidden = !canSide(job);
    $("#pvEditBtn").hidden = !(job && job.kind === "pdf" && job.src && !job.fixed && !job.merged && job.epub && !job.busy);
    if ($("#preview").hidden) pv.opener = document.activeElement;
    $("#preview").hidden = false; document.body.classList.add("noscroll");
    $("#pvClose").focus({ preventScroll: true });
    let start = 0, label = null;
    if (opt.pdfPage && canSide(job)) {
      label = job.src.labels[opt.pdfPage - 1];
      const k = docs.findIndex(d => d.pbs.includes(label));
      if (k >= 0) start = k;
      pv.side = true;
    }
    setSide(pv.side && canSide(job));
    await showPage(start, label);
    if (opt.pdfPage && pv.side) showPdfPage(opt.pdfPage);
    $("#pvClose").focus();
  } catch (e) { console.error(e); toast("Não consegui abrir a prévia deste EPUB."); }
}
async function showPage(i, scrollToLabel){
  pv.i = Math.max(0, Math.min(pv.docs.length - 1, i));
  const d = pv.docs[pv.i];
  for (const u of pv.urls) URL.revokeObjectURL(u); pv.urls = [];
  const body = d.doc.getElementsByTagNameNS("*", "body")[0] || d.doc.documentElement;
  const page = document.createElement("div"); page.className = "pv-page";
  for (const c of body.childNodes) page.appendChild(document.importNode(c, true));
  // nada de scripts, estilos ou eventos vindos do livro; imagens viram endereços locais
  for (const el of [...page.querySelectorAll("*")]) {
    const name = el.localName;
    if (/^(script|style|link|iframe|object|embed|form|input|button|meta|audio|video)$/i.test(name)) { el.remove(); continue; }
    for (const a of [...el.attributes]) if (/^on/i.test(a.name) || a.name === "style") el.removeAttribute(a.name);
    if (name === "img" || name === "image") {
      const src = el.getAttribute("src") || el.getAttribute("href") || el.getAttribute("xlink:href") || "";
      const path = src && !/^[a-z]+:/i.test(src) ? resolvePath(dirOf(d.path), decodeURIComponent(src.split("#")[0])) : null;
      const f = path && pv.z.file(path);
      if (f) {
        const type = /\.png$/i.test(path) ? "image/png" : /\.svg$/i.test(path) ? "image/svg+xml" : /\.gif$/i.test(path) ? "image/gif" : "image/jpeg";
        const url = URL.createObjectURL(new Blob([await f.async("uint8array")], { type })); pv.urls.push(url);
        if (name === "img") el.setAttribute("src", url); else el.setAttribute("href", url);
      } else if (name === "img") el.removeAttribute("src");
    }
    if (name === "a") {
      const h = el.getAttribute("href") || "";
      el.removeAttribute("href");
      if (h.includes("#")) { el.dataset.anchor = h.split("#")[1]; el.setAttribute("role", "link"); el.tabIndex = 0; }
    }
  }
  page.querySelectorAll("[data-anchor]").forEach(a => a.onclick = e => {
    e.stopPropagation();
    const t = page.querySelector(`[id="${CSS.escape(a.dataset.anchor)}"]`); if (t) t.scrollIntoView({ block: "center" });
  });
  // clicar no texto mostra a página correspondente do PDF
  page.onclick = e => {
    if (!pv.side) return;
    const pbs = [...page.querySelectorAll('[role="doc-pagebreak"]')];
    let lab = null;
    for (const pb of pbs) if (pb === e.target || pb.compareDocumentPosition(e.target) & Node.DOCUMENT_POSITION_FOLLOWING || pb.contains(e.target)) lab = pb.getAttribute("aria-label");
    if (lab == null && pbs.length) lab = pbs[0].getAttribute("aria-label");
    const n = pdfPageOfLabel(lab); if (n) showPdfPage(n);
  };
  const box = $("#pvBody"); box.innerHTML = ""; box.appendChild(page); box.scrollTop = 0;
  if (scrollToLabel != null) {
    const t = [...page.querySelectorAll('[role="doc-pagebreak"]')].find(e => e.getAttribute("aria-label") === scrollToLabel);
    if (t) { t.scrollIntoView({ block: "start" }); t.classList.add("pv-hit"); }
  }
  $("#pvToc").value = String(pv.i);
  $("#pvPrev").disabled = pv.i === 0; $("#pvNext").disabled = pv.i === pv.docs.length - 1;
  $("#pvCount").textContent = `${pv.i + 1} de ${pv.docs.length}`;
  if (pv.side && scrollToLabel == null && d.pbs.length) { const n = pdfPageOfLabel(d.pbs[0]); if (n) showPdfPage(n); }
}
function pdfPageOfLabel(label){
  const L = pv.job && pv.job.src && pv.job.src.labels;
  if (!L || label == null) return 0;
  const k = L.indexOf(label); return k >= 0 ? k + 1 : 0;
}
function setSide(on){
  pv.side = !!on;
  $("#preview").classList.toggle("pv-side", pv.side);
  $("#pvSideBtn").textContent = pv.side ? "Esconder o PDF" : "PDF ao lado";
  $("#pvSideBtn").setAttribute("aria-pressed", String(pv.side));
  $("#pvPdf").hidden = !pv.side;
}
async function showPdfPage(n){
  if (!canSide(pv.job)) return;
  const job = pv.job;
  pv.pdfPage = Math.max(1, Math.min(job.src.numPages, n));
  $("#pvPdfLabel").textContent = `p. ${job.src.labels[pv.pdfPage - 1]} (${pv.pdfPage} de ${job.src.numPages})`;
  $("#pvPdfPrev").disabled = pv.pdfPage <= 1; $("#pvPdfNext").disabled = pv.pdfPage >= job.src.numPages;
  try {
    pv.pdfP ||= job.file.arrayBuffer().then(buf => pdfjsLib.getDocument({ data: buf, password: job.password || undefined, isOffscreenCanvasSupported: false }).promise).then(d => (pv.pdf = d));
    const doc = await pv.pdfP;
    if (pv.job !== job) return;
    const want = pv.pdfPage;
    const page = await doc.getPage(want);
    const box = $("#pvCanvas");
    const vp1 = page.getViewport({ scale: 1 });
    const cssW = Math.max(200, box.clientWidth - 16), dpr = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: cssW / vp1.width * dpr });
    const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    c.style.width = cssW + "px";
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    if (pv.pdfTask) { try { pv.pdfTask.cancel(); } catch {} }
    pv.pdfTask = page.render({ canvasContext: ctx, viewport: vp });
    await pv.pdfTask.promise.catch(() => {});
    if (pv.pdfPage !== want) return;
    box.innerHTML = ""; box.appendChild(c); box.scrollTop = 0;
  } catch (e) { console.warn("pdf ao lado", e); }
}
$("#pvClose").onclick = closePreview;
$("#pvPrev").onclick = () => showPage(pv.i - 1);
$("#pvNext").onclick = () => showPage(pv.i + 1);
$("#pvToc").onchange = e => showPage(+e.target.value);
$("#pvSideBtn").onclick = () => { setSide(!pv.side); if (pv.side) { const d = pv.docs[pv.i]; showPdfPage(pdfPageOfLabel(d && d.pbs[0]) || pv.pdfPage || 1); } };
$("#pvPdfPrev").onclick = () => showPdfPage(pv.pdfPage - 1);
$("#pvPdfNext").onclick = () => showPdfPage(pv.pdfPage + 1);
$("#preview").onclick = e => { if (e.target.id === "preview") closePreview(); };
document.addEventListener("keydown", e => {
  if ($("#preview").hidden) return;
  if (e.key === "Escape") closePreview();
  else if (e.key === "Tab") {   // o foco fica dentro da prévia enquanto ela está aberta
    const els = [...$("#preview").querySelectorAll('button, select, a[href], input, [tabindex]:not([tabindex="-1"])')].filter(el => !el.closest("[hidden]") && !el.disabled);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && (document.activeElement === first || !$("#preview").contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !$("#preview").contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }
  else if (e.key === "ArrowRight" && !/input|select|textarea/i.test(document.activeElement.tagName)) showPage(pv.i + 1);
  else if (e.key === "ArrowLeft" && !/input|select|textarea/i.test(document.activeElement.tagName)) showPage(pv.i - 1);
});

// da prévia para a lista de capítulos do livro
$("#pvEditBtn").onclick = () => {
  const job = pv.job; if (!job) return;
  closePreview();
  job.editOpen = true; render(job);
  const box = document.getElementById("chap-" + job.histId);
  if (box) { box.scrollIntoView({ block: "start", behavior: "smooth" }); const i = box.querySelector("input"); if (i) i.focus({ preventScroll: true }); }
};
