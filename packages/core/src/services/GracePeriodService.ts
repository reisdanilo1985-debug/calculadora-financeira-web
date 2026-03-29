/**
 * Serviço de carência — aplica a lógica de carência sobre memória de cálculo
 * já processada pelos engines base (CDI, IPCA, etc.).
 *
 * Tipo A / D: sem modificação (juros capitalizam — comportamento padrão)
 * Tipo B: saldo congelado durante a carência
 * Tipo C: saldo congelado, juros contabilizados como pagamentos saídos
 */

import Decimal from 'decimal.js';
import {
  CalculationMemoryRow,
  GracePeriodConfig,
  GracePeriodType,
  GracePeriodInfo,
} from '../models/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function applyGracePeriod(
  rows: CalculationMemoryRow[],
  initialAmount: number,
  gracePeriod: GracePeriodConfig
): { rows: CalculationMemoryRow[] } & Omit<GracePeriodInfo, 'type' | 'endDate'> {
  if (
    gracePeriod.type === GracePeriodType.A ||
    gracePeriod.type === GracePeriodType.D
  ) {
    return { rows, deferredInterest: 0, interestPayments: 0 };
  }

  const graceEndDate = new Date(gracePeriod.endDate);
  graceEndDate.setHours(0, 0, 0, 0);

  // Fator acumulado até o fim da carência
  let factorAtGraceEnd = new Decimal(1);
  for (const row of rows) {
    const d = new Date(row.date);
    d.setHours(0, 0, 0, 0);
    if (d <= graceEndDate) {
      factorAtGraceEnd = new Decimal(row.accumulatedFactor);
    } else {
      break;
    }
  }

  const initial = new Decimal(initialAmount);
  let deferredInterest = new Decimal(0);
  let interestPayments = new Decimal(0);

  const adjustedRows: CalculationMemoryRow[] = rows.map(row => {
    const rowDate = new Date(row.date);
    rowDate.setHours(0, 0, 0, 0);
    const isInGrace = rowDate <= graceEndDate;

    if (!isInGrace) {
      // Pós-carência: recalcula saldo a partir do montante inicial × fator_relativo
      const adjustedBalance = initial.mul(
        new Decimal(row.accumulatedFactor).div(factorAtGraceEnd)
      );
      return { ...row, balance: adjustedBalance.toNumber() };
    }

    // Dentro da carência
    const interestThisPeriod = initial.mul(
      new Decimal(row.dailyFactor).minus(1)
    );

    if (gracePeriod.type === GracePeriodType.B) {
      deferredInterest = deferredInterest.plus(interestThisPeriod);
      return {
        ...row,
        balance: initialAmount,
        description: 'Carência Tipo B — juros diferidos',
      };
    }

    // Type C: interest paid out
    interestPayments = interestPayments.plus(interestThisPeriod);
    return {
      ...row,
      balance: initialAmount,
      amortizationAmount: interestThisPeriod.toNumber(),
      description: `Carência Tipo C — juros pagos: ${interestThisPeriod.toFixed(6)}`,
    };
  });

  return {
    rows: adjustedRows,
    deferredInterest: deferredInterest.toNumber(),
    interestPayments: interestPayments.toNumber(),
  };
}
