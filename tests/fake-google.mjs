// Google simulado para os testes: login falso (Google Identity Services) e um Drive em memória
// ---------- Drive falso, compartilhado entre os "aparelhos" ----------
export const drive = { files: new Map(), n: 0, fail401: 0, requests: [] };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH, OPTIONS" };
const json = (route, body, status = 200) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
function matches(f, q){
  if (/trashed=false/.test(q) && f.trashed) return false;
  const par = /'([^']+)' in parents/.exec(q); if (par && !(f.parents || []).includes(par[1])) return false;
  const mt = /mimeType='([^']+)'/.exec(q); if (mt && f.mimeType !== mt[1]) return false;
  for (const m of q.matchAll(/appProperties has \{ key='([^']+)' and value='([^']*)' \}/g)) if ((f.appProperties || {})[m[1]] !== m[2]) return false;
  return true;
}
function multipart(req){
  const b = /boundary=([^;]+)/.exec(req.headers()["content-type"])[1], buf = req.postDataBuffer();
  const parts = []; let at = buf.indexOf("--" + b);
  while (at >= 0) {
    const next = buf.indexOf("\r\n--" + b, at + 2 + b.length);
    if (next < 0) break;
    const chunk = buf.subarray(at + 2 + b.length + 2, next), sep = chunk.indexOf("\r\n\r\n");
    parts.push({ head: chunk.subarray(0, sep).toString(), body: chunk.subarray(sep + 4) });
    at = next + 2;
  }
  return { meta: JSON.parse(parts[0].body.toString() || "{}"), data: parts[1].body, type: /Content-Type: (.*)/i.exec(parts[1].head)[1].trim() };
}
const pub = f => ({ id: f.id, name: f.name, size: String(f.data ? f.data.length : 0), modifiedTime: f.modifiedTime, appProperties: f.appProperties, mimeType: f.mimeType });
export async function fakeGoogle(ctx){
  await ctx.addInitScript(() => { window.__lombadaGClient = "teste.apps.googleusercontent.com"; });
  await ctx.route("https://accounts.google.com/gsi/client", route => route.fulfill({ contentType: "text/javascript", body: `
    window.google = { accounts: { oauth2: {
      initTokenClient: cfg => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: "tok" + Date.now(), expires_in: 3599, scope: "${"https://www.googleapis.com/auth/drive.file"}" }), 20) }),
      hasGrantedAllScopes: () => true, revoke: (t, cb) => cb && cb({}) } } };` }));
  await ctx.route(/https:\/\/www\.googleapis\.com\/.*/, async route => {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    drive.requests.push(m + " " + url.pathname);
    if (!/^Bearer tok/.test(req.headers()["authorization"] || "")) return json(route, { error: "no auth" }, 401);
    if (drive.fail401 > 0) { drive.fail401--; return json(route, { error: "expired" }, 401); }
    const now = new Date(Date.now() + drive.n * 1000).toISOString();
    if (url.pathname === "/drive/v3/about") return json(route, { user: { displayName: "Ana Ribeiro", emailAddress: "ana@exemplo.org", photoLink: "" } });
    if (url.pathname === "/drive/v3/files" && m === "GET") {
      const list = [...drive.files.values()].filter(f => matches(f, url.searchParams.get("q") || "")).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
      return json(route, { files: list.map(pub) });
    }
    if (url.pathname === "/drive/v3/files" && m === "POST") {
      const meta = JSON.parse(req.postData()), f = { id: "f" + ++drive.n, ...meta, modifiedTime: now };
      drive.files.set(f.id, f); return json(route, { id: f.id });
    }
    let k;
    if ((k = /^\/upload\/drive\/v3\/files(?:\/(.+))?$/.exec(url.pathname))) {
      const { meta, data, type } = multipart(req);
      const f = k[1] ? drive.files.get(k[1]) : { id: "f" + ++drive.n };
      Object.assign(f, meta, { data, type, modifiedTime: now, appProperties: { ...(f.appProperties || {}), ...(meta.appProperties || {}) } });
      drive.files.set(f.id, f); return json(route, pub(f));
    }
    if ((k = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname))) {
      const f = drive.files.get(k[1]); if (!f) return json(route, { error: "not found" }, 404);
      if (m === "PATCH") { Object.assign(f, JSON.parse(req.postData())); return json(route, pub(f)); }
      if (url.searchParams.get("alt") === "media") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": f.type || "application/octet-stream" }, body: f.data });
    }
    return json(route, { error: "fake: " + m + " " + url.pathname }, 400);
  });
}
