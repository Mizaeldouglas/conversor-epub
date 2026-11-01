/* ---------- EPUB -> EPUB (numera páginas sem mexer no texto) ---------- */
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const EPUB_NS = "http://www.idpf.org/2007/ops";
const OPF_NS = "http://www.idpf.org/2007/opf";
const NCX_NS = "http://www.daisy.org/z3986/2005/ncx/";
const parseXml = s => new DOMParser().parseFromString(s, "application/xml");
const hasParseError = d => d.getElementsByTagName("parsererror").length > 0;
const dirOf = p => p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "";
function resolvePath(base, href){
  const out = [];
  for (const seg of (base + href).split("/")) {
    if (seg === "..") out.pop(); else if (seg !== "." && seg !== "") out.push(seg);
  }
  return out.join("/");
}
function relPath(fromDir, to){
  const a = fromDir.split("/").filter(Boolean), b = to.split("/");
  let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return "../".repeat(a.length - i) + b.slice(i).map(encodeURIComponent).join("/");
}
const serializeXml = (doc, hadDecl) => (hadDecl ? '<?xml version="1.0" encoding="UTF-8"?>\n' : "") +
  new XMLSerializer().serializeToString(doc).replace(/^\s*<\?xml[^>]*\?>\s*/, "");

async function fixEpub(file, opt, onProgress){
  let zin;
  try { zin = await JSZip.loadAsync(file); } catch { throw new Error("O arquivo não é um EPUB válido (não abre como ZIP)."); }
  const enc = zin.file("META-INF/encryption.xml");
  if (enc) {
    const encDoc = parseXml(await enc.async("string"));
    const refs = [...encDoc.getElementsByTagNameNS("*", "CipherReference")].map(c => c.getAttribute("URI") || "");
    const methods = [...encDoc.getElementsByTagNameNS("*", "EncryptionMethod")].map(m => m.getAttribute("Algorithm") || "");
    const onlyFonts = methods.every(m => /obfuscation|idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/.test(m));
    if (refs.some(r => /\.(x?html?|xml)$/i.test(r)) || !onlyFonts) throw new Error("Este EPUB tem proteção DRM e não pode ser alterado.");
  }
  const cont = zin.file("META-INF/container.xml");
  if (!cont) throw new Error("EPUB sem META-INF/container.xml.");
  const rootfile = parseXml(await cont.async("string")).getElementsByTagNameNS("*", "rootfile")[0];
  const opfPath = rootfile && rootfile.getAttribute("full-path");
  if (!opfPath || !zin.file(opfPath)) throw new Error("Não encontrei o arquivo OPF do EPUB.");
  const opfDir = dirOf(opfPath);
  const opf = parseXml(await zin.file(opfPath).async("string"));
  const isV3 = parseFloat(opf.documentElement.getAttribute("version") || "2") >= 3;
  const DC = "http://purl.org/dc/elements/1.1/";
  const titleEl = opf.getElementsByTagNameNS(DC, "title")[0];
  let creatorEl = opf.getElementsByTagNameNS(DC, "creator")[0];
  let opfChanged = false;
  if (opt.title && titleEl && opt.title !== titleEl.textContent.trim()) { titleEl.textContent = opt.title; opfChanged = true; }
  if (opt.author != null && opt.author !== (creatorEl ? creatorEl.textContent.trim() : "")) {
    if (!creatorEl && opt.author) {
      const md = opf.getElementsByTagNameNS("*", "metadata")[0];
      creatorEl = opf.createElementNS(DC, "dc:creator"); md.appendChild(creatorEl);
    }
    if (creatorEl) { creatorEl.textContent = opt.author; opfChanged = true; }
  }
  if (applyMetaDom(opf, opt.meta, isV3)) opfChanged = true;
  const title = (titleEl && titleEl.textContent.trim()) || baseName(file.name);
  const author = creatorEl ? creatorEl.textContent.trim() : "";

  const manifest = new Map();
  for (const it of opf.getElementsByTagNameNS("*", "item"))
    manifest.set(it.getAttribute("id"), { href: it.getAttribute("href"), type: it.getAttribute("media-type") || "", props: it.getAttribute("properties") || "" });
  const pathOf = m => resolvePath(opfDir, decodeURIComponent(m.href.split("#")[0]));
  const navItem = [...manifest.values()].find(m => /\bnav\b/.test(m.props));
  const spineEl = opf.getElementsByTagNameNS("*", "spine")[0];
  const ncxItem = manifest.get(spineEl && spineEl.getAttribute("toc")) || [...manifest.values()].find(m => m.type === "application/x-dtbncx+xml");

  // documentos do spine, na ordem de leitura
  const docs = [];
  for (const ref of opf.getElementsByTagNameNS("*", "itemref")) {
    const m = manifest.get(ref.getAttribute("idref"));
    if (!m || !/html/.test(m.type)) continue;
    const path = pathOf(m);
    const f = zin.file(path); if (!f) continue;
    const src = await f.async("string");
    let doc = new DOMParser().parseFromString(src, "application/xhtml+xml"), html = false;
    if (hasParseError(doc)) { doc = new DOMParser().parseFromString(src, "text/html"); html = true; }
    docs.push({ path, doc, html, hadDecl: /^\s*<\?xml/.test(src), changed: false });
  }
  if (!docs.length) throw new Error("Não encontrei o texto do livro dentro do EPUB.");

  const textNodes = d => {
    const body = d.doc.body || d.doc.getElementsByTagNameNS(XHTML_NS, "body")[0] || d.doc.documentElement;
    const walker = d.doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentNode && /^(script|style|title|head)$/i.test(n.parentNode.localName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const out = []; let n; while ((n = walker.nextNode())) out.push(n);
    return out;
  };

  // palavras antes de qualquer mudança (para a conferência no fim)
  const before = [];
  docs.forEach((d, i) => { for (const w of docWords(d.doc)) before.push({ w, p: i + 1, eol: false }); });

  // 2) páginas
  let navDoc = null, navPath = null, ncxDoc = null, ncxPath = null;
  if (navItem) { navPath = pathOf(navItem); const s = await zin.file(navPath)?.async("string"); if (s) navDoc = parseXml(s); if (navDoc && hasParseError(navDoc)) navDoc = null; }
  if (ncxItem) { ncxPath = pathOf(ncxItem); const s = await zin.file(ncxPath)?.async("string"); if (s) ncxDoc = parseXml(s); if (ncxDoc && hasParseError(ncxDoc)) ncxDoc = null; }
  const navPageList = navDoc && [...navDoc.getElementsByTagNameNS("*", "nav")].find(n => /page-list/.test(n.getAttributeNS(EPUB_NS, "type") || n.getAttribute("epub:type") || ""));
  const ncxPageList = ncxDoc && ncxDoc.getElementsByTagNameNS("*", "pageList")[0];
  const existing = navPageList ? navPageList.getElementsByTagNameNS("*", "a").length : ncxPageList ? ncxPageList.getElementsByTagNameNS("*", "pageTarget").length : 0;

  let pageCount = 0, keptPages = false, paginated = false;
  if (existing && opt.keepPages) { pageCount = existing; keptPages = true; }
  else if (opt.totalPages > 0 || opt.cpp > 0) {
    paginated = true;
    onProgress("numerando páginas");
    // remove marcações de página antigas para não duplicar
    for (const d of docs) for (const el of [...d.doc.getElementsByTagNameNS("*", "*")]) {
      const t = el.getAttributeNS(EPUB_NS, "type") || el.getAttribute("epub:type") || "";
      if (/\bpagebreak\b/.test(t) || el.getAttribute("role") === "doc-pagebreak") { el.parentNode.removeChild(el); d.changed = true; }
    }
    const nodeLen = n => n.data.trim() ? n.data.length : 0;
    let total = 0;
    for (const d of docs) for (const n of textNodes(d)) total += nodeLen(n);
    if (!total) throw new Error("O EPUB não tem texto para numerar.");
    const cpp = opt.totalPages > 0 ? total / opt.totalPages : Math.max(300, opt.cpp || 1800);
    const pages = [], used = new Set();
    for (const d of docs) for (const e of d.doc.querySelectorAll("[id]")) used.add(e.getAttribute("id"));
    const mkMarker = (d, label) => {
      let id = "pagina-" + label, k = 2; while (used.has(id)) id = "pagina-" + label + "-" + k++;
      used.add(id);
      const el = d.doc.createElementNS(d.doc.documentElement.namespaceURI || XHTML_NS, "span");
      el.setAttribute("id", id);
      if (isV3) { el.setAttributeNS(EPUB_NS, "epub:type", "pagebreak"); el.setAttribute("role", "doc-pagebreak"); el.setAttribute("aria-label", label); }
      el.setAttribute("title", label);
      el.setAttribute("class", "pgmark");
      if (opt.showNums) {
        el.setAttribute("style", "font-size:0.7em;font-weight:normal;font-style:normal;color:#888;white-space:nowrap;padding:0 0.3em;text-indent:0");
        el.textContent = "[p. " + label + "]";
      }
      pages.push({ path: d.path, id, label });
      d.changed = true;
      return el;
    };
    let acc = 0, num = 1;
    for (const d of docs) {
      if (isV3 && !d.html) {
        const root = d.doc.documentElement;
        if (root.lookupNamespaceURI("epub") !== EPUB_NS) root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:epub", EPUB_NS);
      }
      for (const node of textNodes(d)) {
        if (!nodeLen(node)) continue;
        let n = node;
        while (true) {
          const target = (num - 1) * cpp;
          if (target >= acc + n.data.length) break;
          let off = Math.max(0, Math.ceil(target - acc));
          if (off > 0) { const sp = n.data.slice(off).search(/\s/); off = sp < 0 ? n.data.length : off + sp + 1; }
          const marker = mkMarker(d, String(num));
          num++; pageCount++;
          if (off >= n.data.length) { n.parentNode.insertBefore(marker, n.nextSibling); break; }
          const rest = off > 0 ? n.splitText(off) : n;
          rest.parentNode.insertBefore(marker, rest);
          acc += off; n = rest;
        }
        acc += n.data.length;
      }
    }

    // lista de páginas (nav do EPUB 3 e/ou NCX)
    if (navDoc) {
      if (navPageList) navPageList.parentNode.removeChild(navPageList);
      const ns = navDoc.documentElement.namespaceURI || XHTML_NS;
      const body = navDoc.getElementsByTagNameNS("*", "body")[0];
      const nav = navDoc.createElementNS(ns, "nav");
      nav.setAttributeNS(EPUB_NS, "epub:type", "page-list"); nav.setAttribute("id", "page-list"); nav.setAttribute("hidden", "hidden");
      const h = navDoc.createElementNS(ns, "h2"); h.textContent = "Páginas"; nav.appendChild(h);
      const ol = navDoc.createElementNS(ns, "ol");
      const nd = dirOf(navPath);
      for (const p of pages) {
        const li = navDoc.createElementNS(ns, "li"), a = navDoc.createElementNS(ns, "a");
        a.setAttribute("href", relPath(nd, p.path) + "#" + p.id); a.textContent = p.label;
        li.appendChild(a); ol.appendChild(li);
      }
      nav.appendChild(ol); body.appendChild(nav);
    }
    if (ncxDoc) {
      if (ncxPageList) ncxPageList.parentNode.removeChild(ncxPageList);
      const root = ncxDoc.documentElement, ns = root.namespaceURI || NCX_NS;
      let maxPlay = 0;
      for (const np of ncxDoc.getElementsByTagNameNS("*", "navPoint")) maxPlay = Math.max(maxPlay, +np.getAttribute("playOrder") || 0);
      const pl = ncxDoc.createElementNS(ns, "pageList");
      const lab = ncxDoc.createElementNS(ns, "navLabel"), lt = ncxDoc.createElementNS(ns, "text"); lt.textContent = "Páginas"; lab.appendChild(lt); pl.appendChild(lab);
      const nd = dirOf(ncxPath);
      pages.forEach((p, i) => {
        const pt = ncxDoc.createElementNS(ns, "pageTarget");
        pt.setAttribute("id", "pt-" + (i + 1)); pt.setAttribute("type", "normal"); pt.setAttribute("value", p.label); pt.setAttribute("playOrder", String(maxPlay + i + 1));
        const nl = ncxDoc.createElementNS(ns, "navLabel"), t = ncxDoc.createElementNS(ns, "text"); t.textContent = p.label; nl.appendChild(t);
        const c = ncxDoc.createElementNS(ns, "content"); c.setAttribute("src", relPath(nd, p.path) + "#" + p.id);
        pt.appendChild(nl); pt.appendChild(c); pl.appendChild(pt);
      });
      const navMap = ncxDoc.getElementsByTagNameNS("*", "navMap")[0];
      if (navMap && navMap.nextSibling) root.insertBefore(pl, navMap.nextSibling); else root.appendChild(pl);
      const head = ncxDoc.getElementsByTagNameNS("*", "head")[0];
      if (head) for (const m of head.getElementsByTagNameNS("*", "meta")) {
        if (m.getAttribute("name") === "dtb:totalPageCount") m.setAttribute("content", String(pages.length));
        if (m.getAttribute("name") === "dtb:maxPageNumber") m.setAttribute("content", String(pages.length));
      }
    }
  }

  // 3) remonta o EPUB (mimetype primeiro, sem compressão)
  onProgress("montando EPUB");
  const changed = new Map();
  for (const d of docs) if (d.changed) changed.set(d.path, serializeXml(d.doc, d.hadDecl || !d.html));
  if (paginated && navDoc) changed.set(navPath, serializeXml(navDoc, true));
  if (paginated && ncxDoc) changed.set(ncxPath, serializeXml(ncxDoc, true));
  if (opfChanged) changed.set(opfPath, serializeXml(opf, true));
  const zout = new JSZip();
  zout.file("mimetype", "application/epub+zip", { compression: "STORE" });
  for (const [name, entry] of Object.entries(zin.files)) {
    if (name === "mimetype" || entry.dir) continue;
    zout.file(name, changed.has(name) ? changed.get(name) : await entry.async("uint8array"));
  }
  const blob = await zout.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });

  if (!opt.verify) return { blob, title, author, pages: pageCount, keptPages, verify: null };

  // conferência: abre o EPUB gerado e compara as palavras com as do original
  onProgress("conferindo o texto");
  const zchk = await JSZip.loadAsync(blob), after = [];
  for (const d of docs) {
    const src = await zchk.file(d.path).async("string");
    let doc = new DOMParser().parseFromString(src, "application/xhtml+xml");
    if (hasParseError(doc)) { if (!d.html) throw new Error("Um arquivo do EPUB gerado ficou inválido: " + d.path); doc = new DOMParser().parseFromString(src, "text/html"); }
    after.push(...docWords(doc));
  }
  return { blob, title, author, pages: pageCount, keptPages, verify: compareWords(before, after) };
}
