/**
 * Engine de cálculo para SOFR (Secured Overnight Financing Rate).
 * Convenção: ACT/360 (dias corridos sobre base 360), metodologia do NY Fed
 * ("SOFR Averages and Index").
 *
 * Fórmula por publicação:
 *   fator_intervalo = 1 + (sofr_anual/100) × (n/360)
 *   n = dias corridos até a próxima publicação (fins de semana e feriados
 *   americanos NÃO capitalizam — rendem juros simples dentro do intervalo).
 *
 * A memória continua com uma linha por dia corrido: o fator do dia é a razão
 * entre o fator linear do intervalo no fim e no início daquele dia, de modo que
 * o produto no intervalo é exatamente 1 + r·n/360.
 *
 * Se o período começa em dia sem publicação, vale a última taxa publicada antes
 * do início. Composição: "% do índice" multiplica a taxa; índice + taxa soma o
 * spread à SOFR (ACT/360). Dias sem publicação por mais de
 * MAX_DIAS_SEM_PUBLICACAO geram MissingIndexDataError.
 */
import { CalculationInput, CalculationMemoryRow } from '../models/types';
/**
 * Calcula a correção via SOFR (ACT/360) para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com taxas SOFR diárias)
 * @returns Array de linhas da memória de cálculo (uma por dia corrido)
 */
export declare function calculateSOFR(input: CalculationInput): CalculationMemoryRow[];
//# sourceMappingURL=SOFREngine.d.ts.map