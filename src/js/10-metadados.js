/* ---------- metadados extras: série, número, assunto, sinopse ---------- */
const seriesIdx = v => /^\d+([.,]\d+)?$/.test(String(v || "").trim()) ? String(v).trim().replace(",", ".") : "";
const subjectsOf = m => String((m && m.subject) || "").split(/[,;]/).map(t => t.trim()).filter(Boolean);
const isbnOf = v => { const d = String(v || "").replace(/[^\dXx]/g, "").toUpperCase(); return /^(\d{9}[\dX]|\d{13})$/.test(d) ? d : ""; };
const yearOf = v => /^\d{4}$/.test(String(v || "").trim()) ? String(v).trim() : "";
function metaXml(m){
  if (!m) return "";
  let x = "";
  if (m.publisher) x += `<dc:publisher>${esc(m.publisher)}</dc:publisher>\n`;
  if (yearOf(m.year)) x += `<dc:date>${yearOf(m.year)}</dc:date>\n`;
  if (isbnOf(m.isbn)) x += `<dc:identifier id="isbn">urn:isbn:${isbnOf(m.isbn)}</dc:identifier>\n`;
  if (m.description) x += `<dc:description>${esc(m.description)}</dc:description>\n`;
  for (const sub of subjectsOf(m)) x += `<dc:subject>${esc(sub)}</dc:subject>\n`;
  if (m.series) {
    const n = seriesIdx(m.seriesIndex);
    x += `<meta property="belongs-to-collection" id="serie">${esc(m.series)}</meta>\n<meta refines="#serie" property="collection-type">series</meta>\n`;
    if (n) x += `<meta refines="#serie" property="group-position">${n}</meta>\n`;
    x += `<meta name="calibre:series" content="${esc(m.series)}"/>\n`;
    if (n) x += `<meta name="calibre:series_index" content="${n}"/>\n`;
  }
  return x;
}
// mesmos metadados num EPUB já existente (mexe só no que foi preenchido)
function applyMetaDom(opf, m, isV3){
  if (!m || !(m.description || m.subject || m.series || m.publisher || yearOf(m.year) || isbnOf(m.isbn))) return false;
  const DC = "http://purl.org/dc/elements/1.1/", OPF = "http://www.idpf.org/2007/opf";
  const md = opf.getElementsByTagNameNS("*", "metadata")[0]; if (!md) return false;
  const drop = els => [...els].forEach(e => e.parentNode.removeChild(e));
  const add = (ns, tag, text, attrs = {}) => { const e = opf.createElementNS(ns, tag); if (text != null) e.textContent = text; for (const k in attrs) e.setAttribute(k, attrs[k]); md.appendChild(e); return e; };
  if (m.description) { drop(md.getElementsByTagNameNS(DC, "description")); add(DC, "dc:description", m.description); }
  if (m.publisher) { drop(md.getElementsByTagNameNS(DC, "publisher")); add(DC, "dc:publisher", m.publisher); }
  if (yearOf(m.year)) { drop(md.getElementsByTagNameNS(DC, "date")); add(DC, "dc:date", yearOf(m.year)); }
  if (isbnOf(m.isbn)) { drop([...md.getElementsByTagNameNS(DC, "identifier")].filter(e => /isbn/i.test(e.textContent + (e.getAttribute("id") || "")))); add(DC, "dc:identifier", "urn:isbn:" + isbnOf(m.isbn), { id: "isbn" }); }
  if (m.subject) { drop(md.getElementsByTagNameNS(DC, "subject")); for (const sub of subjectsOf(m)) add(DC, "dc:subject", sub); }
  if (m.series) {
    const metas = [...md.getElementsByTagNameNS("*", "meta")];
    const coll = metas.filter(e => e.getAttribute("property") === "belongs-to-collection").map(e => e.getAttribute("id")).filter(Boolean);
    drop(metas.filter(e => e.getAttribute("property") === "belongs-to-collection" || /^calibre:series/.test(e.getAttribute("name") || "")
      || coll.some(id => e.getAttribute("refines") === "#" + id)));
    const n = seriesIdx(m.seriesIndex);
    if (isV3) {
      add(OPF, "meta", m.series, { property: "belongs-to-collection", id: "serie" });
      add(OPF, "meta", "series", { refines: "#serie", property: "collection-type" });
      if (n) add(OPF, "meta", n, { refines: "#serie", property: "group-position" });
    }
    add(OPF, "meta", null, { name: "calibre:series", content: m.series });
    if (n) add(OPF, "meta", null, { name: "calibre:series_index", content: n });
  }
  return true;
}
// aparência do texto no EPUB
function lookCss(look){
  look = look || {};
  const font = look.font === "sans" ? "font-family:sans-serif;" : look.font === "reader" ? "" : "font-family:serif;";
  const lh = /^\d(\.\d+)?$/.test(look.lh || "") ? look.lh : "1.5";
  const align = look.justify === false ? "left" : "justify";
  const para = look.indent === "space" ? `p{margin:0 0 .8em;text-indent:0;text-align:${align}}` : `p{margin:0;text-indent:1.4em;text-align:${align}}`;
  return { body: `body{${font}line-height:${lh};margin:0 4%}`, para };
}
