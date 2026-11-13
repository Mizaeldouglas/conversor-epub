// Arquivos que chegam de fora do site ("Abrir com" no computador) e outras novidades da 3.8
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, launch, openApp, waitJob, FIX } from "./helpers.mjs";

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.close(); });

// launchQueue falso (o do Chromium é só de leitura): guarda quem consome os arquivos para o teste entregar um
const fakeLaunch = ctx => ctx.addInitScript(() => { Object.defineProperty(window, "launchQueue", { configurable: true, value: { setConsumer(f){ window.__launch = f; } } }); });
const launchFile = (p, name, b64) => p.evaluate(async ([name, b64]) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await window.__launch({ files: [{ getFile: async () => new File([bytes], name, { type: "application/pdf" }) }] });
}, [name, b64]);
const pdf64 = readFileSync(join(FIX, "capitulos.pdf")).toString("base64");

test("Abrir com > Lombada: o arquivo entra na fila", async () => {
  const app = await openApp(browser, server, { setup: fakeLaunch }), p = app.page;
  await launchFile(p, "capitulos.pdf", pdf64);
  const r = await waitJob(p, 0);
  assert.equal(r.error, null);
  assert.ok(r.chapters >= 2);
  assert.deepEqual(app.errors, []);
  await app.ctx.close();
});

test("Abrir com sem ter entrado: o arquivo espera o login", async () => {
  const { fakeGoogle } = await import("./fake-google.mjs");
  const app = await openApp(browser, server, { setup: async ctx => { await fakeGoogle(ctx); await fakeLaunch(ctx); }, loggedOut: true }), p = app.page;
  await launchFile(p, "capitulos.pdf", pdf64);
  assert.match(await p.textContent("#toast"), /Entre com o Google para converter capitulos\.pdf/);
  assert.equal(await p.evaluate(() => window.__app.jobs.length), 0);
  await p.locator("[data-login]:visible").first().click();
  const r = await waitJob(p, 0);
  assert.equal(r.error, null);
  assert.deepEqual(app.errors, []);
  await app.ctx.close();
});

test("perfil Kobo: imagens em cinza e Baixar KEPUB como botão principal; mexer nas imagens volta para Do meu jeito", async () => {
  const { addFiles } = await import("./helpers.mjs");
  const app = await openApp(browser, server), p = app.page;
  await p.click("#settingsBtn");
  await p.selectOption("#device", "kobo");
  assert.equal(await p.inputValue("#images"), "gray");
  assert.match(await p.textContent("#deviceNote"), /KEPUB/);
  await addFiles(p, ["capitulos.pdf"]); await waitJob(p, 0);
  const row = p.locator(".row").nth(0);
  assert.equal(await row.locator(".actions .btn").first().textContent(), "Baixar KEPUB");
  assert.equal(await row.locator('[data-a="kindle"]').count(), 0);
  const [dl] = await Promise.all([p.waitForEvent("download"), row.locator('[data-a="kepub"]').click()]);
  assert.match(dl.suggestedFilename(), /\.kepub\.epub$/);
  await p.reload();
  assert.equal(await p.inputValue("#device"), "kobo", "o perfil fica guardado");
  await p.click("#settingsBtn");
  await p.selectOption("#images", "orig");
  assert.equal(await p.inputValue("#device"), "custom");
  assert.deepEqual(app.errors, []);
  await app.ctx.close();
});

test("contagem: visitas, conversões e tipos de erro, sem nome de arquivo nem título", async () => {
  const hits = [];
  const app = await openApp(browser, server, { setup: async ctx => {
    await ctx.addInitScript(() => { window.__lombadaGoat = "lombada-teste"; });
    await ctx.route(/goatcounter\.com\/count/, r => { hits.push(new URL(r.request().url()).searchParams); r.fulfill({ status: 200, contentType: "image/gif", body: "" }); });
  } }), p = app.page;
  const { addFiles } = await import("./helpers.mjs");
  await addFiles(p, ["capitulos.pdf", "corrompido.pdf"]); await waitJob(p, 0); await waitJob(p, 1);
  await p.waitForTimeout(300);
  const paths = hits.map(h => h.get("p"));
  assert.ok(paths.includes("/app"), paths.join(" | "));
  assert.ok(paths.includes("convertido/pdf"), paths.join(" | "));
  const err = paths.find(x => x.startsWith("erro/pdf/"));
  assert.ok(err, paths.join(" | "));
  assert.ok(!paths.some(x => /capitulos|corrompido/i.test(x)), "nome de arquivo na contagem: " + paths.join(" | "));
  assert.equal(hits.find(h => h.get("p") === "convertido/pdf").get("e"), "true");
  assert.deepEqual(app.errors, []);
  await app.ctx.close();
});

test("contagem desligada sem o código do GoatCounter", async () => {
  const hits = [];
  const app = await openApp(browser, server, { setup: ctx => ctx.route(/goatcounter\.com/, r => { hits.push(r.request().url()); r.abort(); }) }), p = app.page;
  const { addFiles } = await import("./helpers.mjs");
  await addFiles(p, ["capitulos.pdf"]); await waitJob(p, 0);
  assert.deepEqual(hits, []);
  await app.ctx.close();
});
