// Interface em inglês e espanhol: nenhum texto fica em português, e o português volta inteiro
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, addFiles, waitJob, epubOf } from "./helpers.mjs";

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.close(); });

// nomes próprios e siglas, iguais em qualquer idioma
const SAME = new Set(["Lombada", "GitHub", "DOCX", "EPUB", "KEPUB", "OCR", "Kindle", "Normal", "PDF:", ", EPUB:", "amazon.com.br/sendtokindle", "orig imagem"]);

async function tour(lang){
  const app = await openApp(browser, server), p = app.page;
  await p.selectOption("#uiLang", lang);
  await p.evaluate(() => document.querySelectorAll("details").forEach(d => d.open = true));
  await p.check("#verify");
  await addFiles(p, ["capitulos.pdf", "livro.epub", "senha.pdf", "corrompido.pdf", "farol.mobi", "gibi.pdf"]);
  for (let i = 0; i < 6; i++) await waitJob(p, i);
  await p.evaluate(() => document.querySelectorAll("details").forEach(d => d.open = true));
  const row = p.locator(".row").nth(0);
  await row.locator('[data-n="find"]').fill("os pescadores");
  await row.locator('[data-f="find"]').fill("caixa"); await p.waitForTimeout(400);
  await row.locator('[data-a="pv"]').click(); await p.waitForSelector(".pv-page");
  await p.selectOption("#pvToc", "2"); await p.click("#pvSideBtn"); await p.click("#pvTextBtn");
  await p.locator(".pv-page p").first().click();
  const ta = p.locator(".pv-edit textarea"); await ta.fill((await ta.inputValue()) + " Fim."); await p.click('.pv-edit [data-x="ok"]'); await p.click("#pvApplyBtn");
  await p.waitForFunction(() => { const j = window.__app.jobs[0]; return !j.busy && j.epub && j.verify; }); await p.waitForTimeout(600);
  await p.keyboard.press("Escape");
  await p.evaluate(() => document.querySelectorAll("details").forEach(d => d.open = true));
  await p.locator(".row").nth(0).locator('[data-c="down"]').first().click();
  await p.waitForFunction(() => { const j = window.__app.jobs[0]; return j.reordered && !j.busy && j.epub; });
  await p.click("#themeBtn"); await p.click("#wipeBtn"); await p.waitForTimeout(300);
  return app;
}

for (const [lang, sample] of [["en", { drop: "Your PDF becomes a Kindle book", btn: "Download EPUB", seal: /Ready for Kindle\./, err: /This PDF has a password\./ }],
                              ["es", { drop: "Tu PDF se vuelve un libro de Kindle", btn: "Descargar EPUB", seal: /Listo para el Kindle\./, err: /Este PDF tiene contraseña\./ }]]) {
  test(`interface em ${lang === "en" ? "inglês" : "espanhol"}`, async () => {
    const app = await tour(lang), p = app.page;
    const missing = (await p.evaluate(() => [...window.__app.i18nMissing])).filter(k => !SAME.has(k));
    assert.deepEqual(missing, [], "textos sem tradução");
    assert.equal(await p.textContent(".drop h2"), sample.drop);
    assert.equal((await p.locator('.row [data-a="epub"]').first().textContent()).trim(), sample.btn);
    assert.match(await p.locator(".row").nth(1).locator(".seal").textContent(), sample.seal);
    assert.match(await p.locator(".row").nth(2).locator(".errmsg").textContent(), sample.err);
    assert.equal(await p.getAttribute("html", "lang"), lang);
    // o livro em si não é traduzido
    assert.equal(await p.locator(".row").nth(0).locator(".name").textContent(), "capitulos");
    assert.deepEqual(app.errors, []);
    // de volta ao português, tudo como antes
    await p.selectOption("#uiLang", "pt");
    assert.equal(await p.textContent(".drop h2"), "Seu PDF vira livro de Kindle");
    assert.equal((await p.locator('.row [data-a="epub"]').first().textContent()).trim(), "Baixar EPUB");
    await app.ctx.close();
  });
}

test("o idioma escolhido fica guardado, e o sumário do EPUB segue o idioma do livro", async () => {
  const app = await openApp(browser, server), p = app.page;
  await p.selectOption("#uiLang", "en"); await p.reload();
  assert.equal(await p.inputValue("#uiLang"), "en");
  assert.equal(await p.textContent("#filaT"), "Queue ");
  await p.selectOption("#lang", "en");
  await addFiles(p, ["conto.txt"]); await waitJob(p, 0);
  assert.match(await (await epubOf(p, 0)).file("OEBPS/nav.xhtml").async("string"), /<h1>Contents<\/h1>/);
  await app.ctx.close();
});
