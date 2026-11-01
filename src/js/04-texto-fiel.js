/* ---------- texto fiel ao PDF ---------- */
// O pdf.js cria um espaço sempre que duas letras ficam um pouco mais afastadas (texto justificado,
// ajuste fino entre letras). Era isso que gerava "tam bem". Aqui o espaço só entra onde o PDF
// tem um caractere de espaço de verdade.
const PAGE_NUM_RE = /^(p(á|a)g(ina)?\.?\s*)?\d{1,4}(\s*(de|\/)\s*\d{1,4})?$/i;
const CHAP_NUM = "(\\d+|[ivxlc]+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|qua?torze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|one|two|three|four|five|six|seven|eight|nine|ten|uno|dos|tres)";
const CHAP_RE = new RegExp("^(?:(?:cap[íi]tulo|parte|livro|chapter|part|book|cap\\.)\\s+" + CHAP_NUM + "(?![\\p{L}\\d])|(?:pr[óo]logo|ep[íi]logo|interl[úu]dio|introdu[çc][ãa]o|pref[áa]cio|posf[áa]cio|prologue|epilogue|interlude|introduction|preface|afterword)(?=\\s*$|\\s*[:.—–-]))", "iu");
const isMark = ch => /\p{M}/u.test(ch);
const keyOf = ch => ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Ligaduras ("fi", "fl"…) que o PDF marca com um código sem texto (caractere de controle, uso privado).
// Cada código vira um marcador provisório e, no fim, é decidido uma vez para o livro inteiro:
//  1) pelas palavras: com "fi", "con?rmar/?lhos/?m" viram "confirmar/filhos/fim" (palavras reais);
//  2) pelo desenho da letra na fonte do livro, para sinais como as reticências.
// Sem evidência clara, fica o caractere de substituição (U+FFFD) e a conferência mostra.
const LIGA_CANDS = [["fi"], ["fl"], ["ff"], ["ffi"], ["ffl"], ["ft"], ["fj"], ["fb"], ["fh"], ["fk"], ["Th"], ["st"], ["ct"], ["…", "..."]];
const isBadUni = u => /[\u0000-\u001f\ufffd\ue000-\uf8ff]/.test(u);
const normLig = s => s.replace(/[ﬀ-ﬆ]/g, c => c.normalize("NFKC"));
const PH_RE = /[\u{F0000}-\u{FFFFD}]/gu;
function newLigatureState(){ return { fonts: new Map(), phs: new Map(), list: [], used: {}, unresolved: 0, debug: null }; }
function ligFont(state, name){
  if (!state.fonts.has(name)) state.fonts.set(name, { byChar: new Map(), bad: new Map() });
  return state.fonts.get(name);
}
function placeholderFor(state, font, g){
  const key = font + "|" + g.originalCharCode;
  let e = state.phs.get(key);
  if (!e) {
    e = { ph: String.fromCodePoint(0xF0000 + state.list.length), font, occ: g.originalCharCode, fc: g.fontChar || "", w: g.width || 0, uni: g.unicode, shape: null, final: null };
    state.phs.set(key, e); state.list.push(e);
    ligFont(state, font).bad.set(g.unicode, e.ph);
  }
  return e;
}
let ligCanvas = null;
function inkOf(family, text, S){
  if (!ligCanvas) ligCanvas = document.createElement("canvas");
  ligCanvas.width = S * 6; ligCanvas.height = S * 2;
  const x = ligCanvas.getContext("2d", { willReadFrequently: true });
  x.clearRect(0, 0, ligCanvas.width, ligCanvas.height);
  x.font = `${S}px "${family}"`; x.fillStyle = "#000"; x.textBaseline = "alphabetic";
  x.fillText(text, S * 0.5, S * 1.4);
  const d = x.getImageData(0, 0, ligCanvas.width, ligCanvas.height).data;
  const bits = new Uint8Array(d.length / 4); let n = 0;
  for (let i = 3, k = 0; i < d.length; i += 4, k++) if (d[i] > 110) { bits[k] = 1; n++; }
  return { bits, n };
}
// mapa de distância até o traço mais próximo (chanfro 3-4)
function distMap(bits, W, H){
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = bits[i] ? 0 : 1e6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i]; if (!v) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) { v = Math.min(v, d[i - W] + 3); if (x > 0) v = Math.min(v, d[i - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i]; if (!v) continue;
    if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < H - 1) { v = Math.min(v, d[i + W] + 3); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4); if (x > 0) v = Math.min(v, d[i + W - 1] + 4); }
    d[i] = v;
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}
function shapeDistance(a, da, b, db, W, maxd){
  let best = Infinity;
  for (let dx = -maxd; dx <= maxd; dx++) {
    let sa = 0, na = 0, sb = 0, nb = 0;
    for (let i = 0; i < a.bits.length; i++) {
      const x = i % W;
      if (a.bits[i]) { na++; sa += x - dx >= 0 && x - dx < W ? db[i - dx] : 40; }
      if (b.bits[i]) { nb++; sb += x + dx >= 0 && x + dx < W ? da[i + dx] : 40; }
    }
    const v = Math.max(sa / (na || 1), sb / (nb || 1));
    if (v < best) best = v;
  }
  return best;
}
async function ligaturePass(ol, page, state){
  const OPSx = pdfjsLib.OPS; let font = null; const todo = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPSx.setFont) { font = a && a[0]; continue; }
    if (!font || !a || !Array.isArray(a[0])) continue;
    const f = ligFont(state, font);
    for (const g of a[0]) {
      if (!g || typeof g !== "object" || !("unicode" in g)) continue;
      const u = g.unicode || "";
      if (u && !isBadUni(u) && [...u].length === 1 && !f.byChar.has(u) && g.fontChar) f.byChar.set(u, { fc: g.fontChar, w: g.width || 0 });
      if (u && isBadUni(u)) { const e = placeholderFor(state, font, g); if (!e.shape && !todo.includes(e)) todo.push(e); }
    }
  }
  for (const e of todo) {
    const f = ligFont(state, e.font);
    let fo = null; try { fo = page.commonObjs.get(e.font); } catch {}
    const family = fo && fo.loadedName;
    if (!family || fo.isType3Font || fo.missingFile || !e.fc) continue;
    try { await document.fonts.load(`48px "${family}"`, e.fc); } catch {}
    const S = 48, W = S * 6, H = S * 2, target = inkOf(family, e.fc, S);
    if (target.n < 15) continue;
    const dT = distMap(target.bits, W, H), scores = [];
    for (const [out, spelled] of LIGA_CANDS) {
      const parts = [...(spelled || out)];
      if (!parts.every(ch => f.byChar.has(ch))) continue;
      const img = inkOf(family, parts.map(ch => f.byChar.get(ch).fc).join(""), S);
      if (img.n < 15) continue;
      const wsum = parts.reduce((s, ch) => s + f.byChar.get(ch).w, 0);
      const wr = e.w && wsum ? Math.min(e.w, wsum) / Math.max(e.w, wsum) : 0.8;
      scores.push({ dist: shapeDistance(target, dT, img, distMap(img.bits, W, H), W, Math.round(S * 0.3)) / S * (2 - wr), out });
    }
    if (!scores.length) continue;
    scores.sort((a, b) => a.dist - b.dist);
    const [best, second] = scores;
    e.shape = { out: best.out, decisive: best.dist <= 0.06 && (!second || best.dist <= second.dist * 0.6) };
    if (state.debug) state.debug.push(["forma", e.ph.codePointAt(0) - 0xF0000, scores.slice(0, 3).map(x => x.out + ":" + x.dist.toFixed(4)).join(" ")]);
  }
}

