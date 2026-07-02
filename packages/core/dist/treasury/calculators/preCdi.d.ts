/**
 * §2.4 Pré ↔ % do CDI. Função pura. Taxas em fração decimal.
 *
 * Ressalva (documentar na UI): a razão de taxas é a aproximação de mesa
 * (exata só com CDI constante). O acúmulo real de "p% do CDI" é diário.
 */
export interface PreParaCdiInput {
    /** Taxa pré a.a. (fração). */
    preAa: number;
    /** CDI a.a. (fração). */
    cdiAa: number;
}
export interface PreParaCdiResult {
    pctCdi: number;
    spreadCompSobreCdi: number;
}
export declare function preParaCdi(input: PreParaCdiInput): PreParaCdiResult;
export interface CdiParaPreInput {
    /** Percentual do CDI (ex.: 1.10 para 110%). */
    pctCdi: number;
    cdiAa: number;
}
export declare function cdiParaPre(input: CdiParaPreInput): {
    preAa: number;
};
//# sourceMappingURL=preCdi.d.ts.map