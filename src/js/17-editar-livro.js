/* ---------- corrigir trechos e editar o livro ---------- */
// corrigir um trecho apontado pela conferência
function bindFixes(job, row){
  row.querySelectorAll("[data-fix]").forEach(btn => btn.onclick = () => {
    const d = job.verify.diffs[+btn.dataset.fix];
    const loc = locateDiff(job, d);
    if (!loc) { toast("Não encontrei esse trecho no texto do livro para editar."); return; }
    job.fixing = +btn.dataset.fix; job.fixLoc = loc;
    job.fixDraft = loc.insert ? d.pdf : stripPg(stripNotes(loc.text));
    job.detailsOpen = true; render(job);
    const inp = job.el.querySelector('[data-fx="input"]'); if (inp) { inp.focus(); inp.select(); }
  });
  const inp = row.querySelector('[data-fx="input"]');
  if (!inp) return;
  inp.value = job.fixDraft || "";
  inp.oninput = () => { job.fixDraft = inp.value; };
  inp.onkeydown = e => { if (e.key === "Enter") row.querySelector('[data-fx="ok"]').click(); if (e.key === "Escape") row.querySelector('[data-fx="cancel"]').click(); };
  row.querySelector('[data-fx="cancel"]').onclick = () => { job.fixing = null; render(job); };
  row.querySelector('[data-fx="ok"]').onclick = () => {
    const loc = job.fixLoc, b = job.src.blocks[loc.bi], txt = (job.fixDraft || "").trim();
    const marks = (loc.text.match(/\uE000[^\uE001]*\uE001/g) || []).join("");
    const old = stripPg(stripNotes(loc.text));
    b.text = b.text.slice(0, loc.start) + (loc.insert ? (txt ? " " + txt : "") : marks + txt) + b.text.slice(loc.end);
    (job.userTexts ||= []).push(txt.split(/\s+/).map(edgeW).filter(Boolean).join(" "));
    if (!loc.insert && row.querySelector('[data-fx="mem"]').checked) rememberFix(old, txt);
    job.fixing = null; rebuild(job);
  };
}

