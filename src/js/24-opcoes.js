/* ---------- opções lembradas neste navegador ---------- */
const OPT_IDS = ["verify", "shownums", "headers", "cover", "notes", "ocr", "keeppages", "totalpages", "cpp", "lookFont", "lookJustify", "lookIndent", "lookLh", "images", "tocpage", "device"];
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
  if (DRIVE_ON) prefsChanged();
}
// perfis de leitor: ajustam as imagens e o formato que vem primeiro no download
const DEVICES = {
  kindle: { images: "gray", note: "Imagens menores e em tons de cinza, como a tela do Kindle mostra." },
  kobo: { images: "gray", note: "Imagens em tons de cinza e o botão “Baixar KEPUB”, o formato que guarda a posição de leitura no Kobo." },
  color: { images: "small", note: "Imagens coloridas, um pouco menores para o arquivo ficar leve." }
};
function deviceOf(){ const el = document.getElementById("device"); return el ? el.value : "custom"; }
function applyDevice(){
  const d = DEVICES[deviceOf()], note = $("#deviceNote");
  note.hidden = !d; if (d) note.textContent = d.note;
  if (d) $("#images").value = d.images;
  jobs.forEach(j => j.epub && render(j));
}
$("#device").addEventListener("change", () => { applyDevice(); saveOptions(); });
$("#images").addEventListener("change", () => { const d = DEVICES[deviceOf()]; if (d && $("#images").value !== d.images) { $("#device").value = "custom"; applyDevice(); saveOptions(); } });
loadOptions();
applyDevice();
OPT_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener("change", saveOptions); });
renderHistory();
queueRestore();
renderFixes();
updateOptSum();
