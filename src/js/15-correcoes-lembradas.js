/* ---------- correções lembradas (valem para os próximos livros) ---------- */
const FIX_KEY = "conversor-epub:correcoes";
function loadFixes(){ try { const a = JSON.parse(localStorage.getItem(FIX_KEY) || "[]"); return Array.isArray(a) ? a.filter(x => x && x.from) : []; } catch { return []; } }
function saveFixes(list){ try { localStorage.setItem(FIX_KEY, JSON.stringify(list.slice(-500))); } catch {} renderFixes(); }
function rememberFix(from, to){
  from = from.trim(); to = to.trim();
  if (from.length < 3 || from === to || from.split(" ").length > 6) return;
  const list = loadFixes().filter(x => x.from !== from);
  list.push({ from, to }); saveFixes(list);
}
function applyRememberedFixes(job){
  const list = loadFixes(); let total = 0;
  for (const f of list) {
    const re = wordRe(f.from, true, true); let used = 0;
    for (const b of textBlocks(job)) { const [t, n] = replaceInText(b.text, re, f.to); if (n) { b.text = t; used += n; } }
    if (used) { total += used; (job.userTexts ||= []).push(f.to.split(/\s+/).map(edgeW).filter(Boolean).join(" ")); }
  }
  return total;
}
function renderFixes(){
  const box = $("#fixMem"), sec = $("#fixMemBox"); if (!box) return;
  const list = loadFixes();
  sec.hidden = !list.length;
  $("#fixMemN").textContent = list.length;
  box.innerHTML = "";
  list.slice().reverse().forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `<span><b></b> → <b></b></span> <button class="linkbtn">Esquecer</button>`;
    li.querySelectorAll("b")[0].textContent = f.from; li.querySelectorAll("b")[1].textContent = f.to || "(apagar)";
    li.querySelector("button").onclick = () => saveFixes(loadFixes().filter(x => x.from !== f.from));
    box.appendChild(li);
  });
}
