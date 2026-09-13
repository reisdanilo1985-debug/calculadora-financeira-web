"use strict";
/**
 * Serviço de carência — aplica a lógica de carência sobre memória de cálculo
 * já processada pelos engines base (CDI, IPCA, etc.).
 *
 * Tipo A / D: sem modificação (juros capitalizam — comportamento padrão)
 * Tipo B: saldo congelado durante a carência
 * Tipo C: saldo congelado, juros contabilizados como pagamentos saídos
 *
 * A carência cobre [início, data de término): o dia do término já rende.
 * Como os engines datam as linhas de formas diferentes, a pertinência de uma
 * linha à carência depende do intervalo de acúmulo que ela representa:
 *   - linhas datadas no INÍCIO do acúmulo (CDI/Selic, SOFR, pré-fixada): a
 *     linha do dia d rende de d ao próximo dia → está na carência se d < término;
 *   - linhas datadas no FIM do acúmulo (índices mensais): a linha do dia d
 *     fecha o segmento que termina em d → está na carência se d <= término.
 *
 * Em B e C, o fator acumulado das linhas é reescrito para o fator do SALDO
 * (1 na carência; F / F_término depois). Assim o fator exibido bate com o saldo
 * e amortizações feitas dentro da carência reduzem o principal congelado e só
 * passam a ser corrigidas a partir do término.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyGracePeriod = applyGracePeriod;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
function applyGracePeriod(rows, initialAmount, gracePeriod, rowsDatedAtAccrualEnd = false) {
    if (gracePeriod.type === types_1.GracePeriodType.A ||
        gracePeriod.type === types_1.GracePeriodType.D) {
        return { rows, deferredInterest: 0, interestPayments: 0 };
    }
    const graceEndDate = new Date(gracePeriod.endDate);
    graceEndDate.setHours(0, 0, 0, 0);
    const isInGrace = (row) => {
        const d = new Date(row.date);
        d.setHours(0, 0, 0, 0);
        return rowsDatedAtAccrualEnd ? d <= graceEndDate : d < graceEndDate;
    };
    // Fator acumulado até o fim da carência
    let factorAtGraceEnd = new decimal_js_1.default(1);
    for (const row of rows) {
        if (isInGrace(row)) {
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
        if (!isInGrace(row)) {
            // Pós-carência: saldo = montante inicial × fator relativo ao término
            const relativeFactor = new decimal_js_1.default(row.accumulatedFactor).div(factorAtGraceEnd);
            return {
                ...row,
                accumulatedFactor: relativeFactor.toNumber(),
                balance: initial.mul(relativeFactor).toNumber(),
            };
        }
        // Dentro da carência
        const interestThisPeriod = initial.mul(new decimal_js_1.default(row.dailyFactor).minus(1));
        if (gracePeriod.type === types_1.GracePeriodType.B) {
            deferredInterest = deferredInterest.plus(interestThisPeriod);
            return {
                ...row,
                accumulatedFactor: 1,
                dailyFactor: 1,
                balance: initialAmount,
                description: 'Carência Tipo B — juros diferidos',
            };
        }
        // Type C: interest paid out
        interestPayments = interestPayments.plus(interestThisPeriod);
        return {
            ...row,
            accumulatedFactor: 1,
            dailyFactor: 1,
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