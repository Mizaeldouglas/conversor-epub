/* ---------- Google Drive: entrar com o Google e guardar os livros na pasta "Lombada" do Drive da pessoa ----------
   Opcional e só no site. O app pede só o acesso "drive.file": enxerga apenas os arquivos que ele mesmo criou,
   nunca o resto do Drive. O script do Google só é baixado quando a pessoa clica em "Entrar com Google". */
const GCLIENT = window.__lombadaGClient || "@@GCLIENT@@";
const DRIVE_ON = ON_SITE && /\.apps\.googleusercontent\.com$/.test(GCLIENT);
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API = "https://www.googleapis.com/drive/v3/", DRIVE_UP = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_ACCT = "conversor-epub:drive", DRIVE_TOKEN = "conversor-epub:drive-token";
const drv = { token: null, exp: 0, user: null, folder: null, covers: null, list: null, coverBlobs: new Map(), pending: new Set(), client: null };
const driveConnected = () => !!(drv.token && Date.now() < drv.exp - 60000);
const driveErr = (msg, name) => Object.assign(new Error(msg), { name });

function driveRemembered(){ try { return JSON.parse(localStorage.getItem(DRIVE_ACCT) || "null"); } catch { return null; } }
// o acesso dura uma hora; guardado só nesta aba, para recarregar a página sem entrar de novo
try { const t = JSON.parse(sessionStorage.getItem(DRIVE_TOKEN) || "null"); if (t && t.exp > Date.now() + 60000) { drv.token = t.token; drv.exp = t.exp; drv.user = driveRemembered(); } } catch {}

let gisP = null;
const loadGis = () => gisP ||= new Promise((res, rej) => {
  const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
  s.onload = () => window.google && google.accounts ? res() : rej(new Error("gis"));
  s.onerror = () => { gisP = null; rej(new Error("gis")); };
  document.head.appendChild(s);
});

// o site só abre para quem entrou: sem conta lembrada, aparece a página de apresentação
const loggedIn = () => !!driveRemembered();
function applyGate(){ document.body.classList.toggle("gated", DRIVE_ON && !loggedIn()); }
const loginBtns = on => document.querySelectorAll("[data-login]").forEach(b => { b.disabled = !on; });
async function driveLogin(){
  loginBtns(false);
  try {
    await loadGis();
    const resp = await new Promise((res, rej) => {
      drv.client = google.accounts.oauth2.initTokenClient({ client_id: GCLIENT, scope: DRIVE_SCOPE, callback: res, error_callback: rej });
      const acct = driveRemembered();
      drv.client.requestAccessToken({ prompt: "", ...(acct && acct.email ? { login_hint: acct.email } : {}) });
    });
    if (resp.error) throw driveErr(resp.error, "DriveLogin");
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) { toast("O Google não deu acesso ao Drive. Entre de novo e marque a permissão para o Lombada guardar os livros.", 9000); return; }
    drv.token = resp.access_token; drv.exp = Date.now() + (+resp.expires_in || 3600) * 1000;
    try { sessionStorage.setItem(DRIVE_TOKEN, JSON.stringify({ token: drv.token, exp: drv.exp })); } catch {}
    const about = await gapi("about?fields=user(displayName,emailAddress,photoLink)");
    drv.user = { name: about.user.displayName || "", email: about.user.emailAddress || "", photo: about.user.photoLink || "" };
    try { localStorage.setItem(DRIVE_ACCT, JSON.stringify(drv.user)); } catch {}
    const first = document.body.classList.contains("gated");
    applyGate(); renderAccount();
    if (first) scrollTo(0, 0);
    toast("Conectado ao Google Drive.");
    await driveRefresh();
    // livros que ficaram esperando a conexão (convertidos com ela expirada)
    for (const hid of [...drv.pending]) { const j = jobs.find(j => j.histId === hid); if (j && j.epub) driveSaveJob(j); }
    drv.pending.clear();
  } catch (e) {
    console.warn("login google", e);
    if (!(e && /popup_closed|access_denied/.test(e.type || e.message || ""))) toast("Não consegui entrar com o Google. Tente de novo.");
  } finally { loginBtns(true); }
}
function driveLogout(){
  const tok = drv.token;
  Object.assign(drv, { token: null, exp: 0, user: null, folder: null, covers: null, list: null }); drv.coverBlobs.clear();
  try { sessionStorage.removeItem(DRIVE_TOKEN); localStorage.removeItem(DRIVE_ACCT); } catch {}
  try { if (tok && window.google && google.accounts) google.accounts.oauth2.revoke(tok, () => {}); } catch {}
  applyGate(); renderAccount(); renderHistory(); scrollTo(0, 0);
  toast("Você saiu da conta Google. Os livros continuam no seu Drive.");
}
function driveExpired(){
  if (!drv.token) return;
  drv.token = null; drv.exp = 0;
  try { sessionStorage.removeItem(DRIVE_TOKEN); } catch {}
  renderAccount(); renderHistory();
  toast("A conexão com o Drive expirou. Use “Reconectar” para continuar guardando os livros.", 8000);
}

