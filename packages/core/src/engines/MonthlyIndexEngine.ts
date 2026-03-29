/**
 * Engine de cálculo para indexadores mensais: IPCA, IGP-M, INCC.
 *
 * Fórmula:
 *   Para cada mês, o fator é aplicado proporcionalmente (pro-rata) quando as
 *   datas de início/fim não coincidem com o início/fim do mês.
 *
 *   fator_pro_rata = (1 + indice_mensal/100) ^ (dias_utilizados / dias_do_mes)
 *
 *   A base de cálculo (360 ou 365) configura o denominador do pro-rata.
 */

import Decimal from 'decimal.js';
import { CalculationInput, CalculationMemoryRow, DayCountBasis, IndexDataPoint } from '../models/types';
import { addDays, daysInMonth, toISODate } from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

interface MonthKey {
  year: number;
  month: number; // 0-indexed
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Constrói mapa de mês → variação mensal do índice.
 * Chave: 'YYYY-MM'
 */
function buildMonthlyRateMap(indexData: IndexDataPoint[]): Map<string, { value: number; isProjected: boolean }> {
  const map = new Map<string, { value: number; isProjected: boolean }>();
  for (const point of indexData) {
    const key = toMonthKey(point.date);
    map.set(key, { value: point.value, isProjected: point.isProjected ?? false });
  }
  return map;
}

/**
 * Calcula o número de dias corridos que uma data ocupa dentro de um mês.
 * Considera a base de cálculo (360 ou 365) para o denominador.
 */
function daysInMonthByBasis(date: Date, basis: DayCountBasis): number {
  if (basis === DayCountBasis.DC360) {
    return 30; // Convenção 30/360
  }
  return daysInMonth(date); // Dias reais do mês
}

/**
 * Gera segmentos mensais entre startDate e endDate.
 * Cada segmento representa a fração do mês utilizada.
 */
interface MonthSegment {
  year: number;
  month: number; // 0-indexed
  daysUsed: number;
  totalDaysInMonth: number;
  startOfSegment: Date;
}

function buildMonthSegments(startDate: Date, endDate: Date, basis: DayCountBasis): MonthSegment[] {
  const segments: MonthSegment[] = [];

  let current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current < end) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0); // último dia do mês

    // Fim do segmento: início do próximo mês ou data final, o que vier primeiro
    const segmentEnd = new Date(Math.min(new Date(year, month + 1, 1).getTime(), end.getTime()));

    // Dias utilizados no mês
    const daysUsed = Math.round((segmentEnd.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));

    const totalDays = daysInMonthByBasis(firstOfMonth, basis);

    segments.push({
      year,
      month,
      daysUsed,
      totalDaysInMonth: totalDays,
      startOfSegment: new Date(current),
    });

    current = new Date(year, month + 1, 1);
  }

  return segments;
}

/**
 * Calcula a correção via IPCA/IGP-M/INCC para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com variações mensais)
 * @returns Array de linhas da memória de cálculo (uma por mês)
 */
export function calculateMonthlyIndex(input: CalculationInput): CalculationMemoryRow[] {
  const {
    startDate,
    endDate,
    initialAmount,
    indexData = [],
    futurePremises = [],
    dayCountBasis,
    spread,
  } = input;

  // Mapa de taxas mensais: YYYY-MM → { value, isProjected }
  const rateMap = buildMonthlyRateMap(indexData);

  // Adiciona premissas futuras ao mapa
  for (const premise of futurePremises) {
    let d = new Date(premise.startDate);
    d.setHours(0, 0, 0, 0);
    const endP = new Date(premise.endDate);
    endP.setHours(0, 0, 0, 0);
    while (d <= endP) {
      const key = toMonthKey(d);
      if (!rateMap.has(key)) {
        rateMap.set(key, { value: premise.rate, isProjected: true });
      }
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  }

  const segments = buildMonthSegments(startDate, endDate, dayCountBasis);
  const rows: CalculationMemoryRow[] = [];
  let accumulatedFactor = new Decimal(1);
  let currentBalance = new Decimal(initialAmount);

  for (const seg of segments) {
    const key = `${seg.year}-${String(seg.month + 1).padStart(2, '0')}`;
    const rateEntry = rateMap.get(key);

    let monthlyRate = 0;
    let isProjected = false;

    if (rateEntry) {
      monthlyRate = rateEntry.value;
      isProjected = rateEntry.isProjected;
    } else {
      isProjected = true; // Sem dados → projetado (0%)
    }

    // fator_pro_rata = (1 + taxa_mensal/100) ^ (dias_utilizados / dias_do_mes)
    const proRataExponent = new Decimal(seg.daysUsed).div(seg.totalDaysInMonth);
    const monthFactor = new Decimal(1 + monthlyRate / 100).pow(proRataExponent);

    accumulatedFactor = accumulatedFactor.mul(monthFactor);
    currentBalance = currentBalance.mul(monthFactor);

    rows.push({
      date: new Date(seg.startOfSegment),
      indexRate: monthlyRate,
      dailyFactor: monthFactor.toNumber(),
      accumulatedFactor: accumulatedFactor.toNumber(),
      balance: currentBalance.toNumber(),
      isProjected,
      description: seg.daysUsed < seg.totalDaysInMonth
        ? `Pro-rata: ${seg.daysUsed}/${seg.totalDaysInMonth} dias`
        : undefined,
    });
  }

  // Aplica spread aditivo ao fator acumulado final, se houver
  if (spread?.mode === 'additive' && rows.length > 0) {
    const totalDays = Math.round(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const basisDays = dayCountBasis === DayCountBasis.DC360 ? 360 : 365;
    const spreadFactor = new Decimal(1 + spread.value / 100).pow(
      new Decimal(totalDays).div(basisDays)
    );

    // Aplica o spread sobre o saldo final
    const lastRow = rows[rows.length - 1];
    const finalBalance = new Decimal(lastRow.balance).mul(spreadFactor);
    const finalAccFactor = new Decimal(lastRow.accumulatedFactor).mul(spreadFactor);

    // Adiciona linha de spread
    rows.push({
      date: new Date(endDate),
      indexRate: spread.value,
      dailyFactor: spreadFactor.toNumber(),
      accumulatedFactor: finalAccFactor.toNumber(),
      balance: finalBalance.toNumber(),
      isProjected: false,
      description: `Spread aditivo: ${spread.value}% a.a.`,
    });
  }

  return rows;
}
