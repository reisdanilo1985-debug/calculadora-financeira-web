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
 *
 * Moeda e regime: Rf, ERP, CRP e Kd devem estar na MESMA moeda e no MESMO regime (nominal/real).
 * Para levar uma taxa de uma moeda a outra use `ajustarTaxaPorDiferencialInflacao` (Fisher).
 */
export type MoedaWacc = 'BRL' | 'USD' | 'EUR';
export type RegimeTaxa = 'nominal' | 'real';
export interface WaccInput {
    /** Setor de atuação da empresa */
    setor: string;
    /** País (para sugerir CRP) */
    pais: string;
    /** Moeda do cálculo */
    moeda: MoedaWacc;
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
    sensibilidade: WaccSensibilidadeItem[];
    memorial: WaccMemorialStep[];
}
export type WaccPremissaSensibilidade = 'rf' | 'erp' | 'beta' | 'kd' | 'ir' | 'de';
export interface WaccSensibilidadeItem {
    id: WaccPremissaSensibilidade;
    /** Premissa chocada (ex.: "Taxa livre de risco (Rf)") */
    premissa: string;
    /** Choque aplicado (ex.: "+1 p.p.", "+10%") */
    choque: string;
    /** WACC recalculado com o choque (% a.a.); null se o cenário base não for finito */
    waccChocado: number | null;
    /** WACC_chocado − WACC_base, em pontos percentuais; null se não for finito */
    deltaWaccPP: number | null;
    /** Decomposição do efeito (só no choque de IR: via Kd após IR e via realavancagem do β), em p.p. */
    decomposicao?: {
        viaCustoDivida: number;
        viaBeta: number;
    };
    /** Convenção do choque */
    descricao: string;
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
 * Converte uma taxa de uma moeda/regime para outra pelo diferencial de inflação (paridade de Fisher):
 *   (1 + taxa_destino) = (1 + taxa_origem) × (1 + π_destino) / (1 + π_origem)
 * Todas as taxas em % a.a. Ex.: Rf USD 3,95% com π USD 2% e π BRL 3% → Rf BRL 4,9691%.
 * Com π_destino = 0 obtém-se a taxa real da moeda de origem.
 */
export declare function ajustarTaxaPorDiferencialInflacao(taxaPct: number, inflacaoOrigemPct: number, inflacaoDestinoPct: number): number;
/** Taxa real (% a.a.) a partir da nominal e da inflação da mesma moeda: (1 + n)/(1 + π) − 1. */
export declare function taxaRealDeNominal(taxaNominalPct: number, inflacaoPct: number): number;
/**
 * Sensibilidade do WACC a choques isolados (demais premissas constantes), recalculada pelo motor:
 *   - Rf, ERP, Kd antes do IR e IR: +1 p.p.;
 *   - β: +10% (equivale a +10% no β alavancado, pois Hamada é linear em β desalavancado);
 *   - IR +1 p.p. inclui a realavancagem do β (decomposto em efeito via Kd e via β);
 *   - D/E: +10% (relativo), mantendo V = E + D constante e Kd inalterado.
 * Resultados em pontos percentuais do WACC.
 */
export declare function calcularSensibilidadeWACC(input: WaccInput): WaccSensibilidadeItem[];
/**
 * Calcula o WACC seguindo a metodologia Damodaran.
 * Função pura — sem I/O, ideal para testes unitários.
 */
export declare function calcularWACC(input: WaccInput): WaccResult;
//# sourceMappingURL=WaccEngine.d.ts.map