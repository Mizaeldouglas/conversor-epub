// A página em si: acessibilidade, teclado, privacidade, versão e desempenho
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, launch, openApp, addFiles, waitJob, ROOT } from "./helpers.mjs";
import { audit } from "./a11y.mjs";

const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
let server, browser, app; const workers = [];
before(async () => {
  server = await startServer(); browser = await launch(); app = await openApp(browser, server);
  app.page.on("worker", w => workers.push(w.url()));
  await app.page.check("#verify");
  await addFiles(app.page, ["capitulos.pdf"]);
  await waitJob(app.page, 0);
});
after(async () => { await browser.close(); server.close(); });

test("o PDF é lido num worker, fora da tela", () => {
  assert.ok(workers.length >= 1, "pdf.js rodou na mesma linha da tela");
});

test("versão no rodapé e dados para compartilhar o link", async () => {
  assert.equal(await app.page.textContent("#appVersion"), version);
  const og = await app.page.$$eval('meta[property^="og:"]', m => Object.fromEntries(m.map(x => [x.getAttribute("property"), x.content])));
  assert.equal(og["og:title"], "Conversor PDF para EPUB");
  assert.match(og["og:image"], /^https:\/\/.+\/og\.png$/);
  assert.match(await app.page.getAttribute('meta[name="description"]', "content"), /navegador/);
});

for (const theme of ["light", "dark"]) test(`acessibilidade no tema ${theme === "light" ? "claro" : "escuro"}`, async () => {
  await app.page.evaluate(() => document.querySelectorAll("details").forEach(d => d.open = true));
  await app.page.evaluate(t => document.documentElement.dataset.theme = t, theme);
  await app.page.waitForTimeout(800);
  const r = await app.page.evaluate(`(${audit})()`);
  assert.deepEqual(r.noName, [], "controles sem nome");
  assert.deepEqual(r.noAlt, [], "imagens sem texto alternativo");
  assert.deepEqual(r.dupIds, [], "ids repetidos");
  assert.deepEqual(r.contrast, [], "texto com pouco contraste");
});

test("teclado: prévia recebe o foco, prende o Tab e devolve o foco ao fechar", async () => {
  const btn = app.page.locator('.row [data-a="pv"]').first();
  await btn.focus(); await app.page.keyboard.press("Enter");
  await app.page.waitForSelector("#preview:not([hidden]) .pv-page");
  assert.equal(await app.page.evaluate(() => document.activeElement.id), "pvClose");
  for (let i = 0; i < 15; i++) await app.page.keyboard.press("Tab");
  assert.equal(await app.page.evaluate(() => !!document.activeElement.closest("#preview")), true, "o foco saiu da prévia");
  await app.page.keyboard.press("Escape");
  assert.equal(await app.page.evaluate(() => document.activeElement.dataset.a), "pv");
});

test("leitor de tela é avisado quando o livro fica pronto", async () => {
  assert.match(await app.page.textContent("#sr"), /EPUB pronto/);
});

test("privacidade: link abre a explicação e o botão apaga o que ficou guardado", async () => {
  await app.page.evaluate(() => document.querySelectorAll("details").forEach(d => d.open = false));
  await app.page.click('.foot a[href="#privacidade"]');
  assert.equal(await app.page.getAttribute("#privacidade", "open"), "");
  await app.page.waitForFunction(() => document.querySelectorAll("#history .book").length >= 1);
  await app.page.click("#wipeBtn"); await app.page.click("#wipeBtn");
  await app.page.waitForFunction(() => document.querySelectorAll("#history .book").length === 0);
  assert.equal(await app.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("conversor-epub:")).length), 0);
});

test("nenhum erro de JavaScript", () => assert.deepEqual(app.errors, []));
