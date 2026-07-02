/**
 * §2.12 Forward / NDF USD-BRL (paridade coberta). Função pura.
 * Cada perna na sua base: BR 252 / USD 360. O forward elimina arbitragem de
 * juros — NÃO é previsão de câmbio.
 */
export interface ForwardInput {
    /** Câmbio à vista (R$/US$). */
    spot: number;
    /** DI pré (BR) interpolado a.a. base 252 (fração). */
    iBrAa: number;
    /** Dias úteis até o vencimento. */
    du: number;
    /** Cupom cambial USD interpolado a.a. base 360 (fração). */
    cupomUsdAa: number;
    /** Dias corridos até o vencimento. */
    dc: number;
}
export interface ForwardResult {
    fatorBr: number;
    fatorUsd: number;
    forward: number;
    /** Pontos a termo (forward − spot). */
    pontos: number;
}
export declare function forwardUsdBrl(input: ForwardInput): ForwardResult;
export interface NdfInput {
    /** PTAX no vencimento. */
    ptaxVencimento: number;
    /** Strike contratado. */
    kContratado: number;
    /** Notional em USD. */
    notionalUsd: number;
}
/** Liquidação NDF comprado em USD: (PTAX − K) · notional. */
export declare function ndfAjuste(input: NdfInput): {
    ajusteBrl: number;
};
//# sourceMappingURL=forwardNdf.d.ts.map