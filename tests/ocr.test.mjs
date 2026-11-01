// OCR de verdade (Tesseract do jsDelivr): roda no CI ou com OCR_ONLINE=1, porque precisa de internet
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, addFiles, waitJob, epubOf } from "./helpers.mjs";

const online = !!(process.env.CI || process.env.OCR_ONLINE);
let server, browser, app;
before(async () => { if (!online) return; server = await startServer(); browser = await launch(); app = await openApp(browser, server); });
after(async () => { if (online) { await browser.close(); server.close(); } });

test("PDF escaneado vira texto com o OCR", { skip: !online && "sem internet (defina OCR_ONLINE=1)" }, async () => {
  await app.page.check("#ocr");
  await addFiles(app.page, ["escaneado.pdf"]);
  const r = await waitJob(app.page, 0, 240000);
  assert.equal(r.error, null);
  const z = await epubOf(app.page, 0);
  const txt = (await Promise.all(Object.keys(z.files).filter(f => /ch\d+\.xhtml$/.test(f)).map(f => z.file(f).async("string")))).join(" ").replace(/<[^>]+>/g, " ");
  assert.match(txt, /vento chegou cedo/i);
  assert.match(txt, /barco vazio/i);
});
