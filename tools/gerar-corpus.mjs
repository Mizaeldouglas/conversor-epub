// Gera os PDFs "de verdade" dos testes (tests/corpus) e o livro de exemplo do site (exemplo/).
// Os PDFs saem de programas reais: o Chromium (como "Imprimir > Salvar como PDF") e o LibreOffice
// (como um DOCX exportado pelo Writer), com hifenização, cabeçalho, número de página, colunas e sumário interno.
// Uso: node tools/gerar-corpus.mjs   (precisa do Playwright, do pandoc e do LibreOffice)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync, copyFileSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import * as T from "./corpus-textos.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "tests/corpus"), EX = join(root, "exemplo");
mkdirSync(OUT, { recursive: true }); mkdirSync(EX, { recursive: true });

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = s => esc(s).replace(/&lt;(\/?)i&gt;/g, "<$1i>");

function html(book, { capa = false, indice = null } = {}){
  let hn = 0;
  const body = book.blocos.map(b => {
    if (b.h1) return `<h1 id="c${++hn}">${esc(b.h1)}</h1>`;
    if (b.h2) return `<h2>${esc(b.h2)}</h2>`;
    if (b.cena) return `<p class="cena">* * *</p>`;
    if (b.ul) return `<ul>${b.ul.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    if (b.ol) return `<ol>${b.ol.map(i => `<li>${esc(i)}</li>`).join("")}</ol>`;
    if (b.tabela) return `<table>${b.tabela.map((r, i) => `<tr>${r.map(c => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join("")}</tr>`).join("")}</table>`;
    if (b.poema) return b.poema.map(e => `<p class="estrofe">${e.map(esc).join("<br>")}</p>`).join("");
    if (b.codigo) return `<pre>${b.codigo.map(esc).join("\n")}</pre>`;
    if (b.colunas) return `<div class="colunas">${b.colunas.map(p => `<p>${esc(p)}</p>`).join("")}</div>`;
    if (b.link) return `<p>${inline(b.p)} <a href="${b.link[1]}">${esc(b.link[0])}</a>.</p>`;
    return `<p>${inline(b.p)}</p>`;
  }).join("\n");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(book.titulo)}</title><meta name="author" content="${esc(book.autor)}">
<style>
@page{size:A5;margin:22mm 18mm 20mm}
body{font:11pt/1.45 "Liberation Serif","DejaVu Serif",serif;color:#111;margin:0;hyphens:auto;-webkit-hyphens:auto}
h1{font-size:19pt;line-height:1.2;margin:0 0 14pt;break-before:page;font-weight:bold}
h1:first-of-type{break-before:auto}
h2{font-size:13.5pt;margin:14pt 0 6pt}
p{margin:0;text-align:justify;text-indent:1.3em}
h1+p,h2+p,.cena+p{text-indent:0}
.cena{text-align:center;text-indent:0;margin:10pt 0}
ul,ol{margin:6pt 0 8pt;padding-left:18pt}
li{margin:0 0 3pt}
table{border-collapse:collapse;margin:8pt 0 10pt}
th,td{border:0.6pt solid #555;padding:3pt 7pt;text-align:left;font-size:10pt}
.estrofe{text-indent:0;text-align:left;margin:0 0 10pt 22pt}
.colunas{column-count:2;column-gap:9mm}
pre{font:9.5pt/1.35 "Liberation Mono","DejaVu Sans Mono",monospace;margin:8pt 0 10pt;padding:6pt 8pt;background:#f2f2f2;white-space:pre-wrap}
.colunas p{text-indent:0;margin:0 0 7pt}
.capa{break-after:page;height:150mm;display:flex;flex-direction:column;justify-content:center;text-align:center}
.capa h1{font-size:30pt;break-before:auto;margin:0 0 12pt}
.capa p{text-align:center;text-indent:0;font-style:italic;font-size:14pt}
.indice{break-after:page}
.indice p{text-indent:0;text-align:left;margin:0 0 4pt}
.indice p.n1{margin-left:16pt}
.indice a{color:#123;text-decoration:none}
.ficha{break-after:page;font-size:8.5pt;line-height:1.35;padding-top:60mm}
.ficha p{text-indent:0;text-align:left;margin:0 0 3pt}
</style></head><body>
${capa ? `<section class="capa"><div style="font-size:30pt;font-weight:bold;margin-bottom:12pt">${esc(book.titulo)}</div><p>${esc(book.autor)}</p></section>` : ""}
${capa && book.ficha ? `<section class="ficha">${book.ficha.map(l => `<p>${esc(l)}</p>`).join("")}</section>` : ""}
${indice ? `<section class="indice"><h1>Índice</h1>${indice.map(([nivel, texto, alvo]) => `<p class="n${nivel}"><a href="#c${alvo}">${esc(texto)}</a></p>`).join("")}</section>` : ""}
${body}
</body></html>`;
}

const browser = await chromium.launch();
async function chromePdf(book, file, opt = {}){
  const page = await browser.newPage();
  await page.setContent(html(book, opt), { waitUntil: "load" });
  await page.pdf({ path: file, format: "A5", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: `<div style="font:8pt serif;width:100%;text-align:center;color:#555">${esc(book.titulo)}</div>`,
    footerTemplate: `<div style="font:8pt serif;width:100%;text-align:center;color:#555"><span class="pageNumber"></span></div>`,
    margin: { top: "22mm", bottom: "20mm", left: "18mm", right: "18mm" }, tagged: true, outline: !!opt.outline });
  await page.close();
}
await chromePdf(T.farol, join(OUT, "farol-chrome.pdf"));
await chromePdf(T.bicicleta, join(OUT, "bicicleta-chrome.pdf"));
await chromePdf(T.poemas, join(OUT, "poemas-chrome.pdf"));
await chromePdf(T.revista, join(OUT, "revista-chrome.pdf"));
await chromePdf(T.apostila, join(OUT, "apostila-chrome.pdf"));
// romance com página de índice clicável, com partes e capítulos recuados, como os livros de editora
await chromePdf(T.farol, join(OUT, "farol-indice-chrome.pdf"), { indice: [[0, "Parte um — A chegada", 1], [1, "Capítulo 1 — A ilha", 1], [1, "Capítulo 2 — O caderno verde", 2], [0, "Parte dois — A luz que voltou a girar sobre o mar nas noites de nevoeiro da ilha de Ponta Seca", 3], [1, "Capítulo 3 — O guardião", 3], [1, "Capítulo 4 — A luz", 4]] });
await chromePdf(T.farol, join(EX, "o-farol-apagado.pdf"), { capa: true });
await browser.close();

// o mesmo romance como um DOCX do Word exportado pelo LibreOffice (com sumário interno nos marcadores)
const md = `---\ntitle: "${T.farol.titulo}"\nauthor: "${T.farol.autor}"\nlang: pt-BR\n---\n\n` + T.farol.blocos.map(b =>
  b.h1 ? `# ${b.h1}` : b.cena ? "\\* \\* \\*" : b.p.replace(/<\/?i>/g, "*")).join("\n\n") + "\n";
const tmp = mkdtempSync(join(tmpdir(), "corpus-"));
try {
  writeFileSync(join(tmp, "farol.md"), md);
  execFileSync("pandoc", [join(tmp, "farol.md"), "-o", join(tmp, "farol.docx")]);
  execFileSync("soffice", ["--headless", "--convert-to", 'pdf:writer_pdf_Export:{"ExportBookmarks":{"type":"boolean","value":"true"}}', "--outdir", tmp, join(tmp, "farol.docx")], { stdio: "ignore", env: { ...process.env, HOME: tmp } });
  copyFileSync(join(tmp, "farol.pdf"), join(OUT, "farol-libreoffice.pdf"));
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log("PDFs em tests/corpus e exemplo/");
