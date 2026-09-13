"use strict";
/**
 * Engine de cálculo para CDI e Selic.
 * Base de cálculo: 252 dias úteis.
 *
 * Fórmula:
 *   fator_diario = (1 + cdi_anual/100) ^ (1/252)
 *   Se percentual do CDI (ex: 110%), convenção CETIP/B3 — o percentual incide
 *   sobre a taxa DIÁRIA (TDI), não sobre a taxa anual:
 *     TDI = (1 + cdi_anual/100)^(1/252) − 1
 *     fator_diario = 1 + TDI × percentual/100
 *   (mesma convenção da Calculadora do Cidadão do BCB)
 *   Se CDI + spread (ex: CDI + 2% a.a.), Fator de Spread multiplicativo (B3):
 *     base 252: fator_spread_dia = (1 + spread/100)^(1/252) por dia útil
 *     base 360/365: fator_spread = (1 + spread/100)^(dc/base) nos dias corridos de cada linha
 *   fator_acumulado = ∏ fator_diario_i para cada dia útil no período
 *
 * Todo dia útil do período precisa de dado oficial ou de premissa; dia sem
 * nenhum dos dois gera MissingIndexDataError (antes entrava com taxa 0%).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCDI = calculateCDI;
exports.calcAdditiveSpreadFactor = calcAdditiveSpreadFactor;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
const errors_1 = require("../models/errors");
const businessDays_1 = require("../utils/businessDays");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/**
 * Calcula o fator diário do CDI/Selic para um dia com uma taxa anual e spread opcional.
 * O spread aditivo não entra aqui: é composto por fora (Fator de Spread).
 *
 * @param annualRatePercent Taxa anual em % (ex: 10.65)
 * @param spread Configuração de spread (opcional)
 * @returns Fator diário como Decimal
 */
function calcDailyFactor(annualRatePercent, spread) {
    const annualRate = new decimal_js_1.default(annualRatePercent).div(100);
    // fator_diario base = (1 + taxa_anual)^(1/252)
    const baseDailyFactor = annualRate.plus(1).pow(new decimal_js_1.default(1).div(252));
    if (spread && spread.mode === 'percentage') {
        // Convenção CETIP/B3 ("% do DI"): o percentual incide sobre a taxa DIÁRIA:
        //   TDI = (1 + cdi_anual)^(1/252) − 1
        //   fator_diario = 1 + TDI × p
        const tdi = baseDailyFactor.minus(1);
        return tdi.mul(new decimal_js_1.default(spread.value).div(100)).plus(1);
    }
    return baseDailyFactor;
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
    // Dias úteis sem dado oficial e sem premissa: erro explícito
    const missing = businessDays.filter(d => {
        const iso = (0, businessDays_1.toISODate)(d);
        return !rateMap.has(iso) && !projectedRateMap.has(iso);
    });
    if (missing.length > 0) {
        throw new errors_1.MissingIndexDataError(input.indexType ?? 'CDI', (0, errors_1.agruparIntervalos)(missing, 4));
    }
    // Spread aditivo (Fator de Spread): base 252 por dia útil ou dias corridos/base
    const additive = spread?.mode === 'additive' ? spread : undefined;
    const additiveBase = additive ? Number(additive.additiveBase ?? types_1.DayCountBasis.DC365) : 0;
    const spreadRate = additive ? new decimal_js_1.default(additive.value).div(100).plus(1) : new decimal_js_1.default(1);
    const spreadDailyFactor252 = additive && additiveBase === types_1.DayCountBasis.DU252
        ? spreadRate.pow(new decimal_js_1.default(1).div(252))
        : null;
    const rows = [];
    let accumulatedFactor = new decimal_js_1.default(1);
    let currentBalance = new decimal_js_1.default(initialAmount);
    for (let i = 0; i < businessDays.length; i++) {
        const day = businessDays[i];
        const isoDate = (0, businessDays_1.toISODate)(day);
        let isProjected = false;
        let rate;
        if (rateMap.has(isoDate)) {
            rate = rateMap.get(isoDate);
        }
        else {
            rate = projectedRateMap.get(isoDate);
            isProjected = true;
        }
        let dailyFactor = calcDailyFactor(rate, spread);
        if (additive) {
            if (spreadDailyFactor252) {
                dailyFactor = dailyFactor.mul(spreadDailyFactor252);
            }
            else {
                // Dias corridos que esta linha cobre: do início do período (1ª linha)
                // ou desta data até o próximo dia útil (ou a data final, na última).
                const from = i === 0 ? startDate : day;
                const to = i + 1 < businessDays.length ? businessDays[i + 1] : endDate;
                const dc = (0, businessDays_1.countCalendarDays)(from, to);
                dailyFactor = dailyFactor.mul(spreadRate.pow(new decimal_js_1.default(dc).div(additiveBase)));
            }
        }
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