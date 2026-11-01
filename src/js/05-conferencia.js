/* ---------- conferência palavra por palavra ---------- */
const normW = w => w.normalize("NFKC").normalize("NFC");
// compara palavra por palavra; a pontuação nas pontas não conta (alguns PDFs desenham pontos e vírgulas em outra
// ordem), mas palavras grudadas ("dinheiro.Enfim") ou separadas ("tam bem") continuam aparecendo
const edgeW = w => normW(w).replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
function compareWords(ref, outWords){
  const A = [], alt = [], P = [];
  for (let i = 0; i < ref.length; i++) {
    let w = normW(ref[i].w), a2 = null; const p = ref[i].p;
    // hifenização no fim da linha: aceita "palavra" ou "pala-vra"
    if (ref[i].eol && /\p{L}-$/u.test(w) && i + 1 < ref.length && /^-\p{L}/u.test(ref[i + 1].w)) { w = w + normW(ref[i + 1].w).slice(1); i++; }
    else if (ref[i].eol && /\p{L}-$/u.test(w) && i + 1 < ref.length && /^\p{Ll}/u.test(ref[i + 1].w)) { const nx = normW(ref[i + 1].w); a2 = edgeW(w + nx); w = w.slice(0, -1) + nx; i++; }
    const e = edgeW(w); if (!e) continue;
    A.push(e); alt.push(a2); P.push(p);
  }
  const B = outWords.map(edgeW).filter(Boolean);
  const diffs = []; let i = 0, j = 0, ignored = 0;
  const same = (x, y) => A[x] === B[y] || (alt[x] !== null && alt[x] === B[y]);
  const anchor = (x, y) => same(x, y) && (x + 1 >= A.length || y + 1 >= B.length || same(x + 1, y + 1));
  const push = (x, dx, y, dy) => {
    const a = A.slice(x, x + dx), b = B.slice(y, y + dy);
    if (!b.length && a.every(w => /^([0-9]+|[ivxlcdm]+)$/i.test(w))) { ignored += a.length; return; }
    if (!a.length && b.length <= 2 && b.every(w => /^[0-9]+[½¼¾]?$/.test(w))) { ignored += b.length; return; }
    // sumário do livro impresso: "Capítulo 97" que o PDF guarda grudado ("Capítulo97") e a página mostra separado
    if (a.length && b.length > a.length && a.join("") === b.join("")
        && b.slice(1).every((w, k) => (/\p{L}$/u.test(b[k]) && /^\d/.test(w)) || (/\d$/.test(b[k]) && /^\p{L}/u.test(w)))) { ignored += a.length; return; }   // número do capítulo (o PDF o trata como número de página)
    if (diffs.length < 500) diffs.push({ p: P[Math.min(x, P.length - 1)], pdf: a.slice(0, 25).join(" "), epub: b.slice(0, 25).join(" "), prev: y > 0 ? B[y - 1] : "" });
  };
  while (i < A.length && j < B.length) {
    if (same(i, j)) { i++; j++; continue; }
    let found = false;
    for (let s = 1; s <= 80 && !found; s++) for (let di = 0; di <= s; di++) {
      const dj = s - di;
      if (i + di < A.length && j + dj < B.length && anchor(i + di, j + dj)) { push(i, di, j, dj); i += di; j += dj; found = true; break; }
    }
    if (!found) { push(i, 1, j, 1); i++; j++; }
  }
  if (i < A.length || j < B.length) push(i, A.length - i, j, B.length - j);
  return { total: A.length, diffs, ignored };
}