let WORDS = null;
async function loadWordList(){
  if (WORDS) return WORDS;
  const el = document.getElementById("pt-words");
  if (!el) return null;
  const bin = atob(el.textContent.trim()), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const txt = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  WORDS = new Set(txt.split("\n"));
  return WORDS;
}
// decide cada código uma vez, olhando todas as palavras do livro em que ele aparece
async function resolveLigatures(state, texts, lang){
  if (!state.list.length) return;
  const byPh = new Map(state.list.map(e => [e.ph, new Map()]));
  for (const t of texts) for (const m of t.matchAll(/[\p{L}\p{M}\u{F0000}-\u{FFFFD}]+/gu)) {
    const w = m[0], phs = new Set(w.match(PH_RE) || []);
    if (phs.size === 1) { const [ph] = phs; const mp = byPh.get(ph); if (mp) mp.set(w, (mp.get(w) || 0) + 1); }
  }
  let lex = null;
  if (/^pt/i.test(lang || "")) { try { lex = await loadWordList(); } catch (e) { console.warn(e); } }
  for (const e of state.list) {
    const words = byPh.get(e.ph);
    let dec = null;
    if (lex && words && words.size) {
      const sc = [];
      const f = state.fonts.get(e.font);
      for (const [out] of LIGA_CANDS) {
        if (!/^\p{L}+$/u.test(out)) continue;
        // a largura do desenho tem que combinar com as letras (ex.: "ffi" é bem mais largo que "fi")
        const parts = [...out];
        if (e.w && f && parts.every(ch => f.byChar.has(ch))) {
          const wsum = parts.reduce((s, ch) => s + f.byChar.get(ch).w, 0);
          if (wsum && Math.min(e.w, wsum) / Math.max(e.w, wsum) < 0.8) continue;
        }
        let good = 0, tot = 0;
        for (const [w, c] of words) {
          const cand = w.split(e.ph).join(out).toLowerCase();
          if (!/^\p{L}+$/u.test(cand)) continue;
          tot += c; if (lex.has(cand)) good += c;
        }
        sc.push([tot ? good / tot : 0, out, tot, good]);
      }
      // vence a opção que forma palavras reais e ganha com folga das outras
      // (o livro pode ter muitas palavras fora da lista, como "influenciadoras"; o que conta é a comparação)
      sc.sort((a, b) => b[3] - a[3] || b[0] - a[0]);
      const [b1, b2] = sc;
      if (state.debug) state.debug.push(["palavras", e.ph.codePointAt(0) - 0xF0000, sc.slice(0, 3).map(x => x[1] + ":" + x[3] + "/" + x[2]).join(" ")]);
      if (b1 && b1[3] >= 1 && b1[0] >= 0.15 && (!b2 || b1[3] >= 4 * b2[3])) dec = b1[1];
    }
    if (!dec && e.shape && e.shape.decisive) dec = e.shape.out;
    e.final = dec;
  }
}
function applyLigatures(state, s, unresolvedAs){
  if (!state.list.length || !s) return s;
  return s.replace(PH_RE, ph => {
    const e = state.list[ph.codePointAt(0) - 0xF0000];
    if (e && e.final) { state.used[e.final] = (state.used[e.final] || 0) + 1; return e.final; }
    if (unresolvedAs === "") state.unresolved++;
    return unresolvedAs;
  });
}

