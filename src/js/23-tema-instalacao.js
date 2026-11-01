/* ---------- tema, instalação e resumo das opções ---------- */
const THEME_KEY = "conversor-epub:tema";
const THEMES = { auto: "automático", light: "claro", dark: "escuro" };
function applyTheme(t){
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const b = $("#themeBtn"); b.title = "Tema: " + (THEMES[t] || THEMES.auto); b.setAttribute("aria-label", b.title);
}
let theme = "auto";
try { theme = localStorage.getItem(THEME_KEY) || "auto"; } catch {}
applyTheme(theme);
$("#themeBtn").onclick = () => {
  theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
  applyTheme(theme); try { localStorage.setItem(THEME_KEY, theme); } catch {}
  toast("Tema " + THEMES[theme]);
};

let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("#installBtn").hidden = false; });
window.addEventListener("appinstalled", () => { $("#installBtn").hidden = true; installEvt = null; });
$("#installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; $("#installBtn").hidden = true; };

function updateOptSum(){
  const chips = [];
  if ($("#verify").checked) chips.push("Conferência");
  const m = $("#mode"); if (m.value !== "auto") chips.push(m.options[m.selectedIndex].text);
  if ($("#ocr").checked) chips.push("OCR");
  if ($("#shownums").checked) chips.push("Nº de página");
  const l = $("#lang"); if (l.value !== "pt-BR") chips.push(l.options[l.selectedIndex].text);
  $("#optSum").innerHTML = chips.map(c => `<span class="chip">${esc(c)}</span>`).join("");
}
document.querySelectorAll(".side input, .side select").forEach(el => el.addEventListener("change", updateOptSum));
if (window.matchMedia("(max-width: 1040px)").matches) $("#optPanel").open = false;
