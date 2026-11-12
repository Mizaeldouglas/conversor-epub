"""Gera os arquivos de teste em tests/fixtures (texto original, feito só para os testes).

Uso: python3 tools/gerar-fixtures.py   (precisa de reportlab e Pillow)
"""
import io, os, random, zipfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A5
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures")
os.makedirs(OUT, exist_ok=True)
W, H = A5
M = 48  # margem


def lines_of(c, text, font, size, width):
    words, out, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if c.stringWidth(t, font, size) > width and cur:
            out.append(cur); cur = w
        else:
            cur = t
    if cur: out.append(cur)
    return out


def paragraph(c, y, text, font="Times-Roman", size=11, indent=18, lead=15):
    ls = lines_of(c, text, font, size, W - 2 * M - indent)
    for i, ln in enumerate(ls):
        c.setFont(font, size); c.drawString(M + (indent if i == 0 else 0), y, ln); y -= lead
    return y


def folio(c, n, header=None):
    # cabeçalho repetido só nos arquivos com páginas suficientes para ele ser reconhecido como tal
    if header: c.setFont("Times-Italic", 8); c.drawCentredString(W / 2, H - 28, header)
    c.setFont("Times-Roman", 9); c.drawCentredString(W / 2, 26, str(n))


# 1) estilos.pdf: capítulos, capitular, itálico/negrito, nota de rodapé, cena, cabeçalho e rodapé repetidos
def estilos():
    c = canvas.Canvas(os.path.join(OUT, "estilos.pdf"), pagesize=A5)
    for n, (cap, abertura) in enumerate([("Capítulo 1", "lma acordou antes do farol apagar."), ("Capítulo 2", "ntes da chuva, o vento mudou de lado.")], start=1):
        folio(c, n)
        c.setFont("Times-Bold", 20); c.drawString(M, H - 90, cap)
        y = H - 130
        c.setFont("Times-Roman", 34); c.drawString(M, y - 18, "A")
        c.setFont("Times-Roman", 11); c.drawString(M + 26, y, abertura)
        c.drawString(M + 26, y - 15, "O guarda dormia na cadeira de palha, com o chapéu")
        y -= 30
        c.drawString(M, y, "sobre os olhos e as botas ainda molhadas da ronda.")
        y -= 22
        c.setFont("Times-Roman", 11); c.drawString(M + 18, y, "Ela desceu a escada contando os degraus:")
        x = M + 18 + c.stringWidth("Ela desceu a escada contando os degraus: ", "Times-Roman", 11)
        c.setFont("Times-Italic", 11); c.drawString(x, y, "cento e doze,")
        x += c.stringWidth("cento e doze, ", "Times-Italic", 11)
        c.setFont("Times-Roman", 11); c.drawString(x, y, "como o avô")
        y -= 15
        c.drawString(M, y, "ensinara. No último, leu o aviso pintado de vermelho:")
        y -= 15
        c.setFont("Times-Bold", 11); c.drawString(M, y, "NÃO ABRA COM MARÉ ALTA.")
        x = M + c.stringWidth("NÃO ABRA COM MARÉ ALTA. ", "Times-Bold", 11)
        c.setFont("Times-Roman", 11); c.drawString(x, y, "Abriu mesmo assim.")
        c.setFont("Times-Roman", 7); c.drawString(x + c.stringWidth("Abriu mesmo assim.", "Times-Roman", 11) + 1, y + 5, "1")
        y -= 28
        c.setFont("Times-Roman", 11); c.drawCentredString(W / 2, y, "* * *")
        y -= 28
        y = paragraph(c, y, "Do lado de fora, a areia tinha coberto metade da porta, e as gaivotas olhavam para ela como quem espera uma explicação que nunca vem.")
        y = paragraph(c, y, "Alma voltou para dentro, acendeu a lamparina e decidiu que contaria tudo ao guarda quando ele acordasse.")
        c.line(M, 62, M + 60, 62)
        c.setFont("Times-Roman", 8); c.drawString(M, 50, "1 O aviso foi pintado pelo avô depois da enchente de 1931.")
        c.showPage()
    c.save()


