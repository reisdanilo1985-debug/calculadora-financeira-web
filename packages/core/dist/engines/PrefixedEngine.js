"use strict";
/**
 * Engine de cálculo para taxa pré-fixada.
 *
 * Fórmulas por base:
 *   Base 252 d.u.: fator = (1 + taxa/100) ^ (du / 252)
 *   Base 360 d.c.: fator = (1 + taxa/100) ^ (dc / 360)
 *   Base 365 d.c.: fator = (1 + taxa/100) ^ (dc / 365)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePrefixed = calculatePrefixed;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
const businessDays_1 = require("../utils/businessDays");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/**
 * Calcula a correção via taxa pré-fixada.
 *
 * @param input Input de cálculo (deve ter prefixedRate definido)
 * @returns Array de linhas da memória de cálculo
 */
function calculatePrefixed(input) {
    const { startDate, endDate, initialAmount, dayCountBasis, prefixedRate = 0 } = input;
    const annualRate = new decimal_js_1.default(prefixedRate).div(100);
    if (dayCountBasis === types_1.DayCountBasis.DU252) {
        // Uma linha por dia útil
        const businessDays = (0, businessDays_1.getBusinessDaysBetween)(startDate, endDate);
        const totalDU = businessDays.length;
        const rows = [];
        let accumulatedFactor = new decimal_js_1.default(1);
        let currentBalance = new decimal_js_1.default(initialAmount);
        // fator_diario = (1 + taxa)^(1/252)
        const dailyFactor = annualRate.plus(1).pow(new decimal_js_1.default(1).div(252));
        for (const day of businessDays) {
            accumulatedFactor = accumulatedFactor.mul(dailyFactor);
            currentBalance = currentBalance.mul(dailyFactor);
            rows.push({
                date: new Date(day),
                indexRate: prefixedRate,
                dailyFactor: dailyFactor.toNumber(),
                accumulatedFactor: accumulatedFactor.toNumber(),
                balance: currentBalance.toNumber(),
                isProjected: false,
            });
        }
        return rows;
    }
    // Base 360 ou 365: uma linha por dia corrido
    const calendarDays = (0, businessDays_1.getCalendarDaysBetween)(startDate, endDate);
    const basis = dayCountBasis === types_1.DayCountBasis.DC360 ? 360 : 365;
    // fator_diario = (1 + taxa)^(1/basis)
    const dailyFactor = annualRate.plus(1).pow(new decimal_js_1.default(1).div(basis));
    const rows = [];
    let accumulatedFactor = new decimal_js_1.default(1);
    let currentBalance = new decimal_js_1.default(initialAmount);
    for (const day of calendarDays) {
        accumulatedFactor = accumulatedFactor.mul(dailyFactor);
        currentBalance = currentBalance.mul(dailyFactor);
        rows.push({
            date: new Date(day),
            indexRate: prefixedRate,
            dailyFactor: dailyFactor.toNumber(),
            accumulatedFactor: accumulatedFactor.toNumber(),
            balance: currentBalance.toNumber(),
            isProjected: false,
        });
    }
    return rows;
}
//# sourceMappingURL=PrefixedEngine.js.map