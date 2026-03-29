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

import Decimal from 'decimal.js';
import { CalculationInput, CalculationMemoryRow, IndexDataPoint } from '../models/types';
import { addDays, getCalendarDaysBetween, toISODate } from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Feriados americanos fixos relevantes (mês-dia) */
const US_FIXED_HOLIDAYS = [
  '01-01', // New Year's Day
  '07-04', // Independence Day
  '11-11', // Veterans Day
  '12-25', // Christmas
];

function isUSWeekendOrHoliday(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true; // Domingo ou Sábado

  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return US_FIXED_HOLIDAYS.includes(mmdd);
}

/**
 * Constrói mapa de data ISO → taxa SOFR anual.
 * Para dias sem taxa (fins de semana/feriados), replica a última taxa válida.
 */
function buildSOFRRateMap(
  indexData: IndexDataPoint[],
  startDate: Date,
  endDate: Date
): Map<string, { rate: number; isProjected: boolean }> {
  const sourceMap = new Map<string, { rate: number; isProjected: boolean }>();
  for (const point of indexData) {
    sourceMap.set(toISODate(point.date), {
      rate: point.value,
      isProjected: point.isProjected ?? false,
    });
  }

  const allDays = getCalendarDaysBetween(startDate, endDate);
  const result = new Map<string, { rate: number; isProjected: boolean }>();
  let lastRate = 0;
  let lastIsProjected = false;

  for (const day of allDays) {
    const iso = toISODate(day);
    if (sourceMap.has(iso)) {
      const entry = sourceMap.get(iso)!;
      lastRate = entry.rate;
      lastIsProjected = entry.isProjected;
      result.set(iso, { rate: lastRate, isProjected: lastIsProjected });
    } else {
      // Replicar última taxa (fins de semana, feriados)
      result.set(iso, { rate: lastRate, isProjected: lastIsProjected });
    }
  }

  return result;
}

/**
 * Calcula a correção via SOFR (ACT/360) para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com taxas SOFR diárias)
 * @returns Array de linhas da memória de cálculo (uma por dia corrido)
 */
export function calculateSOFR(input: CalculationInput): CalculationMemoryRow[] {
  const { startDate, endDate, initialAmount, indexData = [], futurePremises = [] } = input;

  // Adiciona premissas ao indexData
  const allData: IndexDataPoint[] = [...indexData];
  for (const premise of futurePremises) {
    let d = new Date(premise.startDate);
    d.setHours(0, 0, 0, 0);
    const endP = new Date(premise.endDate);
    endP.setHours(0, 0, 0, 0);
    while (d <= endP) {
      allData.push({ date: new Date(d), value: premise.rate, isProjected: true });
      d = addDays(d, 1);
    }
  }

  const rateMap = buildSOFRRateMap(allData, startDate, endDate);
  const allDays = getCalendarDaysBetween(startDate, endDate);

  const rows: CalculationMemoryRow[] = [];
  let accumulatedFactor = new Decimal(1);
  let currentBalance = new Decimal(initialAmount);

  for (const day of allDays) {
    const iso = toISODate(day);
    const entry = rateMap.get(iso) ?? { rate: 0, isProjected: true };

    // ACT/360: fator_dia = 1 + (sofr/100) * (1/360)
    const dailyFactor = new Decimal(1).plus(
      new Decimal(entry.rate).div(100).mul(new Decimal(1).div(360))
    );

    accumulatedFactor = accumulatedFactor.mul(dailyFactor);
    currentBalance = currentBalance.mul(dailyFactor);

    rows.push({
      date: new Date(day),
      indexRate: entry.rate,
      dailyFactor: dailyFactor.toNumber(),
      accumulatedFactor: accumulatedFactor.toNumber(),
      balance: currentBalance.toNumber(),
      isProjected: entry.isProjected,
    });
  }

  return rows;
}
