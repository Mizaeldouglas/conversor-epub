// Erros comuns: a mensagem diz o que aconteceu e o que fazer
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, addFiles, waitJob } from "./helpers.mjs";

let server, browser, app;
before(async () => { server = await startServer(); browser = await launch(); app = await openApp(browser, server); });
after(async () => { await browser.close(); server.close(); });

test("PDF com senha: pede a senha, avisa se errar e abre com a certa", async () => {
  await addFiles(app.page, ["senha.pdf"]);
  let r = await waitJob(app.page, 0);
  assert.match(r.error, /tem senha/);
  const row = app.page.locator(".row").nth(0);
  await row.locator(".pwbox input").fill("errada");
  await row.locator(".pwbox button").click();
  r = await waitJob(app.page, 0);
  assert.match(r.error, /Senha incorreta/);
  await row.locator(".pwbox input").fill("segredo");
  await row.locator(".pwbox button").click();
  r = await waitJob(app.page, 0);
  assert.equal(r.error, null);
  assert.ok(r.chapters >= 1);
});

test("arquivo danificado: explica e sugere o que fazer", async () => {
  await addFiles(app.page, ["corrompido.pdf"]);
  const r = await waitJob(app.page, 1);
  assert.match(r.error, /não é um PDF válido ou está danificado/);
});

test("PDF escaneado sem OCR: oferece converter com OCR", async () => {
  await addFiles(app.page, ["escaneado.pdf"]);
  const r = await waitJob(app.page, 2);
  assert.equal(r.error, null);
  const btn = app.page.locator(".row").nth(2).locator('[data-a="ocr"]');
  assert.equal(await btn.count(), 1);
  assert.match(await app.page.locator(".row").nth(2).textContent(), /2 páginas são só imagem/);
});

test("arquivo de formato desconhecido é recusado com aviso", async () => {
  await app.page.setInputFiles("#file", { name: "notas.xyz", mimeType: "application/octet-stream", buffer: Buffer.from("oi") });
  await app.page.waitForSelector("#toast:not([hidden])");
  assert.match(await app.page.textContent("#toast"), /foi ignorado/);
});

test("nenhum erro de JavaScript inesperado", () => {
  assert.deepEqual(app.errors, []);
});
