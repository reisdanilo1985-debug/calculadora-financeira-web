/**
 * Serviço de juros remuneratórios para Tese T5.
 *
 * Aplica juros simples ou compostos sobre o saldo já corrigido pelo indexador.
 *
 * Juros Compostos: saldo_final = saldo_corrigido × (1 + taxa)^t
 * Juros Simples:   saldo_final = saldo_corrigido + capital_inicial × taxa × t
 */

import Decimal from 'decimal.js';
import { CalculationMemoryRow, InterestType, DayCountBasis } from '../models/types';
import { getBusinessDaysBetween } from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

function timeFractionYears(from: Date, to: Date, basis: DayCountBasis): Decimal {
  if (basis === DayCountBasis.DU252) {
    const busDays = getBusinessDaysBetween(from, to).length;
    return new Decimal(busDays).div(252);
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const calDays = Math.max(0, Math.round((to.getTime() - from.getTime()) / msPerDay));
  return new Decimal(calDays).div(basis === DayCountBasis.DC360 ? 360 : 365);
}

/**
 * Aplica juros remuneratórios (simples ou compostos) sobre as linhas
 * já corrigidas pelo indexador de mercado (T1 base).
 *
 * @param rows       Linhas de memória produzidas pelo engine de índice
 * @param initialAmount  Montante original (base para juros simples)
 * @param annualRate     Taxa anual em % (ex: 6 para 6% a.a.)
 * @param interestType   SIMPLES ou COMPOSTA
 * @param startDate      Data de início do contrato
 * @param dayCountBasis  Base de dias para o cálculo do fator de tempo
 */
export function applyInterest(
  rows: CalculationMemoryRow[],
  initialAmount: number,
  annualRate: number,
  interestType: InterestType,
  startDate: Date,
  dayCountBasis: DayCountBasis
): CalculationMemoryRow[] {
  const rate = new Decimal(annualRate).div(100);
  const P0 = new Decimal(initialAmount);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  return rows.map(row => {
    const rowDate = new Date(row.date);
    rowDate.setHours(0, 0, 0, 0);

    const t = timeFractionYears(start, rowDate, dayCountBasis);
    const balanceDec = new Decimal(row.balance);

    let newBalance: Decimal;

    if (interestType === InterestType.SIMPLES) {
      // Saldo corrigido + juros lineares sobre o capital original
      newBalance = balanceDec.plus(P0.mul(rate).mul(t));
    } else {
      // Saldo corrigido × fator de juros compostos
      newBalance = balanceDec.mul(rate.plus(1).pow(t));
    }

    return {
      ...row,
      balance: newBalance.toNumber(),
      accumulatedFactor: P0.isZero() ? 1 : newBalance.div(P0).toNumber(),
      description: row.description
        ? `${row.description} | Juros ${interestType === InterestType.SIMPLES ? 'simples' : 'compostos'}: ${annualRate}% a.a.`
        : `Juros ${interestType === InterestType.SIMPLES ? 'simples' : 'compostos'}: ${annualRate}% a.a.`,
    };
  });
}
