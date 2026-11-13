// PDFs "de verdade": feitos pelo Chromium e pelo LibreOffice (tools/gerar-corpus.mjs), com hifenização,
// cabeçalho, número de página, colunas, tabela, listas e versos. Cada parágrafo do texto original
// precisa aparecer inteiro no EPUB, e a conferência palavra por palavra não pode achar diferença.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, addFiles, waitJob, epubOf, tocOf, epubcheck } from "./helpers.mjs";
import * as T from "../tools/corpus-textos.mjs";

let server, browser, app, n = 0;
before(async () => { server = await startServer(); browser = await launch(); app = await openApp(browser, server); await app.page.check("#verify"); });
after(async () => { await browser.close(); server.close(); });

const norm = s => s.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[•]/g, " ").replace(/\s+/g, " ").trim();
// trechos do texto original que o EPUB precisa conter
function pieces(book){
  const out = [];
  for (const b of book.blocos) {
    if (b.h1) out.push(b.h1);
    else if (b.h2) out.push(b.h2);
    else if (b.ul || b.ol) out.push(...(b.ul || b.ol));
    else if (b.tabela) out.push(...b.tabela.flat());
    else if (b.poema) out.push(...b.poema.map(e => e.join(" ")));
    else if (b.colunas) out.push(...b.colunas);
    else if (b.codigo) out.push(...b.codigo.map(l => l.trim()));
    else if (b.link) out.push(norm(b.p) + " " + b.link[0]);
    else if (b.p) out.push(norm(b.p));
  }
  return out;
}
async function convert(file, book){
  await addFiles(app.page, ["tests/corpus/" + file]);
  const i = n++, r = await waitJob(app.page, i);
  assert.equal(r.error, null);
  assert.deepEqual(r.diffs, [], "a conferência achou diferença entre o EPUB e o PDF");
  const out = file.replace(/\.pdf$/, ".epub");
  const z = await epubOf(app.page, i, out);
  const ck = epubcheck(out); if (ck !== null) assert.equal(ck, "", ck);
  const files = Object.keys(z.files).filter(f => /ch\d+\.xhtml$/.test(f)).sort();
  const html = (await Promise.all(files.map(f => z.file(f).async("string")))).join("\n");
  const text = norm(html.replace(/<span[^>]*doc-pagebreak[^>]*><\/span>/g, ""));
  for (const p of pieces(book)) assert.ok(text.includes(p), "faltou no EPUB: " + p.slice(0, 80));
  return { r, html, toc: await tocOf(z), z };
}

