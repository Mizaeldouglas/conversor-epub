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
const device = () => openApp(browser, server, { setup: fakeGoogle, loggedOut: true });
const login = async p => { await p.locator("[data-login]:visible").first().click(); await p.waitForFunction(() => !document.body.classList.contains("gated") && !document.querySelector("#acctMenu").classList.contains("off")); };

test("sem entrar: só a página de apresentação, e nada do Google é carregado", async () => {
  const app = await openApp(browser, server, { loggedOut: true }), p = app.page;
  const seen = [];
  p.on("request", r => { if (/accounts\.google\.com|googleapis\.com\/(drive|upload)/.test(r.url())) seen.push(r.url()); });
  await p.reload();
  await p.waitForSelector("#landing h2");
  assert.equal(await p.textContent("#landing h2"), "Seus PDFs viram livros de Kindle");
  assert.equal(await p.locator("#landing [data-login]").first().isVisible(), true);
  for (const sel of ["#drop", "#optPanel", "#settingsBtn", "#ajuda", "#acct"]) assert.equal(await p.locator(sel).isVisible(), false, sel + " aparece sem login");
  await p.waitForTimeout(400);
  assert.deepEqual(seen, []);
  assert.deepEqual(app.errors, []);
  await app.ctx.close();
});

test("entrar com Google: o livro convertido vai para a pasta Lombada do Drive, com a capa", async () => {
  A = await device(); const p = A.page;
  assert.equal(await p.locator("#drop").isVisible(), false);
  await login(p);
  assert.equal(await p.locator("#landing").isVisible(), false);
  assert.equal(await p.locator("#drop").isVisible(), true);
  assert.equal(await p.textContent("#acctName"), "Ana");
  await p.reload();   // quem entrou continua dentro ao recarregar
  await p.waitForSelector("#drop");
  assert.equal(await p.locator("#drop").isVisible(), true);
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
  await p.waitForSelector("#history .book .cloud");   // a estante é redesenhada sem esperar
  assert.equal(await p.locator("#history .book .cloud").count(), 1);
  assert.equal(await p.getAttribute("#driveOpen", "href"), "https://drive.google.com/drive/folders/" + live("pasta")[0].id);
  assert.equal(await p.getAttribute(".row .drive-note a", "href"), "https://drive.google.com/file/d/" + books[0].id + "/view");
  // gerar de novo substitui o mesmo arquivo, sem duplicar
  await p.locator(".row details.edit > summary").click();
  await p.locator('.row [data-e="apply"]').click();
  await p.waitForFunction(() => { const j = window.__app.jobs[0]; return !j.busy && j.driveState === "ok"; });
  await p.waitForTimeout(300);
  assert.equal(live("livro").length, 1);
});

test("outro aparelho: a estante mostra o livro do Drive e baixa o arquivo", async () => {
  const B = await device(), p = B.page;
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
  await p.waitForSelector('.row [data-a="driveLogin"]');
  assert.match(await p.textContent("#toast"), /expirou/);
  assert.equal(live("livro").length, 0);
  assert.equal(await p.locator("#drop").isVisible(), true, "a conexão expirada não tira a pessoa do app");
  await p.locator(".row").nth(1).locator('[data-a="driveLogin"]').click();
  await p.waitForFunction(() => !document.querySelector("#acctMenu").classList.contains("off"));
  await p.waitForFunction(() => window.__app.jobs[1].driveState === "ok");
  assert.deepEqual(live("livro").map(f => f.name), ["estilos.epub"]);
});

