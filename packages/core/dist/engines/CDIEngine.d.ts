/**
 * Engine de cálculo para CDI e Selic.
 * Base de cálculo: 252 dias úteis.
 *
 * Fórmula:
 *   fator_diario = (1 + cdi_anual/100) ^ (1/252)
 *   Se percentual do CDI (ex: 110%), convenção CETIP/B3 — o percentual incide
 *   sobre a taxa DIÁRIA (TDI), não sobre a taxa anual:
 *     TDI = (1 + cdi_anual/100)^(1/252) − 1
 *     fator_diario = 1 + TDI × percentual/100
 *   (mesma convenção da Calculadora do Cidadão do BCB)
 *   Se CDI + spread (ex: CDI + 2% a.a.), Fator de Spread multiplicativo (B3):
 *     base 252: fator_spread_dia = (1 + spread/100)^(1/252) por dia útil
 *     base 360/365: fator_spread = (1 + spread/100)^(dc/base) nos dias corridos de cada linha
 *   fator_acumulado = ∏ fator_diario_i para cada dia útil no período
 *
 * Todo dia útil do período precisa de dado oficial ou de premissa; dia sem
 * nenhum dos dois gera MissingIndexDataError (antes entrava com taxa 0%).
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