function bindEditPanel(job, row){
  const box = row.querySelector("details.edit");
  if (!box) return;
  box.ontoggle = () => { job.editOpen = box.open; };
  const dr = job.draft ||= { heads: {} };
  const q = s => box.querySelector(s);
  const meta = job.meta || {};
  for (const k of ["title", "author", "series", "seriesIndex", "subject", "description"]) {
    const el = q(`[data-e="${k}"]`); if (!el) continue;
    el.value = dr[k] ?? (k === "title" ? job.title : k === "author" ? job.author : meta[k]) ?? "";
    el.oninput = () => { dr[k] = el.value; };
  }
  const cv = q(".cv");
  if (cv) {
    const on = dr.coverOn ?? job.coverOn, blob = dr.cover !== undefined ? dr.cover : job.coverBlob;
    cv.innerHTML = on && blob ? `<img alt="Capa">` : `<div class="nocover">Sem capa</div>`;
    if (on && blob) cv.querySelector("img").src = urlOf(blob);
    q('[data-e="coverfile"]').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { dr.cover = await imageToJpeg(f); dr.coverOn = true; render(job); } catch { toast("Não consegui abrir essa imagem."); }
    };
    const cp = q('[data-e="coverpdf"]');
    if (cp) cp.onclick = () => { dr.cover = job.src.cover ? job.src.cover.blob : null; dr.coverOn = !!dr.cover; render(job); };
    q('[data-e="coveroff"]').onclick = () => { dr.coverOn = false; render(job); };
    const cpg = q('[data-e="coverpg"]');
    if (cpg) cpg.onsubmit = async e => {
      e.preventDefault();
      const n = parseInt(cpg.querySelector("input").value, 10);
      if (!(n >= 1 && n <= job.pages)) return;
      const btn = cpg.querySelector("button"); btn.disabled = true; btn.textContent = "Abrindo…";
      let pdf = null;
      try {
        pdf = await pdfjsLib.getDocument({ data: await job.file.arrayBuffer(), password: job.password || undefined, isOffscreenCanvasSupported: false }).promise;
        const r = await renderPage(await pdf.getPage(n));
        if (!r) throw new Error("vazia");
        dr.cover = r.blob; dr.coverOn = true; render(job);
      } catch { toast("Não consegui desenhar essa página."); btn.disabled = false; btn.textContent = "Usar"; }
      finally { if (pdf) pdf.destroy().catch(() => {}); }
    };
  }
  box.querySelectorAll(".chap-list li").forEach(li => {
    const bi = +li.dataset.bi, b = job.src.blocks[bi], h = dr.heads[bi] ||= {};
    const t = li.querySelector('[data-c="text"]'), sp = li.querySelector('[data-c="split"]'), rm = li.querySelector('[data-c="remove"]'), pt = li.querySelector('[data-c="part"]');
    t.value = h.text ?? stripPg(stripNotes(b.text));
    sp.checked = h.split ?? !b.demote;
    pt.checked = h.part ?? !!b.part;
    pt.onchange = () => { h.part = pt.checked; li.classList.toggle("is-part", pt.checked); if (pt.checked && !sp.checked) { sp.checked = true; h.split = true; } };
    rm.textContent = h.remove ? "Desfazer" : "Remover título";
    li.classList.toggle("removed", !!h.remove);
    t.oninput = () => { h.text = t.value; };
    sp.onchange = () => { h.split = sp.checked; };
    rm.onclick = () => { h.remove = !h.remove; rm.textContent = h.remove ? "Desfazer" : "Remover título"; li.classList.toggle("removed", h.remove); };
  });
  // novo capítulo: um parágrafo vira título
  const nf = q('[data-n="find"]');
  if (nf) {
    const hint = q('[data-n="hint"]'), go = q('[data-n="go"]');
    let hit = -1;
    nf.oninput = () => {
      hit = findParagraph(job, nf.value);
      const t = hit >= 0 ? stripPg(stripNotes(job.src.blocks[hit].text)) : "";
      hint.textContent = nf.value.trim().length < 3 ? "" : hit < 0 ? "Nenhum parágrafo começa assim." : `Achei: “${t.length > 90 ? t.slice(0, 90) + "…" : t}” (p. ${job.src.blocks[hit].page})`;
      go.disabled = hit < 0;
    };
    go.onclick = () => {
      if (hit < 0) return;
      const B = job.src.blocks, lv = B.some(b => b.type === "h1") ? "h1" : "h2";
      B[hit].type = lv; delete B[hit].demote;
      job.editOpen = true;
      toast("Novo capítulo criado. Gerando o EPUB de novo.");
      applyDraft(job); rebuild(job);
    };
  }
  // localizar e substituir
  const fr = q(".findrep");
  if (fr) {
    const f = k => fr.querySelector(`[data-f="${k}"]`);
    const count = () => {
      const find = f("find").value;
      if (!find) { f("count").textContent = ""; f("go").disabled = true; return 0; }
      const re = wordRe(find, f("whole").checked, f("case").checked); let n = 0;
      for (const b of textBlocks(job)) n += replaceInText(b.text, re, "")[1];
      f("count").textContent = n ? `${fmtN(n)} ocorrência${n > 1 ? "s" : ""}` : "nenhuma ocorrência";
      f("go").disabled = !n; return n;
    };
    let t = null;
    for (const k of ["find", "whole", "case"]) f(k).addEventListener(k === "find" ? "input" : "change", () => { clearTimeout(t); t = setTimeout(count, 200); });
    f("go").onclick = () => {
      const find = f("find").value, to = f("rep").value;
      const re = wordRe(find, f("whole").checked, f("case").checked); let n = 0;
      for (const b of textBlocks(job)) { const [nt, k] = replaceInText(b.text, re, to); if (k) { b.text = nt; n += k; } }
      if (!n) return;
      if (to.trim()) (job.userTexts ||= []).push(to.split(/\s+/).map(edgeW).filter(Boolean).join(" "));
      toast(`${fmtN(n)} trecho${n > 1 ? "s" : ""} substituído${n > 1 ? "s" : ""}. Gerando o EPUB de novo.`);
      applyDraft(job); rebuild(job);
    };
  }
  q('[data-e="apply"]').onclick = () => { applyDraft(job); rebuild(job); };
}

function applyDraft(job){
  const dr = job.draft; job.draft = null;
  if (!dr) return;
  if (dr.title != null && dr.title.trim()) job.title = dr.title.trim();
  if (dr.author != null) job.author = dr.author.trim();
  const meta = job.meta ||= {};
  for (const k of ["series", "seriesIndex", "subject", "description"]) if (dr[k] != null) meta[k] = dr[k].trim();
  if (job.kind === "epub") { job.titleOverride = job.title; job.authorOverride = job.author; return; }
  if (dr.cover !== undefined) job.coverBlob = dr.cover;
  if (dr.coverOn !== undefined) job.coverOn = dr.coverOn;
  if (!job.src) return;
  const B = job.src.blocks, ref = job.src.ref;
  for (const [k, h] of Object.entries(dr.heads || {})) {
    const b = B[+k]; if (!b || !/^h[12]$/.test(b.type)) continue;
    const marks = (b.text.match(/\uE000[^\uE001]*\uE001/g) || []).join("");
    const old = stripPg(stripNotes(b.text));
    if (h.remove) { refReplace(ref, b.page, old, ""); b.type = "p"; b.text = marks; continue; }
    const nt = (h.text ?? "").trim();
    if (nt && nt !== old) { refReplace(ref, b.page, old, nt); b.text = marks + nt; }
    if (h.split !== undefined) b.demote = !h.split;
    if (h.part !== undefined) b.part = h.part;
  }
}

function rebuild(job){
  job.busy = true; job.progress = "na fila"; job.cancelled = false; job.ctrl = new AbortController(); job.started = false; render(job);
  chain = chain.then(() => { job.started = true; return job.kind === "pdf" ? buildPdf(job) : runEpub(job); });
}
