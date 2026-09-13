"use strict";
/**
 * Engine para Fluxo Completo com SAC / Price / Bullet — Tese T4.
 *
 * Calcula o cronograma completo de amortizações com juros remuneratórios.
 * Fase 1: sem indexador de correção monetária (apenas taxa pré-fixada).
 * Parcelas mensais, trimestrais, semestrais ou anuais: a taxa anual vira a
 * equivalente ao período, (1 + a.a.)^(meses/12) − 1.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFullFlow = calculateFullFlow;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
const periodicity_1 = require("../utils/periodicity");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/** Taxa do período equivalente à taxa anual (juros compostos): (1 + a.a.)^(meses/12) − 1 */
function annualToPeriodRate(annualRate, monthsInPeriod) {
    return new decimal_js_1.default(1 + annualRate / 100)
        .pow(new decimal_js_1.default(monthsInPeriod).div(12))
        .minus(1);
}
/** Calcula o número de meses entre duas datas. */
function monthsBetween(from, to) {
    return ((to.getFullYear() - from.getFullYear()) * 12 +
        (to.getMonth() - from.getMonth()));
}
/** Pluraliza "mês"/"meses" para mensagens ao usuário. */
function mesesTexto(n) {
    return `${n} ${n === 1 ? 'mês' : 'meses'}`;
}
const NOME_PERIODO = {
    3: ['trimestre', 'trimestres'],
    6: ['semestre', 'semestres'],
    12: ['ano', 'anos'],
};
/** "3 meses", "2 trimestres"… conforme a periodicidade das parcelas */
function periodosTexto(n, monthsInPeriod) {
    const nome = NOME_PERIODO[monthsInPeriod];
    return nome ? `${n} ${n === 1 ? nome[0] : nome[1]}` : mesesTexto(n);
}
/**
 * Parcela constante do sistema Price (postecipada, equivalente ao PMT do Excel):
 *   PMT = PV · i / (1 − (1+i)^−n)
 * Com taxa zero, PMT = PV / n.
 */
function pricePayment(presentValue, rate, periods) {
    const n = new decimal_js_1.default(periods);
    if (rate.isZero())
        return presentValue.div(n);
    return presentValue
        .mul(rate)
        .div(new decimal_js_1.default(1).minus(rate.plus(1).pow(n.negated())));
}
/**
 * Calcula o cronograma completo de amortizações.
 */
