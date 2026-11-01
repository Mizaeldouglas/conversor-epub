// Gera og.png (imagem que aparece ao compartilhar o link) a partir de tools/og.html
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto("file://" + fileURLToPath(new URL("og.html", import.meta.url)));
await p.screenshot({ path: fileURLToPath(new URL("../og.png", import.meta.url)) });
await b.close(); console.log("og.png");
