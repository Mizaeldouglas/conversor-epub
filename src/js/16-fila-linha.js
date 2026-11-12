/* ---------- linha da fila: capa, etapas, conferência ---------- */
function editPanelHtml(job){
  if (!job.epub || job.busy) return "";
  const rich = job.kind === "pdf" && !job.fixed;
  const heads = rich ? chapterHeads(job) : [];
  const imgs = rich ? job.src.blocks.map((b, bi) => ({ b, bi })).filter(x => x.b.type === "img" && !x.b.full).slice(0, 40) : [];
  return `<details class="edit"${job.editOpen ? " open" : ""}><summary>Editar livro: ${rich ? "capa, dados do livro, capítulos e texto" : "dados do livro"}</summary>
    <div class="edit-body">
      <div class="edit-top${rich ? "" : " nocov"}">
        ${rich ? `<div class="coverbox"><div class="cv"></div>
          <label class="btn ghost sm filebtn">Trocar capa<input type="file" accept="image/*" data-e="coverfile" hidden></label>
          ${job.src.cover ? `<button class="linkbtn" data-e="coverpdf">${job.fmt || job.fromEpub ? "Capa original" : "1ª página do PDF"}</button>` : ""}
          ${job.file instanceof Blob && !job.merged && job.pages > 1 ? `<form class="coverpg" data-e="coverpg"><label>Página <input type="number" min="1" max="${job.pages}" inputmode="numeric" required aria-label="Número da página do PDF para a capa"></label><button class="btn ghost sm">Usar</button></form>` : ""}
          <button class="linkbtn" data-e="coveroff">Sem capa</button></div>` : ""}
        <div class="edit-fields">
          <label>Título <input type="text" data-e="title" autocomplete="off"></label>
          <label>Autor <input type="text" data-e="author" autocomplete="off" placeholder="Opcional"></label>
          <div class="two"><label>Série <input type="text" data-e="series" autocomplete="off" placeholder="Ex.: A Saga de Zephyrus"></label>
          <label>Nº <input type="text" data-e="seriesIndex" inputmode="decimal" autocomplete="off" placeholder="1"></label></div>
          <label>Gênero / assunto <input type="text" data-e="subject" autocomplete="off" placeholder="Ex.: Fantasia, Aventura"></label>
          <label>Sinopse <textarea data-e="description" rows="3" placeholder="Opcional"></textarea></label>
        </div>
      </div>
      ${rich ? `<div class="chap" id="chap-${job.histId}"><div class="chap-head"><b>Capítulos${heads.length ? ` (${heads.length})` : ""}</b> <span class="muted">Renomeie, junte com o anterior (desmarque “abre capítulo”) ou remova o título. Uma <b>parte</b> agrupa os capítulos seguintes no sumário.</span></div>
        ${heads.length ? `<ol class="chap-list">${heads.map(h => `<li data-bi="${h.bi}"${h.part ? ' class="is-part"' : ""}><input type="text" data-c="text" aria-label="Título do capítulo">
          <label class="mini"><input type="checkbox" data-c="split"> abre capítulo</label>
          <label class="mini"><input type="checkbox" data-c="part"> parte</label>
          <button class="linkbtn" data-c="remove"></button>
          <span class="mv"><button class="btn ghost sm" data-c="up" aria-label="Subir este capítulo" title="Subir">↑</button><button class="btn ghost sm" data-c="down" aria-label="Descer este capítulo" title="Descer">↓</button></span></li>`).join("")}</ol>` : ""}
        <div class="newchap"><label>Faltou um capítulo? Comece a digitar o parágrafo que deve virar título
          <input type="text" data-n="find" autocomplete="off" placeholder="Ex.: Epílogo"></label>
          <span class="muted" data-n="hint" aria-live="polite"></span>
          <button class="btn ghost sm" data-n="go" disabled>Transformar em título</button></div></div>` : ""}
      ${rich ? `<div class="findrep"><b>Localizar e substituir no livro todo</b>
        <div class="fr-row"><input type="text" data-f="find" placeholder="Localizar" aria-label="Localizar" autocomplete="off">
          <input type="text" data-f="rep" placeholder="Substituir por" aria-label="Substituir por" autocomplete="off"></div>
        <div class="fr-row"><label class="mini"><input type="checkbox" data-f="whole" checked> palavra inteira</label>
          <label class="mini"><input type="checkbox" data-f="case"> diferenciar maiúsculas</label>
          <span class="muted fr-count" data-f="count"></span>
          <button class="btn ghost sm" data-f="go" disabled>Substituir tudo</button></div></div>` : ""}
      ${imgs.length ? `<div class="imgalts"><b>Descrição das imagens (${imgs.length})</b><span class="muted">O leitor de tela lê esta descrição no lugar da imagem. Deixe em branco nas que são só enfeite.</span>
        <ul>${imgs.map(x => `<li><img alt="" data-ai="${x.bi}"><input type="text" data-alt="${x.bi}" aria-label="Descrição da imagem" placeholder="O que a imagem mostra" autocomplete="off"></li>`).join("")}</ul></div>` : ""}
      ${ON_SITE ? `<div class="reopen lookup"><b>Capa e sinopse da internet</b><span class="muted">Procura pelo título e pelo autor na Open Library e, se não achar, no Google Books. Só esses dois dados saem do aparelho; o arquivo não.</span>
        <button class="btn ghost sm" data-l="go">Buscar dados deste livro</button><div data-l="out" aria-live="polite"></div></div>` : ""}
      ${job.kind === "epub" ? `<div class="reopen"><b>Capa, capítulos e texto</b><span class="muted">Para mexer nisso, o livro é remontado pelo Lombada: o texto, as imagens e as notas ficam, mas a aparência original (fontes e estilos do arquivo) é trocada pela do Lombada.</span><button class="btn ghost sm" data-a="reopen">Abrir para editar tudo</button></div>` : ""}
      <div class="edit-actions">${job.undo && job.undo.length ? `<button class="btn ghost sm" data-e="undo">Desfazer a última alteração</button>` : ""}<button class="btn sm" data-e="apply">Gerar EPUB de novo</button></div>
    </div></details>`;
}

