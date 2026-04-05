/**
 * Engine para Valor Presente (Discounted Cash Flow) — Tese T2.
 *
 * Fórmula: PV = FV / (1 + r)^t
 * onde t é calculado pela base de dias configurada.
 */
import { DCFCashFlow, DCFResult, DayCountBasis, Currency } from '../models/types';
/**
 * Calcula o Valor Presente de um conjunto de fluxos futuros.
 */
export declare function calculateDCF(params: {
    cashFlows: DCFCashFlow[];
    discountRate: number;
    referenceDate: Date;
    dayCountBasis: DayCountBasis;
    currency: Currency;
}): DCFResult;
//# sourceMappingURL=DCFEngine.d.ts.map