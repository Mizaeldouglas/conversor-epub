/* ---------- etapa 2: blocos -> DOCX ---------- */
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

async function blocksToDocx(blocks, title, author){
  const z = new JSZip();
  let bm = 0;
  const rels = [`<Relationship Id="rIdStyles" Type="${NS_R}/styles" Target="styles.xml"/>`];
  const bookmark = label => { bm++; return `<w:bookmarkStart w:id="${bm}" w:name="pdfpg${bm}_${hexEnc(label)}"/><w:bookmarkEnd w:id="${bm}"/>`; };
  const sup = label => `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">${esc(label)}</w:t></w:r>`;
  // chamada de nota: marcador invisível (para o EPUB achar a nota) + número sobrescrito
  const noteRef = s => {
    const i = s.indexOf("|"); if (i < 0) return sup(s);
    bm++; return `<w:bookmarkStart w:id="${bm}" w:name="note${s.slice(0, i)}_${hexEnc(s.slice(i + 1))}"/><w:bookmarkEnd w:id="${bm}"/>` + sup(s.slice(i + 1));
  };
  let lkN = 0;
  const runs = text => {
    let st = 0, lk = false;
    const out = text.split(/(\uE000[^\uE001]*\uE001|\uE002[^\uE003]*\uE003|[\uE004-\uE008]|\uE009[^\uE00A]*\uE00A|\uE00B)/).filter(Boolean).map(seg => {
      if (seg === BR) return "<w:r><w:br/></w:r>";
      if (seg === IT_ON) { st |= 1; return ""; } if (seg === IT_OFF) { st &= ~1; return ""; }
      if (seg === BD_ON) { st |= 2; return ""; } if (seg === BD_OFF) { st &= ~2; return ""; }
      if (seg[0] === LK_ON) {
        const url = seg.slice(1, -1), pre = lk ? "</w:hyperlink>" : ""; lk = true;
        if (url.startsWith("pg:")) return pre + `<w:hyperlink w:anchor="pg_${hexEnc(url.slice(3))}">`;
        lkN++; rels.push(`<Relationship Id="rIdL${lkN}" Type="${NS_R}/hyperlink" Target="${esc(url)}" TargetMode="External"/>`);
        return pre + `<w:hyperlink r:id="rIdL${lkN}">`;
      }
      if (seg === LK_OFF) { if (!lk) return ""; lk = false; return "</w:hyperlink>"; }
      if (seg[0] === PG_A) return bookmark(seg.slice(1, -1));
      if (seg[0] === "\uE002") return noteRef(seg.slice(1, -1));
      const rp = (st & 2 ? "<w:b/>" : "") + (st & 1 ? "<w:i/>" : "");
      return `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(seg)}</w:t></w:r>`;
    }).join("");
    return out + (lk ? "</w:hyperlink>" : "");
  };
  const para = (style, text) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${runs(text)}</w:p>`;
  const styleOf = { h1: "Heading1", h2: "Heading2", p: "", li: "Lista", verse: "Verso" };
  const cell = t => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${runs(t)}</w:p></w:tc>`;
  const bd = k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="888888"/>`;
  const table = rows => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(bd).join("")}</w:tblBorders></w:tblPr>${rows.map(r => `<w:tr>${r.map(cell).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
  const MAXW = 5760000, MAXH = 8200000; // EMU da área útil A4
  let n = 0, pendingPg = null;
  const parts = [para("Title", title)];
  for (const b of blocks) {
    if (b.type === "pg") { pendingPg = b.label; continue; }
    if (b.type === "note") {
      bm++;
      parts.push(`<w:p><w:pPr><w:pStyle w:val="NotaRodape"/></w:pPr><w:bookmarkStart w:id="${bm}" w:name="notebody${b.id}"/><w:bookmarkEnd w:id="${bm}"/>${sup(b.label)}${runs(" " + b.text)}</w:p>`);
      continue;
    }
    if (b.type === "scene") { parts.push(para("Cena", b.text)); continue; }
    if (b.type === "table") { parts.push(table(b.rows)); continue; }
    if (b.type !== "img") { parts.push(para(b.demote && /^h[12]$/.test(b.type) ? "Heading3" : b.part && /^h[12]$/.test(b.type) ? "Parte" : styleOf[b.type], b.text)); continue; }
    n++;
    const file = `image${n}.jpg`;
    z.file("word/media/" + file, b.blob);
    rels.push(`<Relationship Id="rIdImg${n}" Type="${NS_R}/image" Target="media/${file}"/>`);
    let cx = b.w * 9525, cy = b.h * 9525;
    const s = b.full ? Math.min(MAXW / cx, MAXH / cy) : Math.min(1, MAXW / cx, MAXH / cy);
    cx = Math.round(cx * s); cy = Math.round(cy * s);
    const name = (b.full ? "Pagina " : "Imagem ") + n;
    parts.push(`<w:p><w:pPr>${b.full ? "<w:pageBreakBefore/>" : ""}<w:spacing w:before="120" w:after="120"/><w:jc w:val="center"/></w:pPr>${pendingPg !== null ? bookmark(pendingPg) : ""}<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="${name}"${b.alt ? ` descr="${esc(b.alt)}"` : ""}/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
    pendingPg = null;
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${NS_R}" xmlns:wp="${NS_WP}" xmlns:a="${NS_A}" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${parts.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="480"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="240" w:after="240"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Parte"><w:name w:val="Parte"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="1200" w:after="240"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Cena"><w:name w:val="Quebra de cena"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="200"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="NotaRodape"><w:name w:val="Nota de rodapé"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Lista"><w:name w:val="Item de lista"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="567" w:hanging="283"/><w:jc w:val="left"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Verso"><w:name w:val="Verso"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="120"/><w:ind w:left="567"/><w:jc w:val="left"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  z.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
  z.file("word/document.xml", doc);
  z.file("word/styles.xml", styles);
  z.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author || "")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  return z.generateAsync({ type: "blob", compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