// capa pequena para a fila e a estante
function coverOf(job){
  if (job.kind !== "pdf" || !job.src) return null;
  if (job.fixed) { const b = job.src.blocks.find(b => b.type === "img"); return b ? b.blob : null; }
  return job.coverOn ? job.coverBlob : null;
}
async function thumbBlob(blob){
  if (!blob) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 360 / bmp.height);
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await toJpeg(c, 0.8);
  } catch { return null; }
}

// opções com que este PDF foi convertido, para converter de novo com outras
function reconvHtml(job){
  if (!(job.kind === "pdf" && !job.fmt && !job.fromEpub && !job.merged && job.file instanceof Blob && job.opts) || job.busy || !(job.epub || job.error)) return "";
  return `<details class="reconv"><summary>Opções deste livro</summary>
        <div class="reconv-body"><label>Tipo <select data-o="mode"><option value="auto">Livro de texto</option><option value="pages">Página como imagem</option><option value="comic">Quadrinhos</option><option value="manga">Mangá</option></select></label>
          <label class="mini"><input type="checkbox" data-o="headers"> tirar cabeçalhos e rodapés</label>
          <label class="mini"><input type="checkbox" data-o="notes"> notas clicáveis</label>
          <label class="mini"><input type="checkbox" data-o="ocr"> OCR</label>
          <button class="btn ghost sm" data-o="go">Converter de novo</button>
          <span class="muted">O PDF é lido de novo com estas opções; as correções feitas neste livro são descartadas.</span></div></details>`;
}

