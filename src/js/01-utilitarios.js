/* ---------- utilitários ---------- */
const esc = s => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const kb = n => n < 1048576 ? (n/1024).toFixed(0)+" KB" : (n/1048576).toFixed(1)+" MB";
const baseName = f => f.replace(/\.(pdf|epub)$/i,"");
const safeFile = s => (s.replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim() || "livro").slice(0,120);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16)}));
function median(arr){ if(!arr.length) return 0; const a=[...arr].sort((x,y)=>x-y); return a[a.length>>1]; }

let toastT;
function toast(msg, ms){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,ms||3200); }

async function offer(filename, blob){
  const dl = await downloadsP;
  if (dl) {
    try { await dl.save({ filename, data: blob }); toast("Arquivo salvo: " + filename); }
    catch (e) {
      if (e && e.code === "declined") return;
      if (e && e.code === "rate_limited") { toast("Já há um download aguardando confirmação."); return; }
      toast("Não foi possível salvar o arquivo aqui (" + (e && e.code || "erro") + ").");
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
