// Textos dos PDFs de teste "de verdade" (tests/corpus) e do livro de exemplo do site.
// Todos escritos para o Lombada: podem ficar num repositório público.
// Cada texto é uma lista de blocos: { h1 }, { h2 }, { p }, { cena }, { ul: [...] }, { ol: [...] }, { tabela: [[...]] }, { poema: [[versos], ...] }, { link: [texto, url] }

export const farol = {
  titulo: "O Farol Apagado",
  autor: "Helena Vasconcelos",
  // página de créditos com ficha catalográfica (só no livro de exemplo), como num livro publicado no Brasil
  ficha: [
    "Copyright © 2026 Helena Vasconcelos",
    "Revisão: Marta Quintela",
    "Capa: Estúdio Ventania",
    "Todos os direitos desta edição reservados à Editora Maré Alta Ltda.",
    "Rua das Gaivotas, 120 — Florianópolis, SC",
    "Dados Internacionais de Catalogação na Publicação (CIP)",
    "V331f Vasconcelos, Helena",
    "O farol apagado / Helena Vasconcelos. – 1. ed. – Florianópolis : Editora Maré Alta, 2026.",
    "96 p.",
    "ISBN 978-65-00-99876-4",
    "1. Ficção brasileira. 2. Romance. I. Título.",
    "CDD B869.3"
  ],
  blocos: [
    { h1: "Capítulo 1 — A ilha" },
    { p: "A ilha de Ponta Seca tinha trinta e duas casas, uma igreja sem sino e um farol que ninguém lembrava de ter visto aceso. Os pescadores contavam que a luz se apagara numa noite de março, muitos anos antes, e que desde então os barcos voltavam guiados pelo cheiro do pão que a padaria do porto começava a assar às quatro da manhã." },
    { p: "Teodora chegou num sábado de chuva fina, com uma mala de couro, um caderno de capa verde e a nomeação assinada pela Capitania. Era a nova faroleira. O barqueiro que a trouxe não fez perguntas, mas olhou para a torre branca no alto do morro como quem olha para um parente doente." },
    { p: "— A senhora vai morar lá em cima? — perguntou a menina que vendia mexilhões no cais." },
    { p: "— Vou acender aquilo — respondeu Teodora, e a menina riu tanto que derrubou o balde." },
    { cena: true },
    { p: "Naquela noite, a faroleira subiu os cento e doze degraus da torre contando em voz alta, como a mãe lhe ensinara a fazer nas escadas da escola. No topo, encontrou a lâmpada coberta por um lençol, um calendário de 1987 e um bilhete preso com um prego: <i>não adianta</i>." },
    { h1: "Capítulo 2 — O caderno verde" },
    { p: "Durante a primeira semana, Teodora anotou tudo. Anotou a direção dos ventos, a hora em que as gaivotas desciam para o porto e a cor da água às cinco da tarde. Anotou também os nomes das pessoas que a cumprimentavam e, numa coluna separada, os nomes das que fingiam não vê-la." },
    { p: "A lâmpada estava inteira. O mecanismo de rotação girava com um empurrão. Faltava apenas a corrente elétrica, que vinha do continente por um cabo submarino e que, segundo a companhia, chegava à ilha sem nenhum problema. O problema, concluiu Teodora depois de dez dias, era outro: alguém desligava o disjuntor da torre toda noite, às onze em ponto." },
    { p: "Ela passou a esperar ao lado do quadro de luz, com uma lanterna apagada e o caderno aberto no colo. Na terceira noite, ouviu passos na escada." },
    { h1: "Capítulo 3 — O guardião" },
    { p: "Era o velho Anselmo, o padeiro. Subia devagar, apoiado no corrimão, e não se assustou ao vê-la. Sentou-se num degrau, recuperou o fôlego e explicou, sem pressa, que o farol de Ponta Seca não podia acender." },
    { p: "— Quando a luz gira — disse ele —, os barcos de fora enxergam a ilha. Vêm os compradores, vêm as empresas, vem gente querendo comprar as casas da beira. Apagado, ninguém sabe que estamos aqui. Os nossos voltam pelo cheiro do pão. Sempre voltaram." },
    { p: "Teodora pensou na menina do cais, nos barcos pequenos sem rádio, nas noites de nevoeiro em que o cheiro do pão não atravessaria nem a primeira arrebentação. Pensou também no bilhete preso com um prego, e entendeu de quem era a letra." },
    { h1: "Capítulo 4 — A luz" },
    { p: "O acordo foi feito na padaria, numa mesa de fórmica, diante de toda a ilha. O farol acenderia apenas nas noites de nevoeiro e nas noites em que algum barco da ilha não tivesse voltado até as dez. Nas outras, ficaria apagado, como sempre esteve." },
    { p: "Na primeira noite de nevoeiro, Teodora ligou o disjuntor às sete e meia. A luz girou sobre o mar, lenta, branca, e os quatro barcos que estavam fora voltaram em fila, um atrás do outro. Anselmo ficou no cais até o último amarrar a corda. Depois foi para a padaria, acendeu o forno e começou a sovar a massa, porque o cheiro do pão, disse ele, também é uma espécie de farol." }
  ]
};

