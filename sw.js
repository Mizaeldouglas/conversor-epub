// Lombada (PDF para EPUB): funciona sem internet e recebe arquivos pelo "Compartilhar" do celular
const VERSION = "3.5.0";
const CACHE = "conversor-epub-" + VERSION;
const SHARE = "conversor-epub-compartilhado";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== SHARE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function receiveShare(req){
  const fd = await req.formData();
  const c = await caches.open(SHARE);
  for (const k of await c.keys()) await c.delete(k);
  let i = 0;
  for (const f of fd.getAll("arquivos")) {
    if (!f || typeof f === "string") continue;
    await c.put(new Request("./compartilhado/" + (i++) + "/" + encodeURIComponent(f.name || "arquivo")),
      new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }));
  }
  return Response.redirect("./?compartilhado=1", 303);
}

// a página pergunta a versão para saber se precisa avisar que há uma nova
self.addEventListener("message", e => { if (e.data === "versao" && e.source) e.source.postMessage({ versao: VERSION }); });

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/compartilhar")) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET") return;
  // a página: rede primeiro (pega a versão nova), cópia guardada sem internet
  if (req.mode === "navigate" || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); }
      return r;
    }).catch(() => caches.match("./index.html").then(r => r || caches.match("./"))));
    return;
  }
  // bibliotecas, OCR e ícones: cópia guardada primeiro
  const keep = url.origin === location.origin || /(^|\.)(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)$/.test(url.hostname);
  if (!keep) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return r;
  })));
});