// palavras de um documento XHTML (sem as marcas de página), separando blocos
const BLOCK_RE = /^(p|div|h[1-6]|li|ul|ol|br|hr|td|th|tr|table|section|article|aside|header|footer|figure|figcaption|blockquote|pre|dt|dd|dl|nav|body|img)$/i;
function docWords(doc){
  const parts = [];
  const walk = n => {
    if (n.nodeType === 3) { parts.push(n.data); return; }
    if (n.nodeType !== 1) return;
    const name = n.localName || "";
    if (/^(script|style|head|title)$/i.test(name)) return;
    const t = n.getAttributeNS(EPUB_NS, "type") || n.getAttribute("epub:type") || "";
    if (/\bpagebreak\b/.test(t) || n.getAttribute("role") === "doc-pagebreak" || /\bpgmark\b/.test(n.getAttribute("class") || "")) return;
    if (/\bfootnote\b/.test(t) || n.getAttribute("role") === "doc-footnote") return;
    if (name === "br") { parts.push(" "); return; }
    const block = BLOCK_RE.test(name);
    if (block) parts.push(" ");
    for (const c of n.childNodes) walk(c);
    if (block) parts.push(" ");
  };
  walk(doc.getElementsByTagNameNS("*", "body")[0] || doc.documentElement);
  return parts.join("").split(/\s+/).filter(Boolean);
}

// lê o EPUB gerado e confere com as palavras do PDF
async function verifyPdfEpub(epubBlob, ref){
  const z = await JSZip.loadAsync(epubBlob);
  const opf = parseXml(await z.file("OEBPS/content.opf").async("string"));
  const man = {};
  for (const it of opf.getElementsByTagNameNS("*", "item")) man[it.getAttribute("id")] = it.getAttribute("href");
  const words = [];
  for (const r of opf.getElementsByTagNameNS("*", "itemref")) {
    const href = man[r.getAttribute("idref")];
    if (!href || !/^text\/ch\d+\.xhtml$/.test(href)) continue;   // capa e sumário não vêm do PDF
    const doc = new DOMParser().parseFromString(await z.file("OEBPS/" + href).async("string"), "application/xhtml+xml");
    if (hasParseError(doc)) throw new Error("O EPUB gerado tem um arquivo inválido: " + href);
    words.push(...docWords(doc));
    await tick();
  }
  return compareWords(ref, words);
}

// confere a estrutura do EPUB pronto (o essencial do EPUBCheck): devolve a lista de problemas
async function checkEpubStructure(blob){
  const probs = [];
  try {
    const z = await JSZip.loadAsync(blob);
    const names = Object.keys(z.files);
    if (names[0] !== "mimetype" || (await z.file("mimetype").async("string")) !== "application/epub+zip") probs.push("o arquivo mimetype não é o primeiro");
    const cont = z.file("META-INF/container.xml");
    if (!cont) return [...probs, "falta META-INF/container.xml"];
    const rf = parseXml(await cont.async("string")).getElementsByTagNameNS("*", "rootfile")[0];
    const opfPath = rf && rf.getAttribute("full-path"), opfF = opfPath && z.file(opfPath);
    if (!opfF) return [...probs, "o container aponta para um OPF que não existe"];
    const opf = parseXml(await opfF.async("string"));
    if (hasParseError(opf)) return [...probs, "o OPF não é XML válido"];
    const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
    const items = new Map(); let nav = null;
    for (const it of opf.getElementsByTagNameNS("*", "item")) {
      const href = dir + decodeURIComponent(it.getAttribute("href") || "");
      items.set(it.getAttribute("id"), { href, type: it.getAttribute("media-type") || "" });
      if (!z.file(href)) probs.push("falta o arquivo " + href);
      if (/\bnav\b/.test(it.getAttribute("properties") || "")) nav = href;
    }
    const v3 = (opf.documentElement.getAttribute("version") || "").startsWith("3");
    if (v3 && !nav) probs.push("falta o sumário (nav)");
    const spine = [...opf.getElementsByTagNameNS("*", "itemref")];
    if (!spine.length) probs.push("a ordem de leitura (spine) está vazia");
    for (const r of spine) if (!items.has(r.getAttribute("idref"))) probs.push("a ordem de leitura cita um item que não existe");
    let n = 0;
    for (const { href, type } of items.values()) {
      if (type !== "application/xhtml+xml" || !z.file(href)) continue;
      if (hasParseError(parseXml(await z.file(href).async("string")))) probs.push(href.split("/").pop() + " não é XHTML válido");
      if (++n % 20 === 0) await tick();
    }
  } catch (e) { probs.push("não deu para abrir o EPUB (" + ((e && e.message) || e) + ")"); }
  return [...new Set(probs)].slice(0, 6);
}