# 2) grudado.pdf: cada palavra desenhada separada, sem caractere de espaço entre elas
def grudado():
    c = canvas.Canvas(os.path.join(OUT, "grudado.pdf"), pagesize=A5)
    folio(c, 1)
    c.setFont("Times-Bold", 18); c.drawString(M, H - 90, "A ponte de cordas")
    text = ("O barqueiro cobrava duas moedas pela travessia e mais uma se o passageiro quisesse ouvir a história "
            "da ponte que caiu. Quase todos pagavam a terceira moeda, porque a história mudava um pouco a cada vez "
            "e ninguém sabia qual era a verdadeira. Naquela tarde ele contou que a ponte tinha sido levada por um "
            "vento que vinha do mar e voltava para o mar sem tocar em nenhuma árvore.")
    y = H - 130
    for i, ln in enumerate(lines_of(c, text, "Times-Roman", 11, W - 2 * M - 18)):
        x = M + (18 if i == 0 else 0)
        c.setFont("Times-Roman", 11)
        for w in ln.split():
            c.drawString(x, y, w); x += c.stringWidth(w + " ", "Times-Roman", 11)
        y -= 15
    c.showPage(); c.save()


# 3) capitulos.pdf: partes em romano, número grande em cima do título em várias linhas, citação recuada, hífen repetido
def capitulos():
    c = canvas.Canvas(os.path.join(OUT, "capitulos.pdf"), pagesize=A5)
    page = [0]

    def new_page():
        if page[0]: c.showPage()
        page[0] += 1; folio(c, page[0], "Crônicas do Cais")

    def parte(num, titulo):
        new_page()
        c.setFont("Times-Bold", 48); c.drawCentredString(W / 2, H / 2 + 40, num)
        c.setFont("Times-Bold", 16); c.drawCentredString(W / 2, H / 2 - 10, titulo)

    def capitulo(num, titulo_linhas, corpo, extra=None):
        new_page()
        c.setFont("Times-Bold", 60); c.drawString(M, H - 120, num)
        y = H - 150
        for ln in titulo_linhas:
            c.setFont("Times-Bold", 13); c.drawString(M, y, ln); y -= 17
        y -= 16
        for p in corpo: y = paragraph(c, y, p) - 4
        if extra: extra(y)

    parte("I", "O QUE A MARÉ TROUXE")
    capitulo("1", ["A CAIXA QUE CHEGOU NA AREIA", "(E O QUE HAVIA DENTRO)"],
             ["Ninguém no vilarejo lembrava de uma caixa tão grande na praia. Tinha o tamanho de um armário e cheirava a sal e a ferrugem.",
              "Os pescadores chegaram primeiro, depois as crianças, e por fim o padre, que chegou correndo e sem fôlego."])

    def citacao(y):
        y -= 6
        for ln in ["Registro do cais, folha nove: a caixa foi", "aberta às sete horas, na presença de três", "testemunhas e de um cachorro sem dono."]:
            c.setFont("Times-Italic", 10); c.drawString(M + 30, y, ln); y -= 13
        y -= 10
        c.setFont("Times-Roman", 11); c.drawString(M + 18, y, "O padre abriu a caixa todas as terças-")
        c.drawString(M, y - 15, "-feiras seguintes, até não sobrar nada dentro.")

    capitulo("2", ["O HOMEM QUE CONTAVA", "AS ONDAS"],
             ["Seu Abílio dizia que cada onda tinha um número e que ele sabia todos de cor. Ninguém conferia, mas também ninguém duvidava."], citacao)
    capitulo("2½", ["UM INTERVALO"], ["Este capítulo é curto de propósito, como uma pausa entre duas marés."])
    parte("II", "O QUE A MARÉ LEVOU")
    capitulo("3", ["A NOITE EM QUE", "O FAROL CALOU"],
             ["Quando o farol apagou, o vilarejo inteiro saiu de casa para olhar o escuro, como se o escuro fosse uma visita."])
    capitulo("4", ["DEPOIS"], ["No dia seguinte a caixa tinha sumido, e a areia estava lisa como se nunca tivesse existido nada ali."])
    c.showPage(); c.save()


