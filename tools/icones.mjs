// Gera icon-192.png e icon-512.png (ícone do app instalado)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%"><rect width="64" height="64" fill="#2536c7"/><rect width="9" height="64" fill="#1b279a"/><path d="M36 0h11v25l-5.5-5-5.5 5z" fill="#ffd84a"/><path d="M21 38h24M21 47h15" stroke="#fff" stroke-width="4.4" stroke-linecap="round"/></svg>`;
const b = await chromium.launch();
for (const n of [192, 512]) {
  const p = await b.newPage({ viewport: { width: n, height: n } });
  await p.setContent(`<body style="margin:0">${svg}</body>`);
  await p.screenshot({ path: fileURLToPath(new URL(`../icon-${n}.png`, import.meta.url)) });
  await p.close();
}
await b.close(); console.log("icon-192.png, icon-512.png");
