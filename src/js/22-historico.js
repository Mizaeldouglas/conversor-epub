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
      const r = indexedDB.open(name);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(store)) r.result.createObjectStore(store, { keyPath: "id" }); };
      r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); delete dbP[name]; }; res(r.result); };
      r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("banco ocupado por outra aba"));
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
  } catch (e) { console.warn("histórico", e); }
}
async function renderHistory(){
  const sec = $("#historySec"), box = $("#history");
  let all;
  try { all = await histAll(); } catch { sec.hidden = true; return; }
  sec.hidden = !all.length;
  $("#shelfCount").textContent = all.length ? String(all.length) : "";
  box.innerHTML = "";
  for (const r of all) {
    const el = document.createElement("div"); el.className = "book";
    el.innerHTML = `<button class="cover" data-h="pv" aria-label="Prévia">${r.cover ? `<img alt="">` : `<span class="spine"></span>`}</button>
      <button class="rm" data-h="rm" aria-label="Tirar da estante" title="Tirar da estante">×</button>
      <div class="t"></div>
      <div class="d">${esc(new Date(r.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }))}, ${kb(r.size)}</div>
      <div class="acts"><button class="btn sm" data-h="dl">Baixar</button><a class="btn ghost sm" data-h="kd" href="https://www.amazon.com.br/sendtokindle" target="_blank" rel="noopener">Kindle</a></div>`;
    const name = r.title + (r.author ? " — " + r.author : "");
    el.querySelector(".t").textContent = r.title; el.querySelector(".t").title = name;
    if (r.cover) el.querySelector(".cover img").src = urlOf(r.cover); else el.querySelector(".spine").textContent = r.title;
    el.querySelector('[data-h="dl"]').onclick = () => offer(r.name, r.blob);
    el.querySelector('[data-h="kd"]').onclick = e => sendToKindle(e, { epub: r.blob, title: r.title }, r.name);
    el.querySelector('[data-h="pv"]').onclick = () => openPreview(r.blob, r.title);
    const rm = el.querySelector('[data-h="rm"]');
    rm.onclick = async () => {
      if (rm.dataset.confirm) { await histDel(r.id).catch(() => {}); renderHistory(); return; }
      rm.dataset.confirm = "1"; rm.textContent = "Tirar?";
      setTimeout(() => { if (rm.isConnected) { delete rm.dataset.confirm; rm.textContent = "×"; } }, 4000);
    };
    box.appendChild(el);
  }
}
