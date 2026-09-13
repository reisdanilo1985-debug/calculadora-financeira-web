/**
 * §2.6 IPCA+ (NTN-B) → Pré / % do CDI. Função pura. Taxas em fração decimal.
 * Usa Fisher multiplicativo (atalho real+ipca subestima em prazos longos).
 *
 * % do CDI:
 *   pctCdiB3 → convenção B3 (percentual sobre a taxa DI diária):
 *              [(1 + nominal)^(1/252) − 1] / [(1 + CDI)^(1/252) − 1] — use este;
 *   pctCdi   → razão anual nominal ÷ CDI: APROXIMAÇÃO da planilha, mantida por
 *              compatibilidade e rotulada em `convencao`.
 */
export interface IpcaMaisInput {
    /** Taxa real a.a. (fração, ex.: 0.07). */
    realAa: number;
    /** IPCA projetado a.a. (fração, ex.: 0.045). */
    ipcaAa: number;
    /** CDI a.a. (fração). */
    cdiAa: number;
    /** Taxa pré de mercado a.a. (fração) para breakeven de inflação. Opcional. */
    preMercadoAa?: number;
}
export interface IpcaMaisResult {
    /** Taxa nominal a.a. via Fisher (fração). */
    nominalAa: number;
    /** % do CDI da taxa nominal — convenção B3 (taxa DI diária). */
    pctCdiB3: number;
    /** % do CDI pela razão anual nominal ÷ CDI — aproximação. */
    pctCdi: number;
    /** Régua de cada "% do CDI", para exibição. */
    convencao: string;
    /** Inflação de breakeven (presente quando preMercadoAa é informado). */
    breakevenInf?: number;
    /** Veredito IPCA+ vs Pré (presente quando preMercadoAa é informado). */
    veredito?: 'IPCA+ ganha' | 'Pré ganha';
}
export declare function ipcaMais(input: IpcaMaisInput): IpcaMaisResult;
//# sourceMappingURL=ipca.d.ts.map