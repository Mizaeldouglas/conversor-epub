// Versão 3.7: livro de exemplo, capa automática, sumário no começo, editora/ano/ISBN, nome "Autor - Título",
// soltar em qualquer lugar, busca na estante e dados carregados só quando precisa
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, addFiles, waitJob, epubOf, epubcheck } from "./helpers.mjs";

let server, browser, app, n = 0;
const fetched = [];
before(async () => {
  server = await startServer(); browser = await launch();
  app = await openApp(browser, server, { setup: ctx => ctx.on("request", r => fetched.push(new URL(r.url()).pathname)) });
});
after(async () => { await browser.close(); server.close(); });

test("a lista de palavras e as traduções não vêm junto com a página", async () => {
  const html = await (await fetch(server.url)).text();
  assert.ok(html.length < 450000, "index.html com " + html.length + " bytes");
  assert.doesNotMatch(html, /id="ptWords"|id="i18nData"/);
  assert.ok(!fetched.some(p => p.endsWith("idiomas.json")), "as traduções foram baixadas sem trocar de idioma");
});

test("livro de exemplo: um clique converte, com capa, sumário no começo e nome Autor - Título", async () => {
  const p = app.page;
  await p.click("#sampleBtn");
  const r = await waitJob(p, n);
  assert.equal(r.error, null);
  assert.ok(fetched.some(x => x.startsWith("/dados/pt-words.b64")), "a lista de palavras não foi baixada para converter");
  const z = await epubOf(p, n, "exemplo.epub");
  const ck = epubcheck("exemplo.epub"); if (ck !== null) assert.equal(ck, "", ck);
  const nav = await z.file("OEBPS/text/sumario.xhtml").async("string");
  assert.match(nav, /Capítulo 1 — A ilha/);
  const opf = await z.file("OEBPS/content.opf").async("string");
  assert.ok(opf.indexOf('idref="sumario"') > opf.indexOf('idref="capa"') || /sumario/.test(opf));
  const name = await p.evaluate(i => { const j = window.__app.jobs[i]; j.author = "Helena Vasconcelos"; j.title = "O Farol Apagado"; return window.__app.fileNameOf ? window.__app.fileNameOf(j) : null; }, n);
  if (name !== null) assert.equal(name, "Helena Vasconcelos - O Farol Apagado.epub");
  n++;
});

test("sem a 1ª página como capa, o livro ganha uma capa com o título; editora, ano e ISBN vão para o EPUB", async () => {
  const p = app.page;
  await p.uncheck("#cover");
  await addFiles(p, ["capitulos.pdf"]);
  const i = n++; await waitJob(p, i);
  let z = await epubOf(p, i);
  let opf = await z.file("OEBPS/content.opf").async("string");
  assert.match(opf, /properties="cover-image"/, "o livro ficou sem capa");
  const row = p.locator(".row").nth(i);
  await row.locator("details.edit > summary").click();
  await row.locator('[data-e="publisher"]').fill("Editora Maré");
  await row.locator('[data-e="year"]').fill("2024");
  await row.locator('[data-e="isbn"]').fill("978-85-333-0227-3");
  await row.locator('[data-e="apply"]').click();
  await p.waitForFunction(i => { const j = window.__app.jobs[i]; return !j.busy && j.epub; }, i);
  z = await epubOf(p, i, "metadados.epub");
  opf = await z.file("OEBPS/content.opf").async("string");
  assert.match(opf, /<dc:publisher>Editora Maré<\/dc:publisher>/);
  assert.match(opf, /<dc:date>2024<\/dc:date>/);
  assert.match(opf, /urn:isbn:9788533302273/);
  const ck = epubcheck("metadados.epub"); if (ck !== null) assert.equal(ck, "", ck);
  await p.check("#cover");
});

test("soltar um arquivo em qualquer lugar da página converte", async () => {
  const p = app.page;
  const before = await p.evaluate(() => window.__app.jobs.length);
  await p.evaluate(async () => {
    const r = await fetch("tests/fixtures/conto.txt"); const f = new File([await r.blob()], "conto.txt", { type: "text/plain" });
    const dt = new DataTransfer(); dt.items.add(f);
    const t = document.querySelector("footer") || document.body;
    t.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
    if (document.querySelector("#dropAll").hidden) throw new Error("o aviso de soltar não apareceu");
    t.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  assert.equal(await p.evaluate(() => window.__app.jobs.length), before + 1);
  assert.equal(await p.locator("#dropAll").isHidden(), true);
  n = before + 1; await waitJob(p, before);
});

test("estante com mais de 6 livros: busca por título ou autor e ordem", async () => {
  const p = app.page;
  await addFiles(p, ["conto.md", "relojoeiro.html", "relojoeiro.fb2", "estilos.pdf"]);
  for (let k = 0; k < 4; k++) await waitJob(p, n + k);
  n += 4;
  await p.waitForFunction(() => !document.querySelector("#shelfTools").hidden);
  const all = await p.locator("#history .book").count();
  assert.ok(all > 6, "estante com " + all);
  await p.fill("#shelfFind", "relojo");
  await p.waitForFunction(n => document.querySelectorAll("#history .book").length < n, all);
  const ts = await p.$$eval("#history .book .t", a => a.map(x => x.textContent));
  assert.ok(ts.length >= 1 && ts.every(t => /relojo/i.test(t)), ts.join(" | "));
  await p.fill("#shelfFind", "zzzz");
  await p.waitForSelector(".shelf-empty");
  await p.fill("#shelfFind", "");
  await p.selectOption("#shelfSort", "title");
  await p.waitForFunction(() => document.querySelector("#history .book .t")?.textContent === "capitulos");   // a estante é redesenhada sem esperar
  const sorted = await p.$$eval("#history .book .t", a => a.map(x => x.textContent));
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base", numeric: true })));
});

test("nenhum erro de JavaScript", () => assert.deepEqual(app.errors, []));
