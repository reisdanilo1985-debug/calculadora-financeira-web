/**
 * Motor de Simulação de Aposentadoria — Retirement Architect
 *
 * Metodologia:
 *   - Monte Carlo com distribuição log-normal para retornos reais
 *   - Gastos decrescentes com a idade (dados IBGE/BLS)
 *   - Sistema previdenciário brasileiro (INSS, PGBL, VGBL)
 *   - Tributação regressiva/progressiva de previdência privada
 *   - Inflação médica separada (IPCA + delta)
 *
 * Referências:
 *   - EC 103/2019 (Reforma da Previdência)
 *   - Tabela regressiva IR Previdência (Lei 11.053/2004)
 *   - Tábua de mortalidade IBGE 2024
 */

// ── Interfaces de Input ──────────────────────────────────────────────────────

export type PerfilRisco = 'conservador' | 'moderado' | 'agressivo';
export type TabelaPGBL = 'regressiva' | 'progressiva';
export type Genero = 'M' | 'F';

export interface RetirementInput {
  // Dados pessoais
  idadeAtual: number;
  idadeAposentadoria: number;
  expectativaVida: number;        // padrão: 90
  genero: Genero;

  // Patrimônio atual (R$)
  patrimonioTributavel: number;   // CDB, Tesouro, ações, FIIs, LCI/LCA
  saldoPGBL: number;
  saldoVGBL: number;
  rendaAluguel: number;           // R$/mês (renda de imóveis — isenta IR pessoa física)

  // Aportes mensais (R$)
  aporteMensal: number;           // aportes gerais (tributável)
  aportePGBL: number;             // máx 12% renda bruta
  aporteVGBL: number;

  // INSS
  incluirINSS: boolean;
  salarioContribuicao: number;    // R$/mês — para estimar benefício
  tempoContribuicaoAnos: number;  // anos completos já contribuídos

  // Gastos desejados na aposentadoria
  gastoMensalDesejado: number;    // R$ de hoje (será corrigido por IPCA)
  incluirInflacaoMedica: boolean; // plano de saúde: IPCA + 3% a.a.
  gastoMensalSaude: number;       // R$/mês separado para saúde

  // Premissas de mercado
  perfilRisco: PerfilRisco;
  ipcaMeta: number;               // % a.a., padrão: 3.5
  tabelaPGBL: TabelaPGBL;

  // Simulação
  numeroSimulacoes: number;       // padrão: 1000
}

// ── Interfaces de Output ─────────────────────────────────────────────────────

export interface RetirementYearRow {
  ano: number;
  idade: number;
  patrimonioInicio: number;
  aportesAno: number;
  retornoNominal: number;
  gastoAno: number;
  beneficioINSS: number;
  rendaAluguel: number;
  patrimonioFim: number;
  taxaRetirada: number;           // %
  esgotado: boolean;
}

export interface RetirementMemorialStep {
  titulo: string;
  formula: string;
  formulaComValores: string;
  resultado: number;
  unidade: string;
  descricao: string;
}

export interface RetirementAlert {
  tipo: 'danger' | 'warning' | 'info';
  mensagem: string;
}

export interface RetirementResult {
  // Probabilidade de sucesso
  probabilidadeSucesso: number;   // % das simulações que não zeraram

  // Distribuição de saldos ao final
  saldoFinalP5: number;
  saldoFinalP50: number;
  saldoFinalP95: number;

  // Renda
  beneficioINSSMensal: number;    // estimativa R$/mês
  rendaPatrimonioMensal: number;  // renda gerada pelo patrimônio (P50)
  rendaTotalMensal: number;       // INSS + aluguel + patrimônio

  // Sustentabilidade
  anoEsgotamentoP5: number | null;   // null = nunca esgota no P5
  anoEsgotamentoP50: number | null;
  taxaRetiradaInicial: number;       // % do patrimônio no ano 1

  // Acumulação
  patrimonioAcumuladoAposentadoria: number; // saldo estimado na data de aposentadoria
  totalAportado: number;
  totalRendimento: number;

  // Detalhes
  projecaoAnualP50: RetirementYearRow[];
  memorial: RetirementMemorialStep[];
  alertas: RetirementAlert[];
}

// ── Perfis de Risco Calibrados para Brasil ───────────────────────────────────

