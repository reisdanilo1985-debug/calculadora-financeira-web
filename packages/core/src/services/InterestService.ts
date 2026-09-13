/**
 * Serviço de juros remuneratórios para Tese T5.
 *
 * Aplica juros simples ou compostos sobre o saldo já corrigido pelo indexador.
 *
 * Juros Compostos: saldo_final = saldo_corrigido × (1 + taxa)^t
 * Juros Simples:   saldo_final = saldo_corrigido + capital_inicial × taxa × t
 *
 * t é medido até o FIM do intervalo que cada linha representa:
 *   - linhas datadas no início do acúmulo (CDI/Selic, SOFR, pré): até a data
 *     da próxima linha, e até a data final na última linha;
 *   - linhas datadas no fim do acúmulo (índices mensais): até a própria data.
 * Assim a última linha leva os juros até a data final (antes parava no último
 * dia útil e perdia o intervalo final).
 *
 * Com amortizações, a propagação por razão de fatores equivale a juros simples
 * sobre o principal remanescente depois do evento.
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
 * @param endDate        Data final do cálculo (fim do intervalo da última linha)
 * @param rowsDatedAtAccrualEnd  true para engines que datam a linha no fim do acúmulo
 */
export function applyInterest(
  rows: CalculationMemoryRow[],
  initialAmount: number,
  annualRate: number,
  interestType: InterestType,
  startDate: Date,
  dayCountBasis: DayCountBasis,
  endDate?: Date,
  rowsDatedAtAccrualEnd = false
): CalculationMemoryRow[] {
  const rate = new Decimal(annualRate).div(100);
  const P0 = new Decimal(initialAmount);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : null;
  end?.setHours(0, 0, 0, 0);

  let previousFactor = new Decimal(1);

  return rows.map((row, i) => {
    // Fim do intervalo desta linha
    let intervalEnd = new Date(row.date);
    if (!rowsDatedAtAccrualEnd) {
      intervalEnd = i + 1 < rows.length ? new Date(rows[i + 1].date) : (end ?? new Date(row.date));
    }
    intervalEnd.setHours(0, 0, 0, 0);

    const t = timeFractionYears(start, intervalEnd, dayCountBasis);
    const balanceDec = new Decimal(row.balance);

    let newBalance: Decimal;

    if (interestType === InterestType.SIMPLES) {
      // Saldo corrigido + juros lineares sobre o capital original
      newBalance = balanceDec.plus(P0.mul(rate).mul(t));
    } else {
      // Saldo corrigido × fator de juros compostos
      newBalance = balanceDec.mul(rate.plus(1).pow(t));
    }

    const accumulatedFactor = P0.isZero() ? new Decimal(1) : newBalance.div(P0);
    // Fator do dia coerente com o acumulado (usado para localizar o início do
    // acúmulo de cada linha nas amortizações)
    const dailyFactor = previousFactor.isZero() ? new Decimal(1) : accumulatedFactor.div(previousFactor);
    previousFactor = accumulatedFactor;

    return {
      ...row,
      balance: newBalance.toNumber(),
      accumulatedFactor: accumulatedFactor.toNumber(),
      dailyFactor: dailyFactor.toNumber(),
      description: row.description
        ? `${row.description} | Juros ${interestType === InterestType.SIMPLES ? 'simples' : 'compostos'}: ${annualRate}% a.a.`
        : `Juros ${interestType === InterestType.SIMPLES ? 'simples' : 'compostos'}: ${annualRate}% a.a.`,
    };
  });
}
