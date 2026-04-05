"use strict";
/**
 * Serviço de juros remuneratórios para Tese T5.
 *
 * Aplica juros simples ou compostos sobre o saldo já corrigido pelo indexador.
 *
 * Juros Compostos: saldo_final = saldo_corrigido × (1 + taxa)^t
 * Juros Simples:   saldo_final = saldo_corrigido + capital_inicial × taxa × t
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyInterest = applyInterest;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
const businessDays_1 = require("../utils/businessDays");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
function timeFractionYears(from, to, basis) {
    if (basis === types_1.DayCountBasis.DU252) {
        const busDays = (0, businessDays_1.getBusinessDaysBetween)(from, to).length;
        return new decimal_js_1.default(busDays).div(252);
    }
    const msPerDay = 24 * 60 * 60 * 1000;
    const calDays = Math.max(0, Math.round((to.getTime() - from.getTime()) / msPerDay));
    return new decimal_js_1.default(calDays).div(basis === types_1.DayCountBasis.DC360 ? 360 : 365);
}
/**
 * Aplica juros remuneratórios (simples ou compostos) sobre as linhas
 * já corrigidas pelo indexador de mercado (T1 base).
 *
 * @param rows       Linhas de memória produzidas pelo engine de índice
 * @param initialAmount  Montante original (base para juros simples)
 * @param annualRate     Taxa anual em % (ex: 6 para 6% a.a.)
 * @param interestType   SIMPLES ou COMPOSTA
 * @param startDate      Data de início do contrato
 * @param dayCountBasis  Base de dias para o cálculo do fator de tempo
 */
function applyInterest(rows, initialAmount, annualRate, interestType, startDate, dayCountBasis) {
    const rate = new decimal_js_1.default(annualRate).div(100);
    const P0 = new decimal_js_1.default(initialAmount);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    return rows.map(row => {
        const rowDate = new Date(row.date);
        rowDate.setHours(0, 0, 0, 0);
        const t = timeFractionYears(start, rowDate, dayCountBasis);
        const balanceDec = new decimal_js_1.default(row.balance);
        let newBalance;
        if (interestType === types_1.InterestType.SIMPLES) {
            // Saldo corrigido + juros lineares sobre o capital original
            newBalance = balanceDec.plus(P0.mul(rate).mul(t));
        }
        else {
            // Saldo corrigido × fator de juros compostos
            newBalance = balanceDec.mul(rate.plus(1).pow(t));
        }
        return {
            ...row,
            balance: newBalance.toNumber(),
            accumulatedFactor: P0.isZero() ? 1 : newBalance.div(P0).toNumber(),
            description: row.description
                ? `${row.description} | Juros ${interestType === types_1.InterestType.SIMPLES ? 'simples' : 'compostos'}: ${annualRate}% a.a.`
                : `Juros ${interestType === types_1.InterestType.SIMPLES ? 'simples' : 'compostos'}: ${annualRate}% a.a.`,
        };
    });
}
//# sourceMappingURL=InterestService.js.map