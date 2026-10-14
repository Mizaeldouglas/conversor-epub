# Conversor PDF para EPUB

Página única que roda inteira no navegador (nenhum arquivo é enviado para servidor):

- **PDF → DOCX → EPUB**: texto, títulos, imagens e páginas escaneadas, com a numeração de páginas do PDF.
- **Texto igual ao PDF**: o espaço entre palavras só entra onde o PDF tem um caractere de espaço de verdade, evitando quebras como "tam bem".
- **Ligaduras sem texto** ("fi", "fl" guardados como símbolo sem código): identificadas uma vez para o livro inteiro, pelas palavras em que aparecem ou pelo desenho da letra.
- **Conferência palavra por palavra**: antes de liberar o download, o EPUB gerado é lido de volta e comparado com o texto do PDF; diferenças aparecem com a página e o trecho.
- **EPUB → EPUB**: coloca números de página sem mexer no texto (também conferido).
- **Enviar ao Kindle**: no celular abre o compartilhamento com o app Kindle; no computador baixa o EPUB e abre amazon.com.br/sendtokindle.

Bibliotecas: [pdf.js](https://mozilla.github.io/pdf.js/) e [JSZip](https://stuk.github.io/jszip/), carregadas do cdnjs.

Lista das 50 mil palavras mais usadas do português (usada só para identificar ligaduras): [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), CC BY-SA 4.0.
