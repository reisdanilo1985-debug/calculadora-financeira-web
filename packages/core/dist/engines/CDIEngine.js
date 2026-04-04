"use strict";
/**
 * Engine de cálculo para CDI e Selic.
 * Base de cálculo: 252 dias úteis.
 *
 * Fórmula:
 *   fator_diario = (1 + cdi_anual/100) ^ (1/252)
 *   Se percentual do CDI (ex: 110%): fator_diario = (1 + percentual/100 * cdi_anual/100) ^ (1/252)
 *   fator_acumulado = ∏ fator_diario_i para cada dia útil no período
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCDI = calculateCDI;
exports.calcAdditiveSpreadFactor = calcAdditiveSpreadFactor;
const decimal_js_1 = __importDefault(require("decimal.js"));
const businessDays_1 = require("../utils/businessDays");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/**
 * Calcula o fator diário do CDI/Selic para um dia com uma taxa anual e spread opcional.
 *
 * @param annualRatePercent Taxa anual em % (ex: 10.65)
 * @param spread Configuração de spread (opcional)
 * @returns Fator diário como Decimal
 */
function calcDailyFactor(annualRatePercent, spread) {
    let effectiveRate = new decimal_js_1.default(annualRatePercent).div(100);
    if (spread) {
        if (spread.mode === 'percentage') {
            // Ex: 110% do CDI → taxa_efetiva = 1.10 * cdi
            effectiveRate = effectiveRate.mul(new decimal_js_1.default(spread.value).div(100));
        }
        // Para mode='additive', o spread é somado ao fator acumulado (tratado no acumulador)
    }
    // fator_diario = (1 + taxa_efetiva) ^ (1/252)
    return effectiveRate.plus(1).pow(new decimal_js_1.default(1).div(252));
}
/**
 * Mapeia IndexDataPoint[] para um Map de ISO date string → taxa anual
 */
function buildRateMap(indexData) {
    const map = new Map();
    for (const point of indexData) {
        map.set((0, businessDays_1.toISODate)(point.date), point.value);
    }
    return map;
}
/**
 * Calcula a correção via CDI/Selic para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com taxas CDI)
 * @returns Array de linhas da memória de cálculo
 */
function calculateCDI(input) {
    const { startDate, endDate, initialAmount, indexData = [], spread, futurePremises = [] } = input;
    // Monta mapa de taxas: data → taxa anual
    const rateMap = buildRateMap(indexData);
    // Monta mapa de premissas futuras
    const projectedRateMap = new Map();
    for (const premise of futurePremises) {
        let d = new Date(premise.startDate);
        d.setHours(0, 0, 0, 0);
        const endP = new Date(premise.endDate);
        endP.setHours(0, 0, 0, 0);
        while (d <= endP) {
            projectedRateMap.set((0, businessDays_1.toISODate)(d), premise.rate);
            d = new Date(d);
            d.setDate(d.getDate() + 1);
        }
    }
    const businessDays = (0, businessDays_1.getBusinessDaysBetween)(startDate, endDate);
    const rows = [];
    let accumulatedFactor = new decimal_js_1.default(1);
    let currentBalance = new decimal_js_1.default(initialAmount);
    for (const day of businessDays) {
        const isoDate = (0, businessDays_1.toISODate)(day);
        let isProjected = false;
        let rate;
        if (rateMap.has(isoDate)) {
            rate = rateMap.get(isoDate);
        }
        else if (projectedRateMap.has(isoDate)) {
            rate = projectedRateMap.get(isoDate);
            isProjected = true;
        }
        else {
            // Fallback: taxa do último dia disponível (não deve ocorrer em uso normal)
            rate = 0;
            isProjected = true;
        }
        const dailyFactor = calcDailyFactor(rate, spread);
        accumulatedFactor = accumulatedFactor.mul(dailyFactor);
        currentBalance = currentBalance.mul(dailyFactor);
        rows.push({
            date: new Date(day),
            indexRate: rate,
            dailyFactor: dailyFactor.toNumber(),
            accumulatedFactor: accumulatedFactor.toNumber(),
            balance: currentBalance.toNumber(),
            isProjected,
        });
    }
    return rows;
}
/**
 * Calcula o fator acumulado de CDI com spread aditivo.
 * Usado internamente pelo CalculationEngine para composição IPCA+6%a.a. etc.
 */
function calcAdditiveSpreadFactor(accumulatedIndexFactor, spreadAnnualPercent, calendarDays, basis) {
    // fator_spread = (1 + spread/100) ^ (dc/basis)
    const spreadFactor = new decimal_js_1.default(1 + spreadAnnualPercent / 100).pow(new decimal_js_1.default(calendarDays).div(basis));
    return accumulatedIndexFactor.mul(spreadFactor);
}
//# sourceMappingURL=CDIEngine.js.map