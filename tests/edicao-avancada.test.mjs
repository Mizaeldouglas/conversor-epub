// Corrigir texto na prévia, mover capítulos, desfazer, descrição de imagem, KEPUB, opções por livro e fila guardada
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, launch, openApp, addFiles, waitJob, epubOf, tocOf, epubcheck, JSZip, FIX, OUT } from "./helpers.mjs";

let server, browser, app, row;
const done = i => app.page.waitForFunction(i => { const j = window.__app.jobs[i]; return j && !j.busy && j.epub; }, i);
const chapters = async z => (await Promise.all(Object.keys(z.files).filter(f => /ch\d+\.xhtml$/.test(f)).sort().map(f => z.file(f).async("string")))).join("\n");
before(async () => {
  server = await startServer(); browser = await launch(); app = await openApp(browser, server);
  await app.page.check("#verify");
  await addFiles(app.page, ["capitulos.pdf"]);
  await waitJob(app.page, 0);
  row = app.page.locator(".row").nth(0);
});
after(async () => { await browser.close(); server.close(); });

test("corrigir texto na prévia: muda só o parágrafo clicado e reabre no mesmo lugar", async () => {
  await row.locator('[data-a="pv"]').click();
  await app.page.waitForSelector("#preview:not([hidden]) .pv-page");
  await app.page.selectOption("#pvToc", "2");
  await app.page.click("#pvTextBtn");
  await app.page.locator(".pv-page p", { hasText: "Os pescadores chegaram primeiro" }).click();
  const ta = app.page.locator(".pv-edit textarea");
  assert.match(await ta.inputValue(), /^Os pescadores chegaram primeiro, depois as crianças/);
  await ta.fill((await ta.inputValue()).replace("as crianças", "as meninas"));
  await app.page.click('.pv-edit [data-x="ok"]');
  await app.page.click("#pvApplyBtn");
  await app.page.waitForFunction(() => { const j = window.__app.jobs[0]; return !j.busy && j.epub && /as meninas/.test(document.querySelector(".pv-page")?.textContent || ""); });
  assert.equal(await app.page.inputValue("#pvToc"), "2");
  const all = await chapters(await epubOf(app.page, 0, "corrigido.epub"));
  assert.match(all, /<p>Os pescadores chegaram primeiro, depois as meninas, e por fim o padre/);
  assert.match(all, /Ninguém no vilarejo lembrava de uma caixa tão grande na praia\./);
  const diffs = await app.page.evaluate(() => window.__app.jobs[0].verify.diffs.map(d => [d.epub, d.user]));
  assert.deepEqual(diffs, [["meninas", true]], "a conferência deve mostrar a troca como correção sua");
  await app.page.keyboard.press("Escape");
});

test("mover capítulo e desfazer", async () => {
  const before = await tocOf(await epubOf(app.page, 0));
  await row.locator("details.edit > summary").click();
  const items = row.locator(".chap-list li");
  const texts = await items.locator('[data-c="text"]').evaluateAll(a => a.map(x => x.value));
  await items.nth(texts.findIndex(t => /^3 /.test(t))).locator('[data-c="down"]').click();
  await app.page.waitForFunction(() => { const j = window.__app.jobs[0]; return j.reordered && !j.busy && j.epub; });
  const moved = await tocOf(await epubOf(app.page, 0, "movido.epub"));
  assert.deepEqual(moved[1][1], ["4. DEPOIS", "3. A NOITE EM QUE O FAROL CALOU"]);
  assert.match(await row.locator(".seal").textContent(), /ordem dos capítulos mudou/);
  const ck = epubcheck("movido.epub"); if (ck !== null) assert.equal(ck, "", ck);
  await row.locator('[data-e="undo"]').click();
  await app.page.waitForFunction(() => { const j = window.__app.jobs[0]; return !j.reordered && !j.busy && j.epub; });
  assert.deepEqual(await tocOf(await epubOf(app.page, 0)), before);
});

test("KEPUB: mesmo livro com os trechos marcados para o Kobo", async () => {
  const [dl] = await Promise.all([app.page.waitForEvent("download"), row.locator('[data-a="kepub"]').click()]);
  assert.match(dl.suggestedFilename(), /\.kepub\.epub$/);
  const path = join(OUT, "livro.kepub.epub"); await dl.saveAs(path);
  const z = await JSZip.loadAsync(readFileSync(path));
  assert.match(await z.file("OEBPS/text/ch002.xhtml").async("string"), /<span class="koboSpan" id="kobo\.\d+\.1">Ninguém no vilarejo/);
  const ck = epubcheck("livro.kepub.epub"); if (ck !== null) assert.equal(ck, "", ck);
});

test("converter de novo com outras opções: só este livro muda", async () => {
  await row.locator("details.reconv > summary").click();
  await row.locator('select[data-o="mode"]').selectOption("pages");
  await row.locator('button[data-o="go"]').click();
  await app.page.waitForFunction(() => { const j = window.__app.jobs[0]; return j.mode === "pages" && !j.busy && j.epub; });
  assert.equal(await app.page.evaluate(() => window.__app.jobs[0].images), 7);
  assert.equal(await app.page.inputValue("#mode"), "auto");
});

test("descrição de imagem e imagens em tons de cinza", async () => {
  await app.page.selectOption("#images", "gray");
  await addFiles(app.page, ["farol.mobi"]); await waitJob(app.page, 1);
  const r = app.page.locator(".row").nth(1);
  await r.locator("details.edit > summary").click();
  await r.locator("[data-alt]").fill("Desenho do farol");
  await r.locator('[data-e="apply"]').click();
  await app.page.waitForFunction(() => { const j = window.__app.jobs[1]; return !j.busy && j.epub && j.src.blocks.some(b => b.alt === "Desenho do farol"); });
  const z = await epubOf(app.page, 1, "farol-alt.epub");
  assert.match(await chapters(z), /<img src="\.\.\/images\/img0001\.jpg" alt="Desenho do farol"\/>/);
  const ck = epubcheck("farol-alt.epub"); if (ck !== null) assert.equal(ck, "", ck);
});

test("fila guardada: arquivo que ficou na fila volta ao reabrir a página", async () => {
  const bytes = [...readFileSync(join(FIX, "conto.txt"))];
  await app.page.evaluate(bytes => new Promise((res, rej) => {
    const r = indexedDB.open("conversor-epub", 2);
    r.onsuccess = () => { const tx = r.result.transaction("fila", "readwrite"); tx.objectStore("fila").put({ id: "x1", file: new File([new Uint8Array(bytes)], "conto.txt"), date: 1 }); tx.oncomplete = res; tx.onerror = rej; };
    r.onerror = rej;
  }), bytes);
  await app.page.reload();
  await app.page.waitForFunction(() => { const j = window.__app.jobs[0]; return j && !j.busy && j.epub; });
  assert.equal(await app.page.evaluate(() => window.__app.jobs[0].file.name), "conto.txt");
  await app.page.reload();
  await app.page.waitForTimeout(600);
  assert.equal(await app.page.evaluate(() => window.__app.jobs.length), 0, "o arquivo voltou de novo depois de pronto");
});

test("nenhum erro de JavaScript", () => assert.deepEqual(app.errors, []));
