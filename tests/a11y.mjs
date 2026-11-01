// Auditoria simples de acessibilidade, rodada dentro da página (sem dependências externas)
export function audit(){
  const out = { noName: [], noAlt: [], contrast: [], dupIds: [] };
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const nameOf = el => {
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    const lb = el.getAttribute("aria-labelledby"); if (lb) return lb.split(" ").map(id => (document.getElementById(id) || {}).textContent || "").join(" ");
    if (el.labels && el.labels.length) return [...el.labels].map(l => l.textContent).join(" ");
    if (el.title) return el.title;
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && el.placeholder) return el.placeholder;
    return (el.textContent || "").trim() || [...el.querySelectorAll("img[alt]")].map(i => i.alt).join(" ");
  };
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary')) {
    if (el.closest("[hidden]") || (!visible(el) && !(el.tagName === "INPUT" && el.id === "file"))) continue;
    if (!nameOf(el).trim()) out.noName.push(el.outerHTML.slice(0, 120));
  }
  for (const img of document.querySelectorAll("img")) if (!img.hasAttribute("alt")) out.noAlt.push(img.outerHTML.slice(0, 120));
  const ids = {}; for (const e of document.querySelectorAll("[id]")) ids[e.id] = (ids[e.id] || 0) + 1;
  out.dupIds = Object.keys(ids).filter(k => ids[k] > 1);
  // contraste (WCAG): texto normal 4.5, grande 3
  const rgb = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && (c.length < 4 || c[3] > 0.5)) return c.slice(0, 3); } return [255, 255, 255]; };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement; if (!n.data.trim() || !el || seen.has(el) || el.closest("[hidden], svg, .modal, option") || !visible(el)) continue;
    seen.add(el);
    const s = getComputedStyle(el); const fg = rgb(s.color); if (!fg) continue;
    if (fg.length > 3 && fg[3] < 1) continue;
    const L1 = lum(fg.slice(0, 3)), L2 = lum(bgOf(el)), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 600, large = size >= 24 || (bold && size >= 18.66);
    if (ratio < (large ? 3 : 4.5) && !(el.closest("button:disabled, [aria-disabled=true]"))) out.contrast.push(`${ratio.toFixed(2)} ${s.color} "${n.data.trim().slice(0, 40)}" <${el.tagName.toLowerCase()} class="${el.className}">`);
  }
  return out;
}
