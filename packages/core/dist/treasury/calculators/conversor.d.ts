/**
 * §2.1 Conversor de taxas — equivalência de taxa efetiva e ponte 252↔360.
 * Função pura. Taxas em fração decimal.
 */
export interface ConversorInput {
    /** Taxa efetiva anual base 252 (fração, ex.: 0.144). */
    iaa: number;
    /** Dias úteis da janela (para a ponte 252↔360). Opcional. */
    du?: number;
    /** Dias corridos da janela (para a ponte 252↔360). Opcional. */
    dc?: number;
    /** Número de capitalizações para nominal↔efetiva. Opcional. */
    m?: number;
}
export interface ConversorResult {
    aoDiaUtil: number;
    aoMes: number;
    aoTrimestre: number;
    aoSemestre: number;
    aoAno: number;
    aoDiaCorrido: number;
    /** Ponte 252↔360 (presente quando du e dc são informados). */
    ponte?: {
        fator: number;
        i360Comp: number;
        i360Linear: number;
    };
    /** Nominal↔efetiva (presente quando m é informado). */
    nominal?: {
        efetivaDeNominal: number;
        nominalDeEfetiva: number;
    };
}
export declare function conversor(input: ConversorInput): ConversorResult;
//# sourceMappingURL=conversor.d.ts.map