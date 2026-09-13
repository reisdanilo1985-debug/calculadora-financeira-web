/**
 * Camada de DECISÃO da Tesouraria (Fase A do Treasury Engine).
 *
 * Traduz o resultado numérico de cada calculador em:
 *   - veredito executivo (frase de decisão + sinal 🟢🟡🔴/ℹ️ com critério explícito)
 *   - pontes de decisão ("o que isso muda": custo / caixa / risco / capital)
 *
 * REGRA INEGOCIÁVEL: esta camada NÃO calcula nada financeiro novo — apenas
 * lê o resultado do motor (e aritmética trivial de apresentação) e o expressa
 * na língua da decisão de capital. Determinística, sem LLM.
 *
 * Unidades: body/result chegam em FRAÇÃO decimal (como o core).
 *
 * Régua do "% do CDI": SEMPRE a convenção B3 que o motor devolve (percentual
 * sobre a taxa DI diária — pctCdi de pre-cdi/cdi-spread, pctCdiB3Comp do
 * cross-ccy, pctCdiB3 do IPCA+). A razão anual taxa ÷ CDI é aproximação e não
 * entra em frase nem em limiar de sinal.
 */

export type Sinal = 'verde' | 'amarelo' | 'vermelho' | 'info';

export type EixoPonte = 'custo' | 'caixa' | 'risco' | 'capital';

export interface Ponte {
  eixo: EixoPonte;
  texto: string;
}

export interface Veredito {
  sinal: Sinal;
  /** Frase de decisão (Nível 1). */
  frase: string;
  /** Critério explícito do sinal (aparece ao expandir). */
  criterio: string;
  pontes: Ponte[];
}

// ── Formatação pt-BR ──────────────────────────────────────────────────────────

/** Fração → "14,40%". */
const fp = (x: number, dec = 2): string =>
  isFinite(x) ? `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}%` : '—';

