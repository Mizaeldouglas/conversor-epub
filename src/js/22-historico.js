/* ---------- histórico: últimos livros guardados neste navegador ---------- */
const HIST_DB = "conversor-epub", HIST_STORE = "livros", HIST_MAX = 12, QUEUE_STORE = "fila", QUEUE_DB = "conversor-epub-fila";
// fila guardada: se a página fechar no meio, os arquivos que faltavam voltam na próxima visita (uma vez só)
const queueSave = job => { if (job.file instanceof Blob && job.file.size < 300e6) idbReq("readwrite", st => st.put({ id: job.histId, file: job.file, date: Date.now() }), QUEUE_STORE).catch(() => {}); };
const queueDone = job => { idbReq("readwrite", st => st.delete(job.histId), QUEUE_STORE).catch(() => {}); };
async function queueRestore(){
  try {
    const all = (await idbReq("readonly", st => st.getAll(), QUEUE_STORE)) || [];
    if (!all.length) return;
    await idbReq("readwrite", st => st.clear(), QUEUE_STORE);
    const files = all.sort((a, b) => a.date - b.date).map(r => r.file).filter(f => f && f.name);
    if (!files.length) return;
    addFiles(files, true);
    toast(files.length > 1 ? `Retomando ${files.length} arquivos que estavam na fila.` : "Retomando o arquivo que estava na fila.", 5000);
  } catch (e) { console.warn("fila", e); }
}
// cada banco tem uma gaveta só e nunca muda de versão: assim uma aba antiga aberta não trava a aba nova
const dbP = {};
function openDb(name, store){
  return dbP[name] ||= new Promise((res, rej) => {
    try {
      // outra aba (de uma versão anterior) pode estar segurando o banco: não espera para sempre
      const t = setTimeout(() => { delete dbP[name]; rej(Object.assign(new Error("banco ocupado por outra aba"), { name: "DbBusy" })); }, 4000);
      const r = indexedDB.open(name);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(store)) r.result.createObjectStore(store, { keyPath: "id" }); };
      r.onsuccess = () => { clearTimeout(t); r.result.onversionchange = () => { r.result.close(); delete dbP[name]; }; res(r.result); };
      r.onerror = () => { clearTimeout(t); rej(r.error); };
    } catch (e) { rej(e); }
  });
}
const idbReq = (mode, fn, store = HIST_STORE) => openDb(store === QUEUE_STORE ? QUEUE_DB : HIST_DB, store).then(db => new Promise((res, rej) => {
  const tx = db.transaction(store, mode), st = tx.objectStore(store), r = fn(st);
  tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
}));
const histAll = () => idbReq("readonly", st => st.getAll()).then(a => (a || []).sort((x, y) => y.date - x.date));
const histDel = id => idbReq("readwrite", st => st.delete(id));
async function saveHistory(job){
  if (!job.epub) return;
  try {
    const cover = await thumbBlob(coverOf(job));
    await idbReq("readwrite", st => st.put({ id: job.histId, title: job.title, author: job.author || "", name: fileNameOf(job), date: Date.now(), size: job.epub.size, blob: job.epub, cover }));
    const all = await histAll();
    for (const r of all.slice(HIST_MAX)) await histDel(r.id);
    renderHistory();
    driveSaveJob(job);
  } catch (e) { console.warn("histórico", e); }
}
// estante: os livros deste navegador e, com a conta Google conectada, os do Drive (sem repetir)
async function renderHistory(){
  const sec = $("#historySec"), box = $("#history");
  let local;
  try { local = await histAll(); } catch (e) {
    local = [];
    if (e && e.name === "DbBusy" && !renderHistory.warned) { renderHistory.warned = true; toast("A estante está presa por outra aba ou janela do Lombada aberta antes da atualização. Feche as outras e recarregue esta página.", 9000); }
  }
  const on = DRIVE_ON && driveConnected() && drv.list;
  const inDrive = new Map((on ? drv.list : []).map(d => [d.hid, d]));
  const items = local.map(r => ({ r, d: inDrive.get(r.id), date: r.date }));
  const seen = new Set(local.map(r => r.id));
  if (on) for (const d of drv.list) if (!seen.has(d.hid)) items.push({ d, date: d.date });
  items.sort((a, b) => b.date - a.date);
  sec.hidden = !items.length;
  $("#shelfCount").textContent = items.length ? String(items.length) : "";
  const localOnly = on ? local.filter(r => !inDrive.has(r.id)).length : 0;
  $("#driveAllBtn").hidden = !localOnly;
  const open = $("#driveOpen"); open.hidden = !(DRIVE_ON && driveRemembered()); open.href = driveFolderUrl();
  $("#driveAllN").textContent = String(localOnly);
  $("#shelfNote").textContent = on ? "Guardados na pasta Lombada do seu Google Drive: aparecem em qualquer aparelho em que você entrar."
    : DRIVE_ON ? "Mostrando só os livros deste navegador. Reconecte ao Drive, no menu da sua conta, para ver os outros."
    : "Os últimos 12 livros ficam guardados neste navegador.";
  box.innerHTML = "";
  for (const it of items) {
    const r = it.r, d = it.d, title = r ? r.title : d.title, author = r ? r.author : d.author, size = r ? r.size : d.size;
    const el = document.createElement("div"); el.className = "book";
    el.innerHTML = `<button class="cover" data-h="pv" aria-label="Prévia"><img alt="" hidden><span class="spine"></span></button>
      ${d ? `<span class="cloud" title="Guardado no seu Google Drive"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.7 4.7 0 0 0 7 18.5z" fill="currentColor"/></svg><span class="sr-only">No Google Drive</span></span>` : ""}
      <button class="rm" data-h="rm" aria-label="Tirar da estante" title="Tirar da estante">×</button>
      <div class="t"></div>
      <div class="d">${esc(new Date(it.date).toLocaleDateString(uiLocale(), { day: "2-digit", month: "short" }))}, ${kb(size)}</div>
      <div class="acts"><button class="btn sm" data-h="dl">Baixar</button>${r ? `<a class="btn ghost sm" data-h="kd" href="https://www.amazon.com.br/sendtokindle" target="_blank" rel="noopener">Kindle</a>` : ""}</div>`;
    const t = el.querySelector(".t"); t.textContent = title; t.title = title + (author ? " — " + author : "");
    el.querySelector(".spine").textContent = title;
    const showCover = blob => { if (!blob) return; const img = el.querySelector(".cover img"); img.src = urlOf(blob); img.hidden = false; el.querySelector(".spine").hidden = true; };
    if (r && r.cover) showCover(r.cover); else if (d) driveCover(d).then(showCover).catch(() => {});
    // livro que só está no Drive vem para este aparelho no primeiro uso
    const get = async () => r || await driveFetch(d);
    el.querySelector('[data-h="dl"]').onclick = async () => { try { const x = await get(); offer(x.name, x.blob); if (!r) renderHistory(); } catch (e) { console.warn(e); toast("Não consegui baixar este livro do Drive."); } };
    if (r) el.querySelector('[data-h="kd"]').onclick = e => sendToKindle(e, { epub: r.blob, title: r.title }, r.name);
    el.querySelector('[data-h="pv"]').onclick = async () => { try { const x = await get(); openPreview(x.blob, x.title); if (!r) renderHistory(); } catch (e) { console.warn(e); toast("Não consegui baixar este livro do Drive."); } };
    const rm = el.querySelector('[data-h="rm"]');
    rm.onclick = async () => {
      if (rm.dataset.confirm) {
        await histDel(r ? r.id : d.hid).catch(() => {});
        if (d) { try { if (await driveTrash(d.hid)) toast("Livro movido para a lixeira do seu Drive."); } catch (e) { console.warn(e); toast("Não consegui tirar este livro do Drive."); } }
        renderHistory(); return;
      }
      rm.dataset.confirm = "1"; rm.textContent = "Tirar?";
      setTimeout(() => { if (rm.isConnected) { delete rm.dataset.confirm; rm.textContent = "×"; } }, 4000);
    };
    box.appendChild(el);
  }
}
