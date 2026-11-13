/* ---------- outros formatos de entrada: DOCX, TXT, HTML, Markdown, FB2, MOBI, CBZ e EPUB aberto para edição ----------
   Todos viram a mesma lista de blocos que sai do PDF; daí em diante o caminho é um só (DOCX -> EPUB, edição, prévia). */
const FMT = {
  docx: { re: /\.docx$/i, label: "DOCX" }, txt: { re: /\.txt$/i, label: "TXT" }, html: { re: /\.x?html?$/i, label: "HTML" },
  md: { re: /\.(md|markdown)$/i, label: "Markdown" }, fb2: { re: /\.fb2$/i, label: "FB2" },
  mobi: { re: /\.(mobi|azw3?|prc)$/i, label: "MOBI" }, cbz: { re: /\.cbz$/i, label: "CBZ" }
};
const fmtOf = name => Object.keys(FMT).find(k => FMT[k].re.test(name)) || null;
const srcLabel = job => job.fmt ? FMT[job.fmt].label : job.fromEpub ? "EPUB" : "PDF";

async function imgBlock(blob, alt){
  try {
    const bmp = await createImageBitmap(blob);
    if (bmp.width < 8 || bmp.height < 8) return null;
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await toJpeg(c, 0.85); const r = out ? { type: "img", blob: out, w: c.width, h: c.height, alt: alt || "" } : null;
    c.width = c.height = 0; return r;
  } catch { return null; }
}
const decodeText = buf => {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder("utf-16be").decode(u8);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); } catch { return new TextDecoder("windows-1252").decode(u8); }
};
const SCENE_RE = /^[\s*•·#~◆◇❖✦✧⁂§_=—–♦❦❧✶✱✳⁎-]+$/u;

// HTML (ou XHTML de um EPUB) -> blocos
async function htmlToBlocks(root, getImg, st = { notes: new Map(), n: 0 }){
  const blocks = []; let cur = null;
  const clean = t => t.replace(/[ \t\r\n ]+/g, " ").replace(/\s*\s*/g, "").replace(/^[\s]+|[\s]+$/g, "");
  const flush = () => {
    if (!cur) return;
    cur.text = clean(cur.text);
    const plain = stripPg(stripNotes(cur.text));
    if (!plain) { for (const m of cur.text.matchAll(PG_RE)) blocks.push({ type: "pg", label: m[1] }); }
    else if (cur.type === "p" && plain.length <= 20 && SCENE_RE.test(plain)) blocks.push({ type: "scene", text: cur.text });
    else blocks.push(cur);
    cur = null;
  };
  const add = (t, type) => { if (!cur) cur = { type: type || "p", text: "" }; cur.text += t; };
  const typeAttr = n => (n.getAttribute("epub:type") || n.getAttributeNS(EPUB_NS, "type") || "") + " " + (n.getAttribute("role") || "");
  // chamadas de nota: o destino ganha um número
  for (const a of root.querySelectorAll("a")) {
    if (!/noteref/.test(typeAttr(a)) && !a.hasAttribute("data-noteref")) continue;
    const id = (a.getAttribute("href") || "").split("#")[1];
    if (id && !st.notes.has(id)) st.notes.set(id, { nid: ++st.n, label: a.textContent.trim().replace(/^\[|\]$/g, "") || String(st.n) });
  }
  const BLOCK = /^(p|div|section|article|main|header|footer|blockquote|li|ul|ol|dl|dt|dd|figure|figcaption|center|address|body|html|tr|td|th|caption)$/;
  const walk = async (n, ctx) => {
    if (n.nodeType === 3) {
      if (ctx.pre) { add(n.data.replace(/\r?\n/g, ""), ctx.type); return; }
      const t = n.data.replace(/[ \t\r\n]+/g, " ");
      if (t.trim() || (cur && cur.text && !/\s$/.test(cur.text))) add(t, ctx.type);
      return;
    }
    if (n.nodeType !== 1) return;
    const name = (n.localName || "").toLowerCase(), ty = typeAttr(n);
    if (/^(script|style|head|title|nav|svg|math|template|noscript|iframe|form|button|input|select|textarea|object|audio|video)$/.test(name)) return;
    if (/pagebreak/.test(ty)) { const l = n.getAttribute("aria-label") || n.getAttribute("title") || ""; if (l) add(pgMark(l.slice(0, 14)), ctx.type); return; }
    if (name === "mbp:pagebreak") { flush(); return; }
    if (n.getAttribute("id") && st.notes.has(n.getAttribute("id"))) {   // destino de uma chamada de nota
      const nt = st.notes.get(n.getAttribute("id"));
      flush(); cur = { type: "note", id: nt.nid, label: nt.label, text: "" };
      const kids = [...n.childNodes];
      await walkKids(kids, { type: "note", inline: true, skipLabel: nt.label });
      if (cur) { cur.text = clean(cur.text).replace(/\s*↩\uFE0E?$/, "").replace(new RegExp("^\\[?" + escRe(nt.label) + "\\]?[.)\\s]*"), ""); if (cur.text) blocks.push(cur); cur = null; }
      return;
    }
    if (name === "br") { add(ctx.verse ? "" : " ", ctx.type); return; }
    if (name === "hr") { flush(); blocks.push({ type: "scene", text: "" }); return; }
    if (name === "img" || name === "image") {
      const src = n.getAttribute("src") || n.getAttribute("recindex") && "recindex:" + n.getAttribute("recindex") || n.getAttribute("xlink:href") || n.getAttribute("href") || "";
      const blob = src && getImg ? await getImg(src).catch(() => null) : null;
      const b = blob && await imgBlock(blob, n.getAttribute("alt") || "");
      if (b) { flush(); blocks.push(b); }
      return;
    }
    if (name === "table") {
      flush();
      const rows = [...n.querySelectorAll("tr")].map(tr => [...tr.children].filter(c => /^t[dh]$/i.test(c.localName)).map(c => c.textContent.replace(/\s+/g, " ").trim()));
      if (rows.length && rows.some(r => r.some(Boolean))) blocks.push({ type: "table", rows: rows.filter(r => r.length) });
      return;
    }
    const h = /^h([1-6])$/.exec(name);
    if (h) { flush(); cur = { type: h[1] === "1" ? "h1" : "h2", text: "", lv: +h[1] }; await walkKids(n.childNodes, { type: cur.type, inline: true, verse: true }); flush(); return; }
    if (name === "pre") { flush(); cur = { type: "verse", text: "" }; await walkKids(n.childNodes, { type: "verse", inline: true, pre: true, verse: true }); flush(); return; }
    if (name === "li" && !ctx.inline) {
      flush(); const ol = n.parentNode && /^ol$/i.test(n.parentNode.localName);
      cur = { type: "li", text: ol ? ([...n.parentNode.children].filter(c => /^li$/i.test(c.localName)).indexOf(n) + 1) + ". " : "• " };
      await walkKids(n.childNodes, { ...ctx, type: "li" }); flush(); return;
    }
    if (BLOCK.test(name) && !ctx.inline) {
      flush();
      const verse = /\b(verse|poem|stanza|verso|poema)\b/i.test(n.getAttribute("class") || "") || n.hasAttribute("data-verse");
      await walkKids(n.childNodes, verse ? { ...ctx, type: "verse", verse: true } : ctx);
      flush(); return;
    }
    // trechos dentro do parágrafo
    const it = /^(em|i|cite|dfn|var)$/.test(name), bd = /^(strong|b)$/.test(name);
    const href = name === "a" ? n.getAttribute("href") || "" : "";
    if (name === "a" && (/noteref/.test(ty) || n.hasAttribute("data-noteref"))) {
      const nt = st.notes.get(href.split("#")[1]);
      if (nt) { add("" + nt.nid + "|" + nt.label + "", ctx.type); return; }
    }
    if (ctx.skipLabel && name === "a" && n.textContent.trim().replace(/^\[|\]$/g, "") === ctx.skipLabel) return;
    const link = /^(https?:|mailto:)/i.test(href) && !ctx.link ? href : "";
    if (it) add(IT_ON, ctx.type); if (bd) add(BD_ON, ctx.type); if (link) add(LK_ON + link + LK_MID, ctx.type);
    await walkKids(n.childNodes, link ? { ...ctx, link: true } : ctx);
    if (cur) { if (link) cur.text += LK_OFF; if (bd) cur.text += BD_OFF; if (it) cur.text += IT_OFF; }
  };
  const walkKids = async (kids, ctx) => { for (const c of [...kids]) await walk(c, ctx); };
  await walk(root, { type: "p" });
  flush();
  // estilos abertos e fechados no mesmo bloco: tira pares vazios
  for (const b of blocks) if (typeof b.text === "string") b.text = b.text.replace(/(\s*)|(\s*)/g, "$1$2");
  return blocks;
}

// títulos: tira o título do livro repetido no texto; se os capítulos estão em h2, eles passam a abrir capítulo
function normalizeHeads(blocks, title){
  const txt = b => stripPg(b.text).toLowerCase();
  const of = t => blocks.filter(b => b.type === t);
  let found = "", h1 = of("h1");
  let t = title || (h1.length >= 2 && txt(h1[0]) === txt(h1[1]) ? stripPg(h1[0].text) : "");
  if (t) {
    const same = h1.filter(b => txt(b) === t.toLowerCase());
    if (same.length && (same.length < h1.length || of("h2").length)) { for (const b of same) blocks.splice(blocks.indexOf(b), 1); found = t; }
  }
  h1 = of("h1"); const h2 = of("h2");
  if (h1.length === 1 && h2.length >= 2) {
    const i = blocks.indexOf(h1[0]);
    if (i <= 2 && !found) { found = stripPg(h1[0].text); blocks.splice(i, 1); } else h1[0].type = "h2";
    h1 = [];
  }
  if (!h1.length && h2.length) { const top = Math.min(...of("h2").map(b => b.lv || 2)); for (const b of of("h2")) if ((b.lv || 2) === top) b.type = "h1"; }
  return found;
}

function txtToBlocks(text){
  text = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const hasBlank = /\n[ \t]*\n/.test(text);
  // com linhas em branco, cada trecho é um parágrafo (as quebras no meio são da largura do arquivo); sem elas, cada linha é um parágrafo
  const chunks = hasBlank ? text.split(/\n[ \t]*\n+/) : text.split("\n");
  const blocks = [];
  for (const c of chunks) {
    const lines = c.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const t = lines.join(" ");
    if (t.length <= 20 && SCENE_RE.test(t)) blocks.push({ type: "scene", text: t });
    else if (t.length <= 70 && lines.length <= 2 && CHAP_RE.test(lines[0])) blocks.push({ type: "h1", text: lines.join("") });
    else blocks.push({ type: "p", text: t });
  }
  return blocks;
}

// Markdown básico -> HTML
function mdToHtml(md){
  const e = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = s => e(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, alt, src) => `<img alt="${alt}" src="${src}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "<strong>$2</strong>")
    .replace(/(?<![\p{L}\p{N}*_])(\*|_)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}*_])/gu, "<em>$2</em>");
  const out = []; let para = [], list = null, quote = [], code = null;
  const flushP = () => { if (para.length) out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; };
  const flushL = () => { if (list) out.push(`<${list.t}>` + list.items.map(i => "<li>" + inline(i) + "</li>").join("") + `</${list.t}>`); list = null; };
  const flushQ = () => { if (quote.length) out.push("<blockquote><p>" + inline(quote.join(" ")) + "</p></blockquote>"); quote = []; };
  const all = () => { flushP(); flushL(); flushQ(); };
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    if (code) { if (/^\s*```/.test(raw)) { out.push("<pre>" + e(code.join("\n")) + "</pre>"); code = null; } else code.push(raw); continue; }
    const l = raw.trimEnd(); let m;
    if (/^\s*```/.test(l)) { all(); code = []; }
    else if (!l.trim()) all();
    else if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(l))) { all(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { all(); out.push("<hr>"); }
    else if (/^(=+|-+)\s*$/.test(l) && para.length) { const t = para.join(" "); para = []; all(); out.push(`<h${l[0] === "=" ? 1 : 2}>${inline(t)}</h${l[0] === "=" ? 1 : 2}>`); }
    else if ((m = /^\s*>\s?(.*)$/.exec(l))) { flushP(); flushL(); quote.push(m[1]); }
    else if ((m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l))) { flushP(); flushQ(); const t = /\d/.test(m[1]) ? "ol" : "ul"; if (!list || list.t !== t) { flushL(); list = { t, items: [] }; } list.items.push(m[2]); }
    else if (list && /^\s{2,}\S/.test(raw)) list.items[list.items.length - 1] += " " + l.trim();
    else { flushL(); flushQ(); para.push(l.trim()); }
  }
  if (code) out.push("<pre>" + e(code.join("\n")) + "</pre>");
  all();
  return out.join("\n");
}

// FB2 -> HTML simples (depois htmlToBlocks)
function fb2ToHtml(doc){
  const out = document.implementation.createHTMLDocument("");
  const el = (tag, parent, attrs) => { const e = out.createElement(tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
  const hrefOf = n => n.getAttribute("l:href") || n.getAttribute("xlink:href") || n.getAttributeNS("http://www.w3.org/1999/xlink", "href") || n.getAttribute("href") || "";
  const conv = (n, parent, depth) => {
    if (n.nodeType === 3) { parent.appendChild(out.createTextNode(n.data)); return; }
    if (n.nodeType !== 1) return;
    const kids = (p, d = depth) => { for (const c of n.childNodes) conv(c, p, d); };
    switch (n.localName) {
      case "section": kids(el("section", parent), depth + 1); break;
      case "title": { const h = el(depth <= 1 ? "h1" : "h2", parent); [...n.children].forEach((p, i) => { if (i) h.appendChild(out.createElement("br")); for (const c of p.childNodes) conv(c, h, depth); }); break; }
      case "subtitle": kids(el("strong", el("p", parent))); break;
      case "p": case "text-author": kids(el("p", parent)); break;
      case "emphasis": kids(el("em", parent)); break;
      case "strong": kids(el("strong", parent)); break;
      case "empty-line": break;
      case "epigraph": case "cite": case "annotation": kids(el("blockquote", parent)); break;
      case "poem": kids(parent); break;
      case "stanza": { const d = el("div", parent, { "data-verse": "" }); [...n.children].forEach((v, i) => { if (i) d.appendChild(out.createElement("br")); for (const c of v.childNodes) conv(c, d, depth); }); break; }
      case "image": el("img", parent, { src: hrefOf(n), alt: n.getAttribute("alt") || "" }); break;
      case "a": { const a = el("a", parent, { href: hrefOf(n) }); if (n.getAttribute("type") === "note") a.setAttribute("data-noteref", ""); kids(a); break; }
      case "table": case "tr": case "td": case "th": kids(el(n.localName, parent)); break;
      default: kids(parent);
    }
  };
  const bodies = [...doc.getElementsByTagNameNS("*", "body")];
  for (const b of bodies) {
    if (/^(notes|comments)$/i.test(b.getAttribute("name") || "")) {
      for (const s of b.getElementsByTagNameNS("*", "section")) {
        const a = el("aside", out.body, { "data-note": "", id: s.getAttribute("id") || "" });
        for (const c of s.children) if (c.localName !== "title") conv(c, a, 9);
      }
    } else for (const c of b.childNodes) conv(c, out.body, 0);
  }
  return out;
}

// DOCX de qualquer origem (Word, Google Docs, LibreOffice) -> blocos
async function docxToBlocks(file){
  const z = await JSZip.loadAsync(file);
  const read = async p => z.file(p) ? parseXml(await z.file(p).async("string")) : null;
  const doc = await read("word/document.xml");
  if (!doc) throw new Error("Este arquivo não é um DOCX do Word (falta word/document.xml).");
  const wv = (n, a = "val") => n ? (n.getAttributeNS(W, a) || n.getAttribute("w:" + a)) : null;
  const kid = (n, name) => n && [...n.children].find(c => c.localName === name);
  const rels = {};
  const relDoc = await read("word/_rels/document.xml.rels");
  if (relDoc) for (const r of relDoc.getElementsByTagName("Relationship")) rels[r.getAttribute("Id")] = r.getAttribute("Target");
  // estilos: nome e nível de título
  const styles = {};
  const sDoc = await read("word/styles.xml");
  if (sDoc) for (const s of sDoc.getElementsByTagNameNS(W, "style")) {
    const name = (wv(kid(s, "name")) || "").toLowerCase(), ppr = kid(s, "pPr"), ol = ppr && wv(kid(ppr, "outlineLvl"));
    const m = /^(?:heading|t[íi]tulo|cabe[çc]alho|titre|überschrift)\s*(\d)$/.exec(name);
    styles[wv(s, "styleId")] = { name, level: m ? +m[1] : ol != null && ol !== "" && +ol < 9 ? +ol + 1 : 0, based: wv(kid(s, "basedOn")) };
  }
  const levelOf = id => { for (let k = 0, s = styles[id]; s && k < 6; k++, s = styles[s.based]) if (s.level) return s.level; return 0; };
  const numFmt = {};   // numId -> lista numerada?
  const nDoc = await read("word/numbering.xml");
  if (nDoc) {
    const abs = {};
    for (const a of nDoc.getElementsByTagNameNS(W, "abstractNum")) abs[wv(a, "abstractNumId")] = wv(a.getElementsByTagNameNS(W, "numFmt")[0]) || "bullet";
    for (const n of nDoc.getElementsByTagNameNS(W, "num")) numFmt[wv(n, "numId")] = abs[wv(kid(n, "abstractNumId"))] !== "bullet";
  }
  const notes = new Map();
  const fDoc = await read("word/footnotes.xml");
  let noteN = 0; const counters = {};
  const on = n => { if (!n) return false; const v = wv(n); return !v || !/^(0|false|off)$/i.test(v); };
  const runsText = async (p, out) => {
    let text = "", cs = 0, lk = "";
    const visit = async (n, link) => {
      for (const c of n.children) {
        if (c.localName === "hyperlink") { const u = rels[c.getAttributeNS(NS_R, "id") || c.getAttribute("r:id")] || ""; await visit(c, /^(https?:|mailto:)/i.test(u) ? u : ""); continue; }
        if (c.localName === "ins" || c.localName === "smartTag" || c.localName === "sdt" || c.localName === "sdtContent") { await visit(c, link); continue; }
        if (c.localName !== "r") continue;
        const rp = kid(c, "rPr"), va = rp && wv(kid(rp, "vertAlign"));
        const s = (rp && on(kid(rp, "i")) ? 1 : 0) | (rp && on(kid(rp, "b")) ? 2 : 0);
        for (const t of c.children) {
          if (t.localName === "t") {
            if (link !== lk) { text = styleSwitch(text, cs, 0) + (lk ? LK_OFF : "") + (link ? LK_ON + link + LK_MID : ""); cs = 0; lk = link; }
            if (s !== cs) { text = styleSwitch(text, cs, s); cs = s; }
            text += t.textContent;
          }
          else if (t.localName === "tab") text += " ";
          else if (t.localName === "br") { if (wv(t, "type") !== "page") text += " "; }
          else if (t.localName === "footnoteReference" && fDoc) {
            const id = wv(t, "id"); const nid = ++noteN; notes.set(nid, id);
            text = styleSwitch(text, cs, 0) + "" + nid + "|" + nid + ""; cs = 0;
          }
          else if (t.localName === "drawing" || t.localName === "pict") {
            for (const b of t.getElementsByTagNameNS(NS_A, "blip")) {
              const tg = rels[b.getAttributeNS(NS_R, "embed") || b.getAttribute("r:embed")], f = tg && z.file("word/" + tg.replace(/^\//, ""));
              const dp = t.getElementsByTagNameNS(NS_WP, "docPr")[0];
              if (f) { const ib = await imgBlock(await f.async("blob"), dp ? dp.getAttribute("descr") || "" : ""); if (ib) out.imgs.push(ib); }
            }
          }
        }
      }
    };
    await visit(p, "");
    text = styleSwitch(text, cs, 0) + (lk ? LK_OFF : "");
    return text.replace(/\s+/g, " ").trim().replace(/(\s*)|(\s*)/g, "$1$2");
  };
  const blocks = []; let title = "", n = 0;
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  const each = async el => {
    if (++n % 200 === 0) await tick();
    if (el.localName === "sdt") { const c = kid(el, "sdtContent"); if (c) for (const k of c.children) await each(k); return; }
    if (el.localName === "tbl") {
      const rows = [];
      for (const tr of el.getElementsByTagNameNS(W, "tr")) { const r = []; for (const tc of tr.getElementsByTagNameNS(W, "tc")) { const parts = []; for (const cp of tc.getElementsByTagNameNS(W, "p")) { const t = await runsText(cp, { imgs: [] }); if (t) parts.push(t); } r.push(parts.join(" ")); } if (r.length) rows.push(r); }
      if (rows.length) blocks.push({ type: "table", rows });
      return;
    }
    if (el.localName !== "p") return;
    const ppr = kid(el, "pPr"), sid = ppr && wv(kid(ppr, "pStyle")), st = styles[sid] || {};
    const out = { imgs: [] };
    const text = await runsText(el, out);
    const lvl = levelOf(sid) || (ppr && wv(kid(ppr, "outlineLvl")) != null ? +wv(kid(ppr, "outlineLvl")) + 1 : 0);
    if (text) {
      const plain = stripPg(stripNotes(text));
      if (/^(title|t[íi]tulo)$/.test(st.name || "") && !title) title = plain;
      else if (lvl && lvl <= 6 && plain.length < 200) blocks.push({ type: lvl === 1 ? "h1" : "h2", text: text.replace(/[-]/g, ""), lv: lvl });
      else if (plain.length <= 20 && SCENE_RE.test(plain)) blocks.push({ type: "scene", text });
      else {
        const np = ppr && kid(ppr, "numPr"), numId = np && wv(kid(np, "numId"));
        if (numId && numId !== "0") { const ord = numFmt[numId]; counters[numId] = (counters[numId] || 0) + 1; blocks.push({ type: "li", text: (ord ? counters[numId] + ". " : "• ") + text }); }
        else blocks.push({ type: "p", text });
      }
      // notas chamadas neste parágrafo
      for (const m of text.matchAll(/(\d+)\|/g)) {
        const fn = [...fDoc.getElementsByTagNameNS(W, "footnote")].find(f => wv(f, "id") === notes.get(+m[1]));
        const parts = []; if (fn) for (const fp of fn.getElementsByTagNameNS(W, "p")) { const t = await runsText(fp, { imgs: [] }); if (t) parts.push(t); }
        if (parts.length) blocks.push({ type: "note", id: +m[1], label: m[1], text: parts.join(" ") });
        else blocks[blocks.length - 1].text = blocks[blocks.length - 1].text.replace(m[0] + m[1] + "", "");
      }
    }
    blocks.push(...out.imgs);
  };
  if (body) for (const el of [...body.children]) await each(el);
  let author = "";
  try { const core = await read("docProps/core.xml"); if (core) { title ||= (core.getElementsByTagName("dc:title")[0] || {}).textContent || ""; author = (core.getElementsByTagName("dc:creator")[0] || {}).textContent || ""; } } catch {}
  return { blocks, title: title.trim(), author: author.trim() };
}

// MOBI / AZW3 sem proteção -> HTML + imagens
function readMobi(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...u8.subarray(o, o + n));
  if (!/^(BOOKMOBI|TEXtREAd)$/.test(str(60, 8))) throw new Error("Este arquivo não é um MOBI ou AZW3 que eu consiga abrir.");
  const nrec = dv.getUint16(76), offs = [];
  for (let i = 0; i < nrec; i++) offs.push(dv.getUint32(78 + i * 8));
  offs.push(u8.length);
  const rec = i => u8.subarray(offs[i], offs[i + 1]);
  const r0 = offs[0], comp = dv.getUint16(r0), textLen = dv.getUint32(r0 + 4), textRecs = dv.getUint16(r0 + 8), enc = dv.getUint16(r0 + 12);
  if (enc) throw new Error("Este livro tem proteção DRM e não pode ser aberto.");
  if (comp !== 1 && comp !== 2) throw new Error("Este MOBI usa uma compressão (Huffman) que o Lombada ainda não lê. Converta no Calibre para EPUB e envie o EPUB.");
  const isMobi = str(r0 + 16, 4) === "MOBI";
  const hl = isMobi ? dv.getUint32(r0 + 20) : 0;
  const codepage = isMobi ? dv.getUint32(r0 + 28) : 1252;
  let title = "", author = "", coverOff = -1, firstImg = isMobi && hl >= 0x70 ? dv.getUint32(r0 + 108) : textRecs + 1;
  if (isMobi) { const to = dv.getUint32(r0 + 84), tl = dv.getUint32(r0 + 88); title = new TextDecoder(codepage === 65001 ? "utf-8" : "windows-1252").decode(u8.subarray(r0 + to, r0 + to + tl)); }
  const extra = isMobi && hl >= 0xE4 ? dv.getUint16(r0 + 242) : 0;
  if (isMobi && (dv.getUint32(r0 + 128) & 0x40)) {   // EXTH
    let p = r0 + 16 + hl;
    if (str(p, 4) === "EXTH") {
      const cnt = dv.getUint32(p + 8); p += 12;
      for (let i = 0; i < cnt && p + 8 <= u8.length; i++) {
        const t = dv.getUint32(p), l = dv.getUint32(p + 4); if (l < 8) break;
        const data = u8.subarray(p + 8, p + l);
        if (t === 100 && !author) author = new TextDecoder("utf-8").decode(data);
        else if (t === 503) title = new TextDecoder("utf-8").decode(data);
        else if (t === 201 && l === 12) coverOff = dv.getUint32(p + 8);
        p += l;
      }
    }
  }
  // tira os bytes extras do fim de cada registro de texto
  const trim = r => {
    let end = r.length;
    for (let bit = 15; bit >= 1; bit--) if (extra & (1 << bit)) {
      let v = 0; for (const b of r.subarray(Math.max(0, end - 4), end)) { if (b & 0x80) v = 0; v = (v << 7) | (b & 0x7F); }
      end = Math.max(0, end - v);
    }
    if (extra & 1) end -= (r[end - 1] & 3) + 1;
    return r.subarray(0, Math.max(0, end));
  };
  const lz = r => {
    const out = [];
    for (let i = 0; i < r.length;) {
      const c = r[i++];
      if (c >= 1 && c <= 8) { for (let k = 0; k < c && i < r.length; k++) out.push(r[i++]); }
      else if (c < 0x80) out.push(c);
      else if (c >= 0xC0) { out.push(32, c ^ 0x80); }
      else if (i < r.length) { const v = ((c << 8) | r[i++]) & 0x3FFF, dist = v >> 3, len = (v & 7) + 3; for (let k = 0; k < len; k++) out.push(out[out.length - dist] ?? 32); }
    }
    return out;
  };
  const parts = []; let total = 0;
  for (let i = 1; i <= textRecs && i < nrec; i++) { const r = trim(rec(i)); const d = comp === 2 ? Uint8Array.from(lz(r)) : r; parts.push(d); total += d.length; }
  const all = new Uint8Array(total); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const html = new TextDecoder(codepage === 65001 ? "utf-8" : "windows-1252").decode(all.subarray(0, Math.min(total, textLen || total)));
  const image = k => {   // k: número do registro de imagem, a partir de 1
    const i = firstImg + k - 1; if (i <= 0 || i >= nrec) return null;
    const r = rec(i), sig = str(offs[i], 4);
    if (/^(FLIS|FCIS|SRCS|RESC|BOUN|FDST|DATP|AUDI|VIDE|FONT|CRES|CONT|kind|INDX)/.test(sig) || str(offs[i], 8) === "BOUNDARY") return null;
    const type = r[0] === 0xFF && r[1] === 0xD8 ? "image/jpeg" : sig === "\x89PNG" ? "image/png" : sig.startsWith("GIF") ? "image/gif" : null;
    return type ? new Blob([r], { type }) : null;
  };
  return { html, title: title.trim(), author: author.trim(), image, cover: coverOff >= 0 ? image(coverOff + 1) : null };
}

// EPUB sem proteção -> blocos (para editar capa, capítulos e texto; a aparência original é refeita)
async function epubToBlocks(file){
  const z = await JSZip.loadAsync(file);
  if (z.file("META-INF/encryption.xml") && /\.x?html?/i.test(await z.file("META-INF/encryption.xml").async("string"))) throw new Error("Este EPUB tem proteção DRM e não pode ser aberto para edição.");
  const cont = parseXml(await z.file("META-INF/container.xml").async("string"));
  const opfPath = cont.getElementsByTagNameNS("*", "rootfile")[0].getAttribute("full-path"), dir = dirOf(opfPath);
  const opf = parseXml(await z.file(opfPath).async("string"));
  const dc = k => (opf.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", k)[0] || {}).textContent || "";
  const man = new Map(); let coverHref = null, navHref = null;
  const coverId = ([...opf.getElementsByTagNameNS("*", "meta")].find(m => m.getAttribute("name") === "cover") || { getAttribute: () => null }).getAttribute("content");
  for (const it of opf.getElementsByTagNameNS("*", "item")) {
    const href = resolvePath(dir, decodeURIComponent(it.getAttribute("href") || ""));
    man.set(it.getAttribute("id"), { href, type: it.getAttribute("media-type") || "", props: it.getAttribute("properties") || "" });
    if (/cover-image/.test(it.getAttribute("properties") || "") || it.getAttribute("id") === coverId) coverHref = href;
    if (/\bnav\b/.test(it.getAttribute("properties") || "")) navHref = href;
  }
  // nomes do sumário, para os arquivos que não trazem título no texto
  const tocName = new Map();
  if (navHref && z.file(navHref)) {
    const nav = new DOMParser().parseFromString(await z.file(navHref).async("string"), "application/xhtml+xml");
    for (const a of nav.querySelectorAll("nav a[href]")) { const p = resolvePath(dirOf(navHref), decodeURIComponent(a.getAttribute("href").split("#")[0])); if (!tocName.has(p)) tocName.set(p, a.textContent.replace(/\s+/g, " ").trim()); }
  }
  const blocks = [], st = { notes: new Map(), n: 0 };
  let cover = coverHref && z.file(coverHref) ? await z.file(coverHref).async("blob") : null;
  for (const r of opf.getElementsByTagNameNS("*", "itemref")) {
    const m = man.get(r.getAttribute("idref"));
    if (!m || !/html/.test(m.type) || m.href === navHref || !z.file(m.href)) continue;
    const s = await z.file(m.href).async("string");
    let d = new DOMParser().parseFromString(s, "application/xhtml+xml");
    if (hasParseError(d)) d = new DOMParser().parseFromString(s, "text/html");
    const body = d.getElementsByTagNameNS("*", "body")[0] || d.documentElement;
    // página de sumário (do Lombada ou de outro programa): os capítulos já são refeitos
    const links = [...body.querySelectorAll("a[href]")], linkTxt = links.reduce((s, a) => s + a.textContent.trim().length, 0), allTxt = body.textContent.replace(/\s+/g, "").length;
    if (body.querySelector('nav, [epub\\:type~="toc"], .sumario') || (links.length >= 3 && linkTxt >= allTxt * 0.7)) continue;
    const imgs = body.querySelectorAll("img, image");
    // página que é só a capa
    if (imgs.length === 1 && !body.textContent.trim() && (/cover|capa/i.test(m.href) || body.querySelector("[epub\\:type~='cover'], .cover"))) {
      if (!cover) { const src = imgs[0].getAttribute("src") || imgs[0].getAttribute("xlink:href") || imgs[0].getAttribute("href") || ""; const f = z.file(resolvePath(dirOf(m.href), decodeURIComponent(src))); if (f) cover = await f.async("blob"); }
      continue;
    }
    const getImg = async src => { if (/^data:/.test(src)) return (await fetch(src)).blob(); const f = z.file(resolvePath(dirOf(m.href), decodeURIComponent(src.split("#")[0]))); return f ? f.async("blob") : null; };
    const part = await htmlToBlocks(body, getImg, st);
    if (!part.length) continue;
    if (!part.some(b => /^h[12]$/.test(b.type)) && tocName.get(m.href)) part.unshift({ type: "h1", text: tocName.get(m.href) });
    blocks.push(...part);
    await tick();
  }
  const cv = cover ? await imgBlock(cover) : null;
  return { blocks, title: dc("title").trim(), author: dc("creator").trim(), lang: dc("language").trim(), cover: cv ? cv.blob : null,
    meta: { description: dc("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), subject: [...opf.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "subject")].map(e => e.textContent.trim()).join(", ") } };
}

// lê o arquivo e devolve { blocks, title, author, cover, lang, meta, fixed }
async function importFile(file, fmt){
  if (fmt === "docx") return docxToBlocks(file);
  if (fmt === "epub") return epubToBlocks(file);
  if (fmt === "txt") return { blocks: txtToBlocks(decodeText(await file.arrayBuffer())) };
  if (fmt === "md" || fmt === "html") {
    const src = decodeText(await file.arrayBuffer());
    const doc = new DOMParser().parseFromString(fmt === "md" ? mdToHtml(src) : src, "text/html");
    const getImg = async s => /^data:image\//.test(s) ? (await fetch(s)).blob() : null;
    const meta = n => (doc.querySelector(`meta[name="${n}"]`) || { content: "" }).content || "";
    return { blocks: await htmlToBlocks(doc.body, getImg), title: (doc.title || "").trim(), author: meta("author"), lang: doc.documentElement.lang || "" };
  }
  if (fmt === "fb2") {
    const doc = parseXml(decodeText(await file.arrayBuffer()));
    if (hasParseError(doc)) throw new Error("Este FB2 não é um XML válido.");
    const bins = new Map();
    for (const b of doc.getElementsByTagNameNS("*", "binary")) bins.set(b.getAttribute("id"), b);
    const getImg = async s => { const b = bins.get(s.replace(/^#/, "")); return b ? (await fetch(`data:${b.getAttribute("content-type") || "image/jpeg"};base64,${b.textContent.replace(/\s+/g, "")}`)).blob() : null; };
    const ti = doc.getElementsByTagNameNS("*", "title-info")[0];
    const tx = (p, k) => { const e = p && p.getElementsByTagNameNS("*", k)[0]; return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };
    const au = ti && ti.getElementsByTagNameNS("*", "author")[0];
    const cvImg = ti && ti.getElementsByTagNameNS("*", "coverpage")[0] && ti.getElementsByTagNameNS("*", "coverpage")[0].getElementsByTagNameNS("*", "image")[0];
    const cvBlob = cvImg ? await getImg(cvImg.getAttribute("l:href") || cvImg.getAttribute("xlink:href") || cvImg.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "") : null;
    const cv = cvBlob ? await imgBlock(cvBlob) : null;
    return { blocks: await htmlToBlocks(fb2ToHtml(doc).body, getImg), title: tx(ti, "book-title"), author: [tx(au, "first-name"), tx(au, "middle-name"), tx(au, "last-name")].filter(Boolean).join(" "),
      lang: tx(ti, "lang"), cover: cv ? cv.blob : null, meta: { description: tx(ti, "annotation"), subject: "" } };
  }
  if (fmt === "mobi") {
    const m = readMobi(await file.arrayBuffer());
    const doc = new DOMParser().parseFromString(m.html.replace(/<mbp:pagebreak\s*\/?>/gi, "<hr data-pb>"), "text/html");
    for (const hr of doc.querySelectorAll("hr[data-pb]")) hr.remove();
    const getImg = async s => { const k = /^recindex:(\d+)/.exec(s) || /kindle:embed:([0-9A-V]+)/i.exec(s); if (!k) return null; return m.image(/^recindex/.test(s) ? +k[1] : parseInt(k[1], 32)); };
    const cv = m.cover ? await imgBlock(m.cover) : null;
    return { blocks: await htmlToBlocks(doc.body, getImg), title: m.title, author: m.author, cover: cv ? cv.blob : null };
  }
  if (fmt === "cbz") {
    const z = await JSZip.loadAsync(file);
    const names = Object.keys(z.files).filter(n => !z.files[n].dir && /\.(jpe?g|png|gif|webp|bmp)$/i.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n))
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));
    if (!names.length) throw new Error("Não encontrei imagens dentro deste CBZ.");
    const blocks = [];
    for (let i = 0; i < names.length; i++) {
      const b = await imgBlock(await z.file(names[i]).async("blob"));
      if (b) { blocks.push({ type: "pg", label: String(blocks.length / 2 + 1) }, { ...b, full: true }); }
      if (i % 5 === 0) await tick();
    }
    return { blocks, fixed: true };
  }
  throw new Error("Formato não reconhecido.");
}
