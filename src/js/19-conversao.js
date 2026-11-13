/* ---------- conversão: fila de trabalhos ---------- */
let chain = Promise.resolve();
function addFiles(list, restored){
  for (const file of list) {
    const kind = /\.epub$/i.test(file.name) || file.type === "application/epub+zip" ? "epub"
      : /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? "pdf" : null;
    const fmt = kind ? null : fmtOf(file.name);
    if (!kind && !fmt) { toast(file.name + " não é de um formato que o Lombada abre e foi ignorado."); continue; }
    const job = { file, kind: kind || "pdf", fmt, title: kind !== "epub" ? cleanTitle(baseName(file.name)) : baseName(file.name), done: [], stage: kind !== "epub" ? "pdf" : "read",
      progress: "na fila", verifyOn: $("#verify").checked, histId: uuid(), busy: true, ctrl: new AbortController(), started: false, opts: readOpts() };
    jobs.push(job); render(job);
    if (!restored) queueSave(job);
    chain = chain.then(() => { job.started = true; return job.kind === "pdf" ? runPdf(job) : runEpub(job); });
  }
}

// opções lidas quando o arquivo entra na fila; cada livro guarda as suas e pode ser convertido de novo com outras
// idioma do livro: descoberto pelo próprio texto; enquanto não há texto (OCR, quadrinhos), vale o da interface
const defaultLang = () => uiLang === "pt" ? "pt-BR" : uiLang;
const LANG_WORDS = { "pt-BR": "não uma com do da você ele ela são foi mas os em seu sua também já", en: "the and of to that was is it with for his her you not had they this", es: "el y los las del con una pero muy ella por más está fue sus como también" };
function detectLang(blocks){
  let text = "";
  for (const b of blocks) { if (b.type === "p" && typeof b.text === "string") { text += " " + plainOf(stripPg(b.text)); if (text.length > 30000) break; } }
  const words = text.toLowerCase().match(/\p{L}+/gu) || [], score = {};
  for (const [l, list] of Object.entries(LANG_WORDS)) { const set = new Set(list.split(" ")); score[l] = words.filter(w => set.has(w)).length; }
  const [best, second] = Object.entries(score).sort((a, b) => b[1] - a[1]);
  return best[1] >= 5 && best[1] > second[1] * 1.3 ? best[0] : null;
}
// tempo que falta, pelo ritmo das páginas já lidas
function etaText(t0, p, total){
  const el = (Date.now() - t0) / 1000;
  if (p < 3 || el < 4 || p >= total) return "";
  const left = el / p * (total - p);
  return left < 50 ? "menos de 1 minuto" : left < 90 ? "cerca de 1 minuto" : `cerca de ${Math.round(left / 60)} minutos`;
}
// aviso do navegador quando o livro fica pronto com a aba em segundo plano
function notifyDone(job){
  try {
    if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    const n = new Notification(i18nText(job.title + ": EPUB pronto."), { body: i18nText("Volte ao Lombada para baixar ou mandar ao Kindle."), icon: "icon-192.png", tag: job.histId });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}
const readOpts = () => ({ lang: defaultLang(), mode: $("#mode").value, headers: $("#headers").checked, notes: $("#notes").checked, cover: $("#cover").checked,
  ocr: $("#ocr").checked, showNums: $("#shownums").checked, author: $("#author").value.trim(), look: lookOf(), images: $("#images").value, tocpage: $("#tocpage").checked, autometa: $("#autometa").checked });
const lookOf = () => ({ font: $("#lookFont").value, justify: $("#lookJustify").checked, indent: $("#lookIndent").value, lh: $("#lookLh").value });
function stopIfCancelled(job){ if (job.ctrl && job.ctrl.signal.aborted) throw abortErr(); }
function markCancelled(job){ queueDone(job); job.busy = false; job.cancelled = true; job.progress = ""; job.stage = null; render(job); }

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
    saveHistory(job); queueDone(job); notifyDone(job); goatCount("convertido/" + (job.fmt || job.kind), true);
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

// DOCX, TXT, HTML, Markdown, FB2, MOBI, CBZ (e EPUB aberto para edição): lê para blocos e segue o caminho do PDF
async function runImport(job){
  const o = job.opts ||= readOpts();
  job.lang = o.lang; job.mode = o.mode; job.showNums = o.showNums; job.look = o.look; job.images = o.images;
  if (job.coverOn === undefined) job.coverOn = o.cover;
  if (!job.author) job.author = o.author;
  job.busy = true; job.verifyOn = false; job.verify = null; job.epub = null; job.error = null;
  try {
    job.progress = "lendo o arquivo"; render(job); await tick();
    const res = await importFile(job.file, job.fromEpub ? "epub" : job.fmt);
    stopIfCancelled(job);
    if (!res.blocks.length) throw Object.assign(new Error("vazio"), { name: "EmptyDoc" });
    job.fixed = !!res.fixed;
    if (job.fixed) job.mode = job.mode === "manga" ? "manga" : "comic"; else { const t = normalizeHeads(res.blocks, res.title); res.title ||= t; }
    job.src = { blocks: res.blocks, ref: [], labels: null, numPages: 0, cover: res.cover ? { blob: res.cover } : null };
    if (res.title) job.title = res.title;
    if (res.author && !job.author) job.author = res.author;
    if (res.lang) job.lang = /^pt/i.test(res.lang) ? "pt-BR" : res.lang.slice(0, 2).toLowerCase() || job.lang;
    else if (!job.fixed) job.lang = detectLang(res.blocks) || job.lang;
    if (res.meta) job.meta = { ...res.meta, ...(job.meta || {}) };
    job.coverOn = true; job.coverBlob = res.cover || null; job.coverAuto = false;
    if (!job.fixed) job.autoFixed = applyRememberedFixes(job);
    // autor, editora, ano, ISBN, gênero e sinopse: do próprio PDF e, se faltar, da internet
    if (!job.fixed) {
      const online = ON_SITE && o.autometa;
      if (online) { job.progress = "buscando os dados do livro"; paintProgress(job); }
      await autoMeta(job, res, online);
    }
    await buildPdf(job);
  } catch (e) {
    if (e && e.name === "AbortError") return markCancelled(job);
    console.warn(e);
    job.busy = false; queueDone(job);
    job.error = e && e.name === "EmptyDoc" ? "Este arquivo não tem texto nem imagens que dê para aproveitar."
      : `Não consegui ler este arquivo ${srcLabel(job)}: ${(e && e.message) || "erro desconhecido"}`;
    render(job);
  }
}

async function runPdf(job){
  if (job.ctrl && job.ctrl.signal.aborted) return markCancelled(job);
  if (job.fmt || job.fromEpub) return runImport(job);
  const o = job.opts ||= readOpts();
  job.lang = o.lang; job.mode = o.mode; job.fixed = job.mode === "comic" || job.mode === "manga";
  job.showNums = o.showNums; job.coverOn = true; job.author = job.author || o.author; job.look = o.look; job.images = o.images;
  job.busy = true;
  try {
    const buf = await job.file.arrayBuffer();
    let lastPaint = 0;
    const t0 = Date.now();
    const res = await pdfToBlocks(buf, job.fixed ? "pages" : job.mode, (p, total, what) => {
      job.progress = what ? `${what}: página ${p} de ${total}` : `lendo página ${p} de ${total}`; job.pct = p / total;
      job.eta = etaText(t0, p, total);
      const now = Date.now(); if (now - lastPaint > 250 || p === total || what) { lastPaint = now; paintProgress(job); }
    }, job.lang, { headers: o.headers, notes: o.notes, cover: !job.fixed, ocr: (o.ocr || job.forceOcr) && !job.fixed, signal: job.ctrl.signal, password: job.password });
    job.src = res; job.pages = res.numPages; job.ligatures = res.ligatures; job.headersRemoved = res.headersRemoved;
    job.ocrPages = res.ocrPages; job.ocrError = res.ocrError; job.imagePages = job.fixed ? 0 : res.imagePages; job.outlineUsed = res.outlineUsed; job.columnPages = res.columnPages;
    const meta = res.metaTitle;
    if (meta && meta.length > 2 && !/^(untitled|microsoft word|document|\(anonymous\)|sem t[íi]tulo)/i.test(meta)) job.title = cleanTitle(meta);
    job.coverBlob = o.cover && res.cover ? res.cover.blob : null;
    if (!job.fixed) job.lang = detectLang(res.blocks) || job.lang;
    if (!job.fixed) job.autoFixed = applyRememberedFixes(job);
    if (!job.fixed) {
      const online = ON_SITE && o.autometa;
      if (online) { job.progress = "buscando os dados do livro"; paintProgress(job); }
      await autoMeta(job, res, online);
    }
    await buildPdf(job);
  } catch (e) {
    if (e && e.name === "AbortError") return markCancelled(job);
    job.busy = false; queueDone(job);
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
    job.eta = "";
    // livro sem capa ganha uma capa com o título; ela acompanha o título se ele mudar
    if (!job.fixed && job.coverOn && (!job.coverBlob || job.coverAuto)) {
      const key = job.title + "\u0000" + (job.author || "");
      if (!job.coverBlob || job.coverAutoKey !== key) { job.coverBlob = await autoCover(job.title, job.author); job.coverAuto = true; job.coverAutoKey = key; }
    }
    if (!job.fixed && !src.partsMarked) { if (!src.outlineUsed) markParts(src.blocks); src.partsMarked = true; }
    job.docx = await blocksToDocx(src.blocks, job.title, job.author);
    stopIfCancelled(job);
    job.done.push("docx"); job.stage = "epub"; job.progress = "montando EPUB"; render(job);
    const ep = job.fixed
      ? await buildFixedEpub(src.blocks, { title: job.title, author: job.author, lang: job.lang, rtl: job.mode === "manga", meta: job.meta })
      : await docxToEpub(job.docx, job.author, job.lang, job.showNums, { cover: job.coverOn ? job.coverBlob : null, meta: job.meta, look: job.look, images: job.images, tocPage: job.opts ? job.opts.tocpage !== false : true });
    job.chapters = ep.chapters; job.images = ep.images; job.pageMarks = ep.pages; job.notesN = ep.notes || 0;
    job.done.push("epub");
    if (job.verifyOn && !job.fixed && !job.reordered) {
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
    saveHistory(job); queueDone(job); notifyDone(job); goatCount("convertido/" + (job.fmt || job.kind), true);
  } catch (e) {
    if (e && e.name === "AbortError") return markCancelled(job);
    console.error(e);
    job.busy = false; job.error = "Falha ao montar o EPUB: " + ((e && e.message) || "erro desconhecido") + ".";
    render(job);
  }
}

// livro de exemplo: só no site (o artefato não tem a pasta exemplo/)
if (ON_SITE) {
  const sb = $("#sampleBtn"); sb.hidden = false;
  sb.addEventListener("click", async () => {
    sb.disabled = true;
    try {
      const r = await fetch("exemplo/o-farol-apagado.pdf");
      if (!r.ok) throw new Error(r.status);
      addFiles([new File([await r.blob()], "O Farol Apagado.pdf", { type: "application/pdf" })]);
    } catch (e) { toast("Não deu para abrir o livro de exemplo agora."); }
    sb.disabled = false;
  });
}
