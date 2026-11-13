/* ---------- app instalável (só no site; o artefato não aceita) ---------- */
(async () => {
  if (!ON_SITE || location.protocol !== "https:" && location.hostname !== "localhost") return;
  const head = document.head;
  const link = (rel, href, extra = {}) => { const l = document.createElement("link"); l.rel = rel; l.href = href; Object.assign(l, extra); head.appendChild(l); };
  link("manifest", "manifest.webmanifest");
  link("apple-touch-icon", "icon-192.png");
  if ("serviceWorker" in navigator) {
    try {
      const hadSw = !!navigator.serviceWorker.controller;
      await navigator.serviceWorker.register("sw.js");
      // versão nova publicada com a página aberta: avisa, sem recarregar no meio de uma conversão
      navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.versao && e.data.versao !== VERSION) $("#updateBar").hidden = false; });
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadSw) navigator.serviceWorker.controller.postMessage("versao"); });
      const reg = await navigator.serviceWorker.getRegistration();
      const check = () => reg && reg.update().catch(() => {});
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    } catch (e) { console.warn("sw", e); }
  }
  // arquivos recebidos pelo "Compartilhar" do celular
  if (new URLSearchParams(location.search).has("compartilhado") && "caches" in window) {
    try {
      const c = await caches.open("conversor-epub-compartilhado");
      const files = [];
      for (const req of await c.keys()) {
        const r = await c.match(req); const name = decodeURIComponent(req.url.split("/").pop());
        files.push(new File([await r.blob()], name, { type: r.headers.get("content-type") || "" }));
        await c.delete(req);
      }
      history.replaceState(null, "", location.pathname);
      if (files.length) addFiles(files);
    } catch (e) { console.warn("compartilhado", e); }
  }
})();


// aviso de versão nova: recarrega só quando a pessoa quiser (e avisa se há conversão em andamento)
$("#updateBtn").onclick = () => {
  if (jobs.some(j => j.busy) && !$("#updateBtn").dataset.sure) { $("#updateBtn").dataset.sure = "1"; $("#updateBtn").textContent = "Há conversão em andamento. Atualizar mesmo assim?"; return; }
  location.reload();
};
$("#updateLater").onclick = () => { $("#updateBar").hidden = true; };

// link "política de privacidade": abre a pergunta certa
document.querySelectorAll("[data-open]").forEach(a => a.addEventListener("click", e => {
  if (document.body.classList.contains("gated")) { e.preventDefault(); $("#lp-privacidade").scrollIntoView({ behavior: "smooth" }); return; }
  const d = document.getElementById(a.dataset.open); if (d) d.open = true;
}));
if (location.hash === "#privacidade") $("#privacidade").open = true;

// apagar tudo o que fica guardado neste navegador
$("#wipeBtn").onclick = async () => {
  const b = $("#wipeBtn");
  if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Confirmar: apagar estante, opções e correções"; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = "Apagar tudo o que está guardado neste navegador"; } }, 5000); return; }
  if (DRIVE_ON && driveConnected()) driveLogout();
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("conversor-epub:")) localStorage.removeItem(k); sessionStorage.removeItem(DRIVE_TOKEN); } catch {}
  try { (await histAll()).forEach(r => histDel(r.id)); await idbReq("readwrite", st => st.clear(), QUEUE_STORE); } catch {}
  try { if ("caches" in window) await caches.delete("conversor-epub-compartilhado"); } catch {}
  delete b.dataset.sure; b.textContent = "Apagar tudo o que está guardado neste navegador";
  renderHistory(); renderFixes();
  if (DRIVE_ON) { applyGate(); renderAccount(); scrollTo(0, 0); }   // apagar tudo também desfaz o login
  toast("Pronto: nada do Lombada ficou guardado neste navegador.");
};

const drop = $("#drop"), input = $("#file");
drop.onclick = () => input.click();
drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
input.onchange = () => { addFiles([...input.files]); input.value = ""; };
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => addFiles([...e.dataTransfer.files]));
// arquivos soltos em qualquer lugar da página também entram na fila
const dropAll = $("#dropAll"); let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
const canDrop = () => !document.body.classList.contains("gated") && $("#preview").hidden;
document.addEventListener("dragenter", e => { if (!hasFiles(e) || !canDrop()) return; dragDepth++; dropAll.hidden = false; });
document.addEventListener("dragleave", e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropAll.hidden = true; });
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => {
  e.preventDefault(); dragDepth = 0; dropAll.hidden = true;
  if (e.defaultPrevented && drop.contains(e.target)) return;
  if (hasFiles(e) && canDrop() && !drop.contains(e.target)) addFiles([...e.dataTransfer.files]);
});
})();
