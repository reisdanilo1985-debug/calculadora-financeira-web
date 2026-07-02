/**
 * §2.8 Amortização — Price (parcela constante) & SAC (amortização constante).
 * Função pura. Taxa periódica em fração decimal. Retorna ambas as tabelas + totais.
 */
export interface AmortizacaoInput {
    /** Principal (valor financiado). */
    principal: number;
    /** Taxa de juros por período (fração, ex.: 0.012 para 1,2% a.m.). */
    i: number;
    /** Número de parcelas. */
    n: number;
}
export interface ParcelaRow {
    periodo: number;
    juros: number;
    amortizacao: number;
    parcela: number;
    saldo: number;
}
export interface TabelaAmortizacao {
    parcelas: ParcelaRow[];
    totalJuros: number;
    totalParcelas: number;
    /** Valor da parcela (Price) — constante. */
    pmt?: number;
}
export interface AmortizacaoResult {
    price: TabelaAmortizacao;
    sac: TabelaAmortizacao;
}
export declare function amortizacao(input: AmortizacaoInput): AmortizacaoResult;
//# sourceMappingURL=amortizacao.d.ts.map