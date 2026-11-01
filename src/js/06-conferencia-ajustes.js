/* ---------- ajustes na referência da conferência ---------- */
const NOTE_RE = /\uE002([^\uE003]*)\uE003/g;
const stripNotes = s => s.replace(/\uE002(?:\d+\|)?([^\uE003]*)\uE003/g, "$1");
// troca (ou tira) uma sequência de palavras da referência numa página (p) ou nas vizinhas
function refReplace(ref, p, oldText, newText){
  const words = plainOf(stripNotes(oldText)).replace(PG_RE, " ").split(/\s+/).map(edgeW).filter(Boolean);
  if (!words.length) return false;
  for (const pp of [p, p - 1, p + 1]) {
    for (let i = 0; i < ref.length; i++) {
      if (ref[i].p !== pp) continue;
      const idx = []; let k = 0, j = i;
      while (j < ref.length && k < words.length && Math.abs(ref[j].p - pp) <= 1) {
        const e = edgeW(ref[j].w); if (!e) { j++; continue; }
        if (e !== words[k]) break;
        idx.push(j); k++; j++;
      }
      if (k === words.length) {
        const add = String(newText || "").split(/\s+/).filter(Boolean).map(w => ({ w, p: pp, eol: false }));
        ref.splice(idx[0], idx[idx.length - 1] - idx[0] + 1, ...add);
        return true;
      }
    }
  }
  return false;
}
const joinLine = (a, b) => /\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b) ? a.slice(0, -1) + b : a + " " + b;
