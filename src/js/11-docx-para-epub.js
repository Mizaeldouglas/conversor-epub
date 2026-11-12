/* ---------- etapa 3: DOCX -> EPUB (lê o DOCX gerado) ---------- */
// sumário em dois níveis: cada parte agrupa os capítulos que vêm depois dela
function tocTree(files){
  const out = []; let part = null;
  for (const f of files) {
    if (f.part) { part = { f, kids: [] }; out.push(part); }
    else if (part) part.kids.push(f);
    else out.push({ f, kids: [] });
  }
  return out;
}

async function docxToEpub(docxBlob, author, lang, showNums, extra = {}){
  const dz = await JSZip.loadAsync(docxBlob);
  const parse = s => new DOMParser().parseFromString(s, "application/xml");
  const xml = parse(await dz.file("word/document.xml").async("string"));
  const relMap = {};
  const relFile = dz.file("word/_rels/document.xml.rels");
  if (relFile) for (const r of parse(await relFile.async("string")).getElementsByTagName("Relationship"))
    relMap[r.getAttribute("Id")] = r.getAttribute("Target");
  let title = "";
  try { const core = parse(await dz.file("docProps/core.xml").async("string"));
        title = (core.getElementsByTagName("dc:title")[0] || {}).textContent || ""; } catch {}

  const z = new JSZip();
  z.file("mimetype", "application/epub+zip", { compression: "STORE" });
  const images = []; // {id, href}
  const paras = [];
  // estilo da letra no DOCX: <w:i/> itálico, <w:b/> negrito
  const runStyle = t => {
    const r = t.parentNode, rp = r && [...r.childNodes].find(c => c.localName === "rPr");
    let s = 0;
    if (rp) for (const c of rp.childNodes) {
      if (!c.getAttribute) continue;
      const v = c.getAttributeNS(W, "val") || c.getAttribute("w:val");
      const on = !v || !/^(0|false|off)$/i.test(v);
      if (c.localName === "i" && on) s |= 1; if (c.localName === "b" && on) s |= 2;
    }
    return s;
  };
  const pgLabel = el => {
    const m = /^pdfpg\d+_([0-9a-f]*)$/.exec(el.getAttributeNS(W, "name") || el.getAttribute("w:name") || "");
    return m ? hexDec(m[1]) : null;
  };
  // endereço do link em volta de um trecho de texto
  const linkOf = t => {
    const h = t.parentNode && t.parentNode.parentNode;
    if (!h || h.localName !== "hyperlink") return "";
    const u = relMap[h.getAttributeNS(NS_R, "id") || h.getAttribute("r:id")] || "";
    return /^(https?:|mailto:)/i.test(u) ? u : "";
  };
  // texto de um parágrafo, com os marcadores de estilo, página, nota e link
  const paraText = (p, style) => {
    let text = "", skipSup = false, noteBody = null, noteLabel = "", cs = 0, lk = "";
    for (const n of p.getElementsByTagNameNS(W, "*")) {
      if (n.localName === "t") {
        if (skipSup) { skipSup = false; if (noteBody && !noteLabel) noteLabel = n.textContent; continue; }
        const u = linkOf(n);
        if (u !== lk) { if (cs) { text = styleSwitch(text, cs, 0); cs = 0; } text += (lk ? LK_OFF : "") + (u ? LK_ON + u + LK_MID : ""); lk = u; }
        const s = runStyle(n); if (s !== cs) { text = styleSwitch(text, cs, s); cs = s; }
        text += n.textContent;
      }
      else if (n.localName === "tab") text += " ";
      else if (n.localName === "br") text += /^(Heading|Parte$|Verso$)/.test(style) ? BR : " ";
      else if (n.localName === "bookmarkStart") {
        const nm = n.getAttributeNS(W, "name") || n.getAttribute("w:name") || ""; let m;
        if ((m = /^note(\d+)_([0-9a-f]*)$/.exec(nm))) { text += "\uE002" + m[1] + "|" + hexDec(m[2]) + "\uE003"; skipSup = true; }
        else if ((m = /^notebody(\d+)$/.exec(nm))) { noteBody = +m[1]; skipSup = true; }
        else { const l = pgLabel(n); if (l !== null) text += pgMark(l); }
      }
    }
    if (cs) text = styleSwitch(text, cs, 0);
    if (lk) text += LK_OFF;
    return { text: text.trim(), noteBody, noteLabel };
  };
  let pn = 0;
  const bodyEl = xml.getElementsByTagNameNS(W, "body")[0];
  for (const p of bodyEl ? [...bodyEl.children] : []) {
    if (++pn % 300 === 0) await tick();
    if (p.localName === "tbl") {
      const rows = [...p.getElementsByTagNameNS(W, "tr")].map(tr => [...tr.getElementsByTagNameNS(W, "tc")].map(tc =>
        [...tc.getElementsByTagNameNS(W, "p")].map(cp => paraText(cp, "").text).filter(Boolean).join(" ")));
      if (rows.length) paras.push({ style: "table", rows });
      continue;
    }
    if (p.localName !== "p") continue;
    const blips = p.getElementsByTagNameNS(NS_A, "blip");
    if (blips.length) {
      for (const b of p.getElementsByTagNameNS(W, "bookmarkStart")) { const l = pgLabel(b); if (l !== null) paras.push({ style: "pg", label: l }); }
      const prs = p.getElementsByTagNameNS(NS_WP, "docPr");
      for (let i = 0; i < blips.length; i++) {
        const rid = blips[i].getAttributeNS(NS_R, "embed") || blips[i].getAttribute("r:embed");
        const target = relMap[rid]; if (!target) continue;
        const f = dz.file("word/" + target.replace(/^\//, "")); if (!f) continue;
        const href = "images/img" + String(images.length + 1).padStart(4, "0") + ".jpg";
        let bytes = await f.async("uint8array");
        if (extra.images && extra.images !== "orig") { const sm = await shrinkJpeg(new Blob([bytes], { type: "image/jpeg" }), extra.images); if (sm) bytes = sm; }
        z.file("OEBPS/" + href, bytes);
        images.push({ id: "im" + (images.length + 1), href });
        const name = prs[i] ? prs[i].getAttribute("name") || "" : "";
        paras.push({ style: "img", src: href, full: name.startsWith("Pagina"), alt: prs[i] ? prs[i].getAttribute("descr") || "" : "" });
      }
      continue;
    }
    const ps = p.getElementsByTagNameNS(W, "pStyle")[0];
    const style = ps ? (ps.getAttributeNS(W, "val") || ps.getAttribute("w:val")) : "";
    const { text, noteBody, noteLabel } = paraText(p, style);
    if (style === "Cena") { paras.push({ style: "scene", text }); continue; }
    if (style === "NotaRodape" && noteBody) { paras.push({ style: "note", id: noteBody, label: noteLabel, text }); continue; }
    if (!text) continue;
    if (!stripPg(text)) { for (const m of text.matchAll(PG_RE)) paras.push({ style: "pg", label: m[1] }); continue; }
    paras.push({ style, text });
  }
  if (!title) { const t = paras.find(p => p.style === "Title"); title = t ? t.text : "Sem título"; }
  const content = paras.filter(p => p.style !== "Title");

  const hasH1 = content.some(p => p.style === "Heading1");
  const hasH2 = content.some(p => p.style === "Heading2");
  const hasPart = content.some(p => p.style === "Parte");
  const splitStyle = hasH1 ? "Heading1" : hasH2 ? "Heading2" : hasPart ? "Parte" : null;
  const chapters = [];
  let ch = null;
  const newCh = (name, part) => { ch = { title: name, items: [], weight: 0, notes: [], part: !!part }; chapters.push(ch); };
  const titleOf = t => stripPg(t.replace(NOTE_RE, "").replace(/\.?\s*\uE008\s*/g, ". "));
  for (const p of content) {
    if (p.style === "Parte") { newCh(titleOf(p.text), true); ch.items.push({ tag: "h1", text: p.text }); continue; }
    if (splitStyle && p.style === splitStyle) { newCh(titleOf(p.text)); ch.items.push({ tag: "h1", text: p.text }); continue; }
    if (!ch) newCh(splitStyle ? "Início" : "Parte 1");
    if (p.style === "note") { ch.notes.push(p); continue; }
    if (p.style === "pg") { ch.items.push({ tag: "pg", label: p.label }); continue; }
    if (p.style === "scene") { ch.items.push({ tag: "scene", text: p.text }); continue; }
    if (!splitStyle && ch.weight >= 60) newCh("Parte " + (chapters.length + 1));
    if (p.style === "img") { ch.items.push({ tag: "img", src: p.src, full: p.full, alt: p.alt }); ch.weight += 5; continue; }
    if (p.style === "table") { ch.items.push({ tag: "table", rows: p.rows }); ch.weight += p.rows.length; continue; }
    if (p.style === "Lista" || p.style === "Verso") { ch.items.push({ tag: p.style === "Lista" ? "li" : "verse", text: p.text }); ch.weight += 1; continue; }
    const tag = p.style === "Heading1" ? "h2" : p.style === "Heading2" ? (splitStyle === "Heading2" ? "h1" : "h2") : p.style === "Heading3" ? "h2" : "p";
    ch.items.push({ tag, text: p.text }); ch.weight += 1;
  }
  if (!chapters.length) newCh("Texto");
  // cada nota fica no capítulo que a chama (em alguns formatos as notas vêm todas no fim do arquivo)
  const allNotes = new Map();
  for (const c of chapters) for (const n of c.notes) allNotes.set(String(n.id), n);
  for (const c of chapters) {
    const ids = [];
    for (const it of c.items) for (const t of it.rows ? it.rows.flat() : [it.text || ""]) for (const m of t.matchAll(/\uE002(\d+)\|/g)) if (!ids.includes(m[1])) ids.push(m[1]);
    c.notes = ids.map(id => allNotes.get(id)).filter(Boolean);
  }

  // capa: primeira imagem, se for página inteira logo no início
  const firstImg = content.slice(0, 3).find(p => p.style === "img" && p.full);
  let cover = firstImg ? images.find(i => i.href === firstImg.src) : null, coverPage = false;
  // capa escolhida (primeira página do PDF ou imagem enviada): vira a capa do Kindle
  if (!cover && extra.cover) {
    z.file("OEBPS/images/cover.jpg", extra.cover);
    cover = { id: "cover-img", href: "images/cover.jpg" }; images.unshift(cover); coverPage = true;
  }

  const id = "urn:uuid:" + uuid();
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const xhtml = (t, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="UTF-8"/><title>${esc(t)}</title><link rel="stylesheet" type="text/css" href="../style.css"/></head>
<body>${inner}</body></html>`;

  z.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const lk = lookCss(extra.look);
  z.file("OEBPS/style.css", `${lk.body}
h1{font-size:1.6em;margin:1.5em 0 1em;text-align:left;page-break-after:avoid}
h2{font-size:1.25em;margin:1.4em 0 .6em;page-break-after:avoid}
${lk.para}
h1+p,h2+p,figure+p{text-indent:0}
figure{margin:1em 0;text-align:center}
figure img{max-width:100%;height:auto}
.pg{margin:0;padding:0;text-align:center;page-break-before:always;page-break-inside:avoid}
.pg img{max-width:100%;max-height:94vh;height:auto}
.pn{font-size:.7em;font-weight:normal;font-style:normal;color:#888;white-space:nowrap;padding:0 .3em;text-indent:0}
h1 .pn,h2 .pn{display:block;padding:0;margin-bottom:.3em}
.pnb{font-size:.7em;color:#888;text-align:center;text-indent:0;margin:.8em 0 .2em}
.cover{margin:0;padding:0;text-align:center}.cover img{max-width:100%;max-height:100vh;height:auto}
sup a{text-decoration:none}
aside{font-size:.85em;margin-top:1em}
p.nota{text-indent:0;text-align:left}
p.cena{text-indent:0;text-align:center;margin:1em 0}
hr.cena{border:0;height:0;margin:1.2em 0}
p.cena+p,hr.cena+p{text-indent:0}
ul.lista{list-style:none;margin:.6em 0;padding:0}
ul.lista li{margin:0 0 .3em 1.6em;text-indent:-1em;text-align:left}
p.verso{text-indent:0;text-align:left;margin:.8em 0 .8em 1.6em}
table{border-collapse:collapse;margin:1em auto;font-size:.9em}
td{border:1px solid #888;padding:.25em .5em;text-align:left;vertical-align:top}
a{color:inherit}
.parte h1{font-size:2em;text-align:center;margin-top:30%}
.title{text-align:center;margin-top:30%}.title h1{font-size:2em;text-align:center}.title p{text-indent:0;text-align:center;font-style:italic}`);

  const files = [], pageList = [];
  let pgN = 0;
  const pgSpan = (label, fn, block) => {
    pgN++; const pid = "pg" + pgN; pageList.push({ fn, pid, label });
    const attrs = `id="${pid}" epub:type="pagebreak" role="doc-pagebreak" aria-label="${esc(label)}" title="${esc(label)}"`;
    if (block) return showNums ? `<div ${attrs} class="pnb">p. ${esc(label)}</div>` : `<div ${attrs}></div>`;
    return showNums ? `<span ${attrs} class="pn">[p. ${esc(label)}]</span>` : `<span ${attrs}></span>`;
  };
  const noteRef = s => {
    const i = s.indexOf("|"); if (i < 0) return esc(s);
    const id = s.slice(0, i);
    if (!allNotes.has(id)) return `<sup>${esc(s.slice(i + 1))}</sup>`;
    return `<sup><a epub:type="noteref" role="doc-noteref" href="#fn${id}" id="fnref${id}">${esc(s.slice(i + 1))}</a></sup>`;
  };
  // texto com marcadores -> XHTML (itálico em <em>, negrito em <strong>, sempre bem aninhados)
  const rich = (text, fn) => {
    const out = [], stack = []; let want = 0, link = false;
    const sync = () => {
      const need = []; if (want & 2) need.push("strong"); if (want & 1) need.push("em");
      let k = 0; while (k < stack.length && need.includes(stack[k])) k++;
      while (stack.length > k) out.push(`</${stack.pop()}>`);
      for (const t of need) if (!stack.includes(t)) { out.push(`<${t}>`); stack.push(t); }
    };
    for (const seg of text.split(/(\uE000[^\uE001]*\uE001|\uE002[^\uE003]*\uE003|[\uE004-\uE008]|\uE009[^\uE00A]*\uE00A|\uE00B)/)) {
      if (!seg) continue;
      if (seg === BR) { out.push("<br/>"); continue; }
      if (seg[0] === LK_ON || seg === LK_OFF) {
        while (stack.length) out.push(`</${stack.pop()}>`);
        if (link) { out.push("</a>"); link = false; }
        if (seg[0] === LK_ON) { out.push(`<a href="${esc(seg.slice(1, -1))}">`); link = true; }
        continue;
      }
      if (seg === IT_ON) want |= 1; else if (seg === IT_OFF) want &= ~1; else if (seg === BD_ON) want |= 2; else if (seg === BD_OFF) want &= ~2;
      else { sync(); out.push(seg[0] === PG_A ? pgSpan(seg.slice(1, -1), fn, false) : seg[0] === "\uE002" ? noteRef(seg.slice(1, -1)) : esc(seg)); }
    }
    while (stack.length) out.push(`</${stack.pop()}>`);
    if (link) out.push("</a>");
    return out.join("");
  };
  if (coverPage) z.file("OEBPS/text/cover.xhtml", xhtml(title, `<div class="cover" epub:type="cover"><img src="../images/cover.jpg" alt="${esc(title)}"/></div>`));
  if (!cover) z.file("OEBPS/text/titlepage.xhtml", xhtml(title,
    `<section class="title" epub:type="titlepage"><h1>${esc(title)}</h1>${author ? `<p>${esc(author)}</p>` : ""}</section>`));
  chapters.forEach((c, i) => {
    const fn = `ch${String(i + 1).padStart(3, "0")}.xhtml`;
    files.push({ fn, title: c.title, part: c.part });
    const altOf = it => esc(it.alt || "");
    const inner = c.items.map((it, k) =>
      it.tag === "pg" ? ((c.items[k + 1] || {}).full ? "" : pgSpan(it.label, fn, true))
      : it.tag === "img"
        ? (it.full ? `<div class="pg">${(c.items[k - 1] || {}).tag === "pg" ? pgSpan(c.items[k - 1].label, fn, true) : ""}<img src="../${it.src}" alt="${altOf(it)}"/></div>` : `<figure><img src="../${it.src}" alt="${altOf(it)}"/></figure>`)
        : it.tag === "scene" ? (stripPg(it.text) ? `<p class="cena">${rich(it.text, fn)}</p>` : `${rich(it.text, fn)}<hr class="cena"/>`)
        : it.tag === "table" ? `<table>${it.rows.map(r => `<tr>${r.map(t => `<td>${rich(t, fn)}</td>`).join("")}</tr>`).join("")}</table>`
        : it.tag === "li" ? `${(c.items[k - 1] || {}).tag === "li" ? "" : '<ul class="lista">'}<li>${rich(it.text, fn)}</li>${(c.items[k + 1] || {}).tag === "li" ? "" : "</ul>"}`
        : it.tag === "verse" ? `<p class="verso">${rich(it.text, fn)}</p>`
        : `<${it.tag}>${rich(it.text, fn)}</${it.tag}>`).join("\n");
    const notes = c.notes.map(n => `<aside epub:type="footnote" role="doc-footnote" id="fn${n.id}"><p class="nota"><a href="#fnref${n.id}">${esc(n.label)}</a> ${rich(n.text, fn)}</p></aside>`).join("\n");
    z.file("OEBPS/text/" + fn, xhtml(c.title, `<section epub:type="${c.part ? "part" : "chapter"}"${c.part ? ' class="parte"' : ""}>${inner}</section>${notes ? "\n" + notes : ""}`));
  });

  z.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="UTF-8"/><title>Sumário</title></head>
<body><nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>
${tocTree(files).map(t => `<li><a href="text/${t.f.fn}">${esc(t.f.title)}</a>${t.kids.length ? `<ol>\n${t.kids.map(k => `<li><a href="text/${k.fn}">${esc(k.title)}</a></li>`).join("\n")}\n</ol>` : ""}</li>`).join("\n")}
</ol></nav>
${pageList.length ? `<nav epub:type="page-list" id="page-list" hidden=""><h2>Páginas</h2><ol>
${pageList.map(pg => `<li><a href="text/${pg.fn}#${pg.pid}">${esc(pg.label)}</a></li>`).join("\n")}
</ol></nav>` : ""}
</body></html>`);

  z.file("OEBPS/toc.ncx", `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/><meta name="dtb:depth" content="${files.some(f => f.part) ? 2 : 1}"/><meta name="dtb:totalPageCount" content="${pageList.length}"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${esc(title)}</text></docTitle><navMap>
${(() => { const np = f => `<navPoint id="np${files.indexOf(f) + 1}" playOrder="${files.indexOf(f) + 1}"><navLabel><text>${esc(f.title)}</text></navLabel><content src="text/${f.fn}"/>`;
  return tocTree(files).map(t => np(t.f) + t.kids.map(k => np(k) + "</navPoint>").join("") + "</navPoint>").join("\n"); })()}
</navMap></ncx>`);

  z.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${esc(title)}</dc:title>
${author ? `<dc:creator>${esc(author)}</dc:creator>` : ""}
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
${metaXml(extra.meta)}${pageList.length ? `<dc:source id="src">PDF original</dc:source>
<meta property="schema:accessibilityFeature">printPageNumbers</meta>
<meta property="schema:accessibilityFeature">pageNavigation</meta>` : ""}
${cover ? `<meta name="cover" content="${cover.id}"/>` : ""}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${cover ? "" : `<item id="titlepage" href="text/titlepage.xhtml" media-type="application/xhtml+xml"/>`}
${coverPage ? `<item id="coverpage" href="text/cover.xhtml" media-type="application/xhtml+xml"/>` : ""}
${images.map(im => `<item id="${im.id}" href="${im.href}" media-type="image/jpeg"${cover && im.id === cover.id ? ` properties="cover-image"` : ""}/>`).join("\n")}
${files.map((f, i) => `<item id="c${i + 1}" href="text/${f.fn}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine toc="ncx">
${cover ? "" : `<itemref idref="titlepage"/>`}
${coverPage ? `<itemref idref="coverpage"/>` : ""}
${files.map((f, i) => `<itemref idref="c${i + 1}"/>`).join("\n")}
</spine>
</package>`);

  const blob = await z.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
  return { blob, chapters: chapters.length, images: images.length - (coverPage ? 1 : 0), pages: pageList.length, title, notes: chapters.reduce((s, c) => s + c.notes.length, 0) };
}
