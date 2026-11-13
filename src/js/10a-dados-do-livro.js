/* ---------- dados do livro: do próprio PDF (créditos e ficha catalográfica) e, se faltar, da internet ---------- */
// ISBN com o dígito verificador certo (10 ou 13 dígitos)
function isbnValid(d){
  if (/^\d{13}$/.test(d)) { let s = 0; for (let i = 0; i < 12; i++) s += +d[i] * (i % 2 ? 3 : 1); return (10 - s % 10) % 10 === +d[12]; }
  if (/^\d{9}[\dX]$/.test(d)) { let s = 0; for (let i = 0; i < 10; i++) s += (d[i] === "X" ? 10 : +d[i]) * (10 - i); return s % 11 === 0; }
  return false;
}
// rótulos da página de créditos: um campo acaba onde começa o próximo
const CRED_STOP = "(?=\\s*(?:Copyright|©|\\(c\\)|T[íi]tulo original|Tradu[çc][ãa]o|Traduzido|Prepara[çc][ãa]o|Revis[ãa]o|Capa\\b|Projeto gr[áa]fico|Diagrama[çc][ãa]o|Imagens?\\b|Foto|Edi[çc][ãa]o\\b|Editora[çc][ãa]o|ISBN|Todos os direitos|Direitos|Publicado|Impresso|Dados Internacionais|CIP|Coordena[çc][ãa]o|Edi[çc][õo]es anteriores|\\d{1,2}[ªa] edi[çc][ãa]o|$))";
const NOT_PERSON = /^(user|usuario|usuário|admin(istrator)?|owner|unknown|desconhecido|autor|author|microsoft|adobe|calibre|word|pdf|scanner|hp|canon|epson|[\d\s_.-]+)$/i;

// lê as primeiras e as últimas páginas de texto e devolve o que achar
function bookFacts(blocks, numPages, metaAuthor){
  const pages = new Map();
  for (const b of blocks) {
    if (!b.page || !b.text || b.type === "img") continue;
    if (b.page > 16 && b.page < numPages - 5) continue;
    pages.set(b.page, (pages.get(b.page) || "") + "\n" + plainOf(stripNotes(stripPg(b.text))));
  }
  const all = [...pages.values()].join("\n"), f = {};
  // ISBN: o primeiro com rótulo e dígito verificador certo; sem rótulo, só um 978/979 válido
  for (const m of all.matchAll(/ISBN(?:[\s-]*1[03])?(?:\s*\([^)]{0,20}\))?[\s:.-]*((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx])/g)) {
    const d = m[1].replace(/[\s-]/g, "").toUpperCase(); if (isbnValid(d)) { f.isbn = d; break; }
  }
  if (!f.isbn) for (const m of all.matchAll(/\b97[89](?:[\s-]?\d){10}\b/g)) { const d = m[0].replace(/[\s-]/g, ""); if (isbnValid(d)) { f.isbn = d; break; } }
  // ficha catalográfica: "Título / Autor ; tradução … – 1. ed. – Cidade : Editora, 2024." e "1. Ficção inglesa. 2. Suspense."
  const cipAt = all.search(/Dados Internacionais de Cataloga[çc][ãa]o|Cataloga[çc][ãa]o na (?:Publica[çc][ãa]o|fonte)|\bCIP\b|\bCDD\b|\bCDU\b/i);
  const cip = cipAt >= 0 ? all.slice(Math.max(0, cipAt - 200), cipAt + 1500) : "";
  if (cip) {
    const pub = /(?:[–—-]\s*|\.\s+)(?:[A-ZÀ-Ú][\p{L}.]+(?:\s+(?:de|do|da|dos|das)?\s*[A-ZÀ-Ú][\p{L}.]+){0,3})\s*,?\s*(?:[A-Z]{2}\s*)?:\s*([^,:;\n]{2,60}?),\s*(?:c?\s*)?((?:19|20)\d{2})\b/u.exec(cip);
    if (pub) { f.publisher = pub[1].trim(); f.year = pub[2]; }
    const au = /\/\s*([A-ZÀ-Ú][^;\n/–—]{2,80}?)\s*(?:;|\.\s*[–—-]|\s[–—-]\s|\n)/u.exec(cip);
    if (au && !/tradu|organiza|ilustra/i.test(au[1])) f.author = au[1].replace(/\s*\.$/, "").trim();
    const subs = [...cip.matchAll(/(?:^|\s)(\d)\.\s*([A-ZÀ-Ú][\p{L}\s-]{2,40}?)\.(?=\s|$)/gu)].filter(m => +m[1] <= 4 && !/livros? (eletr|digit)|e-?books?|recurso/i.test(m[2])).map(m => m[2].trim());
    if (subs.length) f.subject = [...new Set(subs)].slice(0, 3).join(", ");
  }
  // página de créditos
  const orig = new RegExp("T[íi]tulo original\\s*[:.]?\\s*([^\\n]{2,120}?)" + CRED_STOP, "iu").exec(all);
  if (orig) f.originalTitle = orig[1].replace(/[.,;]\s*$/, "").trim();
  if (!f.publisher) {
    const dr = /(?:direitos[^.]{0,80}?reservados|publicado)\s+(?:à|a|ao|pela|pelo|para a|para o|por)\s+([^.\n]{3,70}?)(?:\s*[.,]|\s+(?:Rua|Av\.?|Avenida|CNPJ|Tel|www|http))/iu.exec(all);
    if (dr) f.publisher = dr[1].replace(/\b(Ltda|LTDA|S\.?\/?A\.?|EIRELI|ME)\b\.?/g, "").replace(/[\s,–—-]+$/, "").trim();
  }
  if (!f.year) {
    const ed = /(?:1[ªa.]?\s*edi[çc][ãa]o|primeira edi[çc][ãa]o|edi[çc][ãa]o)\s*[:,]?\s*(?:\p{L}+\s+(?:de\s+)?)?((?:19|20)\d{2})/iu.exec(all);
    const cy = [...all.matchAll(/(?:©|Copyright|\(c\))\s*(?:©\s*)?(?:[^\d\n]{0,40}?)((?:19|20)\d{2})/gi)].map(m => +m[1]);
    if (ed) f.year = ed[1]; else if (cy.length) f.year = String(Math.max(...cy));
  }
  if (!f.author) {
    const ma = String(metaAuthor || "").trim();
    if (ma.length > 3 && ma.length < 80 && !NOT_PERSON.test(ma) && /\p{L}{2,}\s+\p{L}{2,}/u.test(ma)) f.author = ma;
  }
  if (!f.author) {
    const cr = /(?:©|Copyright)\s*(?:©\s*)?(?:(?:19|20)\d{2}[,\s]+)?(?:by\s+|por\s+)?([A-ZÀ-Ú][\p{L}'.-]+(?:\s+(?:de|da|do|dos|das|van|von)?\s*[A-ZÀ-Ú][\p{L}'.-]+){1,3})/u.exec(all);
    if (cr && !/editora|edições|publish|press|books|livros|ltda|companhia|grupo/i.test(cr[1])) f.author = cr[1].trim();
  }
  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

