/**
 * §2.5 CDI + spread ↔ % do CDI. Função pura. Taxas em fração decimal.
 *
 * O "% do CDI" segue a convenção B3 (percentual sobre a taxa DI DIÁRIA, a mesma
 * do CDIEngine da Calculadora principal):
 *   TDI      = (1 + CDI)^(1/252) − 1
 *   p        = [(1 + total)^(1/252) − 1] / TDI
 *   total(p) = (1 + p·TDI)^252 − 1
 * As variantes "Comp"/"Lin" referem-se à COMPOSIÇÃO do spread sobre o CDI:
 *   totalComp = (1 + CDI)·(1 + spread) − 1   (spread composto, base 252)
 *   totalLin  = CDI + spread                 (spread aditivo)
 */
export interface CdiSpreadParaPctInput {
    cdiAa: number;
    /** Spread a.a. (fração). */
    spreadAa: number;
}
export interface CdiSpreadParaPctResult {
    totalComp: number;
    totalLin: number;
    /** % do CDI (B3) equivalente ao total com spread composto. */
    pctCdiComp: number;
    /** % do CDI (B3) equivalente ao total com spread aditivo. */
    pctCdiLin: number;
}
export declare function cdiSpreadParaPct(input: CdiSpreadParaPctInput): CdiSpreadParaPctResult;
export interface PctParaCdiSpreadInput {
    /** Percentual do CDI (ex.: 1.10 para 110%). */
    pctCdi: number;
    cdiAa: number;
}
export interface PctParaCdiSpreadResult {
    /** Taxa a.a. do acúmulo diário a p% do CDI (B3). */
    totalAa: number;
    spreadLin: number;
    spreadComp: number;
}
export declare function pctParaCdiSpread(input: PctParaCdiSpreadInput): PctParaCdiSpreadResult;
//# sourceMappingURL=cdiSpread.d.ts.map