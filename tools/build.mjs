// Monta o index.html publicado a partir de src/ (HTML, CSS, módulos JS e lista de palavras).
// Uso: node tools/build.mjs        -> escreve index.html e sw.js na raiz
//      node tools/build.mjs --check -> falha se os arquivos da raiz estiverem desatualizados
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = p => readFileSync(join(root, "src", p), "utf8");
const { version, googleClientId = "" } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const SITE = "https://mizaeldouglas.github.io/conversor-epub/";

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="6" y="3" width="28" height="34" rx="5" fill="#2536c7"/><rect x="6" y="3" width="6" height="34" rx="3" fill="#1b279a"/><path d="M22 3h7.5v15.5L25.75 15 22 18.5z" fill="#ffd84a"/><path d="M16 25h13M16 30h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;

const files = readdirSync(join(root, "src/js")).filter(f => f.endsWith(".js")).sort();
const js = files.map(f => src("js/" + f).trimEnd()).join("\n\n")
  .replaceAll("@@VERSION@@", version).replaceAll("@@SITE@@", SITE).replaceAll("@@GCLIENT@@", googleClientId);

// confere a sintaxe do JavaScript montado antes de gravar
const tmp = mkdtempSync(join(tmpdir(), "build-"));
try {
  writeFileSync(join(tmp, "app.js"), js);
  execFileSync(process.execPath, ["--check", join(tmp, "app.js")], { stdio: "inherit" });
} finally { rmSync(tmp, { recursive: true, force: true }); }

// troca por função para que "$&" e afins no código não sejam interpretados
const put = (s, key, val) => { if (!s.includes(key)) throw new Error("marcador ausente: " + key); return s.replace(key, () => val); };
let html = src("index.html");
html = put(html, "/* @@CSS@@ */", src("style.css").trimEnd());
html = put(html, "/* @@JS@@ */", js);
html = put(html, "@@WORDS@@", src("data/pt-words.b64").trim());
html = put(html, "@@I18N@@", JSON.stringify(JSON.parse(src("data/idiomas.json"))).replace(/</g, "\\u003c"));
html = html.replaceAll("@@SITE@@", SITE).replaceAll("@@FAVICON@@", encodeURIComponent(favicon)).replaceAll("@@VERSION@@", version);
if (/@@[A-Z]+@@/.test(html)) throw new Error("marcador não substituído: " + html.match(/@@[A-Z]+@@/)[0]);

const sw = src("sw.js").replaceAll("@@VERSION@@", version);
const out = { "index.html": html, "sw.js": sw };

if (process.argv.includes("--check")) {
  const stale = Object.keys(out).filter(f => { try { return readFileSync(join(root, f), "utf8") !== out[f]; } catch { return true; } });
  if (stale.length) { console.error("Desatualizado: " + stale.join(", ") + ". Rode: npm run build"); process.exit(1); }
  console.log("index.html e sw.js em dia (v" + version + ")");
} else {
  for (const [f, s] of Object.entries(out)) writeFileSync(join(root, f), s);
  console.log(`index.html (${Math.round(html.length / 1024)} KB, ${files.length} módulos) e sw.js — v${version}`);
}
