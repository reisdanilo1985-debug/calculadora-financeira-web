"use strict";
/**
 * Engine para Valor Presente (Discounted Cash Flow) — Tese T2.
 *
 * Fórmula: PV = FV / (1 + r)^t
 * onde t é calculado pela base de dias configurada.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDCF = calculateDCF;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
const businessDays_1 = require("../utils/businessDays");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/**
 * Calcula a fração de tempo em anos entre duas datas, conforme a base.
 */
function calcTimeFraction(from, to, basis) {
    if (basis === types_1.DayCountBasis.DU252) {
        const busDays = (0, businessDays_1.getBusinessDaysBetween)(from, to).length;
        return new decimal_js_1.default(busDays).div(252);
    }
    const msPerDay = 24 * 60 * 60 * 1000;
    const calDays = Math.max(0, Math.round((to.getTime() - from.getTime()) / msPerDay));
    return new decimal_js_1.default(calDays).div(basis === types_1.DayCountBasis.DC360 ? 360 : 365);
}
/**
 * Calcula o Valor Presente de um conjunto de fluxos futuros.
 */
function calculateDCF(params) {
    const { cashFlows, discountRate, referenceDate, dayCountBasis, currency } = params;
    if (!cashFlows.length) {
        throw new Error('Ao menos um fluxo de caixa é necessário.');
    }
    const rate = new decimal_js_1.default(discountRate).div(100);
    const flowResults = [];
    let totalPV = new decimal_js_1.default(0);
    let totalNominal = new decimal_js_1.default(0);
    let weightedTime = new decimal_js_1.default(0);
    for (const flow of cashFlows) {
        const flowDate = new Date(flow.date);
        flowDate.setHours(0, 0, 0, 0);
        const refDate = new Date(referenceDate);
        refDate.setHours(0, 0, 0, 0);
        if (flowDate <= refDate) {
            throw new Error(`Fluxo em ${flowDate.toISOString().slice(0, 10)} deve ser após a data de referência.`);
        }
        const t = calcTimeFraction(refDate, flowDate, dayCountBasis);
        // PV = FV / (1 + r)^t
        const discountFactor = new decimal_js_1.default(1).div(rate.plus(1).pow(t));
        const pv = new decimal_js_1.default(flow.amount).mul(discountFactor);
        flowResults.push({
            date: flowDate,
            nominalAmount: flow.amount,
            pv: pv.toNumber(),
            discountFactor: discountFactor.toNumber(),
            timeFractionYears: t.toNumber(),
            contributionPercent: 0, // calculated after totaling
        });
        totalPV = totalPV.plus(pv);
        totalNominal = totalNominal.plus(new decimal_js_1.default(flow.amount));
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
            : new decimal_js_1.default(fr.pv).div(totalPV).mul(100).toNumber();
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
//# sourceMappingURL=DCFEngine.js.map