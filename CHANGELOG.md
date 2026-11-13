# Novidades

## 3.9.1 — 13 nov 2026

- O índice do próprio PDF sai igual ao do PDF: uma entrada por linha, com o recuo de partes e capítulos e o link para o capítulo. Antes, as entradas se juntavam em parágrafos. Entrada que quebra em duas linhas volta a ser uma, sem o hífen do meio. Quando o PDF já tem índice, o Lombada não acrescenta o sumário dele no começo, para o livro não ficar com dois.

## 3.9.0 — 13 nov 2026

- Dados do livro preenchidos sozinhos: autor, editora, ano, ISBN e gênero saem da página de créditos e da ficha catalográfica do próprio PDF (e do autor gravado no arquivo). O que faltar, incluindo a sinopse, vem do Google Books pelo ISBN, que é exato, ou pelo título e autor, só quando o resultado é o mesmo livro; depois, da Open Library. A internet nunca troca o que o PDF já diz, e a busca pode ser desligada em Ajustes.
- A fila diz quais dados foram preenchidos e de onde vieram.
- Título tirado do arquivo perde o ponto final (“Você me matou primeiro.” vira “Você me matou primeiro”).
- O livro de exemplo ganhou página de créditos com ficha catalográfica.

## 3.8.0 — 13 nov 2026

- Você escolhe onde guardar os livros: no seu Google Drive ou só neste navegador, sem ocupar espaço no Drive. A pergunta aparece na primeira entrada e dá para mudar no menu da conta.
- Ajustes no Drive: quem guarda os livros no Drive tem as mesmas opções em todo aparelho.
- “Onde você vai ler”: perfis para Kindle, Kobo (com “Baixar KEPUB” como botão principal) e Kindle Colorsoft, tablet ou celular, que acertam as imagens sozinhos.
- Código em fonte de largura fixa vira bloco de código no EPUB, linha a linha e com o recuo original.
- Com o app instalado no computador, o Lombada aparece em “Abrir com” para PDFs, EPUBs e os outros formatos. Arquivo compartilhado ou aberto antes do login espera a pessoa entrar.
- Página de ajuda: como mandar o EPUB ao Kindle pelo site, por e-mail e pelo celular, o que fazer quando o livro não chega e quando o PDF sai ruim.
- Contagem de visitas, conversões e tipos de erro pelo GoatCounter, sem cookies e sem nome de arquivo, título ou texto. Fica desligada até o código do GoatCounter ser posto em `package.json`.

## 3.7.0 — 13 nov 2026

- Livro de exemplo: um botão na fila converte “O Farol Apagado” para quem quer ver o Lombada funcionando antes de usar um arquivo seu.
- Capa automática com o título e o autor quando o livro não tem capa, e o botão “Capa com o título” para trocar a capa por ela.
- Página de sumário no começo do livro, logo depois da capa (opção “Sumário no começo do livro”).
- Tempo restante na conversão e “Avisar quando terminar”, que manda uma notificação quando o EPUB fica pronto com a aba em segundo plano.
- O arquivo baixado se chama “Autor - Título.epub”.
- Editora, ano e ISBN nos dados do livro.
- Dá para soltar o arquivo em qualquer lugar da página.
- Busca por título ou autor e ordem (recentes, título, autor) na estante, quando ela passa de 6 livros.
- Página mais leve: a lista de palavras e as traduções são baixadas só quando precisam (o `index.html` caiu de 660 KB para 350 KB).
- Instalação com prints do app, página de Termos de Uso e página 404 própria.
- PDFs reais nos testes, feitos pelo Chromium e pelo LibreOffice. Eles mostraram e já corrigidos: hífen do Chromium (U+2010) que não juntava a palavra, cabeçalho de tabela com células em negrito, revista em duas colunas lida como tabela, versos numa página só de poema, itens numerados partidos ou grudados no parágrafo seguinte e marcadores de lista desenhados como figura.
- O idioma escolhido fica guardado mesmo se a página for recarregada logo em seguida.

## 3.6.1 — 13 nov 2026

- Página de entrada: o print do app deu lugar a uma ilustração de uma prateleira de livros com um leitor de e-book.

## 3.6.0 — 12 nov 2026

- Botão “Abrir no Google Drive” na estante, que leva à pasta Lombada, e “Ver no Drive” em cada livro guardado.

## 3.5.2 — 12 nov 2026

- Quando o login com Google falha, a mensagem diz o motivo (bloqueador do navegador, pop-up bloqueado, acesso negado, Drive API desativada).

## 3.5.1 — 12 nov 2026

- Página própria com a Política de Privacidade (`privacidade.html`), exigida pelo Google para liberar o login a todos.

## 3.5.0 — 12 nov 2026

- Tela de entrada: quem ainda não entrou vê a página de apresentação do Lombada, com o botão “Entrar com Google”. O app abre depois do login e continua aberto nas visitas seguintes, até a pessoa sair.
- Conta no topo mesmo quando o acesso ao Drive expira (cerca de uma hora), com “Reconectar ao Drive” no menu e no cartão do livro.

## 3.4.1 — 12 nov 2026

- O botão “Entrar com Google” passa a aparecer no site.

## 3.4.0 — 12 nov 2026

- Entrar com Google (opcional): cada livro convertido vai para a pasta Lombada do seu Google Drive, e a estante mostra esses livros em qualquer aparelho em que você entrar. O Lombada pede só o acesso aos arquivos que ele mesmo cria.
- Livro tirado da estante vai para a lixeira do Drive. Livros convertidos antes de entrar podem ser guardados no Drive com um clique.

## 3.3.0 — 12 nov 2026

