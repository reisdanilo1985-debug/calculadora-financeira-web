"use strict";
/**
 * Periodicidade de eventos recorrentes (amortizações periódicas, parcelas do Fluxo
 * Completo, perpetuidade do DCF) e soma de meses ancorada no dia original.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthsPerPeriod = monthsPerPeriod;
exports.addMonthsAnchored = addMonthsAnchored;
const types_1 = require("../models/types");
/** Meses entre dois eventos da periodicidade. Lança para valor fora do enum. */
function monthsPerPeriod(periodicity) {
    switch (periodicity) {
        case types_1.PeriodicityType.MONTHLY: return 1;
        case types_1.PeriodicityType.QUARTERLY: return 3;
        case types_1.PeriodicityType.SEMIANNUAL: return 6;
        case types_1.PeriodicityType.ANNUAL: return 12;
        default:
            throw new Error(`Periodicidade inválida: "${periodicity}". Use MONTHLY, QUARTERLY, SEMIANNUAL ou ANNUAL.`);
    }
}
/** Soma meses mantendo o dia da âncora, limitado ao último dia do mês de destino (31/01 → 28/02 → 31/03) */
function addMonthsAnchored(anchor, months) {
    const target = new Date(anchor.getFullYear(), anchor.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(anchor.getDate(), lastDay));
    return target;
}
//# sourceMappingURL=periodicity.js.map