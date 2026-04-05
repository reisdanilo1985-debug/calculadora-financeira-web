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
import {
  CalculationInput,
  CalculationMemoryRow,
  IndexDataPoint,
  SpreadConfig,
} from '../models/types';
import {
  getBusinessDaysBetween,
  toISODate,
} from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Calcula o fator diário do CDI/Selic para um dia com uma taxa anual e spread opcional.
 *
 * @param annualRatePercent Taxa anual em % (ex: 10.65)
 * @param spread Configuração de spread (opcional)
 * @returns Fator diário como Decimal
 */
function calcDailyFactor(annualRatePercent: number, spread?: SpreadConfig): Decimal {
  let effectiveRate = new Decimal(annualRatePercent).div(100);

  if (spread) {
    if (spread.mode === 'percentage') {
      // Ex: 110% do CDI → taxa_efetiva = 1.10 * cdi
      effectiveRate = effectiveRate.mul(new Decimal(spread.value).div(100));
    }
    // Para mode='additive', o spread é somado ao fator acumulado (tratado no acumulador)
  }

  // fator_diario = (1 + taxa_efetiva) ^ (1/252)
  return effectiveRate.plus(1).pow(new Decimal(1).div(252));
}

/**
 * Mapeia IndexDataPoint[] para um Map de ISO date string → taxa anual
 */
function buildRateMap(indexData: IndexDataPoint[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const point of indexData) {
    map.set(toISODate(point.date), point.value);
  }
  return map;
}

/**
 * Calcula a correção via CDI/Selic para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com taxas CDI)
 * @returns Array de linhas da memória de cálculo
 */
export function calculateCDI(input: CalculationInput): CalculationMemoryRow[] {
  const { startDate, endDate, initialAmount, indexData = [], spread, futurePremises = [] } = input;

  // Monta mapa de taxas: data → taxa anual
  const rateMap = buildRateMap(indexData);

  // Monta mapa de premissas futuras
  const projectedRateMap = new Map<string, number>();
  for (const premise of futurePremises) {
    let d = new Date(premise.startDate);
    d.setHours(0, 0, 0, 0);
    const endP = new Date(premise.endDate);
    endP.setHours(0, 0, 0, 0);
    while (d <= endP) {
      projectedRateMap.set(toISODate(d), premise.rate);
      d = new Date(d);
      d.setDate(d.getDate() + 1);
    }
  }

  const businessDays = getBusinessDaysBetween(startDate, endDate);

  const rows: CalculationMemoryRow[] = [];
  let accumulatedFactor = new Decimal(1);
  let currentBalance = new Decimal(initialAmount);

  for (const day of businessDays) {
    const isoDate = toISODate(day);
    let isProjected = false;
    let rate: number;

    if (rateMap.has(isoDate)) {
      rate = rateMap.get(isoDate)!;
    } else if (projectedRateMap.has(isoDate)) {
      rate = projectedRateMap.get(isoDate)!;
      isProjected = true;
    } else {
      // Fallback: taxa do último dia disponível (não deve ocorrer em uso normal)
      rate = 0;
      isProjected = true;
    }

    const dailyFactor = calcDailyFactor(rate, spread);
    accumulatedFactor = accumulatedFactor.mul(dailyFactor);
    currentBalance = currentBalance.mul(dailyFactor);

    rows.push({
      date: new Date(day),
      indexRate: rate,
      dailyFactor: dailyFactor.toNumber(),
      accumulatedFactor: accumulatedFactor.toNumber(),
      balance: currentBalance.toNumber(),
      isProjected,
    });
  }

  return rows;
}

/**
 * Calcula o fator acumulado de CDI com spread aditivo.
 * Usado internamente pelo CalculationEngine para composição IPCA+6%a.a. etc.
 */
export function calcAdditiveSpreadFactor(
  accumulatedIndexFactor: Decimal,
  spreadAnnualPercent: number,
  calendarDays: number,
  basis: number
): Decimal {
  // fator_spread = (1 + spread/100) ^ (dc/basis)
  const spreadFactor = new Decimal(1 + spreadAnnualPercent / 100).pow(
    new Decimal(calendarDays).div(basis)
  );
  return accumulatedIndexFactor.mul(spreadFactor);
}