- O painel de opções saiu da lateral. A página fica só com a área de soltar, a fila e a estante; os ajustes abrem pelo botão “Ajustes”, no topo.
- “Opções deste livro” em cada PDF da fila, para converter de novo como imagem, quadrinhos ou com OCR.
- O tipo de PDF não fica mais lembrado de uma visita para a outra: cada visita começa em “Livro de texto”.

## 3.2.0 — 12 nov 2026

- A opção “Idioma” do livro saiu: ela não traduzia nada e confundia. O idioma do livro agora é reconhecido pelo próprio texto.

## 3.1.0 — 12 nov 2026

- Interface em inglês e espanhol, além do português. O idioma vem do navegador e pode ser trocado no topo da página.
- O sumário dentro do EPUB (“Sumário”, “Contents”, “Índice”) segue o idioma do livro.
- PDF: links de uma página para outra do próprio livro (como os do sumário impresso) continuam funcionando no EPUB.

## 3.0.2 — 12 nov 2026

- Corrigido: com uma aba antiga do Lombada aberta, a estante não aparecia na aba nova. Se ainda acontecer, a página avisa o que fazer.

## 3.0.1 — 12 nov 2026

- Capa e sinopse da internet: a busca passa a usar primeiro a Open Library, que responde sempre; o Google Books fica como reserva.

## 3.0.0 — 12 nov 2026

- Novos formatos de entrada: DOCX, TXT, HTML, Markdown, FB2, MOBI/AZW3 sem proteção e CBZ. Todos seguem o mesmo caminho do PDF e podem ser editados.
- PDF: o sumário interno do arquivo define capítulos e partes; texto em duas colunas é lido na ordem certa; tabelas, listas, links e versos são mantidos.
- Corrigir o texto direto na prévia, clicando no parágrafo.
- Mudar a ordem dos capítulos e desfazer a última alteração.
- EPUB pronto pode ser aberto para editar capa, capítulos e texto.
- Buscar capa e sinopse na internet (Open Library e Google Books), só quando você pede.
- Descrição (texto alternativo) para as imagens.
- Imagens menores ou em tons de cinza, e download em KEPUB para o Kobo.
- Cada livro guarda as opções com que foi convertido e pode ser convertido de novo com outras.
- Se a página fechar com arquivos na fila, eles voltam na visita seguinte.
- Cada nota de rodapé fica no capítulo que a chama.

## 2.2.0 — 12 nov 2026

- O app agora se chama Lombada. O endereço do site continua o mesmo.

## 2.1.0 — 12 nov 2026

- Visual novo: a área de soltar virou a capa de um livro, em azul, com o amarelo de marca-texto nas ações e nas palavras conferidas.
- Fila mais limpa: capa maior, um selo só para “Pronto para o Kindle” e as etapas aparecem apenas enquanto o livro é convertido.
- Fila vazia mostra o caminho em três passos.
- Livros sem capa aparecem na estante como capa de tecido com o título.
- Tema escuro redesenhado, ícone e imagem de compartilhamento novos.

## 2.0.0 — 1 nov 2026

- A leitura do PDF saiu da linha de execução da tela: a página não trava mais durante a conversão (livro de 268 páginas: de 6,6 s de travadas para 0,6 s) e converte uns 25% mais rápido.
- Sumário em dois níveis: partes (“Parte II”, ou numeração romana acima de capítulos numerados) agrupam os capítulos.
- Editar capítulos: marcar e desmarcar partes, transformar um parágrafo em capítulo e ir da prévia direto para a lista.
- Capa a partir de qualquer página do PDF.
- Selo “Pronto para o Kindle”: a estrutura de cada EPUB é conferida antes do download.
- PDF com senha: dá para digitar a senha ali mesmo. Mensagens claras para arquivo danificado, PDF em branco e falta de memória. PDF escaneado com o OCR desligado oferece converter de novo com OCR.
- Títulos de várias linhas com fonte menor que o número do capítulo ficam num título só.
- Acessibilidade: foco preso na prévia e devolvido ao fechar, avisos para leitor de tela, contraste conferido nos dois temas.
- Privacidade explicada na página e botão para apagar tudo o que fica guardado no navegador.
- Versão no rodapé e aviso quando sai uma versão nova.
- Imagem e descrição para o link aparecer bem no WhatsApp e nas redes.
- Código dividido em módulos (`src/`), testes automáticos e publicação pelo GitHub Actions só quando os testes passam.

## 1.4.0 — 31 out 2026

- Títulos de capítulo: o número grande fica junto do título, e títulos em várias linhas viram um só.
- Citações recuadas não se partem mais em um parágrafo por linha; “terças- / -feiras” vira “terças-feiras”.
- Enviar ao Kindle: no computador, baixa o EPUB e abre a página da Amazon; no celular, se o compartilhamento falhar, baixa o arquivo.

## 1.3.0 — 31 out 2026

- Novo layout: opções ao lado, fila com capas e barra de progresso, estante com os últimos livros, tema claro e escuro.
- Itálico e negrito, quebras de cena, letra capitular, OCR para páginas escaneadas, correções lembradas, série e volume, juntar volumes, app instalável.
- Palavras desenhadas sem caractere de espaço são separadas.

## 1.2.0 — 31 out 2026

- Editar o livro (capa, título, autor, capítulos), corrigir trechos apontados pela conferência, prévia com o PDF ao lado, notas de rodapé clicáveis, quadrinhos e mangá, histórico.
- Conferência palavra por palavra opcional.

## 1.1.0 — 14 out 2026

- Texto igual ao PDF e conferência palavra por palavra.
- Ligaduras “fi” e “fl” sem texto recuperadas pelas palavras do livro ou pelo desenho da letra.

## 1.0.0 — 9 out 2026

- Primeira versão: PDF para EPUB no navegador.
