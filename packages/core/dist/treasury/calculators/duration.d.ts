/**
 * §2.9 Duration (Macaulay/Modificada), DV01 e Convexidade.
 * Regime EFETIVO ANUAL: desconto (1+y)^t, t = k/m anos. Função pura.
 *
 * Convenção do cupom periódico (`convencaoCupom`, declarada no resultado):
 *   'simples' (padrão) → cupom = face · taxa / m  (taxa nominal dividida por m);
 *   'ntnf'             → cupom = face · [(1 + taxa)^(1/m) − 1], a convenção NTN-F
 *                        de `puNtnf`. Como t = k/m = du/252 com du = 252·k/m, o
 *                        preço coincide com o PU NTN-F do mesmo título.
 * As duas dão preços diferentes para a mesma "taxa de cupom" (10% a.a. semestral:
 * cupom 50,00 × 48,81 por 1.000) — por isso a convenção vem sempre explícita.
 */
/** 'simples' = face·taxa/m; 'ntnf' = face·[(1+taxa)^(1/m) − 1] (convenção NTN-F). */
export type ConvencaoCupom = 'simples' | 'ntnf';
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
    /** Convenção do cupom periódico. Padrão: 'simples'. */
    convencaoCupom?: ConvencaoCupom;
}
export interface DurationResult {
    preco: number;
    macaulayDuration: number;
    modifiedDuration: number;
    dv01: number;
    convexidade: number;
    /** Cupom periódico em valor monetário. */
    cupomPeriodico: number;
    /** Convenção de cupom aplicada, em texto (exibida no resultado). */
    convencao: string;
}
export declare function duration(input: DurationInput): DurationResult;
//# sourceMappingURL=duration.d.ts.map