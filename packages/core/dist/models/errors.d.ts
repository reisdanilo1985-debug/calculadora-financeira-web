/**
 * Erros de domínio do motor de cálculo.
 */
/** Intervalo (inclusive nos dois extremos) sem dado oficial nem premissa */
export interface IntervaloSemDado {
    inicio: Date;
    fim: Date;
}
/**
 * Lançado quando o período pedido tem dias (ou meses) sem dado oficial e sem
 * premissa. Antes, esses dias entravam silenciosamente com taxa 0%.
 */
export declare class MissingIndexDataError extends Error {
    readonly intervalos: IntervaloSemDado[];
    constructor(indexLabel: string, intervalos: IntervaloSemDado[], mensal?: boolean);
}
/**
 * Agrupa datas ordenadas em intervalos, juntando datas separadas por até
 * `folgaDias` dias corridos (para que fins de semana não quebrem o intervalo).
 */
export declare function agruparIntervalos(datas: Date[], folgaDias: number): IntervaloSemDado[];
//# sourceMappingURL=errors.d.ts.map