export const PERFIS_RISCO: Record<PerfilRisco, {
  retornoRealAnual: number;
  volatilidade: number;
  descricao: string;
}> = {
  conservador: {
    retornoRealAnual: 5.0,
    volatilidade: 5.0,
    descricao: 'Tesouro IPCA+ + CDB + LCI/LCA (80% renda fixa)',
  },
  moderado: {
    retornoRealAnual: 6.5,
    volatilidade: 11.0,
    descricao: 'Balanceado: 50% renda fixa + 50% ações/FIIs',
  },
  agressivo: {
    retornoRealAnual: 8.0,
    volatilidade: 17.0,
    descricao: '80% renda variável (ações BR + BDRs internacionais)',
  },
};

// ── Teto INSS 2025 ───────────────────────────────────────────────────────────
const TETO_INSS_MENSAL = 7786.02;
const SALARIO_MINIMO = 1412.00;

// ── Funções auxiliares ───────────────────────────────────────────────────────

/**
 * Fator de redução de gastos com a idade (baseado em padrões IBGE/BLS).
 * Gastos caem progressivamente após os 65 anos.
 */
function fatorReducaoGastos(idade: number): number {
  if (idade < 65) return 1.00;
  if (idade < 75) return 0.90;  // -10% entre 65-74
  if (idade < 85) return 0.75;  // -25% entre 75-84
  return 0.62;                   // -38% aos 85+
}

/**
 * Estima o benefício INSS com base nas regras pós-EC 103/2019.
 * Usa a regra de pontuação (97H / 87M em 2024, +1 por ano até 2031-2027).
 */
export function calcularBeneficioINSS(
  genero: Genero,
  idadeAposentadoria: number,
  tempoContribuicaoAnos: number,
  salarioContribuicaoMensal: number,
): { beneficio: number; regra: string; alertas: string[] } {
  const alertas: string[] = [];

  // Regras de elegibilidade (simplificadas para 2025)
  const idadeMinima = genero === 'M' ? 65 : 62;
  const pontuacaoNecessaria = genero === 'M' ? 100 : 90; // 2025
  const pontuacaoAtingida = idadeAposentadoria + tempoContribuicaoAnos;
  const tempoMinimo = genero === 'M' ? 20 : 15;

  if (idadeAposentadoria < idadeMinima) {
    alertas.push(`Idade mínima para aposentadoria por idade: ${idadeMinima} anos. Considere aposentar mais tarde ou verifique regras de transição.`);
  }

  if (tempoContribuicaoAnos < tempoMinimo) {
    alertas.push(`Tempo mínimo de contribuição: ${tempoMinimo} anos. Atual: ${tempoContribuicaoAnos} anos.`);
    return { beneficio: 0, regra: 'Sem direito ao benefício', alertas };
  }

  // Salário de benefício: média dos salários de contribuição
  const salarioBeneficio = Math.min(salarioContribuicaoMensal, TETO_INSS_MENSAL);

  // Alíquota progressiva sobre o salário de benefício
  let beneficioBase: number;
  if (salarioBeneficio <= 2 * SALARIO_MINIMO) {
    beneficioBase = salarioBeneficio * 0.70;
  } else if (salarioBeneficio <= 5 * SALARIO_MINIMO) {
    beneficioBase = salarioBeneficio * 0.60;
  } else {
    beneficioBase = salarioBeneficio * 0.50;
  }

  // Acréscimo por tempo extra de contribuição
  const anosExtras = Math.max(0, tempoContribuicaoAnos - tempoMinimo);
  const acrescimo = anosExtras * 0.02; // 2% por ano adicional
  const fatorTotal = Math.min(1.0, 0.70 + acrescimo);
  beneficioBase = salarioBeneficio * fatorTotal;

  // Mínimo = 1 salário mínimo
  const beneficio = Math.max(SALARIO_MINIMO, Math.min(beneficioBase, TETO_INSS_MENSAL));

  const regra = pontuacaoAtingida >= pontuacaoNecessaria
    ? `Regra de pontos (${pontuacaoAtingida}/${pontuacaoNecessaria})`
    : `Aposentadoria por idade (${idadeAposentadoria}/${idadeMinima} anos)`;

  return { beneficio, regra, alertas };
}

/**
 * Retorno anual aleatório com distribuição log-normal (Monte Carlo).
 */
function retornoAleatorio(retornoRealMedio: number, volatilidade: number): number {
  // Box-Muller transform para distribuição normal
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  // Log-normal: evita retornos negativos abaixo de -100%
  const mu = Math.log(1 + retornoRealMedio / 100) - 0.5 * Math.pow(volatilidade / 100, 2);
  const sigma = volatilidade / 100;
  return Math.exp(mu + sigma * z) - 1;
}

/**
 * Patrimônio projetado até a data de aposentadoria.
 */
