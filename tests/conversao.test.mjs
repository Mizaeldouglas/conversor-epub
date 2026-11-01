// Conversões de ponta a ponta com os arquivos de tests/fixtures
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, addFiles, waitJob, epubOf, tocOf, epubcheck } from "./helpers.mjs";

let server, browser, app;
before(async () => {
  server = await startServer(); browser = await launch();
  app = await openApp(browser, server);
  await app.page.check("#verify");
});
after(async () => { await browser.close(); server.close(); });

test("estilos: capítulos, itálico, negrito, nota, cena, capitular", async () => {
  await addFiles(app.page, ["estilos.pdf"]);
  const r = await waitJob(app.page, 0);
  assert.equal(r.error, null);
  assert.equal(r.chapters, 2);
  assert.deepEqual(r.diffs, [], "texto do EPUB diferente do PDF");
  const z = await epubOf(app.page, 0, "estilos.epub");
  const ch1 = await z.file("OEBPS/text/ch001.xhtml").async("string");
  assert.match(ch1, /<em>cento e doze,?<\/em>/);
  assert.match(ch1, /<strong>NÃO ABRA COM MARÉ ALTA\.<\/strong>/);
  assert.match(ch1, /Alma acordou antes do farol apagar/, "capitular não voltou para a palavra");
  assert.match(ch1, /epub:type="footnote"/);
  assert.match(ch1, /class="cena"/);
  assert.doesNotMatch(ch1, /O Farol de Areia/, "cabeçalho repetido ficou no texto");
  const ck = epubcheck("estilos.epub"); if (ck !== null) assert.equal(ck, "", ck);
});

test("palavras desenhadas sem espaço não saem grudadas", async () => {
  await addFiles(app.page, ["grudado.pdf"]);
  const r = await waitJob(app.page, 1);
  assert.equal(r.error, null);
  assert.deepEqual(r.diffs, []);
  const z = await epubOf(app.page, 1);
  const txt = (await z.file("OEBPS/text/ch001.xhtml").async("string")).replace(/<[^>]+>/g, " ");
  assert.match(txt, /O barqueiro cobrava duas moedas pela travessia/);
  assert.doesNotMatch(txt, /\p{L}{25,}/u, "sobrou palavra grudada");
});

test("capítulos: número grande + título em várias linhas, partes, citação recuada, hífen repetido", async () => {
  await addFiles(app.page, ["capitulos.pdf"]);
  const r = await waitJob(app.page, 2);
  assert.equal(r.error, null);
  assert.deepEqual(r.diffs, []);
  const z = await epubOf(app.page, 2, "capitulos.epub");
  assert.deepEqual(await tocOf(z), [
    ["I. O QUE A MARÉ TROUXE", ["1. A CAIXA QUE CHEGOU NA AREIA (E O QUE HAVIA DENTRO)", "2. O HOMEM QUE CONTAVA AS ONDAS", "2½. UM INTERVALO"]],
    ["II. O QUE A MARÉ LEVOU", ["3. A NOITE EM QUE O FAROL CALOU", "4. DEPOIS"]],
  ]);
  const all = (await Promise.all(Object.keys(z.files).filter(f => /ch\d+\.xhtml$/.test(f)).sort().map(f => z.file(f).async("string")))).join("\n");
  assert.match(all, /<h1>(<span [^>]*><\/span>)?1<br\/>A CAIXA QUE CHEGOU NA AREIA \(E O QUE HAVIA DENTRO\)<\/h1>/);
  assert.match(all, /<p><em>Registro do cais, folha nove: a caixa foi aberta às sete horas, na presença de três testemunhas e de um cachorro sem dono\.<\/em><\/p>/, "citação recuada virou uma linha por parágrafo");
  assert.match(all, /terças-feiras seguintes/);
  const ck = epubcheck("capitulos.epub"); if (ck !== null) assert.equal(ck, "", ck);
});

test("mangá: página fixa, da direita para a esquerda", async () => {
  await app.page.selectOption("#mode", "manga");
  await addFiles(app.page, ["gibi.pdf"]);
  const r = await waitJob(app.page, 3);
  await app.page.selectOption("#mode", "auto");
  assert.equal(r.error, null);
  const z = await epubOf(app.page, 3, "gibi.epub");
  const opf = await z.file("OEBPS/content.opf").async("string");
  assert.match(opf, /pre-paginated/);
  assert.match(opf, /page-progression-direction="rtl"/);
  const ck = epubcheck("gibi.epub"); if (ck !== null) assert.equal(ck, "", ck);
});

test("EPUB pronto ganha números de página e o texto é conferido", async () => {
  await app.page.fill("#cpp", "300");
  await addFiles(app.page, ["livro.epub"]);
  const r = await waitJob(app.page, 4);
  await app.page.fill("#cpp", "");
  assert.equal(r.error, null);
  assert.ok(r.pages > 0, "nenhuma página numerada");
  assert.deepEqual(r.diffs, []);
  const z = await epubOf(app.page, 4, "livro.epub");
  const nav = await z.file(Object.keys(z.files).find(f => /nav\.xhtml$/.test(f))).async("string");
  assert.match(nav, /epub:type="page-list"/);
  const ck = epubcheck("livro.epub"); if (ck !== null) assert.equal(ck, "", ck);
});

test("nenhum erro de JavaScript na página", () => {
  assert.deepEqual(app.errors, []);
});
