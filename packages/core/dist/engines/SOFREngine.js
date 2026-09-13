"use strict";
/**
 * Engine de cálculo para SOFR (Secured Overnight Financing Rate).
 * Convenção: ACT/360 (dias corridos sobre base 360), metodologia do NY Fed
 * ("SOFR Averages and Index").
 *
 * Fórmula por publicação:
 *   fator_intervalo = 1 + (sofr_anual/100) × (n/360)
 *   n = dias corridos até a próxima publicação (fins de semana e feriados
 *   americanos NÃO capitalizam — rendem juros simples dentro do intervalo).
 *
 * A memória continua com uma linha por dia corrido: o fator do dia é a razão
 * entre o fator linear do intervalo no fim e no início daquele dia, de modo que
 * o produto no intervalo é exatamente 1 + r·n/360.
 *
 * Se o período começa em dia sem publicação, vale a última taxa publicada antes
 * do início. Composição: "% do índice" multiplica a taxa; índice + taxa soma o
 * spread à SOFR (ACT/360). Dias sem publicação por mais de
 * MAX_DIAS_SEM_PUBLICACAO geram MissingIndexDataError.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateSOFR = calculateSOFR;
const decimal_js_1 = __importDefault(require("decimal.js"));
const errors_1 = require("../models/errors");
const businessDays_1 = require("../utils/businessDays");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/**
 * Maior distância, em dias corridos, entre a última publicação e um dia do
 * período. No histórico do NY Fed o maior intervalo entre publicações é de
 * 4 dias (fim de semana prolongado); acima disso é lacuna de dado.
 */
const MAX_DIAS_SEM_PUBLICACAO = 4;
/** Taxa efetiva do intervalo em fração a.a., com a composição do spread */
function taxaEfetiva(ratePercent, spread) {
    let r = new decimal_js_1.default(ratePercent);
    if (spread?.mode === 'percentage')
        r = r.mul(new decimal_js_1.default(spread.value).div(100));
    if (spread?.mode === 'additive')
        r = r.plus(spread.value);
    return r.div(100);
}
function diasEntre(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}
/**
 * Calcula a correção via SOFR (ACT/360) para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com taxas SOFR diárias)
 * @returns Array de linhas da memória de cálculo (uma por dia corrido)
 */
function calculateSOFR(input) {
    const { startDate, endDate, initialAmount, indexData = [], futurePremises = [], spread } = input;
    // Publicações oficiais
    const publicacoes = new Map();
    for (const point of indexData) {
        publicacoes.set((0, businessDays_1.toISODate)(point.date), { rate: point.value, isProjected: point.isProjected ?? false });
    }
    // Premissas: uma "publicação" por dia de semana sem dado oficial
    for (const premise of futurePremises) {
        const d = new Date(premise.startDate);
        d.setHours(0, 0, 0, 0);
        const endP = new Date(premise.endDate);
        endP.setHours(0, 0, 0, 0);
        while (d <= endP) {
            const dow = d.getDay();
            const iso = (0, businessDays_1.toISODate)(d);
            if (dow !== 0 && dow !== 6 && !publicacoes.has(iso)) {
                publicacoes.set(iso, { rate: premise.rate, isProjected: true });
            }
            d.setDate(d.getDate() + 1);
        }
    }
    const inicio = new Date(startDate);
    inicio.setHours(0, 0, 0, 0);
    // Taxa vigente no início: última publicação anterior ao início, se houver
    let vigente = null;
    const isoInicio = (0, businessDays_1.toISODate)(inicio);
    let ultimaAnterior = null;
    for (const iso of publicacoes.keys()) {
        if (iso < isoInicio && (ultimaAnterior === null || iso > ultimaAnterior))
            ultimaAnterior = iso;
    }
    if (ultimaAnterior) {
        const [y, m, d] = ultimaAnterior.split('-').map(Number);
        vigente = { ...publicacoes.get(ultimaAnterior), publicadaEm: new Date(y, m - 1, d), inicioIntervalo: inicio };
    }
    const allDays = (0, businessDays_1.getCalendarDaysBetween)(startDate, endDate);
    const semDado = [];
    const rows = [];
    let accumulatedFactor = new decimal_js_1.default(1);
    let currentBalance = new decimal_js_1.default(initialAmount);
    for (const day of allDays) {
        const iso = (0, businessDays_1.toISODate)(day);
        const pub = publicacoes.get(iso);
        if (pub) {
            vigente = { ...pub, publicadaEm: new Date(day), inicioIntervalo: new Date(day) };
        }
        if (!vigente || diasEntre(vigente.publicadaEm, day) > MAX_DIAS_SEM_PUBLICACAO) {
            semDado.push(new Date(day));
            continue;
        }
        // Fator linear do intervalo antes e depois deste dia: 1 + r·k/360
        const r = taxaEfetiva(vigente.rate, spread);
        const k = diasEntre(vigente.inicioIntervalo, day);
        const linearAntes = r.mul(k).div(360).plus(1);
        const linearDepois = r.mul(k + 1).div(360).plus(1);
        const dailyFactor = linearDepois.div(linearAntes);
        accumulatedFactor = accumulatedFactor.mul(dailyFactor);
        currentBalance = currentBalance.mul(dailyFactor);
        rows.push({
            date: new Date(day),
            indexRate: vigente.rate,
            dailyFactor: dailyFactor.toNumber(),
            accumulatedFactor: accumulatedFactor.toNumber(),
            balance: currentBalance.toNumber(),
            isProjected: vigente.isProjected,
        });
    }
    if (semDado.length > 0) {
        throw new errors_1.MissingIndexDataError('SOFR', (0, errors_1.agruparIntervalos)(semDado, 1));
    }
    return rows;
}
//# sourceMappingURL=SOFREngine.js.map