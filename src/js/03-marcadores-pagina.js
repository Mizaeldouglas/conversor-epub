/* ---------- marcadores de página ---------- */
const PG_A = "\uE000", PG_B = "\uE001";
const PG_RE = /\uE000([^\uE001]*)\uE001/g;
const pgMark = label => PG_A + label + PG_B;
const stripPg = s => s.replace(PG_RE, "").replace(/\uE008/g, " ").replace(/[\uE004-\uE007]/g, "").replace(/\s+/g, " ").trim();
const BR = "\uE008";   // quebra de linha dentro de um título ("1" / "A descoberta que…")
const NUM_HEAD = /^((cap[íi]tulo|parte|livro|volume|chapter|part|book)\s+)?([0-9]+[½¼¾]?|[ivxlcdm]+)\.?$/i;
// itálico e negrito: \uE004/\uE005 liga/desliga itálico, \uE006/\uE007 liga/desliga negrito
const IT_ON = "\uE004", IT_OFF = "\uE005", BD_ON = "\uE006", BD_OFF = "\uE007";
const plainOf = s => s.replace(/\uE008/g, " ").replace(/[\uE004-\uE007]/g, "");
// muda o estilo no fim do texto: fecha antes do espaço final, abre depois dele
function styleSwitch(text, from, to){
  const m = /\s*$/.exec(text), head = text.slice(0, m.index), tail = m[0];
  const close = ((from & 1) && !(to & 1) ? IT_OFF : "") + ((from & 2) && !(to & 2) ? BD_OFF : "");
  const open = (!(from & 1) && (to & 1) ? IT_ON : "") + (!(from & 2) && (to & 2) ? BD_ON : "");
  return head + close + tail + open;
}
// junta duas linhas: o itálico que continua na linha seguinte vira um trecho só
const OPEN_OF = { "\uE005": "\uE004", "\uE007": "\uE006" };
function joinParts(a, b){
  const pm = /^\uE000[^\uE001]*\uE001/.exec(b), mk = pm ? pm[0] : "";
  if (mk) b = b.slice(mk.length);
  const tc = /[\uE005\uE007]*$/.exec(a)[0], lo = /^[\uE004\uE006]*/.exec(b)[0];
  const both = [...tc].filter(c => lo.includes(OPEN_OF[c]));
  if (both.length) {
    a = a.slice(0, a.length - tc.length) + [...tc].filter(c => !both.includes(c)).join("");
    b = [...lo].filter(c => !both.some(x => OPEN_OF[x] === c)).join("") + b.slice(lo.length);
  }
  return [a, mk + b];
}
const hexEnc = s => [...new TextEncoder().encode(s)].map(b => b.toString(16).padStart(2, "0")).join("");
const hexDec = h => { try { return new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)))); } catch { return h; } };
