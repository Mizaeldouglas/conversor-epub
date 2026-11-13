// Ferramentas comuns dos testes: servidor local, navegador e leitura dos EPUBs gerados.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FIX = join(ROOT, "tests", "fixtures");
export const OUT = join(ROOT, "tests", "saida");
mkdirSync(OUT, { recursive: true });

const { chromium } = require("playwright");
export const JSZip = require(firstExisting([join(ROOT, "node_modules/jszip"), process.env.LIBS_DIR && join(process.env.LIBS_DIR, "jz/dist/jszip.min.js")]));

function firstExisting(list){
  const hit = list.filter(Boolean).find(p => existsSync(p));
  if (!hit) throw new Error("Biblioteca não encontrada. Rode npm install. Procurei em: " + list.filter(Boolean).join(", "));
  return hit;
}

// as bibliotecas do CDN são servidas do node_modules (mesmas versões), para o teste não depender da internet
const LIBS = {
  "pdf.min.js": [join(ROOT, "node_modules/pdfjs-dist/build/pdf.min.js"), process.env.LIBS_DIR && join(process.env.LIBS_DIR, "pdfjs/build/pdf.js")],
  "pdf.worker.min.js": [join(ROOT, "node_modules/pdfjs-dist/build/pdf.worker.min.js"), process.env.LIBS_DIR && join(process.env.LIBS_DIR, "pdfjs/build/pdf.worker.js")],
  "jszip.min.js": [join(ROOT, "node_modules/jszip/dist/jszip.min.js"), process.env.LIBS_DIR && join(process.env.LIBS_DIR, "jz/dist/jszip.min.js")],
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".gz": "application/gzip" };

export function startServer(){
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let file = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r({ url: `http://localhost:${srv.address().port}/`, close: () => srv.close() })));
}

export async function launch(){
  return chromium.launch();
}

// abre o app com as bibliotecas do CDN redirecionadas para o servidor local
export async function openApp(browser, server, { viewport = { width: 1200, height: 1000 }, setup, loggedOut = false, store = "drive" } = {}){
  const ctx = await browser.newContext({ viewport, locale: "pt-BR", acceptDownloads: true, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/fonts\.g|ERR_(TUNNEL|NAME|CONNECTION|INTERNET)|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await ctx.route(/cdnjs\.cloudflare\.com\/.*\/(pdf\.min\.js|pdf\.worker\.min\.js|jszip\.min\.js)$/, (route, req) =>
    route.fulfill({ path: firstExisting(LIBS[req.url().split("/").pop()]), contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  // a busca dos dados do livro na internet fica sem resposta, a não ser que o teste simule uma (rotas do setup valem antes)
  await ctx.route(/googleapis\.com\/books|openlibrary\.org|covers\.openlibrary/, route => route.abort());
  if (setup) await setup(ctx);
  // o site só abre para quem entrou com o Google: os testes começam com uma conta já lembrada (sem acesso ao Drive)
  // e com a escolha de onde guardar já feita (store: null deixa a pergunta aparecer)
  if (store) await ctx.addInitScript(s => { try { if (!sessionStorage.getItem("teste:saiu") && !localStorage.getItem("conversor-epub:guardar")) localStorage.setItem("conversor-epub:guardar", s); } catch {} }, store);
  if (!loggedOut) await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("teste:saiu")) localStorage.setItem("conversor-epub:drive", JSON.stringify({ name: "Ana Ribeiro", email: "ana@exemplo.org", photo: "" })); } catch {} });
  await page.goto(server.url);
  await page.evaluate(() => document.querySelectorAll(".side details").forEach(d => d.open = true));
  return { page, ctx, errors };
}

export async function addFiles(page, names){
  await page.setInputFiles("#file", names.map(n => n.includes("/") ? join(ROOT, n) : join(FIX, n)));
}

export async function waitJob(page, i, timeout = 120000){
  await page.waitForFunction(i => { const j = window.__app.jobs[i]; return j && !j.busy && (j.epub || j.error || j.cancelled); }, i, { timeout });
  return page.evaluate(i => { const j = window.__app.jobs[i];
    return { title: j.title, error: j.error, chapters: j.chapters, pages: j.pageMarks, notes: j.notesN, images: j.images,
      diffs: j.verify ? j.verify.diffs.map(d => ({ p: d.p, pdf: d.pdf, epub: d.epub })) : null, total: j.verify ? j.verify.total : null }; }, i);
}

export async function epubOf(page, i, name){
  const bytes = await page.evaluate(async i => Array.from(new Uint8Array(await window.__app.jobs[i].epub.arrayBuffer())), i);
  const buf = Buffer.from(bytes);
  if (name) writeFileSync(join(OUT, name), buf);
  return JSZip.loadAsync(buf);
}

// sumário do EPUB como árvore de títulos: [["I. O QUE…", ["1. A CAIXA…", …]], …]
export async function tocOf(zip){
  const nav = await zip.file("OEBPS/nav.xhtml").async("string");
  const toc = nav.slice(nav.indexOf('epub:type="toc"'), nav.indexOf("</nav>"));
  const out = []; let depth = 0, cur = null;
  for (const m of toc.matchAll(/<(\/?)ol>|<a [^>]*>([^<]*)<\/a>/g)) {
    if (m[0] === "<ol>") depth++;
    else if (m[0] === "</ol>") depth--;
    else if (depth === 1) { cur = [unesc(m[2]), []]; out.push(cur); }
    else cur[1].push(unesc(m[2]));
  }
  return out;
}
const unesc = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

// EPUBCheck, quando disponível (no CI sempre; localmente se EPUBCHECK_JAR estiver definido)
export function epubcheck(name){
  const jar = process.env.EPUBCHECK_JAR;
  if (!jar || !existsSync(jar)) return null;
  try { execFileSync("java", ["-jar", jar, "-q", join(OUT, name)], { stdio: "pipe" }); return ""; }
  catch (e) { return String(e.stdout || "") + String(e.stderr || ""); }
}
