/* ---------- conversão: fila de trabalhos ---------- */
let chain = Promise.resolve();
function addFiles(list){
  for (const file of list) {
    const kind = /\.epub$/i.test(file.name) || file.type === "application/epub+zip" ? "epub"
      : /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? "pdf" : null;
    if (!kind) { toast(file.name + " não é PDF nem EPUB e foi ignorado."); continue; }
    const job = { file, kind, title: kind === "pdf" ? cleanTitle(baseName(file.name)) : baseName(file.name), done: [], stage: kind === "pdf" ? "pdf" : "read",
      progress: "na fila", verifyOn: $("#verify").checked, histId: uuid(), busy: true, ctrl: new AbortController(), started: false };
    jobs.push(job); render(job);
    chain = chain.then(() => { job.started = true; return kind === "pdf" ? runPdf(job) : runEpub(job); });
  }
}

const lookOf = () => ({ font: $("#lookFont").value, justify: $("#lookJustify").checked, indent: $("#lookIndent").value, lh: $("#lookLh").value });
function stopIfCancelled(job){ if (job.ctrl && job.ctrl.signal.aborted) throw abortErr(); }
function markCancelled(job){ job.busy = false; job.cancelled = true; job.progress = ""; job.stage = null; render(job); }

async function runEpub(job){
  if (job.ctrl && job.ctrl.signal.aborted) return markCancelled(job);
  job.busy = true; job.epub = null; job.verify = null; job.error = null; job.done = []; job.stage = "read";
  try {
    job.progress = "abrindo"; render(job);
    const res = await fixEpub(job.file, {
      showNums: $("#shownums").checked,
      keepPages: $("#keeppages").checked,
      totalPages: parseInt($("#totalpages").value, 10) || 0,
      cpp: parseInt($("#cpp").value, 10) || 0,
      verify: job.verifyOn,
      title: job.titleOverride, author: job.authorOverride, meta: job.meta
    }, msg => {
      const order = ["read", "pages", "epub", "check"];
      const stage = { "numerando páginas": "pages", "montando EPUB": "epub", "conferindo o texto": "check" }[msg];
      if (stage) { for (const k of order.slice(0, order.indexOf(stage))) if (!job.done.includes(k)) job.done.push(k); job.stage = stage; }
      job.progress = msg; render(job);
    });
    stopIfCancelled(job);
    job.title = res.title; job.author = res.author; job.pageMarks = res.pages; job.keptPages = res.keptPages; job.verify = res.verify;
    for (const k of ["read", "pages", "epub", "check"]) if (!job.done.includes(k)) job.done.push(k);
    job.structure = await checkEpubStructure(res.blob);
    job.epub = res.blob; job.stage = null; job.progress = ""; job.busy = false; render(job);
    saveHistory(job);
  } catch (e) {
    if (e && e.name === "AbortError") return markCancelled(job);
    console.error(e);
    job.busy = false; job.error = (e && e.message) || "Falha ao processar o EPUB.";
    render(job);
  }
}

// mensagens que dizem o que aconteceu e o que fazer
function pdfErrorText(e, job){
  const name = e && e.name, msg = (e && e.message) || "";
  job.needPassword = false;
  if (name === "PasswordException") {
    console.warn("PDF com senha");
    job.needPassword = true;
    return e.code === 2 ? "Senha incorreta. Confira e digite de novo." : "Este PDF tem senha. Digite a senha para abrir; ela só é usada aqui no navegador.";
  }
  if (name === "InvalidPDFException" || name === "MissingPDFException" || /Invalid PDF|PDF header/i.test(msg)) {
    console.warn("PDF inválido", msg);
    return "Este arquivo não é um PDF válido ou está danificado, talvez porque o download não terminou. Baixe de novo, ou abra no leitor de PDF e salve uma cópia (Imprimir > Salvar como PDF).";
  }
  if (name === "EmptyPdf") return "Este PDF não tem texto nem imagens que dê para aproveitar: as páginas estão em branco ou só têm desenhos muito simples.";
  console.error(e);
  if (e instanceof RangeError || /memory|allocation/i.test(msg))
    return "Faltou memória para este PDF. Feche outras abas e tente de novo; se não der, divida o PDF em partes e converta uma de cada vez.";
  return `Não consegui ler este PDF (${msg || "erro desconhecido"}). Tente o modo “Página inteira como imagem” nas opções; se o erro continuar, o PDF pode estar danificado.`;
}