function render(job){
  let row = job.el;
  if (!row) {
    row = document.createElement("div"); row.className = "row"; job.el = row;
    $("#list").appendChild(row); $("#empty").hidden = true;
  }
  const steps = STAGES[job.kind].filter(s => s[0] !== "check" || job.verifyOn).map(([k, label]) => {
    const done = job.done.includes(k), work = job.stage === k && !job.error && !job.cancelled && job.busy;
    return `<li class="${done ? "done" : work ? "work" : ""}"><span class="dot"></span>${k === "pdf" && (job.fmt || job.fromEpub) ? srcLabel(job) + " lido" : label}</li>`;
  }).join("");
  const v = job.verify;
  const src = job.kind === "pdf" ? "PDF" : "EPUB original";
  const facts = [job.kind === "epub" ? "EPUB de " + kb(job.file.size) : job.merged ? job.merged + " PDFs juntos, " + kb(job.file.size) : srcLabel(job) + " de " + kb(job.file.size),
    job.pages ? job.pages + (job.pages > 1 ? " páginas no PDF" : " página no PDF") : "",
    job.chapters ? job.chapters + " capítulo" + (job.chapters > 1 ? "s" : "") : "",
    job.images ? job.images + (job.images > 1 ? " imagens" : " imagem") : "",
    job.pageMarks ? job.pageMarks + (job.pageMarks > 1 ? " páginas numeradas" : " página numerada") + (job.keptPages ? " (originais)" : "") : "",
    job.notesN ? job.notesN + (job.notesN > 1 ? " notas clicáveis" : " nota clicável") : "",
    job.headersRemoved ? job.headersRemoved + " linhas de cabeçalho e rodapé tiradas" : "",
    job.outlineUsed ? "capítulos pelo sumário do PDF" : "",
    job.columnPages ? job.columnPages + (job.columnPages > 1 ? " páginas em colunas" : " página em colunas") : "",
    job.autoFixed ? job.autoFixed + (job.autoFixed > 1 ? " correções suas aplicadas" : " correção sua aplicada") : ""].filter(Boolean);
  const ligSrc = job.ligatures || (v && v.ligatures);
  const lig = ligSrc ? Object.entries(ligSrc).sort((a, b) => b[1] - a[1]) : [];
  const ligHtml = lig.length ? `<div class="verify neutral">Este PDF guarda as letras unidas (como “fi” e “fl”) com um código sem texto. Elas foram reconhecidas pelas palavras do próprio livro: ${lig.map(([k, n]) => `“${esc(k)}” ×${fmtN(n)}`).join(", ")}.</div>` : "";
  const ocrHtml = job.ocrPages ? `<div class="verify neutral">${job.ocrPages} página${job.ocrPages > 1 ? "s" : ""} escaneada${job.ocrPages > 1 ? "s" : ""} lida${job.ocrPages > 1 ? "s" : ""} por OCR. O reconhecimento pode trocar letras: confira na prévia, com o PDF ao lado.</div>`
    : job.ocrError ? `<div class="verify warn">O OCR não funcionou (${esc(job.ocrError)}). As páginas escaneadas entraram como imagem.${ON_SITE ? "" : ` Aqui o navegador bloqueia o download do leitor de OCR; use o site <a href="${SITE_URL}" target="_blank" rel="noopener">${esc(SITE_URL.replace(/^https:\/\/|\/$/g, ""))}</a>.`}</div>` : "";
  let verifyHtml = "";
  if (v) {
    const user = job.userTexts || [];
    v.diffs.forEach(d => { d.user = !!(d.epub && user.some(u => u && d.epub.includes(u))); });
    const real = v.diffs.filter(d => !d.user).length, mine = v.diffs.length - real;
    const mineTxt = mine ? ` ${mine} trecho${mine > 1 ? "s" : ""} diferente${mine > 1 ? "s" : ""} por correção sua.` : "";
    const canPdf = job.kind === "pdf" && !job.merged;
    if (!v.total) verifyHtml = `<div class="verify neutral">Sem texto para conferir: as páginas entraram como imagem.</div>`;
    else if (!real) verifyHtml = `<div class="verify ok">✓ Conferido: as ${fmtN(v.total)} palavras do EPUB são iguais às do ${src}.${mineTxt}${v.ignored ? ` Ficaram de fora ${v.ignored} números de página soltos.` : ""}${v.approx ? " Este PDF não guarda os espaços como caracteres, então os espaços foram calculados pela posição das letras." : ""}${v.hidden ? ` O PDF tem ${fmtN(v.hidden)} letras escondidas fora da área visível da página, que não aparecem na leitura e não foram incluídas.` : ""}</div>`;
    else verifyHtml = `<div class="verify warn">${real} trecho${real > 1 ? "s" : ""} diferente${real > 1 ? "s" : ""} do ${src}, em ${fmtN(v.total)} palavras conferidas.${mineTxt} ${job.kind === "pdf" ? "Use “Corrigir” para acertar o texto e gerar de novo." : "Veja abaixo antes de baixar."}</div>`;
    if (v.diffs.length) verifyHtml += `<details class="diffs"${job.detailsOpen ? " open" : ""}><summary>Ver as diferenças (${v.diffs.length})</summary><ul>${v.diffs.slice(0, 300).map((d, i) =>
      `<li class="${d.user ? "user" : ""}"><span class="where">${job.kind === "pdf" ? "p. " + (d.p || "?") : "arquivo " + (d.p || "?")}</span> ${src}: <b>${esc(d.pdf || "—")}</b>, EPUB: <b>${esc(d.epub || "—")}</b>${d.user ? ` <span class="muted">(corrigido por você)</span>` : ""}
        ${canPdf && d.p && !job.busy ? ` <button class="linkbtn" data-see="${i}">Ver no PDF</button>` : ""}
        ${job.kind === "pdf" && !job.busy && !job.fixed ? ` <button class="linkbtn" data-fix="${i}">Corrigir</button>` : ""}
        ${job.fixing === i ? `<div class="fixbox"><input type="text" data-fx="input" aria-label="Texto correto"><button class="btn sm" data-fx="ok">Aplicar e gerar de novo</button><button class="btn ghost sm" data-fx="cancel">Cancelar</button>
          <label class="mini"><input type="checkbox" data-fx="mem" checked> lembrar nos próximos livros</label></div>` : ""}</li>`).join("")}</ul></details>`;
  }
  // selo: estrutura do EPUB conferida (e o texto, se a conferência estava ligada)
  const st = job.structure, realN = v ? v.diffs.filter(d => !d.user).length : 0;
  const sealHtml = !job.epub || job.busy || !st ? ""
    : st.length ? `<div class="verify warn" role="status">O EPUB saiu com problema de estrutura e pode não abrir no Kindle: ${st.map(esc).join("; ")}. Tente gerar de novo.</div>`
    : `<div class="seal"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.4 7.5 10 4.4-1.6 7.5-5.4 7.5-10v-6z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span><b>Pronto para o Kindle.</b> EPUB 3 sem erros de estrutura${job.reordered ? "; texto não conferido porque a ordem dos capítulos mudou" : job.fmt || job.fromEpub ? "" : !v ? "; texto não conferido (ligue “Conferir palavra por palavra” para comparar com o original)" : !v.total ? "" : !realN ? ", com o texto igual ao original" : ""}.</span></div>`;
  const busy = job.busy && !job.epub && !job.cancelled;
  const pct = busy && job.pct != null ? Math.max(3, Math.round(job.pct * 100)) : null;
  const cov = coverOf(job);
  row.innerHTML = `
    <div class="thumb ${job.kind}">${cov ? `<img alt="">` : `<span class="spine"></span>`}</div>
    <div class="row-top">
      <div class="row-title">
        <h3 class="name"></h3>
        ${job.author ? `<div class="byline"></div>` : ""}
        <ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      </div>
      <div class="actions">
        ${busy ? `<button class="btn ghost sm" data-a="cancel">Cancelar</button>` : ""}
        ${job.cancelled || job.error ? `<button class="btn ghost sm" data-a="remove">Tirar da fila</button>` : ""}
        ${job.epub ? `<button class="btn" data-a="epub">Baixar EPUB</button>
        <a class="btn ghost kindle" data-a="kindle" href="https://www.amazon.com.br/sendtokindle" target="_blank" rel="noopener">Enviar ao Kindle</a>
        <button class="btn ghost" data-a="pv">Prévia</button>
        ${job.kind === "pdf" && job.docx ? `<button class="btn quiet sm" data-a="docx">DOCX</button>` : ""}
        <button class="btn quiet sm" data-a="kepub" title="Para leitores Kobo">KEPUB</button>` : ""}
      </div>
    </div>
    <div class="row-status">
      ${busy ? `<div class="bar${pct == null ? " indet" : ""}" role="progressbar" aria-label="Andamento"${pct != null ? ` aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"` : ""}><span${pct != null ? ` style="width:${pct}%"` : ""}></span></div>
        <div class="progress-txt">${esc(job.progress || "")}</div>` : ""}
      ${job.epub && !job.busy ? "" : `<ol class="steps" aria-label="Etapas">${steps}</ol>`}
    </div>
    <div class="row-extra">
      ${sealHtml}
      ${job.cancelled ? `<div class="verify neutral">Conversão cancelada.</div>` : ""}
      ${verifyHtml}
      ${ocrHtml}
      ${ligHtml}
      ${!job.busy && job.epub && job.driveState ? `<div class="drive-note${job.driveState === "err" ? " err" : ""}">${job.driveState === "up" ? "Enviando ao Google Drive…" : job.driveState === "ok" ? "Guardado no seu Google Drive." : `Não consegui guardar no Drive. <button class="linkbtn" data-a="driveRetry">Tentar de novo</button>`}</div>` : ""}
      ${editPanelHtml(job)}
      ${reconvHtml(job)}
      ${!job.busy && job.imagePages && !job.ocrPages && !job.ocrError ? `<div class="verify neutral">${job.imagePages} página${job.imagePages > 1 ? "s são" : " é"} só imagem e ${job.imagePages > 1 ? "entraram" : "entrou"} como figura. Se o PDF for escaneado, o OCR transforma essas páginas em texto. <button class="linkbtn" data-a="ocr">Converter de novo com OCR</button></div>` : ""}
      ${job.error ? `<div class="errmsg" role="alert"></div>` : ""}
      ${job.needPassword ? `<form class="pwbox" data-a="pw"><label>Senha do PDF <input type="password" autocomplete="off" required></label><button class="btn sm">Abrir</button></form>` : ""}
    </div>`;
  row.querySelector(".name").textContent = job.title || job.file.name;
  const by = row.querySelector(".byline"); if (by) by.textContent = job.author;
  if (cov) row.querySelector(".thumb img").src = urlOf(cov); else row.querySelector(".thumb .spine").textContent = job.title || job.file.name;
  if (job.error) row.querySelector(".errmsg").textContent = job.error;
  const on = (sel, fn) => { const el = row.querySelector(sel); if (el) el.onclick = fn; };
  on('[data-a="epub"]', () => offer(fileNameOf(job), job.epub));
  on('[data-a="kindle"]', e => sendToKindle(e, job, fileNameOf(job)));
  on('[data-a="pv"]', () => openPreview(job.epub, job.title, job));
  on('[data-a="kepub"]', async e => { const b = e.currentTarget; b.disabled = true; try { offer(fileNameOf(job).replace(/\.epub$/, ".kepub.epub"), await toKepub(job.epub)); } catch (err) { console.warn(err); toast("Não consegui montar o KEPUB deste livro."); } b.disabled = false; });
  on('[data-a="docx"]', () => offer(safeFile(job.title) + ".docx", job.docx));
  on('[data-a="cancel"]', () => cancelJob(job));
  on('[data-a="remove"]', () => removeJob(job));
  on('[data-a="driveRetry"]', () => driveSaveJob(job));
  on('[data-a="ocr"]', () => { job.forceOcr = true; retryPdf(job); });
  on('[data-a="reopen"]', () => { job.kind = "pdf"; job.fromEpub = true; job.stage = "pdf"; job.verify = null; job.epub = null; job.draft = null; job.editOpen = true; retryPdf(job); });
  const pw = row.querySelector('[data-a="pw"]');
  if (pw) {
    const inp = pw.querySelector("input");
    if (job.error && /incorreta/.test(job.error)) inp.focus();
    pw.onsubmit = e => { e.preventDefault(); if (!inp.value) return; job.password = inp.value; retryPdf(job); };
  }
  const det = row.querySelector("details.diffs");
  if (det) det.ontoggle = () => { job.detailsOpen = det.open; };
  row.querySelectorAll("[data-see]").forEach(btn => btn.onclick = () => openPreview(job.epub, job.title, job, { pdfPage: job.verify.diffs[+btn.dataset.see].p }));
  // leitor de tela: avisa quando o livro fica pronto ou dá erro
  const state = job.epub && !job.busy ? job.epub : job.error && !job.busy ? job.error : null;
  if (state && job.announced !== state) { job.announced = state; $("#sr").textContent = job.epub ? `${job.title}: EPUB pronto.` : `${job.title}: ${job.error}`; }
  bindFixes(job, row);
  bindEditPanel(job, row);
  bindReconv(job, row);
  updateQueueButtons();
}
// durante a leitura só a barra e o texto mudam: não redesenha a linha (os botões não "pulam")
function paintProgress(job){
  const row = job.el, bar = row && row.querySelector(".bar");
  if (!bar || bar.classList.contains("indet") || job.pct == null) return render(job);
  const pct = Math.max(3, Math.round(job.pct * 100));
  bar.firstElementChild.style.width = pct + "%"; bar.setAttribute("aria-valuenow", pct);
  row.querySelector(".progress-txt").textContent = job.progress || "";
}
function updateQueueButtons(){
  $("#allZip").hidden = jobs.filter(j => j.epub).length < 2;
  $("#mergeBtn").hidden = mergeable().length < 2;
  $("#clearDone").hidden = !jobs.some(j => !j.busy && (j.epub || j.cancelled || j.error));
  $("#queueCount").textContent = jobs.length ? String(jobs.length) : "";
}
$("#clearDone").onclick = () => { for (const j of jobs.filter(j => !j.busy && (j.epub || j.cancelled || j.error))) removeJob(j); };

function cancelJob(job){
  if (!job.ctrl) return;
  job.ctrl.abort();
  if (!job.started) { job.cancelled = true; job.busy = false; job.progress = ""; render(job); }
  else { job.progress = "cancelando"; render(job); }
}
function removeJob(job){
  queueDone(job);
  const i = jobs.indexOf(job); if (i >= 0) jobs.splice(i, 1);
  if (job.el) job.el.remove();
  $("#empty").hidden = jobs.length > 0;
  updateQueueButtons();
}