// sequência de letras do PDF na ordem em que foram desenhadas, marcando onde havia espaço real
function glyphStream(ol, liga){
  const OPSx = pdfjsLib.OPS;
  const chars = [], keys = [], spaceBefore = []; let pend = false, spaces = 0, font = null;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPSx.setFont) { font = a && a[0]; continue; }
    if (!a || !Array.isArray(a[0])) continue;
    const arr = a[0];
    if (!arr.some(g => g && typeof g === "object" && "unicode" in g)) continue;
    for (const g of arr) {
      // recuo grande dentro do texto (TJ), do tamanho de um espaço: alguns PDFs separam palavras assim
      if (typeof g === "number") { if (g <= -200 && !pend) { pend = true; spaces++; } continue; }
      if (!g || typeof g !== "object") continue;
      const u = g.unicode || "";
      // só o caractere decide (o pdf.js às vezes marca letras acentuadas como espaço pelo código interno da fonte)
      if (!u) continue;
      if (!u.trim()) { pend = true; spaces++; continue; }
      let shown = isBadUni(u) && font && liga ? placeholderFor(liga, font, g).ph : null;
      for (const ch of u) {
        if (isMark(ch)) { if (chars.length) chars[chars.length - 1] += ch; continue; }
        chars.push(shown != null ? shown : normLig(ch)); keys.push(keyOf(normLig(ch))); spaceBefore.push(pend ? 1 : 0); pend = false;
        if (shown != null) shown = "";   // o marcador vale uma vez por letra desenhada
      }
    }
  }
  // "real": o PDF guarda os espaços como caracteres (quase todos os livros)
  return { chars, keys, spaceBefore, y: new Array(keys.length), h: new Array(keys.length), real: keys.length > 20 && spaces / keys.length > 0.04 };
}

// há espaço real no PDF entre as letras a e b (na ordem do desenho)?
function streamSpace(gs, a, b){
  for (let k = a + 1; k <= b; k++) if (gs.spaceBefore[k]) return true;
  return false;
}

// refaz os espaços de cada trecho de texto do pdf.js seguindo o PDF
// hint: marca as letras que o pdf.js separou por posição (sem caractere de espaço no PDF)
function respaceItems(items, gs, hint){
  let p = 0, prevItem = null, pendHint = false;
  for (const it of items) {
    it.firstIdx = -1; it.lastIdx = -1;
    if (it.str0 === undefined) it.str0 = it.str || "";
    const str = it.str0;
    if (!str || !str.trim()) { if (str) pendHint = true; continue; }
    // trecho novo na mesma linha, afastado do anterior: também conta como separação
    if (prevItem) {
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      const end = prevItem.transform[4] + (prevItem.width || 0);
      if (Math.abs(it.transform[5] - prevItem.transform[5]) < size * 0.5 && it.transform[4] - end > size * 0.15) pendHint = true;
      if (/\s$/.test(prevItem.str0)) pendHint = true;
    }
    let out = "", prevIdx = -1, hadSpace = pendHint && !!prevItem;
    pendHint = false;
    for (const ch of str) {
      if (!ch.trim()) { hadSpace = true; continue; }
      if (isMark(ch)) { out += ch; continue; }
      const k = keyOf(normLig(ch));
      let q = -1;
      for (let j = p, end = Math.min(gs.keys.length, p + 60); j < end; j++) if (gs.keys[j] === k) { q = j; break; }
      if (q >= 0) p = q + 1;
      if (q >= 0 && hadSpace && hint) hint[q] = 1;
      if (out) {
        const sp = q >= 0 && prevIdx >= 0 && q > prevIdx ? streamSpace(gs, prevIdx, q) : hadSpace;
        if (sp) out += " ";
      }
      out += q >= 0 ? gs.chars[q] : ch; hadSpace = false;
      if (q >= 0) {
        if (it.firstIdx < 0) it.firstIdx = q; it.lastIdx = q;
        gs.y[q] = it.transform[5]; gs.h[q] = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      }
      prevIdx = q;
    }
    it.str = out; prevItem = it;
  }
}

