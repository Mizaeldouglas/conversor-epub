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
    snap(job);
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
  const rich = job.kind === "pdf" && !job.fixed;
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
    for (const [k, dir] of [["up", -1], ["down", 1]]) li.querySelector(`[data-c="${k}"]`).onclick = () => {
      snap(job); applyDraft(job);
      if (!moveChapter(job, bi, dir)) { job.undo.pop(); toast(dir < 0 ? "Este já é o primeiro capítulo." : "Este já é o último capítulo."); render(job); return; }
      job.reordered = true; job.editOpen = true;
      toast("Capítulo movido. Gerando o EPUB de novo."); rebuild(job);
    };
  });
  // novo capítulo: um parágrafo vira título
  const nf = q('[data-n="find"]');
  if (nf) {
    const hint = q('[data-n="hint"]'), go = q('[data-n="go"]');
    let hit = -1;
    nf.oninput = () => {
      hit = findParagraph(job, nf.value);
      const t = hit >= 0 ? stripPg(stripNotes(job.src.blocks[hit].text)) : "";
      hint.textContent = nf.value.trim().length < 3 ? "" : hit < 0 ? "Nenhum parágrafo começa assim." : `Achei: “${t.length > 90 ? t.slice(0, 90) + "…" : t}” ${job.src.blocks[hit].page ? `(p. ${job.src.blocks[hit].page})` : ""}`;
      go.disabled = hit < 0;
    };
    go.onclick = () => {
      if (hit < 0) return;
      snap(job);
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
      snap(job);
      for (const b of textBlocks(job)) { const [nt, k] = replaceInText(b.text, re, to); if (k) { b.text = nt; n += k; } }
      if (!n) { job.undo.pop(); return; }
      if (to.trim()) (job.userTexts ||= []).push(to.split(/\s+/).map(edgeW).filter(Boolean).join(" "));
      toast(`${fmtN(n)} trecho${n > 1 ? "s" : ""} substituído${n > 1 ? "s" : ""}. Gerando o EPUB de novo.`);
      applyDraft(job); rebuild(job);
    };
  }
  q('[data-e="apply"]').onclick = () => { snap(job); applyDraft(job); rebuild(job); };
  const un = q('[data-e="undo"]');
  if (un) un.onclick = () => { undoLast(job); job.editOpen = true; toast("Alteração desfeita. Gerando o EPUB de novo."); rebuild(job); };
  // descrição das imagens
  dr.alts ||= {};
  box.querySelectorAll("[data-ai]").forEach(im => { im.src = urlOf(job.src.blocks[+im.dataset.ai].blob); });
  box.querySelectorAll("[data-alt]").forEach(inp => { const bi = +inp.dataset.alt; inp.value = dr.alts[bi] ?? job.src.blocks[bi].alt ?? ""; inp.oninput = () => { dr.alts[bi] = inp.value; }; });
  // converter de novo com outras opções
  const rc = q(".reconv");
  if (rc) {
    const o = job.opts;
    rc.open = !!job.reconvOpen; rc.ontoggle = () => { job.reconvOpen = rc.open; };
    for (const el of rc.querySelectorAll("select[data-o], input[data-o]")) { if (el.type === "checkbox") el.checked = !!o[el.dataset.o]; else el.value = o[el.dataset.o]; }
    rc.querySelector('button[data-o="go"]').onclick = () => {
      const n = { ...o };
      for (const el of rc.querySelectorAll("select[data-o], input[data-o]")) n[el.dataset.o] = el.type === "checkbox" ? el.checked : el.value;
      job.opts = n; job.draft = null; job.undo = []; job.reordered = false; job.userTexts = []; job.forceOcr = false; job.editOpen = false;
      retryPdf(job);
    };
  }
  // capa e sinopse da internet
  const lg = q('[data-l="go"]');
  if (lg) lg.onclick = async () => {
    const out = q('[data-l="out"]'), title = (dr.title ?? job.title ?? "").trim(), author = (dr.author ?? job.author ?? "").trim();
    if (title.length < 2) { out.textContent = "Preencha o título antes de buscar."; return; }
    lg.disabled = true; out.textContent = "Buscando…";
    try {
      const list = await lookupBook(title, author);
      if (!list.length) { out.textContent = "Não achei este livro. Confira o título e o autor."; return; }
      out.innerHTML = `<ul class="lk-list">${list.map((r, i) => `<li><span><b></b> <span class="muted"></span></span><button class="btn ghost sm" data-use="${i}">Usar</button></li>`).join("")}</ul>`;
      out.querySelectorAll("li").forEach((li, i) => { li.querySelector("b").textContent = list[i].title; li.querySelector(".muted").textContent = [list[i].author, list[i].year].filter(Boolean).join(", "); });
      out.querySelectorAll("[data-use]").forEach(btn => btn.onclick = async () => {
        const r = list[+btn.dataset.use]; btn.disabled = true; btn.textContent = "Buscando a capa…";
        if (r.author && !author) dr.author = r.author;
        if (r.description) dr.description = r.description;
        if (r.subject) dr.subject = r.subject;
        let got = false;
        if (rich) try { const cv = await lookupCover(r.isbn); if (cv) { dr.cover = cv; dr.coverOn = true; got = true; } } catch {}
        toast((r.description ? "Sinopse preenchida" : "Este resultado não traz sinopse") + (rich ? (got ? ", capa trocada." : ", sem capa disponível.") : ".") + " Confira e clique em “Gerar EPUB de novo”.", 6000);
        job.editOpen = true; render(job);
      });
    } catch (e) { console.warn(e); out.textContent = "Não consegui buscar agora. Confira a internet e tente de novo."; }
    finally { lg.disabled = false; }
  };
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
  for (const [k, v] of Object.entries(dr.alts || {})) if (B[+k] && B[+k].type === "img") B[+k].alt = v.trim();
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


