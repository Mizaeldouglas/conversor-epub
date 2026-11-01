/* ---------- opções lembradas neste navegador ---------- */
const OPT_IDS = ["verify", "shownums", "headers", "cover", "notes", "ocr", "lang", "mode", "keeppages", "totalpages", "cpp", "lookFont", "lookJustify", "lookIndent", "lookLh"];
const OPT_KEY = "conversor-epub:opcoes";
function loadOptions(){
  try {
    const o = JSON.parse(localStorage.getItem(OPT_KEY) || "{}");
    for (const id of OPT_IDS) {
      const el = document.getElementById(id);
      if (!el || !(id in o)) continue;
      if (el.type === "checkbox") el.checked = !!o[id]; else el.value = o[id];
    }
  } catch {}
}
function saveOptions(){
  try {
    const o = {};
    for (const id of OPT_IDS) { const el = document.getElementById(id); if (el) o[id] = el.type === "checkbox" ? el.checked : el.value; }
    localStorage.setItem(OPT_KEY, JSON.stringify(o));
  } catch {}
}
loadOptions();
OPT_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener("change", saveOptions); });
renderHistory();
renderFixes();
updateOptSum();
