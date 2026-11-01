/* ---------- enviar ao Kindle ---------- */
// Celular: compartilha direto com o app Kindle. Computador: baixa e abre a página da Amazon.
// Celular (Android/iPhone): compartilha direto com o app Kindle.
// Computador: o Mac e o Windows também "aceitam" compartilhar, mas não mandam para o Kindle; lá o EPUB é
// baixado e a página da Amazon abre em outra aba (o link do botão).
const isPhone = () => (navigator.userAgentData && navigator.userAgentData.mobile)
  || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // iPad se apresenta como Mac
async function sendToKindle(e, job, name){
  if (!job.epub) { e.preventDefault(); return; }
  const file = new File([job.epub], name, { type: "application/epub+zip" });
  let canShareFile = false;
  if (isPhone()) { try { canShareFile = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch {} }
  if (canShareFile) {
    e.preventDefault();
    try { await navigator.share({ files: [file], title: job.title }); return; }
    catch (err) {
      if (err && err.name === "AbortError") return;   // a pessoa fechou o compartilhamento
      // não deu para compartilhar (ex.: dentro de outro app): baixa o arquivo para enviar pelo app Kindle
      offer(name, job.epub);
      toast("EPUB baixado. Abra o app Kindle e envie o arquivo pela opção de enviar documentos, ou use amazon.com.br/sendtokindle.", 10000);
      return;
    }
  }
  // o link abre amazon.com.br/sendtokindle em outra aba; aqui baixamos o arquivo
  offer(name, job.epub);
  toast("EPUB baixado. Na página da Amazon que abriu, arraste o arquivo para “Enviar para o Kindle”.", 9000);
}