// chamada à API do Drive com o acesso da pessoa
async function gapi(path, opt = {}, raw){
  if (!driveConnected()) { driveExpired(); throw driveErr("sem conexão", "DriveAuth"); }
  const r = await fetch(/^https:/.test(path) ? path : DRIVE_API + path, { ...opt, headers: { Authorization: "Bearer " + drv.token, ...(opt.headers || {}) } });
  if (r.status === 401) { driveExpired(); throw driveErr("acesso expirado", "DriveAuth"); }
  if (!r.ok) throw driveErr("Drive " + r.status, "DriveHttp");
  return raw ? r : r.status === 204 ? null : r.json();
}
const qs = o => Object.entries(o).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
const qStr = s => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
// valores de appProperties: até 124 bytes por par chave+valor
const propCut = (k, v) => { const enc = new TextEncoder(); v = String(v || ""); while (enc.encode(k + v).length > 120) v = v.slice(0, -1); return v; };

async function driveFolder(name, parent, tag){
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='lombada' and value=${qStr(tag)} }` + (parent ? ` and ${qStr(parent)} in parents` : "");
  const found = await gapi("files?" + qs({ q, fields: "files(id)", pageSize: 1 }));
  if (found.files && found.files.length) return found.files[0].id;
  const made = await gapi("files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", appProperties: { lombada: tag }, ...(parent ? { parents: [parent] } : {}) }) });
  return made.id;
}
async function driveFolders(){
  drv.folder ||= await driveFolder("Lombada", null, "pasta");
  drv.covers ||= await driveFolder("capas", drv.folder, "capas");
}
// envia (ou atualiza) um arquivo: metadados + conteúdo numa só requisição
async function driveUpload(id, meta, blob){
  const b = "lombada" + uuid().replace(/-/g, "");
  const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`, blob, `\r\n--${b}--`]);
  return gapi(DRIVE_UP + (id ? "/" + id : "") + "?uploadType=multipart&fields=id,name,size,modifiedTime,appProperties",
    { method: id ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body });
}
const findByHid = async (hid, parent) => ((await gapi("files?" + qs({ q: `trashed=false and ${qStr(parent)} in parents and appProperties has { key='hid' and value=${qStr(hid)} }`, fields: "files(id)", pageSize: 1 }))).files || [])[0];

