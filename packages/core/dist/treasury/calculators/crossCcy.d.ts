/**
 * §2.2/§2.3 Cross-currency genérico → % do CDI (USD ou EUR + spread).
 *
 * Paridade coberta NO PRAZO, convenção B3 (Manual de Apreçamento de Futuros,
 * eq. 2.1: cupom cambial LINEAR base 360):
 *   fator BRL       = (1 + CDI)^(du/252) ÷ (1 + cupom·dc/360) × (1 + spread·dc/360)
 *   pré equivalente = fator BRL^(252/du) − 1        (anualizado base 252)
 * Sem prazo (du e dc ausentes) vale 252 du / 360 dc, onde linear e composto
 * coincidem: (1 + CDI)/(1 + cupom)·(1 + spread) − 1 — a paridade anual.
 *
 * % do CDI:
 *   pctCdiB3Comp / pctCdiB3Lin → convenção B3 (percentual sobre a taxa DI diária);
 *                                é a régua usada na decisão e nos demais calculadores.
 *   pctCdiComp / pctCdiLin     → razão anual taxa ÷ CDI: APROXIMAÇÃO da planilha,
 *                                mantida por compatibilidade e rotulada em `convencao`.
 *
 * Função pura. Taxas em fração decimal.
 */
/** Prazo da operação. Informe `du` e `dc` juntos (ou nenhum dos dois). */
export interface PrazoCrossCcy {
    /** Dias úteis do prazo (capitaliza o CDI em base 252). */
    du?: number;
    /** Dias corridos do prazo (cupom cambial e spread lineares base 360). */
    dc?: number;
}
export interface CrossCcyInput extends PrazoCrossCcy {
    /** Spread em moeda estrangeira, a.a. (fração). */
    spreadEstrangeiroAa: number;
    /** CDI a.a. (fração). */
    cdiAa: number;
    /** Cupom cambial da moeda no vértice da vida média do papel, a.a. (fração). */
    cupomEstrangeiroAa: number;
}
export interface CrossCcyResult {
    /** Câmbio a termo implícito no prazo, anualizado base 252 (fração). */
    cambioFwdAa: number;
    /** Pré equivalente (spread composto ao câmbio a termo) a.a. base 252 (fração). */
    preEquivComp: number;
    /** Pré equivalente linear (câmbio a termo a.a. + spread) (fração). */
    preEquivLin: number;
    /** % do CDI do pré equivalente composto — convenção B3 (taxa DI diária). */
    pctCdiB3Comp: number;
    /** % do CDI do pré equivalente linear — convenção B3 (taxa DI diária). */
    pctCdiB3Lin: number;
    /** % do CDI (composto) pela razão anual pré ÷ CDI — aproximação. */
    pctCdiComp: number;
    /** % do CDI (linear) pela razão anual pré ÷ CDI — aproximação. */
    pctCdiLin: number;
    /** Spread sobre o CDI equivalente (composto) a.a. — a leitura "CDI + X%". */
    spreadSobreCdiComp: number;
    /** Spread sobre o CDI equivalente (linear) a.a. */
    spreadSobreCdiLin: number;
    /** Spread (a.a.) que resulta em exatos 100% do CDI = cupom cambial. */
    spreadEquilibrio: number;
    /** Dias úteis do prazo usados (252 quando o prazo não é informado). */
    prazoDu: number;
    /** Dias corridos do prazo usados (360 quando o prazo não é informado). */
    prazoDc: number;
    /** Convenções aplicadas (prazo e régua do % do CDI), para exibição. */
    convencao: string;
}
/**
 * USD/EUR + spread → equivalente em reais (pré, % do CDI e CDI + spread).
 * Paridade coberta: o custo hedgeado da dívida externa expresso na régua local.
 */
export declare function crossCcyToCdi(input: CrossCcyInput): CrossCcyResult;
export interface CdiToCrossCcyInput extends PrazoCrossCcy {
    /** CDI a.a. (fração). */
    cdiAa: number;
    /** Spread local sobre o CDI, a.a. (fração) — a perna "CDI + X%". */
    spreadLocalAa: number;
    /** Cupom cambial da moeda no vértice, a.a. (fração). */
    cupomEstrangeiroAa: number;
}
export interface CdiToCrossCcyResult {
    /** Câmbio a termo implícito no prazo, anualizado base 252 (fração). */
    cambioFwdAa: number;
    /** Spread em moeda estrangeira equivalente (linear base 360 no prazo; composto no ano-base) a.a. (fração). */
    spreadEstrangeiroComp: number;
    /** Spread em moeda estrangeira aproximado: spread local + cupom (fração). */
    spreadEstrangeiroLin: number;
    /** Pré equivalente (composto) da perna local, para conferência. */
    preEquivComp: number;
    /** % do CDI da perna local — convenção B3 (taxa DI diária). */
    pctCdiB3Comp: number;
    /** % do CDI da perna local pela razão anual pré ÷ CDI — aproximação. */
    pctCdiComp: number;
    /** Dias úteis do prazo usados (252 quando o prazo não é informado). */
    prazoDu: number;
    /** Dias corridos do prazo usados (360 quando o prazo não é informado). */
    prazoDc: number;
    /** Convenções aplicadas (prazo e régua do % do CDI), para exibição. */
    convencao: string;
}
/**
 * CDI + spread (perna local) → spread em USD/EUR equivalente sob hedge completo.
 *
 * Inverte a paridade coberta no prazo. Igualando o fator da perna local,
 * (1 + CDI)^(du/252)·(1 + spreadLocal)^(du/252), ao da perna externa hedgeada,
 * (1 + CDI)^(du/252) ÷ (1 + cupom·dc/360) × (1 + spreadExt·dc/360):
 *   spreadExt = [(1 + spreadLocal)^(du/252)·(1 + cupom·dc/360) − 1]·360/dc
 * No ano-base (252 du / 360 dc) cai em (1 + spreadLocal)·(1 + cupom) − 1.
 * Aproximação linear: spreadExt ≈ spreadLocal + cupom.
 */
export declare function cdiToCrossCcy(input: CdiToCrossCcyInput): CdiToCrossCcyResult;
//# sourceMappingURL=crossCcy.d.ts.map