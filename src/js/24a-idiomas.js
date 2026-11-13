/* ---------- idioma da interface: português (original), inglês e espanhol ----------
   Os textos nascem em português no código. Aqui cada frase que aparece na tela é trocada pela tradução
   (src/data/idiomas.json); números viram {0}, {1}… na chave, então "7 capítulos" e "12 capítulos" usam a mesma linha. */
// traduções: no site vêm de um arquivo à parte, baixado só quando o idioma não é o português
let I18N = null;
{ const el = document.getElementById("i18n-data"); if (el) I18N = JSON.parse(el.textContent || "{}"); }
let i18nP = null;
const ensureI18n = () => I18N ? Promise.resolve() : i18nP ||= fetch("dados/idiomas.json?v=" + VERSION).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => { I18N = j; });
const I18N_MISSING = new Set();
window.__app.i18nMissing = I18N_MISSING;
const I18N_NUM = /\d+(?:[.,]\d+)*/g;
const I18N_SPLIT = /(?<=[\p{L}\d"”’)\]]{2}[.!?…]["”’)]?)\s+(?=[\p{Lu}“"(\d])/u;
const I18N_SKIP = ".lp-shot .bt,.acct-name,.acct-mail,.acct-initial,.name,.byline,.spine,.book .t,.book .d,.pv-page,#pvToc,#pvTitle,details.diffs b,.fixmem b,.lk-list b,.lk-list .muted,script,style,textarea,#uiLang";
// frases com um trecho que varia (nome de arquivo, título, mensagem do navegador): [expressão, inglês, espanhol]
const I18N_FIELDS = { autor: ["author", "autor"], editora: ["publisher", "editorial"], ano: ["year", "año"], ISBN: ["ISBN", "ISBN"], "gênero": ["genre", "género"], sinopse: ["synopsis", "sinopsis"] };
const i18nFields = (s, k) => s.replace(/autor|editora|ano|ISBN|gênero|sinopse/g, w => I18N_FIELDS[w][k]).replace(/ e /, k ? " y " : " and ");
const I18N_PATS = [
  [/^Arquivo salvo: (.+)$/, "File saved: $1", "Archivo guardado: $1"],
  [/^(.+) não é de um formato que o Lombada abre e foi ignorado\.$/, "$1 is not in a format Lombada can open and was skipped.", "$1 no está en un formato que Lombada abra y se ignoró."],
  [/^Dados do livro preenchidos: (.+) \((pela página de créditos do PDF e pela internet|pela página de créditos do PDF|pela internet)\)\.$/, m => "Book details filled in: " + i18nFields(m[1], 0) + " (" + ({ "pela página de créditos do PDF e pela internet": "from the PDF's copyright page and the internet", "pela página de créditos do PDF": "from the PDF's copyright page", "pela internet": "from the internet" })[m[2]] + ").",
    m => "Datos del libro completados: " + i18nFields(m[1], 1) + " (" + ({ "pela página de créditos do PDF e pela internet": "por la página de créditos del PDF y por internet", "pela página de créditos do PDF": "por la página de créditos del PDF", "pela internet": "por internet" })[m[2]] + ")."],
  [/^Entre com o Google para converter (.+)\.$/, "Sign in with Google to convert $1.", "Entra con Google para convertir $1."],
  [/^(.+): EPUB pronto\.$/, "$1: EPUB ready.", "$1: EPUB listo."],
  [/^(.+?): ((?:Este|Não|Faltou|Senha|O ) ?.+)$/, "$1: $2", "$1: $2"],
  [/^Tema (automático|claro|escuro)$/, m => "Theme: " + ({ automático: "automatic", claro: "light", escuro: "dark" })[m[1]], m => "Tema " + ({ automático: "automático", claro: "claro", escuro: "oscuro" })[m[1]]],
  [/^Tema: (automático|claro|escuro)$/, m => "Theme: " + ({ automático: "automatic", claro: "light", escuro: "dark" })[m[1]], m => "Tema: " + ({ automático: "automático", claro: "claro", escuro: "oscuro" })[m[1]]],
  [/^Não consegui entrar com o Google \((.*)\)\.$/, "I couldn't sign in with Google ($1).", "No pude entrar con Google ($1)."],
  [/^O Google recusou o acesso ao Drive \((.*)\)\.$/, "Google refused access to Drive ($1).", "Google rechazó el acceso a Drive ($1)."],
  [/^Não consegui ler este PDF \((.*)\)\.$/, "I couldn't read this PDF ($1).", "No pude leer este PDF ($1)."],
  [/^Não consegui ler este arquivo (\S+): (.*)$/, "I couldn't read this $1 file: $2", "No pude leer este archivo $1: $2"],
  [/^Falha ao montar o EPUB: (.*)\.$/, "Could not build the EPUB: $1.", "No se pudo armar el EPUB: $1."],
  [/^O OCR não funcionou \((.*)\)\.$/, "OCR did not work ($1).", "El OCR no funcionó ($1)."],
  [/^O EPUB saiu com problema de estrutura e pode não abrir no Kindle: (.*)\.$/, "The EPUB has a structure problem and may not open on Kindle: $1.", "El EPUB salió con un problema de estructura y puede no abrir en el Kindle: $1."],
  [/^Achei: “(.*)”(?: \(p\. (.*)\))?$/, m => `Found: “${m[1]}”` + (m[2] ? ` (p. ${m[2]})` : ""), m => `Encontré: “${m[1]}”` + (m[2] ? ` (p. ${m[2]})` : "")],
  [/^Não foi possível salvar o arquivo aqui \((.*)\)\.$/, "The file could not be saved here ($1).", "No se pudo guardar el archivo aquí ($1)."],
  [/^(.+) lido$/, "$1 read", "$1 leído"],
  [/^(PDF|EPUB|DOCX|TXT|HTML|Markdown|FB2|MOBI|CBZ) de (.+)$/, "$1, $2", "$1 de $2"],
  [/^(OCR|preparando o OCR): página (\d+) de (\d+)$/, m => (m[1] === "OCR" ? "OCR" : "preparing OCR") + `: page ${m[2]} of ${m[3]}`, m => (m[1] === "OCR" ? "OCR" : "preparando el OCR") + `: página ${m[2]} de ${m[3]}`],
  [/^(.+), versão$/, "$1, version", "$1, versión"],
];
const i18nNum = s => uiLang !== "en" ? s : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, ",") : /^\d+,\d+$/.test(s) ? s.replace(",", ".") : s;
const i18nKey = t => { let i = 0; return t.replace(I18N_NUM, () => "{" + (i++) + "}"); };
// trecho variável de uma frase: traduz se for conhecido (uma mensagem de erro), senão fica como está (um nome de arquivo)
const i18nPart = t => { if (!/\s/.test(t)) return t; const w = i18nDirect(t); if (w != null) return w; const ps = t.split(I18N_SPLIT); return ps.length > 1 ? ps.map(p => i18nDirect(p) ?? p).join(" ") : t; };
const i18nDirect = core => { const nums = [], key = core.replace(I18N_NUM, m => { nums.push(m); return "{" + (nums.length - 1) + "}"; }); const t = I18N && (I18N[key] || I18N[core]); return t ? t[uiLang === "en" ? 0 : 1].replace(/\{(\d+)\}/g, (_, i) => i18nNum(nums[+i] ?? "")) : null; };
function i18nLookup(core){
  const nums = [], key = core.replace(I18N_NUM, m => { nums.push(m); return "{" + (nums.length - 1) + "}"; });
  const t = I18N && (I18N[key] || I18N[core]);
  if (t) { const out = t[uiLang === "en" ? 0 : 1]; if (out) return out.replace(/\{(\d+)\}/g, (_, i) => i18nNum(nums[+i] ?? "")); }
  for (const [re, en, es] of I18N_PATS) {
    const m = re.exec(core); if (!m) continue;
    const tpl = uiLang === "en" ? en : es;
    return typeof tpl === "function" ? tpl(m) : tpl.replace(/\$(\d)/g, (_, i) => i18nPart(m[+i] ?? ""));
  }
  return null;
}
function i18nText(s){
  const core = s.trim();
  if (!core || !/\p{L}{2}/u.test(core)) return s;
  const lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
  const whole = i18nLookup(core);
  if (whole != null) return lead + whole + trail;
  const parts = core.split(I18N_SPLIT);
  if (parts.length < 2) { I18N_MISSING.add(i18nKey(core)); return s; }
  return lead + parts.map(p => { const t = i18nLookup(p); if (t == null) I18N_MISSING.add(i18nKey(p)); return t ?? p; }).join(" ") + trail;
}
const i18nSrc = new WeakMap(), i18nSet = new WeakMap();   // texto original e o último texto que esta camada escreveu
const I18N_ATTRS = ["placeholder", "title", "aria-label", "alt"];
function i18nNode(n){
  if (n.nodeType === 3) {
    const p = n.parentElement;
    if (!p || p.closest(I18N_SKIP)) return;
    if (i18nSet.get(n) !== n.data) i18nSrc.set(n, n.data);          // texto novo vindo do app
    const out = uiLang === "pt" ? i18nSrc.get(n) : i18nText(i18nSrc.get(n));
    i18nSet.set(n, out); if (n.data !== out) n.data = out;
    return;
  }
  if (n.nodeType !== 1 || n.closest(I18N_SKIP)) return;
  let src = i18nSrc.get(n), set = i18nSet.get(n);
  if (!src) { src = {}; set = {}; i18nSrc.set(n, src); i18nSet.set(n, set); }
  for (const a of I18N_ATTRS) {
    if (!n.hasAttribute(a)) continue;
    const v = n.getAttribute(a);
    if (set[a] !== v) src[a] = v;
    const out = uiLang === "pt" ? src[a] : i18nText(src[a]);
    set[a] = out; if (v !== out) n.setAttribute(a, out);
  }
}
function i18nTree(root){
  i18nNode(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) i18nNode(n);
}
const I18N_TITLE = { pt: "Lombada: PDF para EPUB", en: "Lombada: PDF to EPUB", es: "Lombada: PDF a EPUB" };
async function setUiLang(l, save){
  uiLang = /^(pt|en|es)$/.test(l) ? l : "pt";
  if (save) try { localStorage.setItem(UI_LANG_KEY, uiLang); } catch {}   // guarda antes de baixar as traduções
  if (uiLang !== "pt" && !I18N) {
    document.documentElement.classList.add("i18n-wait");   // evita mostrar o português por um instante
    await ensureI18n();
    document.documentElement.classList.remove("i18n-wait");
  }
  document.documentElement.lang = uiLang === "pt" ? "pt-BR" : uiLang;
  document.title = I18N_TITLE[uiLang];
  $("#uiLang").value = uiLang;
  i18nTree(document.body);
  renderHistory();
}
new MutationObserver(list => {
  for (const m of list) {
    if (m.type === "characterData" || m.type === "attributes") i18nNode(m.target);
    else for (const n of m.addedNodes) { if (n.nodeType === 1) i18nTree(n); else i18nNode(n); }
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
$("#uiLang").onchange = e => setUiLang(e.target.value, true);
setUiLang(uiLang, false);
