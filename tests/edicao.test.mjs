// Editar o livro depois de converter: capítulos, partes, novo capítulo, prévia
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, addFiles, waitJob, epubOf, tocOf } from "./helpers.mjs";

let server, browser, app, row;
before(async () => {
  server = await startServer(); browser = await launch(); app = await openApp(browser, server);
  await app.page.check("#verify");
  await addFiles(app.page, ["capitulos.pdf"]);
  await waitJob(app.page, 0);
  row = app.page.locator(".row").nth(0);
});
after(async () => { await browser.close(); server.close(); });

test("prévia: sumário legível e botão que leva à lista de capítulos", async () => {
  await row.locator('[data-a="pv"]').click();
  await app.page.waitForSelector("#preview:not([hidden]) .pv-page");
  const opts = await app.page.$$eval("#pvToc option", o => o.map(x => x.textContent));
  assert.ok(opts.includes("1. A CAIXA QUE CHEGOU NA AREIA (E O QUE HAVIA DENTRO)"), opts.join(" | "));
  await app.page.click("#pvEditBtn");
  assert.equal(await app.page.locator("#preview").isHidden(), true);
  assert.equal(await row.locator("details.edit").getAttribute("open"), "");
  assert.equal(await app.page.evaluate(() => document.activeElement && document.activeElement.dataset.c), "text");
});

test("renomear, desfazer parte e criar capítulo a partir de um parágrafo", async () => {
  const items = row.locator(".chap-list li");
  const texts = await items.locator('[data-c="text"]').evaluateAll(a => a.map(x => x.value));
  const iDepois = texts.findIndex(t => /DEPOIS/.test(t)), iII = texts.findIndex(t => /^II /.test(t));
  await items.nth(iDepois).locator('[data-c="text"]').fill("4 DEPOIS DE TUDO");
  await items.nth(iII).locator('[data-c="part"]').uncheck();
  await row.locator('[data-e="apply"]').click();
  let r = await waitJob(app.page, 0);
  assert.equal(r.error, null);
  let toc = await tocOf(await epubOf(app.page, 0));
  // sem a parte II, os capítulos dela ficam dentro da parte I
  assert.equal(toc.length, 1);
  assert.deepEqual(toc[0][1].slice(-3), ["II. O QUE A MARÉ LEVOU", "3. A NOITE EM QUE O FAROL CALOU", "4 DEPOIS DE TUDO"]);
  assert.deepEqual(r.diffs.filter(d => !/DEPOIS|TUDO/.test(d.epub || "")), [], "edição gerou diferença inesperada");

  // novo capítulo
  await row.locator('[data-n="find"]').fill("os pescadores chegaram");
  assert.match(await row.locator('[data-n="hint"]').textContent(), /Achei: “Os pescadores chegaram primeiro/);
  await row.locator('[data-n="go"]').click();
  r = await waitJob(app.page, 0);
  toc = await tocOf(await epubOf(app.page, 0, "editado.epub"));
  assert.ok(toc[0][1].some(t => /^Os pescadores chegaram primeiro/.test(t)), JSON.stringify(toc[0]));
});

test("capa: qualquer página do PDF", async () => {
  await row.locator('[data-e="coverpg"] input').fill("3");
  await row.locator('[data-e="coverpg"] button').click();
  await row.locator(".cv img").waitFor();
  await row.locator('[data-e="apply"]').click();
  const r = await waitJob(app.page, 0);
  assert.equal(r.error, null);
  const z = await epubOf(app.page, 0);
  assert.ok(z.file("OEBPS/images/cover.jpg"), "sem capa no EPUB");
  assert.match(await app.page.locator(".row").nth(0).locator(".seal").textContent(), /Pronto para o Kindle/);
});

test("nenhum erro de JavaScript", () => assert.deepEqual(app.errors, []));
