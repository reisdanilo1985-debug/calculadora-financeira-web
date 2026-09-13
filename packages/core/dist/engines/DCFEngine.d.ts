/**
 * Engine para Valor Presente (Discounted Cash Flow) — Tese T2.
 *
 * Fórmula: VP = Σ CF / (1 + r)^t, onde t é calculado pela base de dias configurada.
 * Fluxos com sinal (saídas negativas, entradas positivas): o VP total é o VPL.
 * Fluxo na própria data de referência entra com t = 0.
 *
 * Perpetuidade (Gordon), avaliada na data N do último fluxo explícito:
 *   VT_N = FC_base × (1 + g_p) / (r_p − g_p),   VP(VT) = VT_N / (1 + r)^t_N
 * r_p e g_p são as taxas equivalentes ao período do fluxo perpétuo: (1 + taxa a.a.)^(1/k) − 1,
 * com k períodos por ano. Exige r > g.
 *
 * TIR: taxa anual i com VPL(i) = 0, na MESMA contagem de tempo do VP (base 252/360/365).
 * Com perpetuidade, o valor terminal é recalculado em cada i (i > g).
 */
import { DCFCashFlow, DCFResult, DCFPerpetuityConfig, DayCountBasis, Currency } from '../models/types';
/**
 * Calcula o Valor Presente de um conjunto de fluxos futuros.
 */
export declare function calculateDCF(params: {
    cashFlows: DCFCashFlow[];
    discountRate: number;
    referenceDate: Date;
    dayCountBasis: DayCountBasis;
    currency: Currency;
    perpetuity?: DCFPerpetuityConfig;
}): DCFResult;
//# sourceMappingURL=DCFEngine.d.ts.map