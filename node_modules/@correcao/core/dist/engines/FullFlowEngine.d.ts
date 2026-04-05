/**
 * Engine para Fluxo Completo com SAC / Price / Bullet — Tese T4.
 *
 * Calcula o cronograma completo de amortizações com juros remuneratórios.
 * Fase 1: sem indexador de correção monetária (apenas taxa pré-fixada).
 */
import { AmortizationSystem, FullFlowResult, Currency, GracePeriodConfig } from '../models/types';
/**
 * Calcula o cronograma completo de amortizações.
 */
export declare function calculateFullFlow(params: {
    principal: number;
    startDate: Date;
    numberOfPeriods: number;
    annualRate: number;
    amortizationSystem: AmortizationSystem;
    currency: Currency;
    gracePeriod?: GracePeriodConfig;
}): FullFlowResult;
//# sourceMappingURL=FullFlowEngine.d.ts.map