// tenta de novo o mesmo arquivo (senha digitada, OCR ligado…)
function retryPdf(job){
  job.error = null; job.busy = true; job.cancelled = false; job.progress = "na fila"; job.ctrl = new AbortController(); job.started = false; job.done = [];
  render(job);
  chain = chain.then(() => { job.started = true; return runPdf(job); });
}

async function runPdf(job){
  if (job.ctrl && job.ctrl.signal.aborted) return markCancelled(job);
  job.lang = $("#lang").value; job.mode = $("#mode").value; job.fixed = job.mode === "comic" || job.mode === "manga";
  job.showNums = $("#shownums").checked; job.coverOn = $("#cover").checked; job.author = $("#author").value.trim(); job.look = lookOf();
  job.busy = true;
  try {
    const buf = await job.file.arrayBuffer();
    let lastPaint = 0;
    const res = await pdfToBlocks(buf, job.fixed ? "pages" : job.mode, (p, total, what) => {
      job.progress = what ? `${what}: página ${p} de ${total}` : `lendo página ${p} de ${total}`; job.pct = p / total;
      const now = Date.now(); if (now - lastPaint > 250 || p === total || what) { lastPaint = now; paintProgress(job); }
    }, job.lang, { headers: $("#headers").checked, notes: $("#notes").checked, cover: !job.fixed, ocr: ($("#ocr").checked || job.forceOcr) && !job.fixed, signal: job.ctrl.signal, password: job.password });
    job.src = res; job.pages = res.numPages; job.ligatures = res.ligatures; job.headersRemoved = res.headersRemoved;
    job.ocrPages = res.ocrPages; job.ocrError = res.ocrError; job.imagePages = job.fixed ? 0 : res.imagePages;
    const meta = res.metaTitle;
    if (meta && meta.length > 2 && !/^(untitled|microsoft word|document|\(anonymous\)|sem t[íi]tulo)/i.test(meta)) job.title = cleanTitle(meta);
    job.coverBlob = res.cover ? res.cover.blob : null;
    if (!job.fixed) job.autoFixed = applyRememberedFixes(job);
    await buildPdf(job);
  } catch (e) {
    if (e && e.name === "AbortError") return markCancelled(job);
    job.busy = false;
    job.error = pdfErrorText(e, job);
    render(job);
  }
}

// monta DOCX + EPUB a partir do texto já lido (também usado depois de editar)
async function buildPdf(job){
  const src = job.src;
  job.busy = true; job.epub = null; job.verify = null; job.error = null; job.done = ["pdf"]; job.pct = null;
  try {
    stopIfCancelled(job);
    job.stage = "docx"; job.progress = "montando DOCX"; render(job);
    if (!job.fixed && !src.partsMarked) { markParts(src.blocks); src.partsMarked = true; }
    job.docx = await blocksToDocx(src.blocks, job.title, job.author);
    stopIfCancelled(job);
    job.done.push("docx"); job.stage = "epub"; job.progress = "montando EPUB"; render(job);
    const ep = job.fixed
      ? await buildFixedEpub(src.blocks, { title: job.title, author: job.author, lang: job.lang, rtl: job.mode === "manga", meta: job.meta })
      : await docxToEpub(job.docx, job.author, job.lang, job.showNums, { cover: job.coverOn ? job.coverBlob : null, meta: job.meta, look: job.look });
    job.chapters = ep.chapters; job.images = ep.images; job.pageMarks = ep.pages; job.notesN = ep.notes || 0;
    job.done.push("epub");
    if (job.verifyOn && !job.fixed) {
      stopIfCancelled(job);
      job.stage = "check"; job.progress = "conferindo palavra por palavra"; render(job);
      await tick();
      job.verify = await verifyPdfEpub(ep.blob, src.ref);
      job.verify.approx = src.approx; job.verify.hidden = src.hiddenChars; job.verify.ligatures = src.ligatures;
      job.done.push("check");
    }
    stopIfCancelled(job);
    job.structure = await checkEpubStructure(ep.blob);
    job.epub = ep.blob; job.stage = null; job.progress = ""; job.busy = false; render(job);
    saveHistory(job);
  } catch (e) {
    if (e && e.name === "AbortError") return markCancelled(job);
    console.error(e);
    job.busy = false; job.error = "Falha ao montar o EPUB: " + ((e && e.message) || "erro desconhecido") + ".";
    render(job);
  }
}
