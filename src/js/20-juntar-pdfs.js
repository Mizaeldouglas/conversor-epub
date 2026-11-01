/* ---------- juntar vários PDFs num EPUB só ---------- */
const mergeable = () => jobs.filter(j => j.kind === "pdf" && j.src && !j.fixed && !j.merged && !j.busy && j.epub);
$("#mergeBtn").onclick = () => {
  const list = mergeable().sort((a, b) => a.file.name.localeCompare(b.file.name, "pt-BR", { numeric: true }));
  if (list.length < 2) return;
  const blocks = [], ref = [], labels = [];
  let pOff = 0, idOff = 0;
  list.forEach((j, vi) => {
    const V = vi + 1; let maxId = 0;
    // cada volume abre com o próprio título; as páginas viram "1.12", "2.12"…
    blocks.push({ type: "h1", text: j.title, page: pOff + 1, last: pOff + 1 });
    for (const b of j.src.blocks) {
      const nb = { ...b };
      if (nb.page != null) nb.page += pOff;
      if (nb.last != null) nb.last += pOff;
      if (nb.type === "pg") nb.label = V + "." + nb.label;
      if (nb.type === "note") { maxId = Math.max(maxId, nb.id); nb.id += idOff; }
      if (typeof nb.text === "string") nb.text = nb.text
        .replace(/\uE000([^\uE001]*)\uE001/g, (m, l) => pgMark(V + "." + l))
        .replace(/\uE002(\d+)\|/g, (m, id) => { maxId = Math.max(maxId, +id); return "\uE002" + (+id + idOff) + "|"; });
      blocks.push(nb);
    }
    for (const w of j.title.split(/\s+/).filter(Boolean)) ref.push({ w, p: pOff + 1, eol: false });   // título do volume
    for (const r of j.src.ref) ref.push({ ...r, p: r.p + pOff });
    (j.src.labels || []).forEach(l => labels.push(V + "." + l));
    idOff += maxId; pOff += j.src.numPages;
  });
  // título: o começo comum dos nomes ("A Saga de Zephyrus 1", "… 2" -> "A Saga de Zephyrus")
  let pre = list[0].title;
  for (const j of list) { let k = 0; while (k < pre.length && k < j.title.length && pre[k].toLowerCase() === j.title[k].toLowerCase()) k++; pre = pre.slice(0, k); }
  pre = pre.replace(/[\s\-–—:,(]*(vol(ume)?\.?|livro|parte|n[º°o]\.?)?\s*\d*\s*$/i, "").trim();
  const title = (pre.length >= 3 ? pre : list[0].title + " e outros") + ` (${list.length} volumes)`;
  const sum = (k) => list.reduce((s, j) => s + (j.src[k] || 0), 0);
  const ligs = {}; for (const j of list) for (const [k, n] of Object.entries(j.src.ligatures || {})) ligs[k] = (ligs[k] || 0) + n;
  const first = list[0];
  const job = {
    kind: "pdf", merged: list.length, file: { name: title + ".pdf", size: list.reduce((s, j) => s + j.file.size, 0) },
    title, author: first.author, meta: { ...(first.meta || {}) }, lang: first.lang, mode: "auto", fixed: false, showNums: first.showNums, look: first.look,
    coverOn: first.coverOn, coverBlob: first.coverBlob, verifyOn: list.some(j => j.verifyOn), histId: uuid(),
    src: { blocks, ref, labels, numPages: pOff, cover: first.src.cover, ligatures: ligs, headersRemoved: sum("headersRemoved"), hiddenChars: sum("hiddenChars"), approx: list.some(j => j.src.approx) },
    pages: pOff, ligatures: ligs, headersRemoved: sum("headersRemoved"), done: ["pdf"], stage: "docx", progress: "na fila", busy: true, ctrl: new AbortController(), started: false,
    userTexts: list.flatMap(j => j.userTexts || [])
  };
  jobs.push(job); render(job);
  chain = chain.then(() => { job.started = true; return buildPdf(job); });
  job.el.scrollIntoView({ block: "nearest" });
};

$("#allZip").onclick = async () => {
  const z = new JSZip(); const used = new Set();
  for (const j of jobs.filter(j => j.epub)) {
    const base = fileNameOf(j).replace(/\.epub$/, "");
    let n = base, k = 2; while (used.has(n)) n = base + " (" + k++ + ")";
    used.add(n); z.file(n + ".epub", j.epub);
  }
  offer("livros-epub.zip", await z.generateAsync({ type: "blob" }));
};