# 4) gibi.pdf: páginas que são só imagem
def gibi():
    c = canvas.Canvas(os.path.join(OUT, "gibi.pdf"), pagesize=A5)
    for n, cor in enumerate([(230, 120, 90), (90, 160, 210), (120, 190, 110)], start=1):
        im = Image.new("RGB", (600, 850), cor); d = ImageDraw.Draw(im)
        for k in range(4): d.rectangle([30, 30 + k * 205, 570, 215 + k * 205], outline=(20, 20, 20), width=6)
        d.text((50, 50), f"Quadro {n}", fill=(0, 0, 0))
        b = io.BytesIO(); im.save(b, "JPEG", quality=80); b.seek(0)
        c.drawImage(ImageReader(b), 0, 0, W, H); c.showPage()
    c.save()


# 5) escaneado.pdf: texto em imagem (para o OCR)
def escaneado():
    font = None
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"]:
        if os.path.exists(f): font = ImageFont.truetype(f, 30); break
    c = canvas.Canvas(os.path.join(OUT, "escaneado.pdf"), pagesize=A5)
    for txt in [["O vento chegou cedo", "e levou as redes", "que secavam no cais."], ["Na volta, trouxe", "o cheiro da chuva", "e um barco vazio."]]:
        im = Image.new("L", (1240, 1754), 255); d = ImageDraw.Draw(im)
        for i, ln in enumerate(txt): d.text((140, 300 + i * 60), ln, fill=0, font=font)
        b = io.BytesIO(); im.save(b, "PNG"); b.seek(0)
        c.drawImage(ImageReader(b), 0, 0, W, H); c.showPage()
    c.save()


# 6) senha.pdf e corrompido.pdf: erros que o app precisa explicar
def erros():
    c = canvas.Canvas(os.path.join(OUT, "senha.pdf"), pagesize=A5, encrypt="segredo")
    c.setFont("Times-Roman", 11); c.drawString(M, H - 90, "Este arquivo foi protegido com senha para o teste.")
    c.drawString(M, H - 105, "Com a senha certa, o texto aparece normalmente."); c.showPage(); c.save()
    random.seed(7)
    with open(os.path.join(OUT, "corrompido.pdf"), "wb") as f:
        f.write(b"%PDF-1.4\n" + bytes(random.randrange(256) for _ in range(3000)))


