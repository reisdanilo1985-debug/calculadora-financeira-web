"use strict";
/**
 * Engine para Fluxo Completo com SAC / Price / Bullet — Tese T4.
 *
 * Calcula o cronograma completo de amortizações com juros remuneratórios.
 * Fase 1: sem indexador de correção monetária (apenas taxa pré-fixada).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFullFlow = calculateFullFlow;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/** Calcula a taxa mensal equivalente à taxa anual (juros compostos). */
function annualToMonthlyRate(annualRate) {
    // (1 + annual)^(1/12) - 1
    return new decimal_js_1.default(1 + annualRate / 100)
        .pow(new decimal_js_1.default(1).div(12))
        .minus(1);
}
/** Avança uma data por N meses. */
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}
/** Calcula o número de meses entre duas datas. */
function monthsBetween(from, to) {
    return ((to.getFullYear() - from.getFullYear()) * 12 +
        (to.getMonth() - from.getMonth()));
}
/**
 * Calcula o cronograma completo de amortizações.
 */
function calculateFullFlow(params) {
    const { principal, startDate, numberOfPeriods, annualRate, amortizationSystem, currency, gracePeriod, } = params;
    const monthlyRate = annualToMonthlyRate(annualRate);
    const P = new decimal_js_1.default(principal);
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
    let pmt = new decimal_js_1.default(0);
    if (amortizationSystem === types_1.AmortizationSystem.PRICE && amortPeriods > 0) {
        const r = monthlyRate;
        const nA = new decimal_js_1.default(amortPeriods);
        if (r.isZero()) {
            pmt = P.div(nA);
        }
        else {
            // PMT = P * r / (1 - (1+r)^-n)
            pmt = P.mul(r).div(new decimal_js_1.default(1).minus(r.plus(1).pow(nA.negated())));
        }
    }
    // Amortização fixa para SAC
    const fixedSACAmort = amortizationSystem === types_1.AmortizationSystem.SAC && amortPeriods > 0
        ? P.div(new decimal_js_1.default(amortPeriods))
        : new decimal_js_1.default(0);
    const rows = [];
    let balance = P;
    let totalInterest = new decimal_js_1.default(0);
    let totalAmortized = new decimal_js_1.default(0);
    let totalPayments = new decimal_js_1.default(0);
    // Type A: balance grows during grace (capitalize interest)
    // Type B: balance frozen
    // Type C: interest paid out, balance frozen
    // Type D: same as A
    const gracePeriodType = gracePeriod?.type ?? types_1.GracePeriodType.A;
    for (let i = 1; i <= numberOfPeriods; i++) {
        const periodDate = addMonths(startDate, i);
        const isGrace = i <= gracePeriodMonths;
        const openingBalance = balance;
        const interest = openingBalance.mul(monthlyRate);
        let amortization = new decimal_js_1.default(0);
        let totalPayment = new decimal_js_1.default(0);
        if (isGrace) {
            switch (gracePeriodType) {
                case types_1.GracePeriodType.A:
                case types_1.GracePeriodType.D:
                    // Juros capitalizam
                    balance = openingBalance.plus(interest);
                    totalPayment = new decimal_js_1.default(0);
                    break;
                case types_1.GracePeriodType.B:
                    // Saldo congelado
                    balance = openingBalance;
                    totalPayment = new decimal_js_1.default(0);
                    break;
                case types_1.GracePeriodType.C:
                    // Juros pagos, principal preservado
                    balance = openingBalance;
                    totalPayment = interest;
                    break;
            }
        }
        else {
            switch (amortizationSystem) {
                case types_1.AmortizationSystem.SAC: {
                    amortization = decimal_js_1.default.min(fixedSACAmort, balance);
                    totalPayment = interest.plus(amortization);
                    balance = openingBalance.minus(amortization);
                    break;
                }
                case types_1.AmortizationSystem.PRICE: {
                    // Parcela fixa; amortização = PMT - juros
                    const amortCalc = pmt.minus(interest);
                    amortization = decimal_js_1.default.min(amortCalc.isNegative() ? new decimal_js_1.default(0) : amortCalc, balance);
                    totalPayment = interest.plus(amortization);
                    balance = openingBalance.minus(amortization);
                    break;
                }
                case types_1.AmortizationSystem.BULLET: {
                    if (i === numberOfPeriods) {
                        // Último período: paga tudo
                        amortization = balance;
                        totalPayment = interest.plus(amortization);
                        balance = new decimal_js_1.default(0);
                    }
                    else {
                        totalPayment = interest;
                        balance = openingBalance;
                    }
                    break;
                }
            }
        }
        if (balance.isNegative())
            balance = new decimal_js_1.default(0);
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
//# sourceMappingURL=FullFlowEngine.js.map