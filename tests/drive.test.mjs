// Entrar com Google e guardar os livros no Drive. O Google é simulado: um login falso e um Drive em memória.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startServer, launch, openApp, addFiles, waitJob } from "./helpers.mjs";

import { drive, fakeGoogle } from "./fake-google.mjs";

const live = tag => [...drive.files.values()].filter(f => !f.trashed && (f.appProperties || {}).lombada === tag);

let server, browser, A;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.close(); });
const device = () => openApp(browser, server, { setup: fakeGoogle });
const login = async p => { await p.click("#loginBtn"); await p.waitForSelector("#acctMenu:not([hidden])"); };

test("antes de clicar em entrar, nada do Google é carregado", async () => {
  const app = await openApp(browser, server);
  const seen = [];
  app.page.on("request", r => { if (/accounts\.google\.com|googleapis\.com\/(drive|upload)/.test(r.url())) seen.push(r.url()); });
  await app.page.reload();
  await app.page.waitForSelector("#loginBtn");
  await app.page.waitForTimeout(500);
  assert.equal(await app.page.locator("#loginBtn").isVisible(), true);
  assert.deepEqual(seen, []);
  await app.ctx.close();
});

test("entrar com Google: o livro convertido vai para a pasta Lombada do Drive, com a capa", async () => {
  A = await device(); const p = A.page;
  await login(p);
  assert.equal(await p.textContent("#acctName"), "Ana");
  await addFiles(p, ["capitulos.pdf"]); await waitJob(p, 0);
  await p.waitForFunction(() => window.__app.jobs[0].driveState === "ok");
  const books = live("livro");
  assert.equal(books.length, 1);
  assert.equal(books[0].name, "capitulos.epub");
  assert.equal(books[0].parents[0], live("pasta")[0].id);
  const epub = Buffer.from(await p.evaluate(async () => Array.from(new Uint8Array(await window.__app.jobs[0].epub.arrayBuffer()))));
  assert.ok(epub.equals(books[0].data), "o arquivo no Drive é o EPUB gerado");
  assert.equal(live("capa").length, 1);
  assert.match(await p.locator(".row .drive-note").textContent(), /Guardado no seu Google Drive/);
  assert.equal(await p.locator("#history .book .cloud").count(), 1);
  // gerar de novo substitui o mesmo arquivo, sem duplicar
  await p.locator(".row details.edit > summary").click();
  await p.locator('.row [data-e="apply"]').click();
  await p.waitForFunction(() => { const j = window.__app.jobs[0]; return !j.busy && j.driveState === "ok"; });
  await p.waitForTimeout(300);
  assert.equal(live("livro").length, 1);
});

test("outro aparelho: a estante mostra o livro do Drive e baixa o arquivo", async () => {
  const B = await device(), p = B.page;
  assert.equal(await p.locator("#history .book").count(), 0);
  await login(p);
  await p.waitForFunction(() => document.querySelectorAll("#history .book").length === 1);
  assert.equal(await p.textContent("#history .book .t"), "capitulos");
  assert.equal(await p.locator('#history [data-h="kd"]').count(), 0, "livro só do Drive ainda não tem o botão Kindle");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click('#history [data-h="dl"]')]);
  const got = readFileSync(await dl.path());
  assert.ok(got.equals(live("livro")[0].data));
  await p.waitForSelector('#history [data-h="kd"]');   // agora está neste aparelho também
  // tirar da estante manda para a lixeira do Drive
  await p.click('#history [data-h="rm"]'); await p.click('#history [data-h="rm"]');
  await p.waitForFunction(() => document.querySelectorAll("#history .book").length === 0);
  assert.equal(live("livro").length, 0);
  assert.equal(live("capa").length, 0);
  await B.ctx.close();
});

test("acesso expirado: avisa, e o livro vai para o Drive ao entrar de novo", async () => {
  const p = A.page;
  drive.fail401 = 1;
  await addFiles(p, ["estilos.pdf"]); await waitJob(p, 1);
  await p.waitForSelector("#loginBtn:not([hidden])");
  assert.match(await p.textContent("#toast"), /expirou/);
  assert.equal(live("livro").length, 0);
  await login(p);
  await p.waitForFunction(() => window.__app.jobs[1].driveState === "ok");
  assert.deepEqual(live("livro").map(f => f.name), ["estilos.epub"]);
});

test("livros convertidos antes de entrar: botão para guardar no Drive", async () => {
  const C = await device(), p = C.page;
  await addFiles(p, ["grudado.pdf"]); await waitJob(p, 0);
  await login(p);
  await p.waitForSelector("#driveAllBtn:not([hidden])");
  assert.equal(await p.textContent("#driveAllN"), "1");
  await p.click("#driveAllBtn");
  await p.waitForSelector("#driveAllBtn", { state: "hidden" });
  assert.deepEqual(live("livro").map(f => f.name).sort(), ["estilos.epub", "grudado.epub"]);
  assert.equal(await p.locator("#history .book").count(), 2);
  await C.ctx.close();
});

test("sair: a estante volta a ser só deste navegador e os livros ficam no Drive", async () => {
  const p = A.page;
  await p.click("#acctMenu > summary"); await p.click("#logoutBtn");
  await p.waitForSelector("#loginBtn:not([hidden])");
  await p.waitForFunction(() => /Entre com o Google/.test(document.querySelector("#shelfNote").textContent));
  assert.equal(await p.locator("#history .book .cloud").count(), 0);
  assert.equal(live("livro").length, 2);
  assert.equal(await p.evaluate(() => localStorage.getItem("conversor-epub:drive")), null);
});

test("nenhum erro de JavaScript", () => { assert.deepEqual(A.errors, []); });
