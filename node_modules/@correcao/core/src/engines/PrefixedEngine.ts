/**
 * Engine de cálculo para taxa pré-fixada.
 *
 * Fórmulas por base:
 *   Base 252 d.u.: fator = (1 + taxa/100) ^ (du / 252)
 *   Base 360 d.c.: fator = (1 + taxa/100) ^ (dc / 360)
 *   Base 365 d.c.: fator = (1 + taxa/100) ^ (dc / 365)
 */

import Decimal from 'decimal.js';
import {
  CalculationInput,
  CalculationMemoryRow,
  DayCountBasis,
} from '../models/types';
import {
  countBusinessDays,
  countCalendarDays,
  getBusinessDaysBetween,
  getCalendarDaysBetween,
  toISODate,
} from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Calcula a correção via taxa pré-fixada.
 *
 * @param input Input de cálculo (deve ter prefixedRate definido)
 * @returns Array de linhas da memória de cálculo
 */
export function calculatePrefixed(input: CalculationInput): CalculationMemoryRow[] {
  const { startDate, endDate, initialAmount, dayCountBasis, prefixedRate = 0 } = input;

  const annualRate = new Decimal(prefixedRate).div(100);

  if (dayCountBasis === DayCountBasis.DU252) {
    // Uma linha por dia útil
    const businessDays = getBusinessDaysBetween(startDate, endDate);
    const totalDU = businessDays.length;

    const rows: CalculationMemoryRow[] = [];
    let accumulatedFactor = new Decimal(1);
    let currentBalance = new Decimal(initialAmount);

    // fator_diario = (1 + taxa)^(1/252)
    const dailyFactor = annualRate.plus(1).pow(new Decimal(1).div(252));

    for (const day of businessDays) {
      accumulatedFactor = accumulatedFactor.mul(dailyFactor);
      currentBalance = currentBalance.mul(dailyFactor);

      rows.push({
        date: new Date(day),
        indexRate: prefixedRate,
        dailyFactor: dailyFactor.toNumber(),
        accumulatedFactor: accumulatedFactor.toNumber(),
        balance: currentBalance.toNumber(),
        isProjected: false,
      });
    }

    return rows;
  }

  // Base 360 ou 365: uma linha por dia corrido
  const calendarDays = getCalendarDaysBetween(startDate, endDate);
  const basis = dayCountBasis === DayCountBasis.DC360 ? 360 : 365;

  // fator_diario = (1 + taxa)^(1/basis)
  const dailyFactor = annualRate.plus(1).pow(new Decimal(1).div(basis));

  const rows: CalculationMemoryRow[] = [];
  let accumulatedFactor = new Decimal(1);
  let currentBalance = new Decimal(initialAmount);

  for (const day of calendarDays) {
    accumulatedFactor = accumulatedFactor.mul(dailyFactor);
    currentBalance = currentBalance.mul(dailyFactor);

    rows.push({
      date: new Date(day),
      indexRate: prefixedRate,
      dailyFactor: dailyFactor.toNumber(),
      accumulatedFactor: accumulatedFactor.toNumber(),
      balance: currentBalance.toNumber(),
      isProjected: false,
    });
  }

  return rows;
}