export const bicicleta = {
  titulo: "Guia de Manutenção da Bicicleta",
  autor: "Coletivo Pedal Livre",
  blocos: [
    { h1: "1. Antes de começar" },
    { p: "Este guia cobre a manutenção que qualquer pessoa consegue fazer em casa, com ferramentas simples. Para trocar o movimento central ou alinhar um aro empenado, procure uma oficina." },
    { h2: "Ferramentas básicas" },
    { ul: ["chave Allen de 4, 5 e 6 milímetros", "espátulas plásticas para tirar o pneu", "bomba de ar com manômetro", "óleo próprio para corrente e um pano limpo"] },
    { h2: "Calibragem dos pneus" },
    { p: "A pressão certa vem escrita na lateral do pneu. Pneus murchos gastam mais rápido e furam com facilidade; cheios demais, perdem aderência na chuva. A tabela abaixo mostra valores de referência." },
    { tabela: [["Tipo de bicicleta", "Pressão mínima", "Pressão máxima"], ["Urbana", "40 psi", "65 psi"], ["Mountain bike", "25 psi", "35 psi"], ["Speed", "80 psi", "110 psi"]] },
    { h1: "2. A corrente" },
    { p: "Uma corrente limpa e lubrificada deixa a pedalada leve e faz as marchas trocarem sem barulho. Faça a limpeza a cada duzentos quilômetros, ou depois de pedalar na chuva." },
    { h2: "Passo a passo" },
    { ol: ["Coloque a bicicleta de cabeça para baixo, apoiada no selim e no guidão.", "Gire o pedal para trás enquanto segura o pano em volta da corrente.", "Pingue uma gota de óleo em cada elo, sem exagerar.", "Gire o pedal mais vinte vezes e tire o excesso com o pano seco."] },
    { p: "O manual completo, com fotos, está em", link: ["www.pedallivre.org/corrente", "https://www.pedallivre.org/corrente"] },
    { h1: "3. Freios" },
    { p: "Freio que range nem sempre está gasto: muitas vezes a sapata está apenas suja. Limpe o aro com álcool e confira se a sapata toca o aro por inteiro, sem encostar no pneu." },
    { p: "Troque a sapata quando os sulcos desaparecerem. Freio a disco pede cuidado extra: nunca encoste os dedos no disco, porque a gordura da pele diminui a frenagem." }
  ]
};

export const poemas = {
  titulo: "Cadernos do Litoral",
  autor: "Rui Amaral",
  blocos: [
    { h1: "Maré baixa" },
    { poema: [["Quando a maré se recolhe,", "a praia mostra o que guarda:", "conchas, cordas, um chinelo,", "a âncora de uma barca."], ["Ninguém reclama o que é seu,", "ninguém pergunta de quem;", "o mar devolve sem pressa", "e leva de volta também."]] },
    { h1: "Inventário" },
    { poema: [["Tenho uma rede remendada,", "um rádio que pega mal,", "três cadeiras na varanda", "e a vista do canal."], ["Tenho a hora do café,", "o nome de cada vento,", "e uma saudade comprida", "que não cabe no inventário."]] },
    { h1: "Nota do autor" },
    { p: "Estes poemas foram escritos ao longo de um inverno numa vila de pescadores. Nenhum deles tem data: a maré não ajudava a contar os dias." }
  ]
};

export const revista = {
  titulo: "Revista da Vila",
  autor: "Redação",
  blocos: [
    { h1: "A feira que voltou para a praça" },
    { colunas: [
      "Depois de quatro anos funcionando no estacionamento do mercado, a feira de domingo voltou para a praça da matriz. A mudança foi decidida em assembleia, com cento e quarenta votos a favor e onze contra, e levou três meses para sair do papel.",
      "Os feirantes mais antigos dizem que a praça devolveu à feira o que o estacionamento tinha tirado: a sombra das árvores, o banco onde os aposentados jogam dominó e o movimento de quem sai da missa das nove.",
      "Nem tudo foi fácil. As barracas precisaram de toldos novos, porque a praça não tem cobertura, e a prefeitura instalou duas torneiras para a limpeza no fim do dia. O custo foi dividido entre os feirantes e a associação de moradores.",
      "Para a próxima temporada, a associação quer criar um espaço para os produtores da serra, que hoje vendem só na estrada. A proposta será votada na assembleia de abril, que fica aberta a qualquer morador da vila."
    ] }
  ]
};

export const apostila = {
  titulo: "Programação para Iniciantes",
  autor: "Oficina de Código da Vila",
  blocos: [
    { h1: "Aula 3 — Repetições" },
    { p: "Quando a mesma tarefa precisa ser feita várias vezes, o programa usa uma repetição. O exemplo abaixo soma os preços de uma lista de compras e avisa quando o total passa do orçamento." },
    { codigo: ["def total_da_compra(precos, orcamento):", "    total = 0", "    for preco in precos:", "        total = total + preco", "        if total > orcamento:", "            print(\"Passou do orçamento!\")", "    return total"] },
    { p: "Repare que as linhas de dentro da repetição ficam mais para a direita. Em Python, esse recuo não é enfeite: é ele que diz ao computador quais linhas pertencem à repetição." },
    { h2: "Exercício" },
    { p: "Mude o programa para contar quantos itens custam mais de dez reais. Dica: crie uma variável chamada contador antes da repetição." }
  ]
};
