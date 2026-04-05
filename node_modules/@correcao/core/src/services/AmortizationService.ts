/**
 * Serviço de processamento de amortizações.
 *
 * Lógica:
 *   1. Ordena amortizações por data
 *   2. Para cada período entre amortizações: corrige o saldo pelo indexador
 *   3. Na data de cada amortização: subtrai o valor do saldo corrigido
 *   4. O novo saldo é a base para o próximo período
 */

import Decimal from 'decimal.js';
import {
  AmortizationEntry,
  AmortizationType,
  CalculationInput,
  CalculationMemoryRow,
  PeriodicityType,
} from '../models/types';
import { addDays } from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Expande amortizações periódicas em entradas individuais.
 */
export function expandPeriodicAmortizations(
  amortizations: AmortizationEntry[]
): AmortizationEntry[] {
  const result: AmortizationEntry[] = [];

  for (const amort of amortizations) {
    if (amort.type !== AmortizationType.PERIODIC) {
      result.push(amort);
      continue;
    }

    if (!amort.periodicity || !amort.periodicEndDate) {
      result.push(amort);
      continue;
    }

    let current = new Date(amort.date);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(amort.periodicEndDate);
    endDate.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      result.push({
        date: new Date(current),
        type: amort.isPeriodicPercentage ? AmortizationType.PERCENTAGE : AmortizationType.FIXED,
        value: amort.value,
      });
      current = advanceByPeriodicity(current, amort.periodicity);
    }
  }

  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function advanceByPeriodicity(date: Date, periodicity: PeriodicityType): Date {
  const d = new Date(date);
  switch (periodicity) {
    case PeriodicityType.MONTHLY:
      d.setMonth(d.getMonth() + 1);
      break;
    case PeriodicityType.QUARTERLY:
      d.setMonth(d.getMonth() + 3);
      break;
    case PeriodicityType.SEMIANNUAL:
      d.setMonth(d.getMonth() + 6);
      break;
    case PeriodicityType.ANNUAL:
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

/**
 * Aplica amortizações sobre a memória de cálculo já calculada.
 *
 * Fórmula correta:
 *   Após amortização de valor V aplicada quando o fator acumulado era F_a,
 *   o saldo em qualquer momento futuro com fator F é:
 *     saldo_original(F) - V * (F / F_a)
 *
 * Isso garante que o efeito da amortização seja propagado corretamente.
 *
 * @param rows Memória de cálculo existente (ordenada por data)
 * @param amortizations Lista de amortizações (já expandidas)
 * @returns Nova memória de cálculo com amortizações aplicadas
 */
export function applyAmortizations(
  rows: CalculationMemoryRow[],
  amortizations: AmortizationEntry[]
): CalculationMemoryRow[] {
  if (!amortizations.length) return rows;

  const sortedAmorts = [...amortizations].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Eventos de amortização: fator acumulado no momento + valor amortizado
  interface AmortEvent {
    accFactor: Decimal;
    amortAmount: Decimal;
  }
  const amortEvents: AmortEvent[] = [];

  /**
   * Computa o saldo ajustado para uma linha, considerando todos os eventos de amortização.
   * saldo_ajustado = saldo_original - Σ(amort_i * acc_factor_atual / acc_factor_i)
   */
  function computeAdjustedBalance(row: CalculationMemoryRow): Decimal {
    let balance = new Decimal(row.balance);
    const currentFactor = new Decimal(row.accumulatedFactor);
    for (const evt of amortEvents) {
      const reduction = evt.amortAmount.mul(currentFactor.div(evt.accFactor));
      balance = balance.minus(reduction);
    }
    return balance.isNegative() ? new Decimal(0) : balance;
  }

  const result: CalculationMemoryRow[] = [];

  for (const row of rows) {
    const rowDate = new Date(row.date);
    rowDate.setHours(0, 0, 0, 0);

    // Verifica amortizações nesta data
    const amortOnDate = sortedAmorts.filter(a => {
      const d = new Date(a.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === rowDate.getTime();
    });

    const adjustedRow: CalculationMemoryRow = {
      ...row,
      balance: computeAdjustedBalance(row).toNumber(),
    };

    // Aplica amortizações desta data
    for (const amort of amortOnDate) {
      const currentBalance = new Decimal(adjustedRow.balance);
      let amortAmount: Decimal;

      if (amort.type === AmortizationType.FIXED) {
        amortAmount = Decimal.min(new Decimal(amort.value), currentBalance);
      } else {
        amortAmount = currentBalance.mul(new Decimal(amort.value).div(100));
      }

      // Registra evento de amortização com o fator acumulado atual
      amortEvents.push({
        accFactor: new Decimal(row.accumulatedFactor),
        amortAmount,
      });

      adjustedRow.balance = currentBalance.minus(amortAmount).toNumber();
      adjustedRow.amortizationAmount = (adjustedRow.amortizationAmount ?? 0) + amortAmount.toNumber();
      adjustedRow.description = `Amortização: ${
        amort.type === AmortizationType.FIXED
          ? `R$ ${amortAmount.toFixed(2)}`
          : `${amort.value}% do saldo`
      }`;
    }

    result.push(adjustedRow);
  }

  return result;
}

/**
 * Calcula o valor total amortizado em um conjunto de linhas.
 */
export function calcTotalAmortized(rows: CalculationMemoryRow[]): number {
  return rows.reduce((sum, row) => sum + (row.amortizationAmount ?? 0), 0);
}
