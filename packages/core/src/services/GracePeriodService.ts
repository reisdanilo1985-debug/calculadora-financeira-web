/**
 * Serviço de carência — aplica a lógica de carência sobre memória de cálculo
 * já processada pelos engines base (CDI, IPCA, etc.).
 *
 * Tipo A / D: sem modificação (juros capitalizam — comportamento padrão)
 * Tipo B: saldo congelado durante a carência
 * Tipo C: saldo congelado, juros contabilizados como pagamentos saídos
 *
 * A carência cobre [início, data de término): o dia do término já rende.
 * Como os engines datam as linhas de formas diferentes, a pertinência de uma
 * linha à carência depende do intervalo de acúmulo que ela representa:
 *   - linhas datadas no INÍCIO do acúmulo (CDI/Selic, SOFR, pré-fixada): a
 *     linha do dia d rende de d ao próximo dia → está na carência se d < término;
 *   - linhas datadas no FIM do acúmulo (índices mensais): a linha do dia d
 *     fecha o segmento que termina em d → está na carência se d <= término.
 *
 * Em B e C, o fator acumulado das linhas é reescrito para o fator do SALDO
 * (1 na carência; F / F_término depois). Assim o fator exibido bate com o saldo
 * e amortizações feitas dentro da carência reduzem o principal congelado e só
 * passam a ser corrigidas a partir do término.
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
  gracePeriod: GracePeriodConfig,
  rowsDatedAtAccrualEnd = false
): { rows: CalculationMemoryRow[] } & Omit<GracePeriodInfo, 'type' | 'endDate'> {
  if (
    gracePeriod.type === GracePeriodType.A ||
    gracePeriod.type === GracePeriodType.D
  ) {
    return { rows, deferredInterest: 0, interestPayments: 0 };
  }

  const graceEndDate = new Date(gracePeriod.endDate);
  graceEndDate.setHours(0, 0, 0, 0);

  const isInGrace = (row: CalculationMemoryRow): boolean => {
    const d = new Date(row.date);
    d.setHours(0, 0, 0, 0);
    return rowsDatedAtAccrualEnd ? d <= graceEndDate : d < graceEndDate;
  };

  // Fator acumulado até o fim da carência
  let factorAtGraceEnd = new Decimal(1);
  for (const row of rows) {
    if (isInGrace(row)) {
      factorAtGraceEnd = new Decimal(row.accumulatedFactor);
    } else {
      break;
    }
  }

  const initial = new Decimal(initialAmount);
  let deferredInterest = new Decimal(0);
  let interestPayments = new Decimal(0);

  const adjustedRows: CalculationMemoryRow[] = rows.map(row => {
    if (!isInGrace(row)) {
      // Pós-carência: saldo = montante inicial × fator relativo ao término
      const relativeFactor = new Decimal(row.accumulatedFactor).div(factorAtGraceEnd);
      return {
        ...row,
        accumulatedFactor: relativeFactor.toNumber(),
        balance: initial.mul(relativeFactor).toNumber(),
      };
    }

    // Dentro da carência
    const interestThisPeriod = initial.mul(
      new Decimal(row.dailyFactor).minus(1)
    );

    if (gracePeriod.type === GracePeriodType.B) {
      deferredInterest = deferredInterest.plus(interestThisPeriod);
      return {
        ...row,
        accumulatedFactor: 1,
        dailyFactor: 1,
        balance: initialAmount,
        description: 'Carência Tipo B — juros diferidos',
      };
    }

    // Type C: interest paid out
    interestPayments = interestPayments.plus(interestThisPeriod);
    return {
      ...row,
      accumulatedFactor: 1,
      dailyFactor: 1,
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
