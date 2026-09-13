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

import Decimal from 'decimal.js';
import { CalculationInput, CalculationMemoryRow, SpreadConfig } from '../models/types';
import { MissingIndexDataError, agruparIntervalos } from '../models/errors';
import { getCalendarDaysBetween, toISODate } from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Maior distância, em dias corridos, entre a última publicação e um dia do
 * período. No histórico do NY Fed o maior intervalo entre publicações é de
 * 4 dias (fim de semana prolongado); acima disso é lacuna de dado.
 */
const MAX_DIAS_SEM_PUBLICACAO = 4;

interface Publicacao {
  rate: number;
  isProjected: boolean;
}

/** Taxa efetiva do intervalo em fração a.a., com a composição do spread */
function taxaEfetiva(ratePercent: number, spread?: SpreadConfig): Decimal {
  let r = new Decimal(ratePercent);
  if (spread?.mode === 'percentage') r = r.mul(new Decimal(spread.value).div(100));
  if (spread?.mode === 'additive') r = r.plus(spread.value);
  return r.div(100);
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Calcula a correção via SOFR (ACT/360) para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com taxas SOFR diárias)
 * @returns Array de linhas da memória de cálculo (uma por dia corrido)
 */
export function calculateSOFR(input: CalculationInput): CalculationMemoryRow[] {
  const { startDate, endDate, initialAmount, indexData = [], futurePremises = [], spread } = input;

  // Publicações oficiais
  const publicacoes = new Map<string, Publicacao>();
  for (const point of indexData) {
    publicacoes.set(toISODate(point.date), { rate: point.value, isProjected: point.isProjected ?? false });
  }

  // Premissas: uma "publicação" por dia de semana sem dado oficial
  for (const premise of futurePremises) {
    const d = new Date(premise.startDate);
    d.setHours(0, 0, 0, 0);
    const endP = new Date(premise.endDate);
    endP.setHours(0, 0, 0, 0);
    while (d <= endP) {
      const dow = d.getDay();
      const iso = toISODate(d);
      if (dow !== 0 && dow !== 6 && !publicacoes.has(iso)) {
        publicacoes.set(iso, { rate: premise.rate, isProjected: true });
      }
      d.setDate(d.getDate() + 1);
    }
  }

  const inicio = new Date(startDate);
  inicio.setHours(0, 0, 0, 0);

  // Taxa vigente no início: última publicação anterior ao início, se houver
  let vigente: (Publicacao & { publicadaEm: Date; inicioIntervalo: Date }) | null = null;
  const isoInicio = toISODate(inicio);
  let ultimaAnterior: string | null = null;
  for (const iso of publicacoes.keys()) {
    if (iso < isoInicio && (ultimaAnterior === null || iso > ultimaAnterior)) ultimaAnterior = iso;
  }
  if (ultimaAnterior) {
    const [y, m, d] = ultimaAnterior.split('-').map(Number);
    vigente = { ...publicacoes.get(ultimaAnterior)!, publicadaEm: new Date(y, m - 1, d), inicioIntervalo: inicio };
  }

  const allDays = getCalendarDaysBetween(startDate, endDate);
  const semDado: Date[] = [];
  const rows: CalculationMemoryRow[] = [];
  let accumulatedFactor = new Decimal(1);
  let currentBalance = new Decimal(initialAmount);

  for (const day of allDays) {
    const iso = toISODate(day);
    const pub = publicacoes.get(iso);
    if (pub) {
      vigente = { ...pub, publicadaEm: new Date(day), inicioIntervalo: new Date(day) };
    }

    if (!vigente || diasEntre(vigente.publicadaEm, day) > MAX_DIAS_SEM_PUBLICACAO) {
      semDado.push(new Date(day));
      continue;
    }

    // Fator linear do intervalo antes e depois deste dia: 1 + r·k/360
    const r = taxaEfetiva(vigente.rate, spread);
    const k = diasEntre(vigente.inicioIntervalo, day);
    const linearAntes = r.mul(k).div(360).plus(1);
    const linearDepois = r.mul(k + 1).div(360).plus(1);
    const dailyFactor = linearDepois.div(linearAntes);

    accumulatedFactor = accumulatedFactor.mul(dailyFactor);
    currentBalance = currentBalance.mul(dailyFactor);

    rows.push({
      date: new Date(day),
      indexRate: vigente.rate,
      dailyFactor: dailyFactor.toNumber(),
      accumulatedFactor: accumulatedFactor.toNumber(),
      balance: currentBalance.toNumber(),
      isProjected: vigente.isProjected,
    });
  }

  if (semDado.length > 0) {
    throw new MissingIndexDataError('SOFR', agruparIntervalos(semDado, 1));
  }

  return rows;
}
