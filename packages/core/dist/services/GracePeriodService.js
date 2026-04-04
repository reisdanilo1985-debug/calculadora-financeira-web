"use strict";
/**
 * Serviço de carência — aplica a lógica de carência sobre memória de cálculo
 * já processada pelos engines base (CDI, IPCA, etc.).
 *
 * Tipo A / D: sem modificação (juros capitalizam — comportamento padrão)
 * Tipo B: saldo congelado durante a carência
 * Tipo C: saldo congelado, juros contabilizados como pagamentos saídos
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyGracePeriod = applyGracePeriod;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
function applyGracePeriod(rows, initialAmount, gracePeriod) {
    if (gracePeriod.type === types_1.GracePeriodType.A ||
        gracePeriod.type === types_1.GracePeriodType.D) {
        return { rows, deferredInterest: 0, interestPayments: 0 };
    }
    const graceEndDate = new Date(gracePeriod.endDate);
    graceEndDate.setHours(0, 0, 0, 0);
    // Fator acumulado até o fim da carência
    let factorAtGraceEnd = new decimal_js_1.default(1);
    for (const row of rows) {
        const d = new Date(row.date);
        d.setHours(0, 0, 0, 0);
        if (d <= graceEndDate) {
            factorAtGraceEnd = new decimal_js_1.default(row.accumulatedFactor);
        }
        else {
            break;
        }
    }
    const initial = new decimal_js_1.default(initialAmount);
    let deferredInterest = new decimal_js_1.default(0);
    let interestPayments = new decimal_js_1.default(0);
    const adjustedRows = rows.map(row => {
        const rowDate = new Date(row.date);
        rowDate.setHours(0, 0, 0, 0);
        const isInGrace = rowDate <= graceEndDate;
        if (!isInGrace) {
            // Pós-carência: recalcula saldo a partir do montante inicial × fator_relativo
            const adjustedBalance = initial.mul(new decimal_js_1.default(row.accumulatedFactor).div(factorAtGraceEnd));
            return { ...row, balance: adjustedBalance.toNumber() };
        }
        // Dentro da carência
        const interestThisPeriod = initial.mul(new decimal_js_1.default(row.dailyFactor).minus(1));
        if (gracePeriod.type === types_1.GracePeriodType.B) {
            deferredInterest = deferredInterest.plus(interestThisPeriod);
            return {
                ...row,
                balance: initialAmount,
                description: 'Carência Tipo B — juros diferidos',
            };
        }
        // Type C: interest paid out
        interestPayments = interestPayments.plus(interestThisPeriod);
        return {
            ...row,
            balance: initialAmount,
            amortizationAmount: interestThisPeriod.toNumber(),
            description: `Carência Tipo C — juros pagos: ${interestThisPeriod.toFixed(6)}`,
        };
    });
    return {
        rows: adjustedRows,
        deferredInterest: deferredInterest.toNumber(),
        interestPayments: interestPayments.toNumber(),
    };
}
//# sourceMappingURL=GracePeriodService.js.map