"use strict";
/**
 * Engine de cálculo para SOFR (Secured Overnight Financing Rate).
 * Convenção: ACT/360 (dias corridos sobre base 360).
 *
 * Fórmula para cada dia corrido:
 *   fator_dia = 1 + (sofr_anual/100) * (dias_corridos/360)
 *
 * Para fins de semana e feriados americanos, a taxa do último dia útil é replicada.
 * Para feriados americanos, usamos simplificação: replicamos taxa de sexta-feira.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateSOFR = calculateSOFR;
const decimal_js_1 = __importDefault(require("decimal.js"));
const businessDays_1 = require("../utils/businessDays");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/** Feriados americanos fixos relevantes (mês-dia) */
const US_FIXED_HOLIDAYS = [
    '01-01', // New Year's Day
    '07-04', // Independence Day
    '11-11', // Veterans Day
    '12-25', // Christmas
];
function isUSWeekendOrHoliday(date) {
    const dow = date.getDay();
    if (dow === 0 || dow === 6)
        return true; // Domingo ou Sábado
    const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return US_FIXED_HOLIDAYS.includes(mmdd);
}
/**
 * Constrói mapa de data ISO → taxa SOFR anual.
 * Para dias sem taxa (fins de semana/feriados), replica a última taxa válida.
 */
function buildSOFRRateMap(indexData, startDate, endDate) {
    const sourceMap = new Map();
    for (const point of indexData) {
        sourceMap.set((0, businessDays_1.toISODate)(point.date), {
            rate: point.value,
            isProjected: point.isProjected ?? false,
        });
    }
    const allDays = (0, businessDays_1.getCalendarDaysBetween)(startDate, endDate);
    const result = new Map();
    let lastRate = 0;
    let lastIsProjected = false;
    for (const day of allDays) {
        const iso = (0, businessDays_1.toISODate)(day);
        if (sourceMap.has(iso)) {
            const entry = sourceMap.get(iso);
            lastRate = entry.rate;
            lastIsProjected = entry.isProjected;
            result.set(iso, { rate: lastRate, isProjected: lastIsProjected });
        }
        else {
            // Replicar última taxa (fins de semana, feriados)
            result.set(iso, { rate: lastRate, isProjected: lastIsProjected });
        }
    }
    return result;
}
/**
 * Calcula a correção via SOFR (ACT/360) para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com taxas SOFR diárias)
 * @returns Array de linhas da memória de cálculo (uma por dia corrido)
 */
function calculateSOFR(input) {
    const { startDate, endDate, initialAmount, indexData = [], futurePremises = [] } = input;
    // Adiciona premissas ao indexData
    const allData = [...indexData];
    for (const premise of futurePremises) {
        let d = new Date(premise.startDate);
        d.setHours(0, 0, 0, 0);
        const endP = new Date(premise.endDate);
        endP.setHours(0, 0, 0, 0);
        while (d <= endP) {
            allData.push({ date: new Date(d), value: premise.rate, isProjected: true });
            d = (0, businessDays_1.addDays)(d, 1);
        }
    }
    const rateMap = buildSOFRRateMap(allData, startDate, endDate);
    const allDays = (0, businessDays_1.getCalendarDaysBetween)(startDate, endDate);
    const rows = [];
    let accumulatedFactor = new decimal_js_1.default(1);
    let currentBalance = new decimal_js_1.default(initialAmount);
    for (const day of allDays) {
        const iso = (0, businessDays_1.toISODate)(day);
        const entry = rateMap.get(iso) ?? { rate: 0, isProjected: true };
        // ACT/360: fator_dia = 1 + (sofr/100) * (1/360)
        const dailyFactor = new decimal_js_1.default(1).plus(new decimal_js_1.default(entry.rate).div(100).mul(new decimal_js_1.default(1).div(360)));
        accumulatedFactor = accumulatedFactor.mul(dailyFactor);
        currentBalance = currentBalance.mul(dailyFactor);
        rows.push({
            date: new Date(day),
            indexRate: entry.rate,
            dailyFactor: dailyFactor.toNumber(),
            accumulatedFactor: accumulatedFactor.toNumber(),
            balance: currentBalance.toNumber(),
            isProjected: entry.isProjected,
        });
    }
    return rows;
}
//# sourceMappingURL=SOFREngine.js.map