/**
 * §2.9 Duration (Macaulay/Modificada), DV01 e Convexidade.
 * Regime EFETIVO ANUAL: desconto (1+y)^t, t em anos. Função pura.
 *
 * Cupom periódico = face · couponRateAnnual / m (convenção simples por período).
 */
export interface DurationInput {
    /** Valor de face. */
    face: number;
    /** Taxa de cupom anual (fração, ex.: 0.10). */
    couponRateAnnual: number;
    /** Yield to maturity efetivo anual (fração, ex.: 0.13). */
    ytm: number;
    /** Pagamentos por ano. */
    m: number;
    /** Número de períodos (cupons) até o vencimento. */
    n: number;
}
export interface DurationResult {
    preco: number;
    macaulayDuration: number;
    modifiedDuration: number;
    dv01: number;
    convexidade: number;
}
export declare function duration(input: DurationInput): DurationResult;
//# sourceMappingURL=duration.d.ts.map