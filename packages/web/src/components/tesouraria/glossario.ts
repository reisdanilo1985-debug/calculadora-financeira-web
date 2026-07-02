/**
 * Glossário conceitual da Tesouraria — verbetes de 6 campos (padrão do spec):
 * assume fluência em finanças corporativas e adiciona apenas a camada de mesa,
 * sempre com a ponte para a decisão de capital.
 *
 * Estrutura: umaFrase → mesaAdiciona → comoLer → ponte → armadilha → formula.
 */

export interface Verbete {
  id: string;
  titulo: string;
  /** Definição em uma frase, assumindo domínio de finanças. */
  umaFrase: string;
  /** O que você já sabe + a nuance técnica que a mesa adiciona. */
  mesaAdiciona: string;
  /** Como ler o número / que decisão ele informa. */
  comoLer: string;
  /** O que muda: custo, caixa, risco, covenant, custo de capital. */
  ponte: string;
  /** O erro de interpretação típico de quem não é de mesa. */
  armadilha: string;
  /** Fórmula e fonte, para auditoria. */
  formula: string;
}

export const VERBETES: Record<string, Verbete> = {
  equivalencia: {
    id: 'equivalencia',
    titulo: 'Equivalência de taxas',
    umaFrase: 'A mesma taxa expressa em períodos ou bases de contagem diferentes (dia, mês, ano; 252 × 360 × 365).',
    mesaAdiciona: 'No Brasil, juros compostos em base 252 dias ÚTEIS (CDI, pré); no exterior, base 360/365 dias corridos e muitas vezes linear. Comparar taxas em bases diferentes sem converter é comparar moedas diferentes.',
    comoLer: 'Use a taxa equivalente na MESMA base para comparar propostas. 14,4% a.a. (252) não é o mesmo custo que 14,4% a.a. (360 linear).',
    ponte: 'Custo: evita fechar contrato "mais barato" que na base correta é mais caro.',
    armadilha: 'Somar ou comparar taxas nominais com efetivas, ou 252 com 360, sem conversão.',
    formula: 'fator 252: (1+i)^(du/252) · fator 360 linear: 1+i·dc/360 · equivalente: (1+i)^(fração do ano) − 1',
  },
  pctCdi: {
    id: 'pctCdi',
    titulo: '% do CDI × CDI + spread',
    umaFrase: 'Duas convenções para o mesmo pós-fixado: multiplicar o CDI (110% do CDI) ou somar um spread (CDI + 2%).',
    mesaAdiciona: 'A conversão entre elas depende do NÍVEL do CDI: 110% do CDI com CDI a 14,4% ≈ CDI + 1,52%, mas com CDI a 10% ≈ CDI + 1,05%. O "% do CDI" embute mais risco de nível de juros do que parece.',
    comoLer: 'Converta tudo para uma convenção única antes de comparar propostas. O equivalente muda quando o CDI muda.',
    ponte: 'Custo e risco: define qual proposta é realmente mais barata hoje — e qual fica mais cara se a Selic subir.',
    armadilha: 'Tratar 110% do CDI como "sempre equivalente" a CDI + X: a equivalência só vale para o nível atual do CDI.',
    formula: '(1+pré) = (1+p·CDI_efetivo) na composição diária; aproximação anual: pré ≈ p × CDI',
  },
  crossCcy: {
    id: 'crossCcy',
    titulo: 'Dívida em moeda estrangeira → % do CDI',
    umaFrase: 'O custo travável em reais de uma dívida em USD/EUR, via paridade coberta (hedge cambial completo).',
    mesaAdiciona: 'O elo é o cupom cambial (juro em dólar onshore), não a expectativa de câmbio. Se o spread externo for menor que o cupom cambial no prazo, a dívida externa hedgeada sai abaixo de 100% do CDI.',
    comoLer: 'Compare o "% do CDI equivalente" com o custo das suas linhas locais. Abaixo do seu funding local = vale considerar; acima = o exterior não compensa depois do hedge.',
    ponte: 'Custo: decide entre captar fora + hedge ou captar localmente. Risco: com hedge completo, some o risco cambial, sobra o custo.',
    armadilha: 'Comparar a taxa externa "seca" (ex.: SOFR + 2%) com o CDI sem somar o custo do hedge — o câmbio a termo come a diferença.',
    formula: '(1+CDI) = (1+Δcâmbio)·(1+cupom) → %CDI = [(1+ΔFX)·(1+spread) − 1] / CDI',
  },
  ipcaMais: {
    id: 'ipcaMais',
    titulo: 'IPCA+ (juro real) e breakeven',
    umaFrase: 'Taxa real + inflação projetada = taxa nominal (Fisher); o breakeven é a inflação que iguala IPCA+ ao pré.',
    mesaAdiciona: 'Dívida/aplicação IPCA+ só é mais barata/rentável que o pré se a inflação REALIZADA ficar abaixo/acima do breakeven. O breakeven do mercado (pré − real) é a régua, não o Focus.',
    comoLer: 'Inflação esperada acima do breakeven → IPCA+ tende a custar mais caro que o pré (como dívida) e render mais (como aplicação).',
    ponte: 'Custo e risco: define se você indexa dívida ao IPCA ou trava no pré; mede quanto de inflação você está "comprando".',
    armadilha: 'Comparar IPCA+ 7% com pré 14% diretamente: falta compor a inflação — (1,07)·(1+IPCA) − 1.',
    formula: 'Fisher: (1+nominal) = (1+real)·(1+inflação) · breakeven = (1+pré)/(1+real) − 1',
  },
  puTitulos: {
    id: 'puTitulos',
    titulo: 'PU (preço unitário) de títulos',
    umaFrase: 'O valor presente dos fluxos do título descontados à taxa de mercado — preço e taxa são o mesmo número em roupas diferentes.',
    mesaAdiciona: 'Base 252: PU = VN/(1+y)^(du/252). Taxa sobe → PU cai. Na NTN-F, cada cupom semestral é descontado no seu próprio prazo — o PU embute a curva inteira, não uma taxa só.',
    comoLer: 'O PU diz quanto você paga/recebe HOJE por um fluxo futuro. Compare o PU de mercado com o seu preço de carrego para decidir vender ou levar a vencimento.',
    ponte: 'Caixa e risco: é o valor de saída da posição hoje; a sensibilidade do PU à taxa é a duration.',
    armadilha: 'Achar que título "caiu" deu prejuízo realizado: a perda só se realiza se vender antes do vencimento.',
    formula: 'LTN: PU = VN/(1+y)^(du/252) · NTN-F: PU = Σ cupom_i/(1+y)^(du_i/252) + (cupom+VN)/(1+y)^(du_n/252)',
  },
  duration: {
    id: 'duration',
    titulo: 'Duration, DV01 e convexidade',
    umaFrase: 'Sensibilidade do valor da posição à taxa de juros: prazo médio ponderado (Macaulay) e variação % por variação de taxa (modificada).',
    mesaAdiciona: 'DV01 = quanto a posição perde/ganha em R$ por 1 bp de movimento. Convexidade corrige a linearidade em choques grandes. Dívida 100% CDI tem duration de taxa ≈ zero (reseta), mas mantém spread duration até o vencimento.',
    comoLer: 'DV01 × choque em bps ≈ impacto econômico em R$. Duration 4 = curva +100 bps ⇒ valor cai ~4%.',
    ponte: 'Risco e hedge: dimensiona quanto de proteção comprar (Qtd = DV01_exposição/DV01_contrato) e o impacto de cenários de curva no resultado.',
    armadilha: 'Ler "duration baixa" de carteira pós-fixada como "sem risco de juros": o risco de refinanciamento e o spread continuam lá.',
    formula: 'Macaulay: Σ t·VP(CF)/ΣVP(CF) · Modificada: D/(1+y) · DV01: P·D_mod·0,0001 · ΔP/P ≈ −D_mod·Δy + ½·C·Δy²',
  },
  amortizacao: {
    id: 'amortizacao',
    titulo: 'Price × SAC',
    umaFrase: 'Duas formas de devolver o mesmo principal: parcela constante (Price) ou amortização constante (SAC).',
    mesaAdiciona: 'Price começa com parcela menor mas amortiza devagar → paga mais juros no total. SAC começa com parcela maior e cai ao longo do tempo → menos juros totais. A taxa é a MESMA; muda o timing do caixa.',
    comoLer: 'Escolha pela restrição de caixa: Price alivia o começo; SAC minimiza o custo total de juros e desalavanca mais rápido.',
    ponte: 'Caixa e covenant: Price preserva caixa no curto prazo (bom p/ DSCR apertado no início); SAC reduz saldo devedor mais rápido (bom p/ alavancagem).',
    armadilha: 'Comparar financiamentos pela parcela inicial: parcela menor ≠ mais barato — é só juros pagos por mais tempo.',
    formula: 'Price: PMT = PV·i/(1−(1+i)^−n) · SAC: amortização = PV/n, juros sobre saldo',
  },
  swapMtm: {
    id: 'swapMtm',
    titulo: 'Swap CDI × pré e marcação a mercado',
    umaFrase: 'O valor de saída do swap hoje: o PV do que você recebe menos o PV do que você paga, à curva atual.',
    mesaAdiciona: 'MtM ≠ desembolso de quitação (que tem breakage/multa à parte). O MtM nasce de projetar a perna CDI pela curva DI e descontar as duas pernas na curva de hoje. Quem recebe pré ganha quando a taxa CAI.',
    comoLer: 'MtM positivo = a taxa que você travou está melhor que a de mercado → desmontar hoje geraria caixa. Negativo = você travaria hoje em condição melhor.',
    ponte: 'Caixa e risco: insumo direto da decisão de manter, desmontar ou rolar o hedge; mede o custo de estar preso à taxa antiga.',
    armadilha: 'Ler MtM negativo como "o hedge deu errado": o swap pode estar cumprindo exatamente o papel de travar o custo — o ganho está do outro lado (na dívida).',
    formula: 'MtM = PV_recebe − PV_paga · perna pré: N·(1+K)^(duTotal/252)/(1+y_mkt)^(duRem/252) · perna CDI: N·fator_CDI_acum',
  },
  forward: {
    id: 'forward',
    titulo: 'Câmbio a termo (forward/NDF)',
    umaFrase: 'O câmbio futuro que elimina arbitragem entre aplicar em reais e aplicar em dólar — não é previsão de câmbio.',
    mesaAdiciona: 'Forward = spot × (fator BRL / fator USD). O "custo do hedge" é o carrego (forward/spot − 1), governado pelo diferencial de juros (cupom cambial), não pela expectativa do mercado sobre o dólar.',
    comoLer: 'Pontos positivos (forward > spot) = proteger custa carrego; compare o carrego anualizado com o risco que você elimina.',
    ponte: 'Custo e risco: precifica o seguro cambial da dívida/receita em moeda; a NDF liquida só a diferença (PTAX − strike)·notional, sem troca de principal.',
    armadilha: 'Recusar hedge porque o forward está "acima do spot": isso é matemática de juros, não opinião de mercado — esperar "melhorar" é ficar vendido em dólar.',
    formula: 'F = S·(1+i_BR)^(du/252)/(1+cupom)^(dc/360) · ajuste NDF = (PTAX − K)·notional',
  },
  tirVpl: {
    id: 'tirVpl',
    titulo: 'TIR e VPL de fluxos datados',
    umaFrase: 'VPL: quanto o projeto/operação vale hoje descontado ao custo de capital. TIR: a taxa que zera esse valor.',
    mesaAdiciona: 'Com datas reais (XIRR/XNPV), cada fluxo pesa pelo prazo exato — juros contam por dia, não por "períodos". Na comparação de dívidas, a TIR all-in (com IOF, tarifas, deságio) é o custo efetivo real.',
    comoLer: 'VPL > 0 ao seu custo de capital = cria valor. TIR de captação < seu custo alternativo de funding = proposta competitiva.',
    ponte: 'Custo de capital: é a régua única para comparar propostas com fluxos e prazos diferentes — não a taxa de etiqueta, nem a parcela.',
    armadilha: 'Comparar propostas pela taxa nominal do contrato: IOF, tarifas e carências mudam a TIR efetiva — às vezes invertem o ranking.',
    formula: 'XNPV = Σ CF_i/(1+r)^(Δdias_i/365) · XIRR: r tal que XNPV = 0',
  },
  usMm: {
    id: 'usMm',
    titulo: 'Money market americano (T-bill, SOFR)',
    umaFrase: 'Instrumentos de curto prazo em USD cotados em bases próprias: desconto bancário (T-bill) e juros simples ACT/360 (SOFR).',
    mesaAdiciona: 'O "discount yield" do T-bill NÃO é comparável ao CDI: é desconto sobre o valor de face, base 360. Converta para BEY/EAY (efetiva anual) antes de comparar com qualquer taxa brasileira.',
    comoLer: 'Use a EAY (efetiva anual) como ponte para comparar aplicações em dólar com o custo/rendimento local.',
    ponte: 'Custo e caixa: define onde aplicar o caixa em moeda e compara linhas 4131/SOFR com funding local.',
    armadilha: 'Comparar discount yield de 4,3% com CDI de 14,4% sem converter base e regime — a diferença real é outra.',
    formula: 'discount: (F−P)/F·360/d · BEY: (F−P)/P·365/d · EAY: (1+i·d/360)^(365/d) − 1',
  },
};

/** Mapeia cada calculador ao verbete principal. */
export const VERBETE_POR_CALC: Record<string, string> = {
  conversor: 'equivalencia',
  'pre-cdi': 'pctCdi',
  'cdi-spread': 'pctCdi',
  'cross-ccy': 'crossCcy',
  ipca: 'ipcaMais',
  'pu-titulos': 'puTitulos',
  duration: 'duration',
  amortizacao: 'amortizacao',
  swap: 'swapMtm',
  'forward-ndf': 'forward',
  'tir-vpl': 'tirVpl',
  'us-money-market': 'usMm',
};
