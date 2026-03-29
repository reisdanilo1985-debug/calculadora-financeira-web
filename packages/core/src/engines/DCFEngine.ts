/**
 * Engine para Valor Presente (Discounted Cash Flow) — Tese T2.
 *
 * Fórmula: PV = FV / (1 + r)^t
 * onde t é calculado pela base de dias configurada.
 */

import Decimal from 'decimal.js';
import { DCFCashFlow, DCFResult, DCFFlowResult, DayCountBasis, Currency } from '../models/types';
import { getBusinessDaysBetween } from '../utils/businessDays';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Calcula a fração de tempo em anos entre duas datas, conforme a base.
 */
function calcTimeFraction(from: Date, to: Date, basis: DayCountBasis): Decimal {
  if (basis === DayCountBasis.DU252) {
    const busDays = getBusinessDaysBetween(from, to).length;
    return new Decimal(busDays).div(252);
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const calDays = Math.max(
    0,
    Math.round((to.getTime() - from.getTime()) / msPerDay)
  );
  return new Decimal(calDays).div(basis === DayCountBasis.DC360 ? 360 : 365);
}

/**
 * Calcula o Valor Presente de um conjunto de fluxos futuros.
 */
export function calculateDCF(params: {
  cashFlows: DCFCashFlow[];
  discountRate: number;
  referenceDate: Date;
  dayCountBasis: DayCountBasis;
  currency: Currency;
}): DCFResult {
  const { cashFlows, discountRate, referenceDate, dayCountBasis, currency } = params;

  if (!cashFlows.length) {
    throw new Error('Ao menos um fluxo de caixa é necessário.');
  }

  const rate = new Decimal(discountRate).div(100);

  const flowResults: DCFFlowResult[] = [];
  let totalPV = new Decimal(0);
  let totalNominal = new Decimal(0);
  let weightedTime = new Decimal(0);

  for (const flow of cashFlows) {
    const flowDate = new Date(flow.date);
    flowDate.setHours(0, 0, 0, 0);
    const refDate = new Date(referenceDate);
    refDate.setHours(0, 0, 0, 0);

    if (flowDate <= refDate) {
      throw new Error(
        `Fluxo em ${flowDate.toISOString().slice(0, 10)} deve ser após a data de referência.`
      );
    }

    const t = calcTimeFraction(refDate, flowDate, dayCountBasis);
    // PV = FV / (1 + r)^t
    const discountFactor = new Decimal(1).div(rate.plus(1).pow(t));
    const pv = new Decimal(flow.amount).mul(discountFactor);

    flowResults.push({
      date: flowDate,
      nominalAmount: flow.amount,
      pv: pv.toNumber(),
      discountFactor: discountFactor.toNumber(),
      timeFractionYears: t.toNumber(),
      contributionPercent: 0, // calculated after totaling
    });

    totalPV = totalPV.plus(pv);
    totalNominal = totalNominal.plus(new Decimal(flow.amount));
    weightedTime = weightedTime.plus(t.mul(pv));
  }

  // Macaulay duration = Σ(t * PV) / TotalPV
  const macaulayDuration = totalPV.isZero()
    ? 0
    : weightedTime.div(totalPV).toNumber();

  // Contribution %
  for (const fr of flowResults) {
    fr.contributionPercent = totalPV.isZero()
      ? 0
      : new Decimal(fr.pv).div(totalPV).mul(100).toNumber();
  }

  return {
    referenceDate,
    discountRate,
    dayCountBasis,
    currency,
    totalPV: totalPV.toNumber(),
    totalNominal: totalNominal.toNumber(),
    macaulayDuration,
    flows: flowResults,
  };
}
