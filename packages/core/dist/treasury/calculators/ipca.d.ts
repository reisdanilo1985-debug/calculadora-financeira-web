/**
 * §2.6 IPCA+ (NTN-B) → Pré / % do CDI. Função pura. Taxas em fração decimal.
 * Usa Fisher multiplicativo (atalho real+ipca subestima em prazos longos).
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
    pctCdi: number;
    /** Inflação de breakeven (presente quando preMercadoAa é informado). */
    breakevenInf?: number;
    /** Veredito IPCA+ vs Pré (presente quando preMercadoAa é informado). */
    veredito?: 'IPCA+ ganha' | 'Pré ganha';
}
export declare function ipcaMais(input: IpcaMaisInput): IpcaMaisResult;
//# sourceMappingURL=ipca.d.ts.map