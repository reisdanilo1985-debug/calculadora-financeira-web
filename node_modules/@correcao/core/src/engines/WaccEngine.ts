/**
 * Motor de cálculo WACC — Metodologia Damodaran (NYU Stern)
 *
 * Custo Médio Ponderado de Capital (WACC / CMPC)
 *
 * Fórmulas:
 *   β Alavancado   = β_desl × (1 + (1 - T) × D/E)
 *   Ke             = Rf + β_alav × ERP + CRP + SP
 *   Kd_after_tax   = Kd × (1 - T)
 *   WACC           = Ke × (E/V) + Kd_after_tax × (D/V)
 *
 * Onde:
 *   Rf  = Taxa livre de risco (Risk-Free Rate)
 *   β   = Beta do setor (desalavancado por Damodaran)
 *   ERP = Equity Risk Premium (prêmio pelo risco de mercado)
 *   CRP = Country Risk Premium (prêmio de risco-país)
 *   SP  = Size Premium (prêmio de tamanho, opcional)
 *   T   = Alíquota de IR efetiva
 *   D   = Dívida (valor de mercado)
 *   E   = Equity / Market Cap (valor de mercado)
 *   V   = D + E (valor total da firma)
 *   Kd  = Custo da dívida pré-imposto
 */

export interface WaccInput {
  /** Setor de atuação da empresa */
  setor: string;
  /** País (para sugerir CRP) */
  pais: string;
  /** Moeda do cálculo */
  moeda: 'BRL' | 'USD' | 'EUR';

  // ── Risco de Mercado ──────────────────────────────────
  /** Taxa Livre de Risco — Rf (% a.a.) */
  taxaLivreDeRisco: number;
  /** Prêmio pelo Risco de Mercado — ERP (% a.a.) */
  premioRiscoMercado: number;
  /** Beta Desalavancado do Setor (β sem dívida) */
  betaDesalavancado: number;
  /** Prêmio de Risco País — CRP (% a.a.) */
  premioRiscoPais: number;
  /** Prêmio de Tamanho — SP (% a.a., opcional, default 0) */
  premioTamanho?: number;

  // ── Estrutura de Capital ──────────────────────────────
  /** Market Cap — Valor de Mercado do Equity */
  marketCap: number;
  /** Dívida Bruta — Valor de Mercado */
  dividaBruta: number;
  /** Alíquota de IR efetiva (%) — Ex: 34 para 34% */
  aliquotaIR: number;

  // ── Custo da Dívida ───────────────────────────────────
  /** Custo da Dívida Pré-Impostos (% a.a.) */
  custoDividaPreTax: number;
}

export interface WaccResult {
  // Estrutura de capital
  valorTotalFirma: number;
  pesoEquity: number;       // We = E/V
  pesoDivida: number;       // Wd = D/V

  // Re-alavancagem do Beta
  betaAlavancado: number;

  // Custo do Equity (Ke)
  custoEquity: number;

  // Custo da Dívida after-tax (Kd)
  custoDividaAfterTax: number;

  // WACC final
  wacc: number;

  // Memorial detalhado (para exibição das fórmulas)
  memorial: WaccMemorialStep[];
}

export interface WaccMemorialStep {
  titulo: string;
  formula: string;           // Fórmula em texto (ex: "Ke = Rf + β × ERP + CRP")
  formulaComValores: string; // Fórmula com valores substituídos
  resultado: number;
  unidade: string;
  descricao: string;
}

/**
 * Calcula o WACC seguindo a metodologia Damodaran.
 * Função pura — sem I/O, ideal para testes unitários.
 */
