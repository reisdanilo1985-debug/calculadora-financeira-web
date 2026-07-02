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
    /** Market Cap — Valor de Mercado do Equity */
    marketCap: number;
    /** Dívida Bruta — Valor de Mercado */
    dividaBruta: number;
    /** Alíquota de IR efetiva (%) — Ex: 34 para 34% */
    aliquotaIR: number;
    /** Custo da Dívida Pré-Impostos (% a.a.) */
    custoDividaPreTax: number;
}
export interface WaccResult {
    valorTotalFirma: number;
    pesoEquity: number;
    pesoDivida: number;
    betaAlavancado: number;
    custoEquity: number;
    custoDividaAfterTax: number;
    wacc: number;
    memorial: WaccMemorialStep[];
}
export interface WaccMemorialStep {
    titulo: string;
    formula: string;
    formulaComValores: string;
    resultado: number;
    unidade: string;
    descricao: string;
}
/**
 * Calcula o WACC seguindo a metodologia Damodaran.
 * Função pura — sem I/O, ideal para testes unitários.
 */
export declare function calcularWACC(input: WaccInput): WaccResult;
//# sourceMappingURL=WaccEngine.d.ts.map