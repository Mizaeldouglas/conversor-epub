// Monta o index.html publicado a partir de src/ (HTML, CSS, módulos JS e lista de palavras).
// Uso: node tools/build.mjs        -> escreve index.html, sw.js e dados/ na raiz, e dist/artefato.html (tudo num arquivo só)
//      node tools/build.mjs --check -> falha se os arquivos da raiz estiverem desatualizados
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = p => readFileSync(join(root, "src", p), "utf8");
const { version, googleClientId = "", goatcounter = "" } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const SITE = "https://mizaeldouglas.github.io/conversor-epub/";

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="6" y="3" width="28" height="34" rx="5" fill="#2536c7"/><rect x="6" y="3" width="6" height="34" rx="3" fill="#1b279a"/><path d="M22 3h7.5v15.5L25.75 15 22 18.5z" fill="#ffd84a"/><path d="M16 25h13M16 30h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;

const files = readdirSync(join(root, "src/js")).filter(f => f.endsWith(".js")).sort();
const js = files.map(f => src("js/" + f).trimEnd()).join("\n\n")
  .replaceAll("@@VERSION@@", version).replaceAll("@@SITE@@", SITE).replaceAll("@@GCLIENT@@", googleClientId).replaceAll("@@GOAT@@", goatcounter);

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
const words = src("data/pt-words.b64").trim(), i18n = JSON.stringify(JSON.parse(src("data/idiomas.json")));
// o site baixa a lista de palavras e as traduções só quando precisa; o artefato (um arquivo só) leva tudo dentro
const inline = `<script type="application/json" id="i18n-data">${i18n.replace(/</g, "\\u003c")}</script>\n<script type="text/plain" id="pt-words">${words}</script>`;
const artifactHtml = put(html, "@@DATA@@", inline);
html = put(html, "@@DATA@@", "");
html = html.replaceAll("@@GCLIENT@@", googleClientId).replaceAll("@@SITE@@", SITE).replaceAll("@@FAVICON@@", encodeURIComponent(favicon)).replaceAll("@@VERSION@@", version);
const fill = h => h.replaceAll("@@GCLIENT@@", googleClientId).replaceAll("@@SITE@@", SITE).replaceAll("@@FAVICON@@", encodeURIComponent(favicon)).replaceAll("@@VERSION@@", version);
const artifact = fill(artifactHtml);
for (const h of [html, artifact]) if (/@@[A-Z]+@@/.test(h)) throw new Error("marcador não substituído: " + h.match(/@@[A-Z]+@@/)[0]);

const sw = src("sw.js").replaceAll("@@VERSION@@", version);
const out = { "index.html": html, "sw.js": sw, "dados/pt-words.b64": words + "\n", "dados/idiomas.json": i18n + "\n" };

if (process.argv.includes("--check")) {
  const stale = Object.keys(out).filter(f => { try { return readFileSync(join(root, f), "utf8") !== out[f]; } catch { return true; } });
  if (stale.length) { console.error("Desatualizado: " + stale.join(", ") + ". Rode: npm run build"); process.exit(1); }
  console.log("index.html e sw.js em dia (v" + version + ")");
} else {
  mkdirSync(join(root, "dados"), { recursive: true }); mkdirSync(join(root, "dist"), { recursive: true });
  for (const [f, s] of Object.entries(out)) writeFileSync(join(root, f), s);
  writeFileSync(join(root, "dist/artefato.html"), artifact);
  console.log(`index.html (${Math.round(html.length / 1024)} KB, ${files.length} módulos), sw.js e dados/ — v${version}; artefato em dist/ (${Math.round(artifact.length / 1024)} KB)`);
}
