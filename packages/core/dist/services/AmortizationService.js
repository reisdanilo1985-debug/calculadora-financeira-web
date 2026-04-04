"use strict";
/**
 * Serviço de processamento de amortizações.
 *
 * Lógica:
 *   1. Ordena amortizações por data
 *   2. Para cada período entre amortizações: corrige o saldo pelo indexador
 *   3. Na data de cada amortização: subtrai o valor do saldo corrigido
 *   4. O novo saldo é a base para o próximo período
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandPeriodicAmortizations = expandPeriodicAmortizations;
exports.applyAmortizations = applyAmortizations;
exports.calcTotalAmortized = calcTotalAmortized;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/**
 * Expande amortizações periódicas em entradas individuais.
 */
function expandPeriodicAmortizations(amortizations) {
    const result = [];
    for (const amort of amortizations) {
        if (amort.type !== types_1.AmortizationType.PERIODIC) {
            result.push(amort);
            continue;
        }
        if (!amort.periodicity || !amort.periodicEndDate) {
            result.push(amort);
            continue;
        }
        let current = new Date(amort.date);
        current.setHours(0, 0, 0, 0);
        const endDate = new Date(amort.periodicEndDate);
        endDate.setHours(0, 0, 0, 0);
        while (current <= endDate) {
            result.push({
                date: new Date(current),
                type: amort.isPeriodicPercentage ? types_1.AmortizationType.PERCENTAGE : types_1.AmortizationType.FIXED,
                value: amort.value,
            });
            current = advanceByPeriodicity(current, amort.periodicity);
        }
    }
    return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}
function advanceByPeriodicity(date, periodicity) {
    const d = new Date(date);
    switch (periodicity) {
        case types_1.PeriodicityType.MONTHLY:
            d.setMonth(d.getMonth() + 1);
            break;
        case types_1.PeriodicityType.QUARTERLY:
            d.setMonth(d.getMonth() + 3);
            break;
        case types_1.PeriodicityType.SEMIANNUAL:
            d.setMonth(d.getMonth() + 6);
            break;
        case types_1.PeriodicityType.ANNUAL:
            d.setFullYear(d.getFullYear() + 1);
            break;
    }
    return d;
}
/**
 * Aplica amortizações sobre a memória de cálculo já calculada.
 *
 * Fórmula correta:
 *   Após amortização de valor V aplicada quando o fator acumulado era F_a,
 *   o saldo em qualquer momento futuro com fator F é:
 *     saldo_original(F) - V * (F / F_a)
 *
 * Isso garante que o efeito da amortização seja propagado corretamente.
 *
 * @param rows Memória de cálculo existente (ordenada por data)
 * @param amortizations Lista de amortizações (já expandidas)
 * @returns Nova memória de cálculo com amortizações aplicadas
 */
function applyAmortizations(rows, amortizations) {
    if (!amortizations.length)
        return rows;
    const sortedAmorts = [...amortizations].sort((a, b) => a.date.getTime() - b.date.getTime());
    const amortEvents = [];
    /**
     * Computa o saldo ajustado para uma linha, considerando todos os eventos de amortização.
     * saldo_ajustado = saldo_original - Σ(amort_i * acc_factor_atual / acc_factor_i)
     */
    function computeAdjustedBalance(row) {
        let balance = new decimal_js_1.default(row.balance);
        const currentFactor = new decimal_js_1.default(row.accumulatedFactor);
        for (const evt of amortEvents) {
            const reduction = evt.amortAmount.mul(currentFactor.div(evt.accFactor));
            balance = balance.minus(reduction);
        }
        return balance.isNegative() ? new decimal_js_1.default(0) : balance;
    }
    const result = [];
    for (const row of rows) {
        const rowDate = new Date(row.date);
        rowDate.setHours(0, 0, 0, 0);
        // Verifica amortizações nesta data
        const amortOnDate = sortedAmorts.filter(a => {
            const d = new Date(a.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === rowDate.getTime();
        });
        const adjustedRow = {
            ...row,
            balance: computeAdjustedBalance(row).toNumber(),
        };
        // Aplica amortizações desta data
        for (const amort of amortOnDate) {
            const currentBalance = new decimal_js_1.default(adjustedRow.balance);
            let amortAmount;
            if (amort.type === types_1.AmortizationType.FIXED) {
                amortAmount = decimal_js_1.default.min(new decimal_js_1.default(amort.value), currentBalance);
            }
            else {
                amortAmount = currentBalance.mul(new decimal_js_1.default(amort.value).div(100));
            }
            // Registra evento de amortização com o fator acumulado atual
            amortEvents.push({
                accFactor: new decimal_js_1.default(row.accumulatedFactor),
                amortAmount,
            });
            adjustedRow.balance = currentBalance.minus(amortAmount).toNumber();
            adjustedRow.amortizationAmount = (adjustedRow.amortizationAmount ?? 0) + amortAmount.toNumber();
            adjustedRow.description = `Amortização: ${amort.type === types_1.AmortizationType.FIXED
                ? `R$ ${amortAmount.toFixed(2)}`
                : `${amort.value}% do saldo`}`;
        }
        result.push(adjustedRow);
    }
    return result;
}
/**
 * Calcula o valor total amortizado em um conjunto de linhas.
 */
function calcTotalAmortized(rows) {
    return rows.reduce((sum, row) => sum + (row.amortizationAmount ?? 0), 0);
}
//# sourceMappingURL=AmortizationService.js.map