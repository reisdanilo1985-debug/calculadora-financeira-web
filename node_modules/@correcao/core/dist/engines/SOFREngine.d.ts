/**
 * Engine de cálculo para SOFR (Secured Overnight Financing Rate).
 * Convenção: ACT/360 (dias corridos sobre base 360).
 *
 * Fórmula para cada dia corrido:
 *   fator_dia = 1 + (sofr_anual/100) * (dias_corridos/360)
 *
 * Para fins de semana e feriados americanos, a taxa do último dia útil é replicada.
 * Para feriados americanos, usamos simplificação: replicamos taxa de sexta-feira.
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