function calculateFullFlow(params) {
    const { principal, startDate, numberOfPeriods, annualRate, amortizationSystem, currency, gracePeriod, periodicity = types_1.PeriodicityType.MONTHLY, } = params;
    const step = (0, periodicity_1.monthsPerPeriod)(periodicity);
    const periodRate = annualToPeriodRate(annualRate, step);
    const P = new decimal_js_1.default(principal);
    // Quantos períodos de carência? (meses entre início e fim ÷ meses do período)
    let gracePeriodMonths = 0;
    if (gracePeriod) {
        const graceEnd = new Date(gracePeriod.endDate);
        graceEnd.setHours(0, 0, 0, 0);
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        gracePeriodMonths = Math.max(0, monthsBetween(start, graceEnd));
    }
    if (gracePeriodMonths % step !== 0) {
        throw new Error(`Carência de ${mesesTexto(gracePeriodMonths)} não fecha em parcelas a cada ${mesesTexto(step)}. ` +
            `Use um múltiplo de ${step}.`);
    }
    const gracePeriods = gracePeriodMonths / step;
    const amortPeriods = numberOfPeriods - gracePeriods;
    // Carência ≥ prazo: não sobra nenhum período para amortizar o saldo, e o
    // cronograma terminaria com saldo devedor em aberto. Rejeita explicitamente.
    if (amortPeriods <= 0) {
        throw new Error(`Carência de ${periodosTexto(gracePeriods, step)} é maior ou igual ao prazo de ` +
            `${periodosTexto(numberOfPeriods, step)}: não resta nenhum período de amortização. ` +
            'Reduza a carência ou aumente o número de períodos.');
    }
    // 1º período de amortização (logo após o fim da carência)
    const firstAmortPeriod = gracePeriods + 1;
    // PMT (Price) e amortização constante (SAC) são definidos no 1º período pós-
    // carência, sobre o saldo daquele momento, para os `amortPeriods` restantes:
    //   - sem carência, ou carência B/C: saldo = principal P;
    //   - carência A/D: saldo capitalizado = P·(1+i)^carência.
    // Calcular sobre P antes da capitalização deixava saldo residual no fim (C07).
    let pmt = new decimal_js_1.default(0);
    let fixedSACAmort = new decimal_js_1.default(0);
    const rows = [];
    let balance = P;
    let totalInterest = new decimal_js_1.default(0);
    let totalAmortized = new decimal_js_1.default(0);
    let totalPayments = new decimal_js_1.default(0);
    // Juros da carência B acumulados (sem capitalização), a liquidar na 1ª parcela
    // pós-carência.
    let deferredInterest = new decimal_js_1.default(0);
    // Tipo A: juros capitalizam ao saldo durante a carência
    // Tipo B: saldo congelado; juros diferidos (sem juros sobre juros), pagos na
    //         1ª parcela pós-carência
    // Tipo C: juros pagos mensalmente na carência, principal preservado
    // Tipo D: igual ao A (Fase 1)
    const gracePeriodType = gracePeriod?.type ?? types_1.GracePeriodType.A;
    for (let i = 1; i <= numberOfPeriods; i++) {
        // Data ancorada no dia do início, com ajuste ao fim do mês (31/01 → 28/02 → 31/03)
        const periodDate = (0, periodicity_1.addMonthsAnchored)(startDate, i * step);
        const isGrace = i <= gracePeriods;
        const openingBalance = balance;
        const interest = openingBalance.mul(periodRate);
        let amortization = new decimal_js_1.default(0);
        let totalPayment = new decimal_js_1.default(0);
        let description;
        if (isGrace) {
            switch (gracePeriodType) {
                case types_1.GracePeriodType.A:
                case types_1.GracePeriodType.D:
                    // Juros capitalizam
                    balance = openingBalance.plus(interest);
                    totalPayment = new decimal_js_1.default(0);
                    break;
                case types_1.GracePeriodType.B:
                    // Saldo congelado; juros do período ficam diferidos
                    balance = openingBalance;
                    totalPayment = new decimal_js_1.default(0);
                    deferredInterest = deferredInterest.plus(interest);
                    break;
                case types_1.GracePeriodType.C:
                    // Juros pagos, principal preservado
                    balance = openingBalance;
                    totalPayment = interest;
                    break;
            }
            description = `Carência Tipo ${gracePeriodType}`;
        }
        else {
            if (i === firstAmortPeriod) {
                // Parâmetros da amortização sobre o saldo no fim da carência
                if (amortizationSystem === types_1.AmortizationSystem.PRICE) {
                    pmt = pricePayment(openingBalance, periodRate, amortPeriods);
                }
                else if (amortizationSystem === types_1.AmortizationSystem.SAC) {
                    fixedSACAmort = openingBalance.div(new decimal_js_1.default(amortPeriods));
                }
            }
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
            // Carência B: os juros diferidos são liquidados junto com a 1ª parcela
            // pós-carência (a coluna de juros mantém só os juros do período, para
            // não contar os juros da carência duas vezes em totalInterest).
            if (i === firstAmortPeriod && !deferredInterest.isZero()) {
                totalPayment = totalPayment.plus(deferredInterest);
                description =
                    `Inclui juros diferidos da carência Tipo ${gracePeriodType}: ` +
                        deferredInterest.toFixed(2);
                deferredInterest = new decimal_js_1.default(0);
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
            description,
        });
    }
    return {
        principal,
        annualRate,
        amortizationSystem,
        currency,
        periodicity,
        periodRate: periodRate.mul(100).toNumber(),
        totalInterest: totalInterest.toNumber(),
        totalMonetaryCorrection: 0,
        totalPayments: totalPayments.toNumber(),
        totalAmortized: totalAmortized.toNumber(),
        rows,
    };
}
//# sourceMappingURL=FullFlowEngine.js.map