test("romance pelo Chromium: hifenização, cabeçalho e número de página somem do texto", async () => {
  const { html, toc, z } = await convert("farol-chrome.pdf", T.farol);
  assert.deepEqual(toc.map(t => t[0]), T.farol.blocos.filter(b => b.h1).map(b => b.h1));
  assert.doesNotMatch(html, /[‐-] \p{Ll}/u, "palavra hifenizada ficou partida");
  assert.doesNotMatch(html, />O Farol Apagado</, "o cabeçalho de página entrou no texto");
  assert.match(html, /<em>não adianta<\/em>/);
  assert.match(html, /class="cena"/);
  assert.ok(z.file("OEBPS/text/sumario.xhtml"), "falta o sumário no começo do livro");
  assert.doesNotMatch(html, /<h1 class="centro/, "título alinhado à esquerda no PDF saiu centralizado");
});

test("romance pelo LibreOffice: capítulos pelo sumário interno do PDF", async () => {
  const { toc, html } = await convert("farol-libreoffice.pdf", T.farol);
  for (const h of T.farol.blocos.filter(b => b.h1).map(b => b.h1)) assert.ok(toc.some(t => t[0] === h), "faltou o capítulo " + h);
  assert.match(html, /class="cena"/);
});

test("manual técnico: tabela com cabeçalho, listas, link e seções", async () => {
  const { html, toc } = await convert("bicicleta-chrome.pdf", T.bicicleta);
  assert.deepEqual(toc.map(t => t[0]), ["1. Antes de começar", "2. A corrente", "3. Freios"]);
  assert.match(html, /<table><tr><td><strong>Tipo de bicicleta<\/strong><\/td><td><strong>Pressão mínima<\/strong><\/td><td><strong>Pressão máxima<\/strong><\/td><\/tr><tr><td>Urbana<\/td><td>40 psi<\/td><td>65 psi<\/td><\/tr>/);
  assert.match(html, /<ul class="lista"><li>• chave Allen de 4, 5 e 6 milímetros<\/li>\n<li>• espátulas plásticas para tirar o pneu<\/li>/);
  assert.match(html, /<li>1\. Coloque a bicicleta de cabeça para baixo, apoiada no selim e no guidão\.<\/li>/);
  assert.match(html, /<\/ul>\n<p>O manual completo, com fotos, está em <a href="https:\/\/www\.pedallivre\.org\/corrente">/);
  assert.match(html, /<h2>Calibragem dos pneus<\/h2>/);
});

test("poemas: cada verso na sua linha, estrofes separadas", async () => {
  const { html } = await convert("poemas-chrome.pdf", T.poemas);
  assert.match(html, /<p class="verso">Quando a maré se recolhe,<br\/>a praia mostra o que guarda:<br\/>conchas, cordas, um chinelo,<br\/>a âncora de uma barca\.<\/p>/);
  assert.equal((html.match(/class="verso"/g) || []).length, 4);
  assert.match(html, /<p>Estes poemas foram escritos ao longo de um inverno numa vila de pescadores\./);
});

test("revista em duas colunas: lida uma coluna de cada vez", async () => {
  const { html } = await convert("revista-chrome.pdf", T.revista);
  assert.match(html, /<h1>A feira que voltou para a praça<\/h1>/);
  assert.doesNotMatch(html, /<table>/, "as colunas viraram tabela");
  const at = s => html.indexOf(s);
  assert.ok(at("três meses para sair do papel") < at("Os feirantes mais antigos") && at("quem sai da missa das nove") < at("Nem tudo foi fácil"));
});

test("apostila: código em bloco próprio, linha a linha e com o recuo", async () => {
  const { html } = await convert("apostila-chrome.pdf", T.apostila);
  const pre = /<pre class="codigo"><code>([\s\S]*?)<\/code><\/pre>/.exec(html);
  assert.ok(pre, "o código não virou bloco de código");
  const lines = pre[1].split("<br/>").map(l => l.replace(/\u00A0/g, " ").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
  assert.deepEqual(lines, T.apostila.blocos.find(b => b.codigo).codigo);
  assert.match(html, /<p>Repare que as linhas/);
});

test("índice do próprio PDF: uma entrada por linha, com o recuo e o link, sem sumário repetido", async () => {
  const { html, z } = await convert("farol-indice-chrome.pdf", T.farol);
  const idx = /<h1[^>]*>[^]*?Índice<\/h1>([^]*?)<\/section>/.exec(html);
  assert.ok(idx, "a página de índice sumiu");
  const entries = [...idx[1].matchAll(/<p class="toc-pdf n(\d)"><a href="(ch\d+\.xhtml#pg\d+)">([^<]+)<\/a><\/p>/g)].map(m => [+m[1], m[3], m[2]]);
  assert.deepEqual(entries.map(e => [e[0], e[1]]), [[0, "Parte um — A chegada"], [1, "Capítulo 1 — A ilha"], [1, "Capítulo 2 — O caderno verde"],
    [0, "Parte dois — A luz que voltou a girar sobre o mar nas noites de nevoeiro da ilha de Ponta Seca"], [1, "Capítulo 3 — O guardião"], [1, "Capítulo 4 — A luz"]]);
  for (const [, t, href] of entries) {
    const [f, id] = href.split("#"), doc = await z.file("OEBPS/text/" + f).async("string");
    assert.ok(doc.includes(`id="${id}"`), "link quebrado: " + t);
  }
  assert.equal(z.file("OEBPS/text/sumario.xhtml"), null, "o livro ficou com dois sumários");
  // capítulos centralizados e começando mais abaixo, como no PDF
  assert.equal((html.match(/<h1 class="centro abertura">/g) || []).length, 4);
});

test("nenhum erro de JavaScript", () => assert.deepEqual(app.errors, []));