test("livros convertidos antes de entrar: botão para guardar no Drive", async () => {
  // conta lembrada, mas sem acesso ao Drive: o livro fica só no navegador até reconectar
  const C = await openApp(browser, server, { setup: fakeGoogle }), p = C.page;
  await addFiles(p, ["grudado.pdf"]); await waitJob(p, 0);
  await p.waitForSelector("#history .book");   // espera o livro ser gravado na estante antes de recarregar
  await p.evaluate(() => window.__app.jobs.length = 0);   // tira da fila: sobra só na estante
  await p.reload();
  await p.click("#acctMenu > summary"); await p.click("#reconnectBtn");
  await p.waitForFunction(() => !document.querySelector("#acctMenu").classList.contains("off"));
  await p.waitForSelector("#driveAllBtn:not([hidden])");
  assert.equal(await p.textContent("#driveAllN"), "1");
  await p.click("#driveAllBtn");
  await p.waitForSelector("#driveAllBtn", { state: "hidden" });
  assert.deepEqual(live("livro").map(f => f.name).sort(), ["estilos.epub", "grudado.epub"]);
  assert.equal(await p.locator("#history .book").count(), 2);
  await C.ctx.close();
});

test("sair: volta para a página de apresentação e os livros ficam no Drive", async () => {
  const p = A.page;
  await p.click("#acctMenu > summary"); await p.click("#logoutBtn");
  await p.waitForFunction(() => document.body.classList.contains("gated"));
  assert.equal(await p.locator("#landing [data-login]").first().isVisible(), true);
  assert.equal(await p.locator("#drop").isVisible(), false);
  assert.equal(live("livro").length, 2);
  assert.equal(await p.evaluate(() => localStorage.getItem("conversor-epub:drive")), null);
});

test("quem escolhe guardar só no navegador não ocupa espaço no Drive, e pode mudar depois", async () => {
  const D = await openApp(browser, server, { setup: fakeGoogle, loggedOut: true, store: null }), p = D.page;
  const before = drive.files.size;
  await p.locator("[data-login]:visible").first().click();
  await p.waitForSelector("#storeAsk[open]");
  await p.keyboard.press("Escape");   // a primeira vez precisa de resposta
  assert.equal(await p.locator("#storeAsk").isVisible(), true);
  await p.click('[data-store="local"]');
  assert.equal(await p.locator("#storeAsk").isVisible(), false);
  await addFiles(p, ["capitulos.pdf"]); await waitJob(p, 0);
  await p.waitForFunction(() => document.querySelectorAll("#history .book").length === 1);
  await p.waitForTimeout(300);
  assert.equal(drive.files.size, before, "algo foi para o Drive");
  assert.equal(await p.locator(".row .drive-note").count(), 0);
  assert.equal(await p.locator("#driveOpen").isVisible(), false);
  assert.match(await p.textContent("#shelfNote"), /neste navegador/);
  await p.click("#acctMenu > summary");
  assert.equal(await p.textContent("#acctStore"), "Livros só neste navegador.");
  // mudou de ideia: o livro da estante pode ir para o Drive
  await p.click("#storeBtn"); await p.click('[data-store="drive"]');
  await p.waitForSelector("#driveAllBtn:not([hidden])");
  await p.click("#acctMenu > summary");
  assert.equal(await p.textContent("#acctStore"), "Livros guardados no seu Drive.");
  assert.deepEqual(D.errors, []);
  await D.ctx.close();
});

test("ajustes no Drive: a opção mudada num aparelho aparece no outro", async () => {
  const E = await device(), p = E.page;
  await login(p);
  await p.click("#settingsBtn");
  await p.selectOption("#device", "kobo");
  const t0 = Date.now();
  while (!live("ajustes").length && Date.now() - t0 < 6000) await p.waitForTimeout(200);
  assert.equal(live("ajustes").length, 1, "os ajustes não foram para o Drive");
  assert.equal(JSON.parse(live("ajustes")[0].data.toString()).device, "kobo");
  const F = await device(), q = F.page;
  assert.equal(await q.inputValue("#device"), "custom");
  await login(q);
  await q.waitForFunction(() => document.querySelector("#device").value === "kobo");
  assert.equal(await q.inputValue("#images"), "gray");
  assert.deepEqual([...E.errors, ...F.errors], []);
  await E.ctx.close(); await F.ctx.close();
});

test("nenhum erro de JavaScript", () => { assert.deepEqual(A.errors, []); });
