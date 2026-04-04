/**
 * Engine de cálculo para CDI e Selic.
 * Base de cálculo: 252 dias úteis.
 *
 * Fórmula:
 *   fator_diario = (1 + cdi_anual/100) ^ (1/252)
 *   Se percentual do CDI (ex: 110%): fator_diario = (1 + percentual/100 * cdi_anual/100) ^ (1/252)
 *   fator_acumulado = ∏ fator_diario_i para cada dia útil no período
 */
import Decimal from 'decimal.js';
import { CalculationInput, CalculationMemoryRow } from '../models/types';
/**
 * Calcula a correção via CDI/Selic para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com taxas CDI)
 * @returns Array de linhas da memória de cálculo
 */
export declare function calculateCDI(input: CalculationInput): CalculationMemoryRow[];
/**
 * Calcula o fator acumulado de CDI com spread aditivo.
 * Usado internamente pelo CalculationEngine para composição IPCA+6%a.a. etc.
 */
export declare function calcAdditiveSpreadFactor(accumulatedIndexFactor: Decimal, spreadAnnualPercent: number, calendarDays: number, basis: number): Decimal;
//# sourceMappingURL=CDIEngine.d.ts.map