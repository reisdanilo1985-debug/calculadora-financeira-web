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
exports.calcTotalContributed = calcTotalContributed;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
// Periodicidade desconhecida é erro (antes travava o laço); datas ancoradas no dia original
const periodicity_1 = require("../utils/periodicity");
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
        const first = new Date(amort.date);
        first.setHours(0, 0, 0, 0);
        const endDate = new Date(amort.periodicEndDate);
        endDate.setHours(0, 0, 0, 0);
        const step = (0, periodicity_1.monthsPerPeriod)(amort.periodicity);
        // Cada ocorrência é contada a partir da data ORIGINAL (âncora), com ajuste ao
        // último dia do mês: 31/01 → 28/02 → 31/03 (antes 31/01 → 03/03 → 03/04).
        for (let k = 0;; k++) {
            const current = (0, periodicity_1.addMonthsAnchored)(first, k * step);
            if (current > endDate)
                break;
            if (k >= MAX_PERIODIC_EVENTS) {
                throw new Error(`Amortização periódica gera mais de ${MAX_PERIODIC_EVENTS} eventos. Reduza o período ou aumente a periodicidade.`);
            }
            result.push({
                date: current,
                type: amort.isPeriodicPercentage ? types_1.AmortizationType.PERCENTAGE : types_1.AmortizationType.FIXED,
                value: amort.value,
                direction: amort.direction,
            });
        }
    }
    return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}
/** Limite de eventos gerados por uma amortização periódica (100 anos mensais) */
const MAX_PERIODIC_EVENTS = 1200;
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
 * Momento do evento (convenção B3, "até a data de pagamento, exclusive"):
 * o valor pago na data D deixa de render a partir de D.
 *   - Linhas datadas no INÍCIO do acúmulo (CDI/Selic, SOFR, pré): a linha de D
 *     já inclui o acúmulo de D, então o evento usa o fator do início da linha
 *     (F / fator_do_dia) e o saldo do início do dia.
 *   - Linhas datadas no FIM do acúmulo (índices mensais): o fator da própria
 *     linha já é o fator em D.
 *
 * @param rows Memória de cálculo existente (ordenada por data)
 * @param amortizations Lista de amortizações (já expandidas)
 * @param rowsDatedAtAccrualEnd true para engines que datam a linha no fim do acúmulo
 * @returns Nova memória de cálculo com amortizações aplicadas
 */
function applyAmortizations(rows, amortizations, rowsDatedAtAccrualEnd = false) {
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
    // Ponteiro sobre a lista ordenada: cada evento é consumido UMA vez, na
    // primeira linha com data >= data do evento. Antes, a busca por igualdade
    // aplicava o mesmo evento a todas as linhas da data (ex.: duas linhas na
    // data final) e ignorava eventos sem linha na data exata.
    let nextAmortIdx = 0;
    for (const row of rows) {
        const rowDate = new Date(row.date);
        rowDate.setHours(0, 0, 0, 0);
        // Coleta todos os eventos pendentes com data <= data da linha
        const amortOnDate = [];
        while (nextAmortIdx < sortedAmorts.length) {
            const d = new Date(sortedAmorts[nextAmortIdx].date);
            d.setHours(0, 0, 0, 0);
            if (d.getTime() <= rowDate.getTime()) {
                amortOnDate.push(sortedAmorts[nextAmortIdx]);
                nextAmortIdx++;
            }
            else {
                break;
            }
        }
        const adjustedRow = {
            ...row,
            balance: computeAdjustedBalance(row).toNumber(),
        };
        // Fator e saldo no momento do evento (ver comentário da função)
        const rowFactor = new decimal_js_1.default(row.accumulatedFactor);
        const growthOfRow = rowsDatedAtAccrualEnd || !row.dailyFactor
            ? new decimal_js_1.default(1)
            : new decimal_js_1.default(row.dailyFactor);
        const eventFactor = rowFactor.div(growthOfRow);
        let balanceAtEvent = new decimal_js_1.default(adjustedRow.balance).div(growthOfRow);
        // Aplica amortizações e aportes desta data
        for (const amort of amortOnDate) {
            const currentBalance = balanceAtEvent;
            const isContribution = amort.direction === types_1.FlowDirection.IN;
            let amount;
            if (amort.type === types_1.AmortizationType.FIXED) {
                // Amortização não pode exceder o saldo; aporte não tem teto
                amount = isContribution
                    ? new decimal_js_1.default(amort.value)
                    : decimal_js_1.default.min(new decimal_js_1.default(amort.value), currentBalance);
            }
            else {
                amount = currentBalance.mul(new decimal_js_1.default(amort.value).div(100));
            }
            // Registra o evento com o fator do momento do evento. Aportes entram com
            // sinal NEGATIVO: em computeAdjustedBalance, `minus(reduction)` então
            // SOMA o aporte corrigido pela razão de fatores (F / F_evento).
            amortEvents.push({
                accFactor: eventFactor,
                amortAmount: isContribution ? amount.neg() : amount,
            });
            balanceAtEvent = isContribution ? currentBalance.plus(amount) : currentBalance.minus(amount);
            adjustedRow.balance = balanceAtEvent.mul(growthOfRow).toNumber();
            if (isContribution) {
                adjustedRow.contributionAmount = (adjustedRow.contributionAmount ?? 0) + amount.toNumber();
                adjustedRow.description = `Aporte: ${amort.type === types_1.AmortizationType.FIXED
                    ? `R$ ${amount.toFixed(2)}`
                    : `${amort.value}% do saldo`}`;
            }
            else {
                adjustedRow.amortizationAmount = (adjustedRow.amortizationAmount ?? 0) + amount.toNumber();
                adjustedRow.description = `Amortização: ${amort.type === types_1.AmortizationType.FIXED
                    ? `R$ ${amount.toFixed(2)}`
                    : `${amort.value}% do saldo`}`;
            }
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
/**
 * Calcula o valor total aportado em um conjunto de linhas.
 */
function calcTotalContributed(rows) {
    return rows.reduce((sum, row) => sum + (row.contributionAmount ?? 0), 0);
}
//# sourceMappingURL=AmortizationService.js.map