# 7) livro.epub: EPUB sem números de página
def epub():
    body = "".join(f"<p>{p}</p>" for p in [
        "A estação ficava no fim da linha, onde os trilhos simplesmente paravam no meio do capim.",
        "Toda manhã o chefe da estação varria a plataforma, embora nenhum trem passasse ali havia anos.",
        "Quando perguntavam por quê, ele respondia que um dia alguém ia chegar e merecia encontrar tudo limpo."])
    files = {
        "META-INF/container.xml": '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        "c.opf": '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:9d2f7a51-3c1e-4c55-9b0e-1f2a3b4c5d6e</dc:identifier><dc:title>A Estação</dc:title><dc:language>pt-BR</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch" href="ch.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch"/></spine></package>',
        "nav.xhtml": '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head><body><nav epub:type="toc"><ol><li><a href="ch.xhtml">A Estação</a></li></ol></nav></body></html>',
        "ch.xhtml": f'<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>A Estação</title></head><body><h1>A Estação</h1>{body * 6}</body></html>',
    }
    with zipfile.ZipFile(os.path.join(OUT, "livro.epub"), "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for k, v in files.items(): z.writestr(k, v, compress_type=zipfile.ZIP_DEFLATED)


# 8) recursos.pdf: sumário interno (com títulos em fonte comum), duas colunas, tabela, listas, link e versos
def recursos():
    c = canvas.Canvas(os.path.join(OUT, "recursos.pdf"), pagesize=A5); c.setTitle("O Almanaque do Porto")
    frase = "O porto acordava cedo e o cheiro de corda molhada subia pelas ruas até a praça do mercado. "
    n = [0]
    def page_end():
        n[0] += 1; folio(c, n[0]); c.showPage()
    def titulo(t, key, level, closed=0):
        c.setFont("Times-Roman", 11); c.drawString(M, H - 70, t)   # mesma fonte do corpo: só o sumário do PDF diz que é título
        c.bookmarkPage(key); c.addOutlineEntry(t, key, level, closed)
        return H - 100
    # parte e capítulos
    y = titulo("Livro Primeiro", "p1", 0); paragraph(c, y, frase * 3); page_end()
    y = titulo("A chegada dos barcos", "c1", 1)
    y = paragraph(c, y, frase * 2)
    y = paragraph(c, y - 4, "O regulamento completo está em")
    c.setFont("Times-Roman", 11); c.drawString(M + 18, y, "www.exemplo.org/porto"); c.linkURL("https://www.exemplo.org/porto", (M + 16, y - 3, M + 130, y + 10)); y -= 15
    c.setFont("Times-Roman", 11); c.drawString(M + 18, y, "Veja a tabela das marés."); c.linkAbsolute("", "c2", (M + 16, y - 3, M + 140, y + 10)); y -= 15
    y = paragraph(c, y - 4, frase * 2)
    # lista com marcadores e lista numerada
    for it in ["corda de cânhamo, três braças", "lanterna de azeite com pavio novo e vidro limpo, guardada sempre na caixa seca do convés", "sal grosso"]:
        ls = lines_of(c, it, "Times-Roman", 11, W - 2 * M - 30)
        for i, ln in enumerate(ls):
            c.setFont("Times-Roman", 11)
            if i == 0: c.drawString(M + 10, y, "\u2022")
            c.drawString(M + 24, y, ln); y -= 15
    y -= 6
    for i, it in enumerate(["Amarrar a proa.", "Recolher a vela.", "Avisar o guarda."]):
        c.setFont("Times-Roman", 11); c.drawString(M, y, f"{i + 1}. {it}"); y -= 22
    page_end()
    # tabela
    y = titulo("A tabela das marés", "c2", 1)
    y = paragraph(c, y, frase * 2) - 8
    for row in [("Dia", "Maré alta", "Maré baixa"), ("Segunda", "06h10", "12h25"), ("Terça", "06h55", "13h05"), ("Quarta", "07h40", "13h50")]:
        c.setFont("Times-Roman", 11)
        for k, t in enumerate(row): c.drawString(M + k * 105, y, t)
        y -= 17
    y = paragraph(c, y - 8, frase * 2)
    # versos
    y -= 8
    for v in ["Quem parte leva o vento,", "quem fica guarda o cais,", "e a maré, sem pensamento,", "devolve o que não é mais."]:
        c.setFont("Times-Roman", 11); c.drawString(M + 40, y, v); y -= 15
    paragraph(c, y - 8, frase * 2); page_end()
    # duas colunas
    y0 = titulo("Livro Segundo", "p2", 0); paragraph(c, y0, frase * 2); page_end()
    titulo("O que dizem os velhos", "c3", 1)
    colw = (W - 2 * M - 18) / 2
    esq = "Dizem os velhos que o farol já foi mais alto e que o mar, naquele tempo, respeitava a pedra. " * 5
    dir_ = "As crianças não acreditam, mas sobem a escada toda tarde para ver se a história ainda cabe na vista. " * 5
    for k, txt in enumerate((esq, dir_)):
        y = H - 100
        for ln in lines_of(c, txt, "Times-Roman", 10, colw):
            c.setFont("Times-Roman", 10); c.drawString(M + k * (colw + 18), y, ln); y -= 13
    page_end()
    c.save()


import sys
for f in (estilos, grudado, capitulos, gibi, escaneado, erros, epub, recursos):
    if len(sys.argv) < 2 or f.__name__ in sys.argv[1:]: f()
print("fixtures em", os.path.abspath(OUT))
