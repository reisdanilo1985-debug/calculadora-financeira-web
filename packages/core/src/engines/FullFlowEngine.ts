/**
 * Engine para Fluxo Completo com SAC / Price / Bullet — Tese T4.
 *
 * Calcula o cronograma completo de amortizações com juros remuneratórios.
 * Fase 1: sem indexador de correção monetária (apenas taxa pré-fixada).
 */

import Decimal from 'decimal.js';
import {
  AmortizationSystem,
  FullFlowMemoryRow,
  FullFlowResult,
  Currency,
  GracePeriodConfig,
  GracePeriodType,
} from '../models/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Calcula a taxa mensal equivalente à taxa anual (juros compostos). */
function annualToMonthlyRate(annualRate: number): Decimal {
  // (1 + annual)^(1/12) - 1
  return new Decimal(1 + annualRate / 100)
    .pow(new Decimal(1).div(12))
    .minus(1);
}

/** Avança uma data por N meses. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Calcula o número de meses entre duas datas. */
function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  );
}

/**
 * Calcula o cronograma completo de amortizações.
 */
export function calculateFullFlow(params: {
  principal: number;
  startDate: Date;
  numberOfPeriods: number;
  annualRate: number;
  amortizationSystem: AmortizationSystem;
  currency: Currency;
  gracePeriod?: GracePeriodConfig;
}): FullFlowResult {
  const {
    principal,
    startDate,
    numberOfPeriods,
    annualRate,
    amortizationSystem,
    currency,
    gracePeriod,
  } = params;

  const monthlyRate = annualToMonthlyRate(annualRate);
  const P = new Decimal(principal);

  // Quantos meses de carência?
  let gracePeriodMonths = 0;
  if (gracePeriod) {
    const graceEnd = new Date(gracePeriod.endDate);
    graceEnd.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    gracePeriodMonths = Math.max(0, monthsBetween(start, graceEnd));
  }

  const amortPeriods = numberOfPeriods - gracePeriodMonths;

  // Pre-calcular PMT para Price
  let pmt = new Decimal(0);
  if (amortizationSystem === AmortizationSystem.PRICE && amortPeriods > 0) {
    const r = monthlyRate;
    const nA = new Decimal(amortPeriods);
    if (r.isZero()) {
      pmt = P.div(nA);
    } else {
      // PMT = P * r / (1 - (1+r)^-n)
      pmt = P.mul(r).div(
        new Decimal(1).minus(r.plus(1).pow(nA.negated()))
      );
    }
  }

  // Amortização fixa para SAC
  const fixedSACAmort =
    amortizationSystem === AmortizationSystem.SAC && amortPeriods > 0
      ? P.div(new Decimal(amortPeriods))
      : new Decimal(0);

  const rows: FullFlowMemoryRow[] = [];
  let balance = P;
  let totalInterest = new Decimal(0);
  let totalAmortized = new Decimal(0);
  let totalPayments = new Decimal(0);

  // Type A: balance grows during grace (capitalize interest)
  // Type B: balance frozen
  // Type C: interest paid out, balance frozen
  // Type D: same as A
  const gracePeriodType = gracePeriod?.type ?? GracePeriodType.A;

  for (let i = 1; i <= numberOfPeriods; i++) {
    const periodDate = addMonths(startDate, i);
    const isGrace = i <= gracePeriodMonths;
    const openingBalance = balance;
    const interest = openingBalance.mul(monthlyRate);
    let amortization = new Decimal(0);
    let totalPayment = new Decimal(0);

    if (isGrace) {
      switch (gracePeriodType) {
        case GracePeriodType.A:
        case GracePeriodType.D:
          // Juros capitalizam
          balance = openingBalance.plus(interest);
          totalPayment = new Decimal(0);
          break;
        case GracePeriodType.B:
          // Saldo congelado
          balance = openingBalance;
          totalPayment = new Decimal(0);
          break;
        case GracePeriodType.C:
          // Juros pagos, principal preservado
          balance = openingBalance;
          totalPayment = interest;
          break;
      }
    } else {
      switch (amortizationSystem) {
        case AmortizationSystem.SAC: {
          amortization = Decimal.min(fixedSACAmort, balance);
          totalPayment = interest.plus(amortization);
          balance = openingBalance.minus(amortization);
          break;
        }
        case AmortizationSystem.PRICE: {
          // Parcela fixa; amortização = PMT - juros
          const amortCalc = pmt.minus(interest);
          amortization = Decimal.min(
            amortCalc.isNegative() ? new Decimal(0) : amortCalc,
            balance
          );
          totalPayment = interest.plus(amortization);
          balance = openingBalance.minus(amortization);
          break;
        }
        case AmortizationSystem.BULLET: {
          if (i === numberOfPeriods) {
            // Último período: paga tudo
            amortization = balance;
            totalPayment = interest.plus(amortization);
            balance = new Decimal(0);
          } else {
            totalPayment = interest;
            balance = openingBalance;
          }
          break;
        }
      }
    }

    if (balance.isNegative()) balance = new Decimal(0);

    totalInterest = totalInterest.plus(interest);
    totalAmortized = totalAmortized.plus(amortization);
    totalPayments = totalPayments.plus(totalPayment);

    rows.push({
      periodNumber: i,
      date: periodDate,
      openingBalance: openingBalance.toNumber(),
      monetaryCorrection: 0,
      interest: interest.toNumber(),
      amortization: amortization.toNumber(),
      totalPayment: totalPayment.toNumber(),
      closingBalance: balance.toNumber(),
      isGracePeriod: isGrace,
      isProjected: false,
      description: isGrace
        ? `Carência Tipo ${gracePeriodType}`
        : undefined,
    });
  }

  return {
    principal,
    annualRate,
    amortizationSystem,
    currency,
    totalInterest: totalInterest.toNumber(),
    totalMonetaryCorrection: 0,
    totalPayments: totalPayments.toNumber(),
    totalAmortized: totalAmortized.toNumber(),
    rows,
  };
}
