/**
 * §2.10 PU de títulos BR (base 252). LTN/Prefixado (zero-cupom) e NTN-F (cupom semestral).
 * Função pura. Taxas em fração decimal; du = dias úteis ANBIMA do título.
 */
export interface LtnInput {
    /** Valor nominal (face). */
    vn: number;
    /** Taxa de desconto a.a. base 252 (fração). */
    iaa: number;
    /** Dias úteis até o vencimento. */
    du: number;
}
export declare function puLtn(input: LtnInput): {
    pu: number;
};
export interface NtnfInput {
    /** Valor de face. */
    face: number;
    /** Taxa de desconto (YTM) a.a. base 252 (fração). */
    iaa: number;
    /** Taxa de cupom anual (fração, ex.: 0.10). Cupom semestral = (1+rate)^(1/m)−1. */
    couponRateAnnual: number;
    /** Pagamentos por ano (2 para semestral). */
    m: number;
    /** Dias úteis até cada pagamento de cupom (ascendente; o último carrega a face). */
    cuponsDu: number[];
}
export interface NtnfFlow {
    du: number;
    valor: number;
    vp: number;
}
export interface NtnfResult {
    pu: number;
    /** Cupom periódico em valor monetário. */
    cupomPeriodico: number;
    fluxos: NtnfFlow[];
}
export declare function puNtnf(input: NtnfInput): NtnfResult;
//# sourceMappingURL=puTitulos.d.ts.map