export function calcularWACC(input: WaccInput): WaccResult {
  const {
    taxaLivreDeRisco: Rf,
    premioRiscoMercado: ERP,
    betaDesalavancado: betaDesl,
    premioRiscoPais: CRP,
    premioTamanho: SP = 0,
    marketCap: E,
    dividaBruta: D,
    aliquotaIR: T_pct,
    custoDividaPreTax: Kd_pre,
  } = input;

  // Normalizar alíquota (34% → 0.34)
  const T = T_pct / 100;

  // 1. Estrutura de Capital (Market Values)
  const V = E + D;
  if (V <= 0) throw new Error('O valor total da firma (Equity + Dívida) deve ser positivo.');

  const we = E / V;  // Peso do Equity
  const wd = D / V;  // Peso da Dívida

  // 2. Re-alavancagem do Beta (Fórmula de Hamada)
  // Considera o efeito da alavancagem financeira no risco sistemático
  const betaAlav = D > 0
    ? betaDesl * (1 + (1 - T) * (D / E))
    : betaDesl; // Sem dívida: beta alavancado = desalavancado

  // 3. Custo do Equity (Ke) — CAPM com prêmios Damodaran
  const Ke = (Rf + betaAlav * ERP + CRP + SP) / 100; // normalizado para decimal

  // 4. Custo da Dívida After-Tax (Kd)
  const Kd = (Kd_pre / 100) * (1 - T);

  // 5. WACC
  const wacc = Ke * we + Kd * wd;

  // Memorial de cálculo
  const fmt = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',');
  const fmtPct = (v: number) => `${fmt(v * 100)}%`;

  const memorial: WaccMemorialStep[] = [
    {
      titulo: 'Estrutura de Capital',
      formula: 'V = E + D',
      formulaComValores: `V = ${E.toLocaleString('pt-BR')} + ${D.toLocaleString('pt-BR')}`,
      resultado: V,
      unidade: input.moeda,
      descricao: 'Valor total da firma = Equity (Market Cap) + Dívida Bruta',
    },
    {
      titulo: 'Peso do Equity (We)',
      formula: 'We = E ÷ V',
      formulaComValores: `We = ${E.toLocaleString('pt-BR')} ÷ ${V.toLocaleString('pt-BR')}`,
      resultado: we * 100,
      unidade: '%',
      descricao: 'Proporção do equity no financiamento total da firma (valores de mercado)',
    },
    {
      titulo: 'Peso da Dívida (Wd)',
      formula: 'Wd = D ÷ V',
      formulaComValores: `Wd = ${D.toLocaleString('pt-BR')} ÷ ${V.toLocaleString('pt-BR')}`,
      resultado: wd * 100,
      unidade: '%',
      descricao: 'Proporção da dívida no financiamento total da firma (valores de mercado)',
    },
    {
      titulo: 'Beta Alavancado (β)',
      formula: 'β_alav = β_desl × (1 + (1 − T) × D/E)',
      formulaComValores: D > 0
        ? `β_alav = ${fmt(betaDesl, 4)} × (1 + (1 − ${fmt(T_pct)}%) × ${fmt(D / E, 4)})`
        : `β_alav = ${fmt(betaDesl, 4)} (sem alavancagem financeira)`,
      resultado: betaAlav,
      unidade: '',
      descricao: 'Fórmula de Hamada — incorpora o risco financeiro (dívida) ao beta setorial',
    },
    {
      titulo: 'Custo do Capital Próprio (Ke)',
      formula: 'Ke = Rf + β × ERP + CRP + SP',
      formulaComValores: `Ke = ${fmt(Rf)}% + ${fmt(betaAlav, 4)} × ${fmt(ERP)}% + ${fmt(CRP)}% + ${fmt(SP)}%`,
      resultado: Ke * 100,
      unidade: '% a.a.',
      descricao: 'CAPM com ajustes Damodaran: prêmio de risco-país (CRP) e prêmio de tamanho (SP)',
    },
    {
      titulo: 'Custo da Dívida After-Tax (Kd)',
      formula: 'Kd = Kd_bruto × (1 − T)',
      formulaComValores: `Kd = ${fmt(Kd_pre)}% × (1 − ${fmt(T_pct)}%)`,
      resultado: Kd * 100,
      unidade: '% a.a.',
      descricao: 'Custo efetivo da dívida após o benefício fiscal do pagamento de juros (tax shield)',
    },
    {
      titulo: 'WACC — Custo Médio Ponderado de Capital',
      formula: 'WACC = Ke × We + Kd × Wd',
      formulaComValores: `WACC = ${fmtPct(Ke)} × ${fmt(we * 100)}% + ${fmtPct(Kd)} × ${fmt(wd * 100)}%`,
      resultado: wacc * 100,
      unidade: '% a.a.',
      descricao: 'Taxa mínima de atratividade da firma — remunera equity e credores proporcionalmente',
    },
  ];

  return {
    valorTotalFirma: V,
    pesoEquity: we * 100,
    pesoDivida: wd * 100,
    betaAlavancado: betaAlav,
    custoEquity: Ke * 100,
    custoDividaAfterTax: Kd * 100,
    wacc: wacc * 100,
    memorial,
  };
}
