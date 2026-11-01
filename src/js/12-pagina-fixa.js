/* ---------- quadrinhos e mangá: EPUB de página fixa ---------- */
async function buildFixedEpub(blocks, { title, author, lang, rtl, meta }){
  const pages = []; let label = null;
  for (const b of blocks) {
    if (b.type === "pg") label = b.label;
    else if (b.type === "img") { pages.push({ blob: b.blob, w: b.w, h: b.h, label: label || String(pages.length + 1) }); label = null; }
  }
  if (!pages.length) throw new Error("Não encontrei páginas para montar o EPUB.");
  const z = new JSZip();
  z.file("mimetype", "application/epub+zip", { compression: "STORE" });
  const id = "urn:uuid:" + uuid(), modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  z.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  pages.forEach((pg, i) => {
    const n = String(i + 1).padStart(4, "0");
    z.file(`OEBPS/images/p${n}.jpg`, pg.blob);
    z.file(`OEBPS/text/p${n}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=${pg.w}, height=${pg.h}"/><title>${esc(title)} – ${esc(pg.label)}</title>
<style>html,body{margin:0;padding:0;width:${pg.w}px;height:${pg.h}px;overflow:hidden}img{display:block;width:${pg.w}px;height:${pg.h}px}</style></head>
<body><div id="pg${i + 1}" epub:type="pagebreak" role="doc-pagebreak" aria-label="${esc(pg.label)}"></div><img src="../images/p${n}.jpg" alt="Página ${esc(pg.label)}"/></body></html>`);
  });
  const files = pages.map((pg, i) => ({ fn: `p${String(i + 1).padStart(4, "0")}.xhtml`, label: pg.label, i }));
  z.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="UTF-8"/><title>Sumário</title></head>
<body><nav epub:type="toc" id="toc"><h1>Sumário</h1><ol><li><a href="text/${files[0].fn}">${esc(title)}</a></li></ol></nav>
<nav epub:type="page-list" id="page-list" hidden=""><h2>Páginas</h2><ol>
${files.map(f => `<li><a href="text/${f.fn}#pg${f.i + 1}">${esc(f.label)}</a></li>`).join("\n")}
</ol></nav></body></html>`);
  z.file("OEBPS/toc.ncx", `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="${pages.length}"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${esc(title)}</text></docTitle><navMap><navPoint id="np1" playOrder="1"><navLabel><text>${esc(title)}</text></navLabel><content src="text/${files[0].fn}"/></navPoint></navMap></ncx>`);
  const first = pages[0];
  z.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${esc(title)}</dc:title>
${author ? `<dc:creator>${esc(author)}</dc:creator>` : ""}
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
${metaXml(meta)}<meta property="rendition:layout">pre-paginated</meta>
<meta property="rendition:orientation">auto</meta>
<meta property="rendition:spread">landscape</meta>
<meta name="cover" content="img1"/>
<meta name="fixed-layout" content="true"/>
<meta name="book-type" content="comic"/>
<meta name="original-resolution" content="${first.w}x${first.h}"/>
${rtl ? `<meta name="primary-writing-mode" content="horizontal-rl"/>` : ""}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${files.map(f => `<item id="img${f.i + 1}" href="images/${f.fn.replace(".xhtml", ".jpg")}" media-type="image/jpeg"${f.i === 0 ? ` properties="cover-image"` : ""}/>
<item id="pg${f.i + 1}x" href="text/${f.fn}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine toc="ncx" page-progression-direction="${rtl ? "rtl" : "ltr"}">
${files.map(f => `<itemref idref="pg${f.i + 1}x"/>`).join("\n")}
</spine>
</package>`);
  const blob = await z.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
  return { blob, chapters: 1, images: pages.length, pages: pages.length, title };
}
