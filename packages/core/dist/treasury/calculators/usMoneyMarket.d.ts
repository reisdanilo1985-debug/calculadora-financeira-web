/**
 * §2.13 EUA — Money Market, SOFR e day counts. Função pura.
 * Taxas em fração decimal.
 */
export interface TbillInput {
    face: number;
    preco: number;
    /** Dias até o vencimento. */
    dias: number;
}
export interface TbillResult {
    /** Discount yield (base 360). */
    discountYield: number;
    /** Money-market yield (base 360). */
    mmy: number;
    /** Bond-equivalent yield (base 365). */
    bey: number;
    /** Effective annual yield. */
    eay: number;
}
export declare function tbillYields(input: TbillInput): TbillResult;
export interface SofrSpreadInput {
    sofrAa: number;
    spreadAa: number;
    /** Dias do período. */
    dias: number;
}
export interface SofrSpreadResult {
    allInAa: number;
    juroPeriodo: number;
    eay: number;
}
export declare function sofrSpreadEay(input: SofrSpreadInput): SofrSpreadResult;
export interface JurosConvencoesInput {
    notional: number;
    /** Taxa a.a. (fração). */
    taxa: number;
    d0: Date;
    d1: Date;
}
export interface JurosConvencoesResult {
    dias30360: number;
    diasAct: number;
    juros30360: number;
    jurosAct360: number;
    jurosAct365: number;
}
export declare function jurosConvencoes(input: JurosConvencoesInput): JurosConvencoesResult;
//# sourceMappingURL=usMoneyMarket.d.ts.map