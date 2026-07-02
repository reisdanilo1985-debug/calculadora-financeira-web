/**
 * §2.5 CDI + spread ↔ % do CDI. Função pura. Taxas em fração decimal.
 */
export interface CdiSpreadParaPctInput {
    cdiAa: number;
    /** Spread a.a. (fração). */
    spreadAa: number;
}
export interface CdiSpreadParaPctResult {
    totalComp: number;
    totalLin: number;
    pctCdiComp: number;
    pctCdiLin: number;
}
export declare function cdiSpreadParaPct(input: CdiSpreadParaPctInput): CdiSpreadParaPctResult;
export interface PctParaCdiSpreadInput {
    /** Percentual do CDI (ex.: 1.10 para 110%). */
    pctCdi: number;
    cdiAa: number;
}
export interface PctParaCdiSpreadResult {
    totalAa: number;
    spreadLin: number;
    spreadComp: number;
}
export declare function pctParaCdiSpread(input: PctParaCdiSpreadInput): PctParaCdiSpreadResult;
//# sourceMappingURL=cdiSpread.d.ts.map