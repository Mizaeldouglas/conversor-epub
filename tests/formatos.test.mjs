// Outros formatos de entrada e os recursos novos do PDF (sumário interno, colunas, tabela, listas, link, versos)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp, addFiles, waitJob, epubOf, tocOf, epubcheck } from "./helpers.mjs";

let server, browser, app, n = 0;
before(async () => { server = await startServer(); browser = await launch(); app = await openApp(browser, server); await app.page.check("#verify"); });
after(async () => { await browser.close(); server.close(); });

const textOf = async z => (await Promise.all(Object.keys(z.files).filter(f => /ch\d+\.xhtml$/.test(f)).sort().map(f => z.file(f).async("string")))).join("\n");
async function convert(name){
  await addFiles(app.page, [name]);
  const i = n++, r = await waitJob(app.page, i);
  assert.equal(r.error, null);
  const out = name.replace(/\.\w+$/, "") + "-" + name.split(".").pop() + ".epub";
  const z = await epubOf(app.page, i, out);
  const ck = epubcheck(out); if (ck !== null) assert.equal(ck, "", ck);
  return { r, z, all: await textOf(z), toc: await tocOf(z) };
}

test("PDF: sumário interno, duas colunas, tabela, listas, link e versos", async () => {
  const { r, all, toc } = await convert("recursos.pdf");
  assert.deepEqual(r.diffs, []);
  assert.deepEqual(toc, [["Livro Primeiro", ["A chegada dos barcos", "A tabela das marés"]], ["Livro Segundo", ["O que dizem os velhos"]]]);
  assert.match(all, /<a href="https:\/\/www\.exemplo\.org\/porto">www\.exemplo\.org\/porto<\/a>/);
  assert.match(all, /<a href="ch003\.xhtml#pg\d+">Veja a tabela das marés\.<\/a>/, "link interno do PDF");
  assert.match(all, /<ul class="lista"><li>• corda de cânhamo, três braças<\/li>/);
  assert.match(all, /<li>• lanterna de azeite com pavio novo e vidro limpo, guardada sempre na caixa seca do convés<\/li>/, "item de lista em duas linhas partido");
  assert.match(all, /<li>2\. Recolher a vela\.<\/li>/);
  assert.match(all, /<table><tr><td>Dia<\/td><td>Maré alta<\/td><td>Maré baixa<\/td><\/tr><tr><td>Segunda<\/td><td>06h10<\/td><td>12h25<\/td><\/tr>/);
  assert.match(all, /<p class="verso">Quem parte leva o vento,<br\/>quem fica guarda o cais,<br\/>e a maré, sem pensamento,<br\/>devolve o que não é mais\.<\/p>/);
  assert.match(all, /respeitava a pedra\. As crianças não acreditam/, "a coluna da direita não veio depois da esquerda");
  assert.doesNotMatch(all, /farol já foi mais alto As crianças|pedra\. As crianças não acreditam, mas sobem a escada toda tarde para ver se a história ainda cabe na vista\. Dizem/);
});

test("DOCX: títulos, itálico, link, lista, nota e tabela", async () => {
  const { r, all, toc } = await convert("relojoeiro.docx");
  assert.equal(r.title, "O Relojoeiro de Vila Seca");
  assert.deepEqual(toc, [["A oficina", []], ["O relógio da torre", []]]);
  assert.match(all, /<em>antes do sino<\/em>, e fechava quando o último relógio <strong>parava de discutir<\/strong>/);
  assert.match(all, /<a href="https:\/\/www\.exemplo\.org\/praca">regulamento da praça<\/a>/);
  assert.match(all, /epub:type="noteref"[^>]*>1<\/a>/);
  assert.match(all, /epub:type="footnote"[\s\S]*Os relógios da vila nunca concordaram entre si\./);
  assert.match(all, /<ul class="lista"><li>• uma lupa<\/li>/);
  assert.match(all, /<table><tr><td>Dia<\/td><td>Atraso<\/td><\/tr>/);
});

test("FB2 e HTML: mesmo livro, com a nota no capítulo que a chama", async () => {
  for (const f of ["relojoeiro.fb2", "relojoeiro.html"]) {
    const { r, all, toc } = await convert(f);
    assert.equal(r.title, "O Relojoeiro de Vila Seca", f);
    assert.deepEqual(toc, [["A oficina", []], ["O relógio da torre", []]], f);
    assert.match(all, /<em>antes do sino<\/em>/, f);
    assert.equal(r.notes, 1, f);
  }
});

test("Markdown e TXT", async () => {
  const md = await convert("conto.md");
  assert.deepEqual(md.toc, [["A oficina", []], ["O relógio da torre", []]]);
  assert.match(md.all, /<strong>parava de discutir<\/strong>/);
  const txt = await convert("conto.txt");
  assert.deepEqual(txt.toc, [["CAPÍTULO 1", []], ["CAPÍTULO 2", []]]);
  assert.match(txt.all, /<p>A carta chegou numa terça, dobrada em quatro\.<\/p>/);
  assert.match(txt.all, /class="cena"/);
});

test("MOBI: texto comprimido, acentos, título, autor e imagem", async () => {
  const { r, all, z } = await convert("farol.mobi");
  assert.equal(r.title, "O Farol Apagado");
  assert.match(all, /Eram <em>cento e doze<\/em> degraus\. O faroleiro subia a escada todas as noites\./);
  assert.match(all, /Coração e ação não cabem em sete bits\./);
  assert.equal(r.images, 1);
  assert.match(await z.file("OEBPS/content.opf").async("string"), /<dc:creator>Ana Ribeiro<\/dc:creator>/);
});

test("CBZ: cada imagem vira uma página fixa, na ordem do nome", async () => {
  const { r, z } = await convert("gibi.cbz");
  assert.equal(r.images, 3);
  assert.match(await z.file("OEBPS/content.opf").async("string"), /pre-paginated/);
});

test("EPUB aberto para edição: vira um livro editável, com capítulo e texto", async () => {
  await addFiles(app.page, ["livro.epub"]);
  const i = n++; await waitJob(app.page, i);
  const row = app.page.locator(".row").nth(i);
  await row.locator("details.edit summary").first().click();
  await row.locator('[data-a="reopen"]').click();
  await app.page.waitForFunction(i => { const j = window.__app.jobs[i]; return j.fromEpub && !j.busy && j.epub; }, i);
  const z = await epubOf(app.page, i, "livro-editavel.epub");
  assert.deepEqual(await tocOf(z), [["A Estação", []]]);
  assert.match(await textOf(z), /A estação ficava no fim da linha/);
  assert.equal(await row.locator(".chap-list li").count(), 1);
  const ck = epubcheck("livro-editavel.epub"); if (ck !== null) assert.equal(ck, "", ck);
});

test("nenhum erro de JavaScript", () => assert.deepEqual(app.errors, []));
