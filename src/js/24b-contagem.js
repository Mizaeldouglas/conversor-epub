/* ---------- contagem de visitas e de erros (GoatCounter, sem cookies) ----------
   Só no site e só com o código do GoatCounter em package.json ("goatcounter"). Nunca sai nome de arquivo,
   título, autor ou texto do livro: só a página aberta, o formato convertido e o tipo do erro. */
// var: render() pode chamar antes deste trecho rodar, e aí a contagem só fica desligada
var GOAT = window.__lombadaGoat || "@@GOAT@@";
var GOAT_ON = ON_SITE && /^[a-z0-9-]+$/.test(GOAT) && navigator.doNotTrack !== "1";
function goatCount(path, event){
  if (!GOAT_ON) return;
  try {
    const q = { p: path, rnd: Math.random().toString(36).slice(2) };
    if (event) q.e = "true";
    else { q.r = document.referrer || ""; q.s = [screen.width, screen.height, devicePixelRatio || 1].join(","); }
    new Image().src = `https://${GOAT}.goatcounter.com/count?` + Object.entries(q).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  } catch {}
}
// tira do texto do erro o que pode ser do usuário: o que vem entre parênteses ou aspas, nomes de arquivo e números
function errKind(msg){ return String(msg || "erro").replace(/\(.*?\)|“.*?”|".*?"|'.*?'/g, "").replace(/\S+\.(pdf|epub|docx?|txt|html?|md|fb2|mobi|azw3?|cbz)\b/gi, "")
  .replace(/\d+/g, "N").replace(/\s+/g, " ").trim().slice(0, 70); }
function countError(job){
  if (!GOAT_ON) return;
  const names = [job.title, job.file && job.file.name].filter(Boolean);
  let m = errKind(job.error);
  for (const n of names) if (n.length > 2) m = m.split(n).join("");
  goatCount("erro/" + (job.fmt || job.kind) + "/" + m, true);
}
const jsSeen = new Set();
window.addEventListener("error", e => { const k = errKind(e.message) + "@" + (e.lineno || 0); if (jsSeen.size < 5 && !jsSeen.has(k)) { jsSeen.add(k); goatCount("erro/js/" + k, true); } });
window.addEventListener("unhandledrejection", e => { const k = errKind(e.reason && (e.reason.message || e.reason)); if (jsSeen.size < 5 && !jsSeen.has(k)) { jsSeen.add(k); goatCount("erro/js/" + k, true); } });
goatCount(document.body.classList.contains("gated") ? "/entrada" : "/app");
