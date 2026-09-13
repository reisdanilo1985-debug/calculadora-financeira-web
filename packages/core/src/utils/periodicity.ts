/**
 * Periodicidade de eventos recorrentes (amortizações periódicas, parcelas do Fluxo
 * Completo, perpetuidade do DCF) e soma de meses ancorada no dia original.
 */

import { PeriodicityType } from '../models/types';

/** Meses entre dois eventos da periodicidade. Lança para valor fora do enum. */
export function monthsPerPeriod(periodicity: PeriodicityType): number {
  switch (periodicity) {
    case PeriodicityType.MONTHLY: return 1;
    case PeriodicityType.QUARTERLY: return 3;
    case PeriodicityType.SEMIANNUAL: return 6;
    case PeriodicityType.ANNUAL: return 12;
    default:
      throw new Error(`Periodicidade inválida: "${periodicity}". Use MONTHLY, QUARTERLY, SEMIANNUAL ou ANNUAL.`);
  }
}

/** Soma meses mantendo o dia da âncora, limitado ao último dia do mês de destino (31/01 → 28/02 → 31/03) */
export function addMonthsAnchored(anchor: Date, months: number): Date {
  const target = new Date(anchor.getFullYear(), anchor.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchor.getDate(), lastDay));
  return target;
}