// dados do livro na internet (só quando a pessoa pede): Google Books para autor e sinopse, Open Library para a capa
async function lookupBook(title, author){
  const q = `intitle:${title}` + (author ? ` inauthor:${author}` : "");
  const r = await fetch("https://www.googleapis.com/books/v1/volumes?maxResults=5&printType=books&q=" + encodeURIComponent(q));
  if (!r.ok) throw new Error("HTTP " + r.status);
  return ((await r.json()).items || []).map(it => {
    const v = it.volumeInfo || {}, ids = v.industryIdentifiers || [], isbn = ids.find(i => i.type === "ISBN_13") || ids.find(i => i.type === "ISBN_10");
    return { title: v.title || "", author: (v.authors || []).join(", "), year: (v.publishedDate || "").slice(0, 4), description: (v.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      subject: (v.categories || []).join(", "), isbn: isbn ? isbn.identifier : "" };
  });
}
async function lookupCover(isbn){
  if (!isbn) return null;
  const r = await fetch(`https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`);
  if (!r.ok) return null;
  const b = await r.blob();
  return /^image\//.test(b.type) && b.size > 2000 ? imageToJpeg(b) : null;
}

// KEPUB (Kobo): o mesmo EPUB com cada trecho de texto marcado, para o Kobo guardar a posição e as estatísticas de leitura
async function toKepub(blob){
  const zin = await JSZip.loadAsync(blob), z = new JSZip();
  z.file("mimetype", "application/epub+zip", { compression: "STORE" });
  for (const name of Object.keys(zin.files)) {
    const f = zin.files[name];
    if (f.dir || name === "mimetype") continue;
    if (!/^OEBPS\/text\/.*\.xhtml$/.test(name)) { z.file(name, await f.async("uint8array")); continue; }
    const doc = parseXml(await f.async("string")), body = doc.getElementsByTagNameNS(XHTML_NS, "body")[0];
    let p = 0, sgm = 0;
    const walk = n => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 1) { if (/^(p|h[1-6]|li|td|div|figure)$/.test(c.localName)) { p++; sgm = 0; } walk(c); }
        else if (c.nodeType === 3 && c.data.trim()) {
          const sp = doc.createElementNS(XHTML_NS, "span"); sp.setAttribute("class", "koboSpan"); sp.setAttribute("id", `kobo.${Math.max(1, p)}.${++sgm}`);
          c.replaceWith(sp); sp.appendChild(c);
        }
      }
    };
    if (body) walk(body);
    z.file(name, serializeXml(doc, true));
  }
  return z.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
}
