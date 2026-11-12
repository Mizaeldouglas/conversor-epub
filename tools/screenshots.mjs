// Capturas de tela do README (docs/*.png), feitas com os arquivos de teste
import { startServer, launch, openApp, addFiles, waitJob } from "../tests/helpers.mjs";
const server = await startServer(), browser = await launch();
const shot = async (name, viewport, fn) => {
  const app = await openApp(browser, server, { viewport });
  await app.page.evaluate(() => { try { localStorage.clear(); } catch {} document.documentElement.dataset.theme = "light"; });
  await app.page.check("#verify");
  await addFiles(app.page, ["capitulos.pdf"]); await waitJob(app.page, 0);
  await app.page.evaluate(() => { document.querySelector("#optPanel").open = false; });   // como a página abre: ajustes fechados
  await app.page.evaluate(() => document.fonts.ready);
  await fn(app.page);
  await app.page.screenshot({ path: `docs/${name}.png` });
  await app.ctx.close();
};
await shot("tela", { width: 1280, height: 860 }, async p => { await p.evaluate(() => scrollTo(0, 0)); });
await shot("previa", { width: 1280, height: 860 }, async p => {
  await p.click('.row [data-a="pv"]'); await p.waitForSelector("#preview:not([hidden]) .pv-page");
  await p.selectOption("#pvToc", "2"); await p.waitForTimeout(300);
});
await shot("capitulos", { width: 1280, height: 860 }, async p => {
  await p.locator(".row details.edit > summary").click();
  await p.locator(".chap").scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120));
});
await shot("celular", { width: 390, height: 844 }, async p => { await p.locator(".row").scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -80)); });
await browser.close(); server.close(); console.log("docs/*.png");