// mesma obra? compara títulos sem acento, pontuação e caixa
const foldT = s => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\d]+/gu, " ").trim();
const sameTitle = (a, b) => { const x = foldT(a), y = foldT(b); return !!x && !!y && (x === y || (x.length > 6 && y.startsWith(x)) || (y.length > 6 && x.startsWith(y))); };
const sameAuthor = (a, b) => { if (!a || !b) return true; const x = foldT(a).split(" "), y = foldT(b).split(" "); return x.some(w => w.length > 2 && y.includes(w)); };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo")), ms))]);

// Google Books pelo ISBN (exato) ou pelo título e autor; Open Library se o Google não achar
async function bookOnline(f, title, author){
  const gb = async q => {
    const r = await fetch("https://www.googleapis.com/books/v1/volumes?maxResults=5&printType=books&q=" + encodeURIComponent(q));
    if (!r.ok) throw new Error("HTTP " + r.status);
    return ((await r.json()).items || []).map(it => {
      const v = it.volumeInfo || {}, ids = v.industryIdentifiers || [], i13 = ids.find(i => i.type === "ISBN_13") || ids.find(i => i.type === "ISBN_10");
      return { title: v.title || "", author: (v.authors || []).join(", "), publisher: v.publisher || "", year: (v.publishedDate || "").slice(0, 4),
        isbn: i13 ? i13.identifier : "", subject: (v.categories || []).join(", "), description: cleanDesc(v.description), lang: v.language || "" };
    });
  };
  if (f.isbn) { const hit = (await gb("isbn:" + f.isbn).catch(() => []))[0]; if (hit) return hit; }
  if (!title || title.length < 3) return null;
  const list = await gb(`intitle:${title}` + (author ? ` inauthor:${author}` : "")).catch(() => []);
  const hit = list.find(r => sameTitle(r.title, title) && sameAuthor(r.author, author));
  if (hit) return hit;
  try {
    const r = await fetch("https://openlibrary.org/search.json?limit=5&fields=key,title,author_name,first_publish_year,publisher,isbn,subject&title=" + encodeURIComponent(title) + (author ? "&author=" + encodeURIComponent(author) : ""));
    if (!r.ok) return null;
    const d = ((await r.json()).docs || []).find(d => sameTitle(d.title, title) && sameAuthor((d.author_name || []).join(" "), author));
    if (!d) return null;
    const o = { title: d.title, author: (d.author_name || []).join(", "), year: d.first_publish_year ? String(d.first_publish_year) : "", publisher: "", isbn: "", subject: (d.subject || []).slice(0, 3).join(", "), description: "" };
    if (d.key) try { const w = await fetch("https://openlibrary.org" + d.key + ".json"); if (w.ok) { const j = await w.json(); o.description = cleanDesc(j.description && j.description.value || j.description); } } catch {}
    return o;
  } catch { return null; }
}

// preenche só o que está vazio; guarda de onde veio cada dado para mostrar na fila
async function autoMeta(job, res, online){
  const meta = job.meta ||= {}, got = [], from = new Set();
  const f = bookFacts(res.blocks, res.numPages, res.metaAuthor);
  const put = (k, v, src) => {
    if (!v) return;
    if (k === "author") { if (job.author) return; job.author = v; }
    else if (k === "isbn") { if (meta.isbn) return; meta.isbn = v; }
    else { if (meta[k]) return; meta[k] = v; }
    got.push(k); from.add(src);
  };
  for (const k of ["author", "publisher", "year", "isbn", "subject"]) put(k, f[k], "pdf");
  if (online) {
    try {
      const o = await withTimeout(bookOnline(f, job.title, job.author), 6000);
      if (o) for (const k of ["author", "publisher", "year", "isbn", "subject", "description"]) put(k, k === "isbn" ? (isbnValid(String(o.isbn).replace(/[\s-]/g, "")) ? o.isbn.replace(/[\s-]/g, "") : "") : o[k], "web");
    } catch (e) { console.warn("dados do livro", e); }
  }
  job.metaAuto = got.length ? { fields: got, from: [...from] } : null;
  if (f.originalTitle) job.originalTitle = f.originalTitle;
}
