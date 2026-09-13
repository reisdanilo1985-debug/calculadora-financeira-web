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
 *
 *   Composição:
 *   - "% do índice" (ex: 110% do IPCA): taxa_mensal_efetiva = taxa_mensal × percentual/100
 *   - Índice + taxa (ex: IPCA + 6% a.a.): o fator do spread é composto em cada
 *     segmento, (1 + spread/100)^(dias_corridos_do_segmento/base), para que
 *     amortizações intermediárias deixem de render o spread a partir da data do evento.
 *
 *   Todo mês do período precisa de dado oficial ou de premissa; mês sem nenhum
 *   dos dois gera MissingIndexDataError (antes entrava com 0%).
 */

import Decimal from 'decimal.js';
import { CalculationInput, CalculationMemoryRow, DayCountBasis, IndexDataPoint } from '../models/types';
import { MissingIndexDataError } from '../models/errors';
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
 * Dias entre duas datas na contagem da base: 30E/360 para DC360
 * (dia 31 conta como 30), dias corridos reais para DC365.
 */
function countSegmentDays(from: Date, to: Date, basis: DayCountBasis): number {
  if (basis === DayCountBasis.DC360) {
    const d1 = Math.min(from.getDate(), 30);
    const d2 = Math.min(to.getDate(), 30);
    return (to.getFullYear() - from.getFullYear()) * 360 + (to.getMonth() - from.getMonth()) * 30 + (d2 - d1);
  }
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
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
  endOfSegment: Date;
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

    // Fim do segmento: início do próximo mês ou data final, o que vier primeiro
    const segmentEnd = new Date(Math.min(new Date(year, month + 1, 1).getTime(), end.getTime()));

    // Dias utilizados no mês: base 360 conta em 30/360 também no numerador
    // (mês fechado = 30/30 = fator mensal integral); base 365 usa dias reais.
    const daysUsed = countSegmentDays(current, segmentEnd, basis);

    const totalDays = daysInMonthByBasis(firstOfMonth, basis);

    segments.push({
      year,
      month,
      daysUsed,
      totalDaysInMonth: totalDays,
      startOfSegment: new Date(current),
      endOfSegment: new Date(segmentEnd),
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
    splitDates = [],
  } = input;

  // Normaliza splits e ordena
  const normalizedSplits = splitDates
    .map(d => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    })
    .sort((a, b) => a.getTime() - b.getTime());

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

  // Meses sem dado oficial e sem premissa: erro explícito
  const missingMonths = segments
    .filter(seg => !rateMap.has(`${seg.year}-${String(seg.month + 1).padStart(2, '0')}`))
    .map(seg => new Date(seg.year, seg.month, 1));
  if (missingMonths.length > 0) {
    const intervalos: { inicio: Date; fim: Date }[] = [];
    for (const m of missingMonths) {
      const ultimo = intervalos[intervalos.length - 1];
      const mesSeguinte = ultimo && new Date(ultimo.fim.getFullYear(), ultimo.fim.getMonth() + 1, 1);
      if (ultimo && mesSeguinte.getTime() === m.getTime()) ultimo.fim = m;
      else intervalos.push({ inicio: m, fim: m });
    }
    throw new MissingIndexDataError(input.indexType ?? 'índice mensal', intervalos, true);
  }

  // Composição com o índice
  const percentOfIndex = spread?.mode === 'percentage' ? new Decimal(spread.value).div(100) : null;
  const additive = spread?.mode === 'additive' ? spread : undefined;
  // Base do spread: additiveBase 360/365 quando informada (360 conta em 30E/360, para taxa
  // informada ao mês); senão, a base do cálculo. O pro-rata do índice não muda.
  const additiveBase = additive?.additiveBase != null ? Number(additive.additiveBase) : undefined;
  const spreadBasis = additiveBase === DayCountBasis.DC360 || additiveBase === DayCountBasis.DC365
    ? additiveBase
    : dayCountBasis === DayCountBasis.DC360 ? DayCountBasis.DC360 : DayCountBasis.DC365;
  const spreadBasisDays = spreadBasis === DayCountBasis.DC360 ? 360 : 365;
  const spreadRate = additive ? new Decimal(additive.value).div(100).plus(1) : null;
  const spreadDaysBetween = (from: Date, to: Date): number => countSegmentDays(from, to, spreadBasis);
  const spreadFactorFor = (spreadDays: number): Decimal =>
    spreadRate ? spreadRate.pow(new Decimal(spreadDays).div(spreadBasisDays)) : new Decimal(1);

  const rows: CalculationMemoryRow[] = [];
  let accumulatedFactor = new Decimal(1);
  let currentBalance = new Decimal(initialAmount);

  for (const seg of segments) {
    const key = `${seg.year}-${String(seg.month + 1).padStart(2, '0')}`;
    const rateEntry = rateMap.get(key)!;

    const monthlyRate = rateEntry.value;
    const isProjected = rateEntry.isProjected;
    // Taxa mensal efetiva (com "% do índice", se houver)
    const effectiveMonthlyRate = percentOfIndex
      ? new Decimal(monthlyRate).div(100).mul(percentOfIndex)
      : new Decimal(monthlyRate).div(100);

    // fator_pro_rata = (1 + taxa_mensal/100) ^ (dias_utilizados / dias_do_mes) × fator do spread
    const proRataExponent = new Decimal(seg.daysUsed).div(seg.totalDaysInMonth);
    const segSpreadDays = spreadDaysBetween(seg.startOfSegment, seg.endOfSegment);
    const monthFactor = effectiveMonthlyRate.plus(1).pow(proRataExponent).mul(spreadFactorFor(segSpreadDays));

    const segStartFactor = accumulatedFactor;
    const segStartBalance = currentBalance;
    const segStartTime = seg.startOfSegment.getTime();
    const segEndTime = seg.endOfSegment.getTime();

    // Insere linhas-âncora para datas de split que caiam dentro deste segmento
    // (exclusivo nos extremos para evitar duplicar a linha de fronteira).
    const anchors = normalizedSplits.filter(
      d => d.getTime() > segStartTime && d.getTime() < segEndTime
    );
    for (const anchorDate of anchors) {
      const elapsedDays = countSegmentDays(seg.startOfSegment, anchorDate, dayCountBasis);
      const partialExponent = new Decimal(elapsedDays).div(seg.totalDaysInMonth);
      const partialFactor = effectiveMonthlyRate.plus(1).pow(partialExponent)
        .mul(spreadFactorFor(spreadDaysBetween(seg.startOfSegment, anchorDate)));
      const anchorAccFactor = segStartFactor.mul(partialFactor);
      const anchorBalance = segStartBalance.mul(partialFactor);
      rows.push({
        date: new Date(anchorDate),
        indexRate: monthlyRate,
        dailyFactor: partialFactor.toNumber(),
        accumulatedFactor: anchorAccFactor.toNumber(),
        balance: anchorBalance.toNumber(),
        isProjected,
        description: `Pro-rata: ${elapsedDays}/${seg.totalDaysInMonth} dias`,
      });
    }

    accumulatedFactor = accumulatedFactor.mul(monthFactor);
    currentBalance = currentBalance.mul(monthFactor);

    rows.push({
      date: new Date(seg.endOfSegment),
      indexRate: monthlyRate,
      dailyFactor: monthFactor.toNumber(),
      accumulatedFactor: accumulatedFactor.toNumber(),
      balance: currentBalance.toNumber(),
      isProjected,
      description: [
        seg.daysUsed < seg.totalDaysInMonth ? `Pro-rata: ${seg.daysUsed}/${seg.totalDaysInMonth} dias` : '',
        additive ? `Spread aditivo: ${additive.value}% a.a. (${segSpreadDays}/${spreadBasisDays})` : '',
      ].filter(Boolean).join(' · ') || undefined,
    });
  }

  return rows;
}