// guarda um livro da estante no Drive (o mesmo livro gerado de novo substitui o anterior)
async function driveSaveRecord(r){
  await driveFolders();
  const meta = { name: r.name, mimeType: "application/epub+zip", description: r.title + (r.author ? " — " + r.author : ""),
    appProperties: { lombada: "livro", hid: r.id, t: propCut("t", r.title), a: propCut("a", r.author || "") } };
  const old = await findByHid(r.id, drv.folder);
  const f = await driveUpload(old && old.id, old ? { name: meta.name, description: meta.description, appProperties: meta.appProperties } : { ...meta, parents: [drv.folder] }, new Blob([r.blob], { type: "application/epub+zip" }));
  if (r.cover) {
    const oc = await findByHid(r.id, drv.covers);
    await driveUpload(oc && oc.id, oc ? {} : { name: r.id + ".jpg", parents: [drv.covers], appProperties: { lombada: "capa", hid: r.id } }, r.cover).catch(e => console.warn("capa no drive", e));
    drv.coverBlobs.set(r.id, r.cover);
  }
  return f;
}
async function driveSaveJob(job){
  if (!DRIVE_ON) return;
  if (!driveConnected()) { if (loggedIn()) { drv.pending.add(job.histId); job.driveState = "wait"; render(job); renderAccount(); } return; }
  job.driveState = "up"; render(job);
  try {
    const rec = await idbReq("readonly", st => st.get(job.histId));
    if (!rec) throw new Error("livro não está na estante");
    await driveSaveRecord(rec);
    job.driveState = "ok";
    driveRefresh();
  } catch (e) {
    console.warn("drive", e);
    job.driveState = e && e.name === "DriveAuth" ? "wait" : "err";
    if (e && e.name === "DriveAuth") drv.pending.add(job.histId);
  }
  render(job);
}
// lista dos livros guardados no Drive
async function driveRefresh(){
  if (!driveConnected()) return;
  try {
    await driveFolders();
    const res = await gapi("files?" + qs({ q: `${qStr(drv.folder)} in parents and trashed=false and appProperties has { key='lombada' and value='livro' }`,
      fields: "files(id,name,size,modifiedTime,appProperties)", orderBy: "modifiedTime desc", pageSize: 200 }));
    const cov = await gapi("files?" + qs({ q: `${qStr(drv.covers)} in parents and trashed=false`, fields: "files(id,appProperties)", pageSize: 400 }));
    const coverId = new Map((cov.files || []).map(f => [(f.appProperties || {}).hid, f.id]));
    drv.list = (res.files || []).map(f => ({ id: f.id, hid: (f.appProperties || {}).hid || f.id, title: (f.appProperties || {}).t || f.name.replace(/\.epub$/i, ""),
      author: (f.appProperties || {}).a || "", name: f.name, size: +f.size || 0, date: Date.parse(f.modifiedTime) || 0, coverId: coverId.get((f.appProperties || {}).hid) }));
  } catch (e) { console.warn("drive lista", e); }
  renderHistory();
}
async function driveCover(d){
  if (drv.coverBlobs.has(d.hid)) return drv.coverBlobs.get(d.hid);
  if (!d.coverId) return null;
  const b = await (await gapi(`files/${d.coverId}?alt=media`, {}, true)).blob();
  drv.coverBlobs.set(d.hid, b); return b;
}
// traz um livro do Drive para este aparelho (entra na estante local)
async function driveFetch(d){
  toast("Baixando do Drive…");
  const blob = new Blob([await (await gapi(`files/${d.id}?alt=media`, {}, true)).blob()], { type: "application/epub+zip" });
  const cover = await driveCover(d).catch(() => null);
  const rec = { id: d.hid, title: d.title, author: d.author, name: d.name, date: d.date, size: blob.size, blob, cover };
  await idbReq("readwrite", st => st.put(rec)).catch(() => {});
  return rec;
}
async function driveTrash(hid){
  if (!driveConnected()) return false;
  await driveFolders();
  let n = 0;
  for (const p of [drv.folder, drv.covers]) {
    const f = await findByHid(hid, p);
    if (f) { await gapi(`files/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }); n++; }
  }
  drv.list = (drv.list || []).filter(d => d.hid !== hid);
  return n > 0;
}
// envia ao Drive os livros da estante deste navegador que ainda não estão lá
async function driveSaveAll(){
  const btn = $("#driveAllBtn"); btn.disabled = true;
  try {
    const have = new Set((drv.list || []).map(d => d.hid));
    const local = (await histAll()).filter(r => !have.has(r.id));
    let n = 0;
    for (const r of local) { await driveSaveRecord(r); n++; }
    toast(n === 1 ? "1 livro guardado no seu Drive." : `${n} livros guardados no seu Drive.`);
  } catch (e) { console.warn(e); toast("Não consegui guardar no Drive. Tente de novo."); }
  finally { btn.disabled = false; await driveRefresh(); }
}

// conta no topo da página
function renderAccount(){
  const box = $("#acct");
  box.hidden = !DRIVE_ON;
  if (!DRIVE_ON) return;
  // quem já entrou continua com a conta no topo; o acesso ao Drive dura uma hora e é refeito em "Reconectar"
  const user = drv.user || driveRemembered(), on = driveConnected();
  $("#loginBtn").hidden = true;
  $("#acctMenu").hidden = !user;
  $("#acctMenu").classList.toggle("off", !on);
  if (user) {
    const img = $("#acctPhoto");
    img.hidden = !user.photo; if (user.photo) img.src = user.photo;
    $("#acctInitial").hidden = !!user.photo; $("#acctInitial").textContent = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
    $("#acctName").textContent = (user.name || user.email || "").split(" ")[0];
    $("#acctMail").textContent = user.email || "";
    $("#reconnectBtn").hidden = on;
    $("#acctFolder").hidden = !on;
    $("#acctFolder").href = drv.folder ? "https://drive.google.com/drive/folders/" + drv.folder : "https://drive.google.com/drive/my-drive";
  }
}
document.querySelectorAll("[data-login]").forEach(b => { b.onclick = () => { $("#acctMenu").open = false; driveLogin(); }; });

$("#logoutBtn").onclick = () => { $("#acctMenu").open = false; driveLogout(); };
$("#driveAllBtn").onclick = driveSaveAll;
document.addEventListener("click", e => { const m = $("#acctMenu"); if (m.open && !m.contains(e.target)) m.open = false; });
applyGate(); renderAccount();
if (driveConnected()) driveRefresh();