/** Número → "R$ 1.234,56" (compacto para milhões). */
const fm = (x: number): string => {
  if (!isFinite(x)) return '—';
  const abs = Math.abs(x);
  if (abs >= 1e6) return `R$ ${(x / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (abs >= 1e3) return `R$ ${(x / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${x.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
};

const fn = (x: number, dec = 4): string =>
  isFinite(x) ? x.toLocaleString('pt-BR', { maximumFractionDigits: dec }) : '—';

// ── Vereditos por calculador ─────────────────────────────────────────────────

type DecisorFn = (body: any, result: any) => Veredito | null;

const DECISORES: Record<string, DecisorFn> = {
  conversor: (body, r) => ({
    sinal: 'info',
    frase: `${fp(body.iaa)} a.a. equivale a ${fp(r.aoMes, 4)} ao mês e ${fp(r.aoDiaUtil, 4)} por dia útil${
      r.ponte ? ` — em base 360, ${fp(r.ponte.i360Comp)} composta / ${fp(r.ponte.i360Linear)} linear` : ''
    }.`,
    criterio: 'Conversão informativa: não há decisão embutida, apenas a mesma taxa em bases comparáveis.',
    pontes: [
      { eixo: 'custo', texto: 'Compare propostas SEMPRE na mesma base — 252 × 360 e efetiva × nominal mudam o ranking.' },
    ],
  }),

  'pre-cdi': (body, r) => {
    if (r.preAa != null) {
      return {
        sinal: 'info',
        frase: `${fn(body.pctCdi * 100, 1)}% do CDI equivale a um pré de ${fp(r.preAa)} a.a. no CDI atual (${fp(body.cdiAa)}).`,
        criterio: 'Equivalência no nível atual do CDI pela convenção B3 (o percentual incide sobre a taxa DI diária: pré = (1 + p·TDI)^252 − 1) — se o CDI mudar, o pré equivalente muda junto.',
        pontes: [
          { eixo: 'risco', texto: 'Fixar no pré equivalente trava o custo; manter % do CDI deixa o custo flutuar com a Selic.' },
        ],
      };
    }
    const acima = r.pctCdi > 1;
    return {
      sinal: 'info',
      frase: `Pré de ${fp(body.preAa)} = ${fn(r.pctCdi * 100, 1)}% do CDI — ${acima ? 'acima' : 'abaixo'} do CDI em ${fp(Math.abs(r.spreadCompSobreCdi))} (composto).`,
      criterio: 'Referência: 100% do CDI, pela convenção B3 (percentual sobre a taxa DI diária). Acima = custo maior que o CDI (caro como dívida, bom como aplicação); abaixo, o inverso.',
      pontes: [
        { eixo: 'custo', texto: 'Use o % do CDI como régua única para comparar esta taxa com suas linhas pós-fixadas.' },
      ],
    };
  },

  'cdi-spread': (body, r) => {
    if (r.totalAa != null) {
      return {
        sinal: 'info',
        frase: `${fn(body.pctCdi * 100, 1)}% do CDI equivale a CDI + ${fp(r.spreadComp)} (composto) no CDI atual.`,
        criterio: 'Equivalência válida para o nível atual do CDI, com o % do CDI pela convenção B3 (sobre a taxa DI diária) — % do CDI amplifica quando a Selic sobe.',
        pontes: [
          { eixo: 'risco', texto: 'CDI + spread mantém o adicional fixo; % do CDI aumenta o custo absoluto quando o CDI sobe.' },
        ],
      };
    }
    return {
      sinal: 'info',
      frase: `CDI + ${fp(body.spreadAa)} custa ${fp(r.totalComp)} a.a. — o mesmo que ${fn(r.pctCdiComp * 100, 1)}% do CDI hoje.`,
      criterio: 'Conversão entre convenções no CDI informado; o % do CDI segue a convenção B3 (sobre a taxa DI diária). Use a composta para contratos com capitalização diária.',
      pontes: [
        { eixo: 'custo', texto: 'Converta todas as propostas para UMA convenção antes de escolher a mais barata.' },
      ],
    };
  },

  'cross-ccy': (body, r) => {
    // Prazo usado pelo motor (B3: CDI em du/252; cupom e spread lineares em dc/360).
    const noPrazo = r.prazoDu != null && r.prazoDc != null ? ` no prazo de ${fn(r.prazoDu, 0)} du / ${fn(r.prazoDc, 0)} dc` : '';
    // Direção inversa: CDI + spread → moeda + spread equivalente.
    if (body.modo === 'cdiParaMoeda' || r.spreadEstrangeiroComp != null) {
      return {
        sinal: 'info',
        frase: `CDI + ${fp(body.spreadLocalAa)} equivale, sob hedge completo${noPrazo}, a captar em moeda + ${fp(r.spreadEstrangeiroComp)} (linear ${fp(r.spreadEstrangeiroLin)}).`,
        criterio: `Régua de negociação: qualquer proposta externa com spread ABAIXO de ${fp(r.spreadEstrangeiroComp)} bate o seu CDI + ${fp(body.spreadLocalAa)} depois do hedge. O elo é o cupom cambial (${fp(body.cupomEstrangeiroAa)}).`,
        pontes: [
          { eixo: 'custo', texto: `Use ${fp(r.spreadEstrangeiroComp)} como teto de spread ao cotar dívida externa — acima disso, o funding local é mais barato.` },
          { eixo: 'risco', texto: 'Comparação já com hedge completo embutido — sem resíduo cambial, só custo contra custo.' },
        ],
      };
    }
    // Régua B3 (percentual sobre a taxa DI diária). Sem ela não há sinal: a razão
    // anual pctCdiComp é só aproximação e não pode decidir 100%/115%.
    const pct = r.pctCdiB3Comp;
    if (typeof pct !== 'number' || !isFinite(pct)) return null;
    const sinal: Sinal = pct < 1 ? 'verde' : pct <= 1.15 ? 'amarelo' : 'vermelho';
    const acimaCdi = r.spreadSobreCdiComp >= 0;
    return {
      sinal,
      frase: `Captar a ${fp(body.spreadEstrangeiroAa)} em moeda + hedge completo sai por ${fn(pct * 100, 1)}% do CDI — ou CDI ${acimaCdi ? '+' : '−'} ${fp(Math.abs(r.spreadSobreCdiComp))} (${fp(r.preEquivComp)} a.a. pré)${noPrazo}.`,
      criterio: `Sinal: 🟢 abaixo de 100% do CDI · 🟡 até 115% · 🔴 acima — % do CDI pela convenção B3 (sobre a taxa DI diária). Spread de equilíbrio (= 100% do CDI): ${fp(r.spreadEquilibrio)} — spreads externos abaixo disso batem o funding local.`,
      pontes: [
        { eixo: 'custo', texto: `Compare CDI ${acimaCdi ? '+' : '−'} ${fp(Math.abs(r.spreadSobreCdiComp))} (= ${fn(pct * 100, 1)}% do CDI) com o custo das suas linhas locais para decidir onde captar.` },
        { eixo: 'risco', texto: 'Com o hedge completo embutido no cálculo, não sobra risco cambial — sobra só o custo.' },
      ],
    };
  },

  ipca: (body, r) => {
    if (r.breakevenInf == null) {
      return {
        sinal: 'info',
        frase: `IPCA+ ${fp(body.realAa)} com inflação de ${fp(body.ipcaAa)} equivale a ${fp(r.nominalAa)} nominal — ${fn(r.pctCdiB3 * 100, 1)}% do CDI.`,
        criterio: 'Composição de Fisher com a inflação projetada informada; % do CDI pela convenção B3 (sobre a taxa DI diária). Sem pré de mercado, não há breakeven para comparar.',
        pontes: [
          { eixo: 'custo', texto: 'Informe o pré de mercado para ver o breakeven — a inflação que iguala IPCA+ e pré.' },
        ],
      };
    }
    const ipcaGanha = r.veredito === 'IPCA+ ganha';
    return {
      sinal: 'info',
      frase: `Breakeven de inflação: ${fp(r.breakevenInf)}. Sua projeção (${fp(body.ipcaAa)}) está ${ipcaGanha ? 'ACIMA' : 'ABAIXO'} → ${
        ipcaGanha ? 'IPCA+ rende mais (como aplicação) / custa mais (como dívida)' : 'o pré rende mais (como aplicação) / custa menos (como dívida)'
      }.`,
      criterio: `Critério: inflação projetada × breakeven (${fp(r.breakevenInf)} = inflação que iguala IPCA+ ${fp(body.realAa)} ao pré ${fp(body.preMercadoAa)}).`,
      pontes: [
        { eixo: 'custo', texto: 'Como DEVEDOR: indexar ao IPCA vale a pena se você espera inflação abaixo do breakeven.' },
        { eixo: 'risco', texto: 'IPCA+ transfere o risco de inflação para o resultado — combine com receitas indexadas quando possível.' },
      ],
    };
  },

  'pu-titulos': (body, r) => {
    // Sensibilidade aproximada da LTN: D_mod = (du/252)/(1+y) — aritmética de exibição.
    if (body.tipo !== 'NTNF') {
      const dmod = body.du / 252 / (1 + body.iaa);
      return {
        sinal: 'info',
        frase: `PU de ${fn(r.pu, 2)} para ${fn(body.vn, 0)} de face — juro de ${fp(body.iaa)} pelo prazo. Cada +1 p.p. na taxa derruba o PU em ~${fn(dmod, 1)}%.`,
        criterio: 'Informativo: preço = valor presente. A sensibilidade citada é a duration modificada aproximada do zero-cupom.',
        pontes: [
          { eixo: 'caixa', texto: 'O PU é o caixa de comprar/vender hoje; segurar até o vencimento devolve a face integral.' },
          { eixo: 'risco', texto: 'Quanto maior o prazo (du), maior a oscilação do PU com a curva — risco de marcação.' },
        ],
      };
    }
    return {
      sinal: 'info',
      frase: `PU de ${fn(r.pu, 2)} — soma dos ${r.fluxos?.length ?? 0} fluxos (cupons de ${fn(r.cupomPeriodico, 2)} + face) descontados à YTM de ${fp(body.iaa)}.`,
      criterio: 'Informativo: cada cupom é descontado no próprio prazo; a YTM única resume a curva embutida no preço.',
      pontes: [
        { eixo: 'caixa', texto: 'Os cupons semestrais devolvem caixa antes do vencimento — reduzem a duration versus um zero-cupom.' },
      ],
    };
  },

  duration: (body, r) => {
    const impacto100 = r.dv01 * 100; // R$ por 100 bps (aprox. linear)
    return {
      sinal: 'info',
      frase: `DV01 de ${fm(r.dv01)}: se a curva subir 100 bps, a posição perde ~${fm(impacto100)} (${fn(r.modifiedDuration, 1)}% do valor). Duration de ${fn(r.macaulayDuration, 1)} anos.`,
      criterio: `Informativo: impacto linear por duration; para choques grandes, a convexidade ameniza a perda e amplifica o ganho.${
        r.convencao ? ` Convenção do cupom — ${r.convencao}.` : ''
      }`,
      pontes: [
        { eixo: 'risco', texto: `Este é o tamanho do seu risco de curva em R$ por bp — a régua para dimensionar hedge (DV01 exposição ÷ DV01 do contrato).` },
        { eixo: 'capital', texto: 'Posições longas de duration sofrem mais na alta de juros — case a duration do ativo com a do passivo.' },
      ],
    };
  },

  amortizacao: (body, r) => {
    const jurosAMais = r.price.totalJuros - r.sac.totalJuros;
    const alivioInicial = r.sac.parcelas[0].parcela - r.price.pmt;
    return {
      sinal: 'info',
      frase: `Mesma taxa, dois caixas: Price paga ${fm(jurosAMais)} a MAIS de juros no total; em troca, alivia a primeira parcela em ${fm(alivioInicial)} versus SAC.`,
      criterio: 'Comparativo estrutural (não há certo/errado): Price = parcela constante; SAC = amortização constante e juros decrescentes.',
      pontes: [
        { eixo: 'caixa', texto: 'Caixa apertado no início do projeto favorece Price; folga favorece SAC (menos juros totais).' },
        { eixo: 'capital', texto: 'SAC desalavanca mais rápido — o saldo devedor cai linearmente, ajudando covenants de dívida.' },
      ],
    };
  },

  swap: (body, r) => {
    const rel = body.notional ? r.mtm / body.notional : 0;
    const favoravel = r.mtm >= 0;
    return {
      sinal: favoravel ? 'verde' : 'vermelho',
      frase: `MtM de ${fm(r.mtm)} (${fp(Math.abs(rel))} do notional) ${favoravel ? 'A FAVOR de' : 'CONTRA'} quem recebe pré — a taxa travada (${fp(body.preContratada)}) está ${favoravel ? 'acima' : 'abaixo'} do mercado (${fp(body.preMercadoAa)}) para o prazo restante.`,
      criterio: 'Referência do sinal: a ponta que RECEBE pré. MtM > 0 = desmontar hoje gera caixa para essa ponta. Atenção: quitação real inclui breakage/multa além do MtM.',
      pontes: [
        { eixo: 'caixa', texto: `Desmontar hoje ${favoravel ? 'geraria' : 'consumiria'} ~${fm(Math.abs(r.mtm))} — insumo da decisão de manter, desmontar ou rolar.` },
        { eixo: 'risco', texto: 'Se o swap protege uma dívida, o MtM negativo aqui tende a ser compensado pelo custo menor da dívida — avalie o conjunto.' },
      ],
    };
  },

  'forward-ndf': (body, r) => {
    if (r.ajusteBrl != null) {
      const ganhou = r.ajusteBrl >= 0;
      return {
        sinal: ganhou ? 'verde' : 'vermelho',
        frase: `Ajuste de ${fm(r.ajusteBrl)} ${ganhou ? 'a receber' : 'a pagar'} — PTAX (${fn(body.ptaxVencimento)}) fechou ${ganhou ? 'acima' : 'abaixo'} do strike (${fn(body.kContratado)}).`,
        criterio: 'Referência: ponta COMPRADA em USD. O ajuste líquido em BRL substitui a troca de principal.',
        pontes: [
          { eixo: 'caixa', texto: 'Se a NDF protegia um passivo em dólar, este ajuste compensa a variação cambial da dívida — o resultado conjunto é o que importa.' },
        ],
      };
    }
    const carrego = r.forward / body.spot - 1;
    const carregoAa = Math.pow(1 + carrego, 252 / Math.max(body.du, 1)) - 1;
    return {
      sinal: 'info',
      frase: `Dólar a termo: ${fn(r.forward)} (spot ${fn(body.spot)} + ${fn(r.pontos, 4)} de pontos). Travar custa ${fp(carrego)} no período (~${fp(carregoAa)} a.a. de carrego).`,
      criterio: 'Informativo: o forward vem do diferencial de juros (paridade coberta) — não é previsão de câmbio.',
      pontes: [
        { eixo: 'risco', texto: 'O carrego é o preço do seguro: compare-o com o dano de uma alta do dólar sem proteção.' },
        { eixo: 'custo', texto: 'Para dívida em USD, o custo em BRL travado = taxa da dívida + este carrego.' },
      ],
    };
  },

  'tir-vpl': (body, r) => {
    const temVpl = r.vpl != null;
    const temCusto = body.custoCapital != null;

    // TIR múltipla (mais de uma troca de sinal): a TIR não é régua — decide o VPL.
    if (r.alertaTirMultipla) {
      const trocas = `${fn(r.trocasDeSinal, 0)} trocas de sinal`;
      if (temCusto && r.vplCustoCapital != null) {
        const aceitar = r.veredito === 'Aceitar';
        return {
          sinal: aceitar ? 'verde' : 'vermelho',
          frase: `TIR múltipla (${trocas}): a TIR de ${fp(r.tirAnual)} a.a. não serve de régua. Pelo VPL ao custo de capital (${fp(body.custoCapital)}), ${fm(r.vplCustoCapital)} — ${aceitar ? 'CRIA' : 'NÃO cria'} valor.`,
          criterio: 'Critério: com mais de uma troca de sinal pode haver mais de uma TIR (regra de Descartes), e comparar a TIR com o custo pode inverter a decisão. Vale o VPL ao custo de capital: acima de zero cria valor; abaixo, destrói.',
          pontes: [
            { eixo: 'capital', texto: aceitar ? 'Descontado ao custo do dinheiro, o fluxo tem valor presente positivo — a operação cria valor.' : 'Descontado ao custo do dinheiro, o fluxo tem valor presente negativo — a operação destrói valor.' },
            { eixo: 'risco', texto: 'Saídas depois de entradas (ex.: desmobilização, garantia a devolver) fazem o fluxo trocar de sinal mais de uma vez — confira o VPL em mais de uma taxa.' },
          ],
        };
      }
      return {
        sinal: 'amarelo',
        frase: `Atenção: TIR múltipla (${trocas}) — a TIR de ${fp(r.tirAnual)} a.a. é só uma das possíveis${temVpl ? `; VPL de ${fm(r.vpl)} na taxa de desconto` : ''}.`,
        criterio: 'Com mais de uma troca de sinal pode haver mais de uma TIR (regra de Descartes). Informe o custo de capital para decidir pelo VPL.',
        pontes: [
          { eixo: 'custo', texto: 'Não compare esta TIR com outras taxas: a régua é o VPL ao custo de capital.' },
        ],
      };
    }

    if (temCusto) {
      const aceitar = r.veredito === 'Aceitar';
      return {
        sinal: aceitar ? 'verde' : 'vermelho',
        frase: `TIR de ${fp(r.tirAnual)} a.a. ${aceitar ? 'SUPERA' : 'NÃO cobre'} o custo de capital (${fp(body.custoCapital)})${temVpl ? ` — VPL de ${fm(r.vpl)}` : ''}.`,
        criterio: 'Critério: TIR × custo de capital informado. TIR acima = cria valor; abaixo = destrói.',
        pontes: [
          { eixo: 'capital', texto: aceitar ? 'O retorno excede o custo do dinheiro — o projeto/operação cria valor.' : 'Rentável no papel ≠ criador de valor: abaixo do custo de capital, destrói valor.' },
          { eixo: 'custo', texto: 'Para CAPTAÇÕES, inverta a leitura: TIR é o custo efetivo all-in — quanto menor, melhor.' },
        ],
      };
    }
    return {
      sinal: 'info',
      frase: `TIR de ${fp(r.tirAnual)} a.a. (${fp(r.tirMensal, 3)} a.m.)${temVpl ? ` — VPL de ${fm(r.vpl)} na taxa de desconto` : ''}.`,
      criterio: 'Sem custo de capital informado, a TIR é apenas descritiva — informe-o para obter o veredito de aceitação.',
      pontes: [
        { eixo: 'custo', texto: 'Em comparação de dívidas, esta é a taxa efetiva REAL (com todos os fluxos) — a régua justa entre propostas.' },
      ],
    };
  },

  'us-money-market': (body, r) => {
    if (r.discountYield != null) {
      return {
        sinal: 'info',
        frase: `T-bill: discount yield de ${fp(r.discountYield)} equivale a ${fp(r.eay)} efetiva anual (EAY) — use a EAY para comparar com taxas brasileiras.`,
        criterio: 'Informativo: o desconto base 360 do T-bill NÃO é comparável diretamente ao CDI; a EAY é a ponte.',
        pontes: [
          { eixo: 'caixa', texto: 'Régua para o caixa em dólar: compare a EAY com o cupom cambial e com o custo das linhas em USD.' },
        ],
      };
    }
    if (r.allInAa != null) {
      return {
        sinal: 'info',
        frase: `SOFR + spread = ${fp(r.allInAa)} linear 360; no período rende ${fp(r.juroPeriodo)} — ${fp(r.eay)} em efetiva anual.`,
        criterio: 'Informativo: conversão da convenção money market (ACT/360 linear) para efetiva anual comparável.',
        pontes: [
          { eixo: 'custo', texto: 'Linhas 4131/SOFR: some o custo do hedge cambial para comparar com o funding local em CDI.' },
        ],
      };
    }
    const vals = [r.juros30360, r.jurosAct360, r.jurosAct365];
    const dif = Math.max(...vals) - Math.min(...vals);
    return {
      sinal: 'info',
      frase: `A MESMA taxa gera juros de ${fm(r.jurosAct360)} (ACT/360), ${fm(r.jurosAct365)} (ACT/365) e ${fm(r.juros30360)} (30/360) — diferença de ${fm(dif)} só pela convenção.`,
      criterio: 'Informativo: a convenção de contagem de dias é cláusula de contrato — e vale dinheiro.',
      pontes: [
        { eixo: 'custo', texto: 'Confira a convenção na minuta ANTES de assinar: ACT/360 rende ~1,4% a mais de juros que ACT/365.' },
      ],
    };
  },
};

/** Rótulos e cores por eixo de ponte. */
export const EIXO_LABEL: Record<EixoPonte, string> = {
  custo: 'Custo',
  caixa: 'Caixa',
  risco: 'Risco',
  capital: 'Custo de capital',
};

/**
 * Gera o veredito executivo para um resultado de calculador.
 * Retorna null se o calculador não tiver decisor (cai no modo mesa puro).
 */
export function decidir(nome: string, body: any, result: any): Veredito | null {
  const fn = DECISORES[nome];
  if (!fn || body == null || result == null) return null;
  try {
    return fn(body, result);
  } catch {
    return null; // veredito nunca pode quebrar a exibição do número
  }
}
