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
import {
  CalculationInput,
  CalculationMemoryRow,
  DayCountBasis,
  IndexDataPoint,
  SpreadConfig,
} from '../models/types';
import { MissingIndexDataError, agruparIntervalos } from '../models/errors';
import {
  countCalendarDays,
  getBusinessDaysBetween,
  toISODate,
} from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Calcula o fator diário do CDI/Selic para um dia com uma taxa anual e spread opcional.
 * O spread aditivo não entra aqui: é composto por fora (Fator de Spread).
 *
 * @param annualRatePercent Taxa anual em % (ex: 10.65)
 * @param spread Configuração de spread (opcional)
 * @returns Fator diário como Decimal
 */
function calcDailyFactor(annualRatePercent: number, spread?: SpreadConfig): Decimal {
  const annualRate = new Decimal(annualRatePercent).div(100);

  // fator_diario base = (1 + taxa_anual)^(1/252)
  const baseDailyFactor = annualRate.plus(1).pow(new Decimal(1).div(252));

  if (spread && spread.mode === 'percentage') {
    // Convenção CETIP/B3 ("% do DI"): o percentual incide sobre a taxa DIÁRIA:
    //   TDI = (1 + cdi_anual)^(1/252) − 1
    //   fator_diario = 1 + TDI × p
    const tdi = baseDailyFactor.minus(1);
    return tdi.mul(new Decimal(spread.value).div(100)).plus(1);
  }

  return baseDailyFactor;
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

  // Dias úteis sem dado oficial e sem premissa: erro explícito
  const missing = businessDays.filter(d => {
    const iso = toISODate(d);
    return !rateMap.has(iso) && !projectedRateMap.has(iso);
  });
  if (missing.length > 0) {
    throw new MissingIndexDataError(input.indexType ?? 'CDI', agruparIntervalos(missing, 4));
  }

  // Spread aditivo (Fator de Spread): base 252 por dia útil ou dias corridos/base
  const additive = spread?.mode === 'additive' ? spread : undefined;
  const additiveBase = additive ? Number(additive.additiveBase ?? DayCountBasis.DC365) : 0;
  const spreadRate = additive ? new Decimal(additive.value).div(100).plus(1) : new Decimal(1);
  const spreadDailyFactor252 = additive && additiveBase === DayCountBasis.DU252
    ? spreadRate.pow(new Decimal(1).div(252))
    : null;

  const rows: CalculationMemoryRow[] = [];
  let accumulatedFactor = new Decimal(1);
  let currentBalance = new Decimal(initialAmount);

  for (let i = 0; i < businessDays.length; i++) {
    const day = businessDays[i];
    const isoDate = toISODate(day);
    let isProjected = false;
    let rate: number;

    if (rateMap.has(isoDate)) {
      rate = rateMap.get(isoDate)!;
    } else {
      rate = projectedRateMap.get(isoDate)!;
      isProjected = true;
    }

    let dailyFactor = calcDailyFactor(rate, spread);

    if (additive) {
      if (spreadDailyFactor252) {
        dailyFactor = dailyFactor.mul(spreadDailyFactor252);
      } else {
        // Dias corridos que esta linha cobre: do início do período (1ª linha)
        // ou desta data até o próximo dia útil (ou a data final, na última).
        const from = i === 0 ? startDate : day;
        const to = i + 1 < businessDays.length ? businessDays[i + 1] : endDate;
        const dc = countCalendarDays(from, to);
        dailyFactor = dailyFactor.mul(spreadRate.pow(new Decimal(dc).div(additiveBase)));
      }
    }

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