function projetarAcumulacao(
  patrimonioInicial: number,
  aporteMensalTotal: number,
  anosAteAposentadoria: number,
  retornoRealAnual: number,
): number {
  const retornoMensal = Math.pow(1 + retornoRealAnual / 100, 1 / 12) - 1;
  let saldo = patrimonioInicial;
  for (let m = 0; m < anosAteAposentadoria * 12; m++) {
    saldo = saldo * (1 + retornoMensal) + aporteMensalTotal;
  }
  return saldo;
}

// ── Função principal ─────────────────────────────────────────────────────────

/**
 * Simula o plano de aposentadoria usando Monte Carlo.
 * Retorna probabilidade de sucesso, distribuição de saldos e projeção detalhada.
 */
export function simularAposentadoria(input: RetirementInput): RetirementResult {
  const perfil = PERFIS_RISCO[input.perfilRisco];
  const anosAcumulacao = Math.max(0, input.idadeAposentadoria - input.idadeAtual);
  const anosDistribuicao = Math.max(1, input.expectativaVida - input.idadeAposentadoria);
  const aporteMensalTotal = input.aporteMensal + input.aportePGBL + input.aporteVGBL;
  const patrimonioTotal = input.patrimonioTributavel + input.saldoPGBL + input.saldoVGBL;

  // Estimativa do benefício INSS
  const inssResult = input.incluirINSS
    ? calcularBeneficioINSS(
        input.genero,
        input.idadeAposentadoria,
        input.tempoContribuicaoAnos + anosAcumulacao,
        input.salarioContribuicao,
      )
    : { beneficio: 0, regra: 'INSS não considerado', alertas: [] };

  const beneficioINSSMensal = inssResult.beneficio;
  const rendaAluguelMensal = input.rendaAluguel;

  // Patrimônio estimado na aposentadoria (fase acumulação)
  const patrimonioNaAposentadoria = projetarAcumulacao(
    patrimonioTotal,
    aporteMensalTotal,
    anosAcumulacao,
    perfil.retornoRealAnual,
  );

  // Gastos anuais na aposentadoria (em R$ reais — não monetário)
  const gastoBaseAnual = input.gastoMensalDesejado * 12;
  const gastoSaudeBaseAnual = input.incluirInflacaoMedica ? input.gastoMensalSaude * 12 : 0;

  // Renda passiva anual (INSS + aluguel)
  const rendaPassivaAnual = (beneficioINSSMensal + rendaAluguelMensal) * 12;

  // Necessidade líquida do patrimônio
  const necessidadeLiquidaAnual = Math.max(0, gastoBaseAnual + gastoSaudeBaseAnual - rendaPassivaAnual);
  const taxaRetiradaInicial = patrimonioNaAposentadoria > 0
    ? (necessidadeLiquidaAnual / patrimonioNaAposentadoria) * 100
    : 0;

  // ── Monte Carlo ────────────────────────────────────────────────────────────
  const N = input.numeroSimulacoes;
  const saldosFinais: number[] = [];
  let simulacoesSucesso = 0;
  const anosEsgotamento: number[] = [];

  for (let sim = 0; sim < N; sim++) {
    let saldo = patrimonioNaAposentadoria;
    let esgotadoNoAno = -1;

    for (let ano = 0; ano < anosDistribuicao; ano++) {
      const idadeNoAno = input.idadeAposentadoria + ano;
      const fatorGasto = fatorReducaoGastos(idadeNoAno);

      // Gasto geral reduzido com a idade
      const gastoGeral = gastoBaseAnual * fatorGasto;

      // Gasto com saúde: cresce IPCA + 3% ao ano (independente)
      const gastoSaude = gastoSaudeBaseAnual * Math.pow(1.03, ano);

      // Necessidade líquida (já descontada renda passiva)
      const necessidade = Math.max(0, gastoGeral + gastoSaude - rendaPassivaAnual);

      // Retorno real do patrimônio
      const retorno = retornoAleatorio(perfil.retornoRealAnual, perfil.volatilidade);
      saldo = saldo * (1 + retorno) - necessidade;

      if (saldo <= 0 && esgotadoNoAno === -1) {
        esgotadoNoAno = input.idadeAposentadoria + ano;
        saldo = 0;
        break;
      }
    }

    saldosFinais.push(saldo);

    if (esgotadoNoAno === -1) {
      simulacoesSucesso++;
    } else {
      anosEsgotamento.push(esgotadoNoAno);
    }
  }

  // Ordenar saldos para percentis
  const saldosOrdenados = [...saldosFinais].sort((a, b) => a - b);
  const p5 = saldosOrdenados[Math.floor(N * 0.05)];
  const p50 = saldosOrdenados[Math.floor(N * 0.50)];
  const p95 = saldosOrdenados[Math.floor(N * 0.95)];

  const anosEsgotamentoOrdenados = anosEsgotamento.length > 0
    ? [...anosEsgotamento].sort((a, b) => a - b)
    : null;

  const anoEsgotamentoP5 = anosEsgotamentoOrdenados
    ? anosEsgotamentoOrdenados[Math.floor(anosEsgotamentoOrdenados.length * 0.05)] ?? null
    : null;
  const anoEsgotamentoP50 = anosEsgotamentoOrdenados
    ? anosEsgotamentoOrdenados[Math.floor(anosEsgotamentoOrdenados.length * 0.50)] ?? null
    : null;

  // ── Projeção determinística P50 (para tabela) ──────────────────────────────
  const projecaoAnualP50: RetirementYearRow[] = [];
  let saldoP50 = patrimonioNaAposentadoria;
  const retornoP50 = perfil.retornoRealAnual / 100;

  for (let ano = 0; ano < anosDistribuicao; ano++) {
    const idadeNoAno = input.idadeAposentadoria + ano;
    const fatorGasto = fatorReducaoGastos(idadeNoAno);
    const gastoGeral = gastoBaseAnual * fatorGasto;
    const gastoSaude = gastoSaudeBaseAnual * Math.pow(1.03, ano);
    const gastoTotal = gastoGeral + gastoSaude;
    const rendaPassiva = rendaPassivaAnual;
    const necessidade = Math.max(0, gastoTotal - rendaPassiva);

    const retornoNominal = saldoP50 * retornoP50;
    const patrimonioFim = Math.max(0, saldoP50 + retornoNominal - necessidade);

    projecaoAnualP50.push({
      ano: new Date().getFullYear() + anosAcumulacao + ano,
      idade: idadeNoAno,
      patrimonioInicio: saldoP50,
      aportesAno: 0,
      retornoNominal,
      gastoAno: gastoTotal,
      beneficioINSS: beneficioINSSMensal * 12,
      rendaAluguel: rendaAluguelMensal * 12,
      patrimonioFim,
      taxaRetirada: saldoP50 > 0 ? (necessidade / saldoP50) * 100 : 0,
      esgotado: patrimonioFim <= 0,
    });

    saldoP50 = patrimonioFim;
    if (saldoP50 <= 0) break;
  }

  // ── Memorial de cálculo ────────────────────────────────────────────────────
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const memorial: RetirementMemorialStep[] = [
    {
      titulo: 'Patrimônio na Aposentadoria',
      formula: 'P_apos = P_atual × (1+r)^n + PMT × [(1+r)^n - 1] / r',
      formulaComValores: `P = R$${fmt(patrimonioTotal)} × (1+${perfil.retornoRealAnual}%)^${anosAcumulacao} + R$${fmt(aporteMensalTotal * 12)}/ano × ...`,
      resultado: patrimonioNaAposentadoria,
      unidade: 'R$',
      descricao: `Patrimônio estimado ao se aposentar aos ${input.idadeAposentadoria} anos, com retorno real de ${perfil.retornoRealAnual}% a.a. (perfil ${input.perfilRisco})`,
    },
    {
      titulo: 'Benefício INSS Estimado',
      formula: 'B = salário_benefício × alíquota × (1 + 2% × anos_extras)',
      formulaComValores: `B = R$${fmt(input.salarioContribuicao)} × alíquota × (tempo: ${input.tempoContribuicaoAnos + anosAcumulacao} anos)`,
      resultado: beneficioINSSMensal,
      unidade: 'R$/mês',
      descricao: inssResult.regra,
    },
    {
      titulo: 'Necessidade Líquida do Patrimônio',
      formula: 'NL = Gasto_total - INSS - Aluguel',
      formulaComValores: `NL = R$${fmt(gastoBaseAnual + gastoSaudeBaseAnual)}/ano - R$${fmt(rendaPassivaAnual)}/ano`,
      resultado: necessidadeLiquidaAnual,
      unidade: 'R$/ano',
      descricao: 'Valor que o patrimônio precisa gerar anualmente (já descontadas rendas passivas)',
    },
    {
      titulo: 'Taxa de Retirada Inicial',
      formula: 'TR = Necessidade_líquida ÷ Patrimônio × 100',
      formulaComValores: `TR = R$${fmt(necessidadeLiquidaAnual)} ÷ R$${fmt(patrimonioNaAposentadoria)} × 100`,
      resultado: taxaRetiradaInicial,
      unidade: '%',
      descricao: 'Referência: taxa ≤ 3,5% é sustentável para perfil conservador. 4% para moderado.',
    },
    {
      titulo: 'Probabilidade de Sucesso (Monte Carlo)',
      formula: `Sucesso% = simulações_sem_esgotamento ÷ ${N} × 100`,
      formulaComValores: `Sucesso% = ${simulacoesSucesso} ÷ ${N} × 100`,
      resultado: (simulacoesSucesso / N) * 100,
      unidade: '%',
      descricao: `Percentual de simulações onde o patrimônio durou até os ${input.expectativaVida} anos`,
    },
    {
      titulo: 'Saldo Final Mediano (P50)',
      formula: 'P50 = percentil 50 dos saldos finais de todas as simulações',
      formulaComValores: `P50 de ${N} simulações Monte Carlo`,
      resultado: p50,
      unidade: 'R$',
      descricao: 'Em metade das simulações, o patrimônio final ficou acima desse valor',
    },
  ];

  // ── Alertas ────────────────────────────────────────────────────────────────
  const alertas: RetirementAlert[] = [];

  const probSucesso = (simulacoesSucesso / N) * 100;

  if (probSucesso < 70) {
    alertas.push({
      tipo: 'danger',
      mensagem: `Probabilidade de sucesso baixa (${probSucesso.toFixed(0)}%). Considere aumentar aportes, adiar aposentadoria ou reduzir gastos desejados.`,
    });
  } else if (probSucesso < 85) {
    alertas.push({
      tipo: 'warning',
      mensagem: `Probabilidade de sucesso moderada (${probSucesso.toFixed(0)}%). Pequenos ajustes podem elevar significativamente a segurança do plano.`,
    });
  }

  if (taxaRetiradaInicial > 5) {
    alertas.push({
      tipo: 'danger',
      mensagem: `Taxa de retirada inicial de ${taxaRetiradaInicial.toFixed(1)}% é muito alta. Recomenda-se até 3,5% (conservador) ou 4% (moderado) para planos de longo prazo no Brasil.`,
    });
  } else if (taxaRetiradaInicial > 4) {
    alertas.push({
      tipo: 'warning',
      mensagem: `Taxa de retirada de ${taxaRetiradaInicial.toFixed(1)}% está no limite. Considere um colchão de segurança.`,
    });
  }

  if (anosAcumulacao < 5) {
    alertas.push({
      tipo: 'warning',
      mensagem: 'Menos de 5 anos até a aposentadoria. O crescimento do patrimônio depende principalmente dos aportes, não dos rendimentos.',
    });
  }

  if (input.saldoPGBL > 0 || input.aportePGBL > 0) {
    alertas.push({
      tipo: 'info',
      mensagem: 'PGBL na tabela regressiva: não resgate antes de 10 anos para garantir alíquota mínima de 10% de IR.',
    });
  }

  if (input.incluirInflacaoMedica && input.gastoMensalSaude > 0) {
    alertas.push({
      tipo: 'info',
      mensagem: `Inflação médica projetada em IPCA + 3% a.a. Aos ${input.expectativaVida} anos, o gasto com saúde será ~${(Math.pow(1.03, anosDistribuicao) * 100 - 100).toFixed(0)}% maior em termos reais.`,
    });
  }

  inssResult.alertas.forEach(msg => alertas.push({ tipo: 'warning', mensagem: msg }));

  // ── Retorno ────────────────────────────────────────────────────────────────
  const totalAportado = aporteMensalTotal * 12 * anosAcumulacao;
  const totalRendimento = patrimonioNaAposentadoria - patrimonioTotal - totalAportado;

  return {
    probabilidadeSucesso: probSucesso,
    saldoFinalP5: Math.max(0, p5),
    saldoFinalP50: Math.max(0, p50),
    saldoFinalP95: Math.max(0, p95),
    beneficioINSSMensal,
    rendaPatrimonioMensal: necessidadeLiquidaAnual / 12,
    rendaTotalMensal: (beneficioINSSMensal + rendaAluguelMensal) + necessidadeLiquidaAnual / 12,
    anoEsgotamentoP5,
    anoEsgotamentoP50,
    taxaRetiradaInicial,
    patrimonioAcumuladoAposentadoria: patrimonioNaAposentadoria,
    totalAportado,
    totalRendimento: Math.max(0, totalRendimento),
    projecaoAnualP50,
    memorial,
    alertas,
  };
}
