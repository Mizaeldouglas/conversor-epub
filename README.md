# Conversor PDF para EPUB

Página única que roda inteira no navegador (nenhum arquivo é enviado para servidor):

- **PDF → DOCX → EPUB**: texto, títulos, imagens e páginas escaneadas, com a numeração de páginas do PDF.
- **EPUB → EPUB corrigido**: junta palavras quebradas ("tam bem" → "também") e adiciona números de página.
- Correções revisáveis palavra por palavra antes de gerar o arquivo final.

Bibliotecas: [pdf.js](https://mozilla.github.io/pdf.js/) e [JSZip](https://stuk.github.io/jszip/), carregadas do cdnjs.
Dicionário: [pythonprobr/palavras](https://github.com/pythonprobr/palavras) e frequências de [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), embutidos compactados no `index.html`.

## Licenças dos dados

- Lista de palavras (pythonprobr/palavras): Mozilla Public License 2.0.
- Frequências de palavras (hermitdave/FrequencyWords, a partir do OpenSubtitles): CC BY-SA 4.0.
