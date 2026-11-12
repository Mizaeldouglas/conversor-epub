(() => {
"use strict";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $ = s => document.querySelector(s);
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const jobs = [];
// idioma da interface: o escolhido antes, ou o do navegador (português, espanhol; os demais veem em inglês)
const UI_LANG_KEY = "conversor-epub:idioma";
let uiLang = "pt";
try { uiLang = localStorage.getItem(UI_LANG_KEY) || (/^pt/i.test(navigator.language) ? "pt" : /^es/i.test(navigator.language) ? "es" : "en"); } catch {}
const uiLocale = () => uiLang === "en" ? "en-US" : uiLang === "es" ? "es" : "pt-BR";
const VERSION = "@@VERSION@@";
const SITE_URL = "@@SITE@@";
// no site (não no artefato do Claude): app instalável, OCR com os próprios arquivos de idioma
const ON_SITE = window.top === window && /^https?:$/.test(location.protocol) && !/claude|anthropic/i.test(location.hostname);
window.__app = { jobs, render: j => render(j) };   // usado pelos testes automáticos
const downloadsP = (window.claude && typeof window.claude.use === "function")
  ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);