// palavras grudadas ("Miratinhaherdadodopai"): alguns PDFs separam parte das palavras só pela posição, sem
// caractere de espaço. Onde o pdf.js viu uma separação, ela entra se todos os pedaços forem palavras conhecidas
// (ou nomes próprios), ou se o "palavrão" for longo demais para ser uma palavra só.
function splitGlued(gs, hint, words){
  let changed = 0;
  const known = w => { const e = w.toLowerCase().replace(/^[\p{P}\p{S}\d]+|[\p{P}\p{S}\d]+$/gu, ""); return !e || (words && words.has(e)); };
  const name = w => /^[\p{P}]*\p{Lu}\p{Ll}+[\p{P}]*$/u.test(w);
  const flush = (a, b) => {
    if (b - a < 4) return;
    const cuts = []; for (let k = a + 1; k < b; k++) if (hint[k]) cuts.push(k);
    if (!cuts.length) return;
    const word = gs.chars.slice(a, b).join("");
    if (words && known(word)) return;
    const pieces = []; let s = a;
    for (const c of [...cuts, b]) { pieces.push(gs.chars.slice(s, c).join("")); s = c; }
    const letters = word.replace(/[^\p{L}]/gu, "").length;
    const nKnown = pieces.filter(known).length;
    const ok = (words && nKnown >= 2 && pieces.every(w => known(w) || name(w))) || letters >= 22;
    if (!ok) return;
    for (const c of cuts) gs.spaceBefore[c] = 1;
    changed += cuts.length;
  };
  let a = 0;
  for (let j = 1; j <= gs.chars.length; j++) {
    const brk = j === gs.chars.length || gs.spaceBefore[j] || gs.y[j] == null || gs.y[j - 1] == null
      || Math.abs(gs.y[j] - gs.y[j - 1]) > lineTol(gs.h[j] || 1, gs.h[j - 1] || 1);
    if (brk) { flush(a, j); a = j; }
  }
  return changed;
}

// mesma linha? letras de tamanhos muito diferentes (número gigante do capítulo) precisam estar quase na mesma base
const lineTol = (a, b) => { const big = Math.max(a, b), small = Math.min(a, b); return big / small > 1.8 ? small * 0.25 : big * 0.5; };
// palavras da página tiradas direto do PDF (referência para a conferência)
function pageRefWords(items, gs, p){
  const lines = [];
  if (gs.real) {
    const eolAfter = new Set(); let last = -1;
    for (const it of items) { if (it.lastIdx >= 0) last = it.lastIdx; if (it.hasEOL && last >= 0) eolAfter.add(last); }
    let line = [], w = "", hidden = 0;
    for (let j = 0; j < gs.chars.length; j++) {
      // letra que o pdf.js não mostra na página (fora da área visível): não entra no EPUB nem na conferência
      if (gs.y[j] == null) { hidden++; continue; }
      // mudou de linha na página: também separa palavras
      if (j > 0 && w && gs.y[j] != null && gs.y[j - 1] != null && Math.abs(gs.y[j] - gs.y[j - 1]) > lineTol(gs.h[j], gs.h[j - 1])) {
        line.push(w); w = ""; lines.push(line); line = [];
      }
      if (gs.spaceBefore[j] && w) { line.push(w); w = ""; }
      w += gs.chars[j];
      if (eolAfter.has(j)) { line.push(w); w = ""; lines.push(line); line = []; }
    }
    if (w) line.push(w);
    if (line.length) lines.push(line);
    lines.hidden = hidden;
  } else {
    let s = "";
    for (const it of items) { s += it.str || ""; if (it.hasEOL) { lines.push(s.split(/\s+/).filter(Boolean)); s = ""; } }
    if (s.trim()) lines.push(s.split(/\s+/).filter(Boolean));
  }
  const out = [];
  for (const ln of lines) {
    if (!ln.length || PAGE_NUM_RE.test(ln.join(" "))) continue;   // número de página solto também sai do EPUB
    ln.forEach((w, i) => out.push({ w, p, eol: i === ln.length - 1 }));
  }
  out.hidden = lines.hidden || 0;
  return out;
}
