/**
 * Engine para Fluxo Completo com SAC / Price / Bullet — Tese T4.
 *
 * Calcula o cronograma completo de amortizações com juros remuneratórios.
 * Fase 1: sem indexador de correção monetária (apenas taxa pré-fixada).
 * Parcelas mensais, trimestrais, semestrais ou anuais: a taxa anual vira a
 * equivalente ao período, (1 + a.a.)^(meses/12) − 1.
 */
import { AmortizationSystem, FullFlowResult, Currency, GracePeriodConfig, PeriodicityType } from '../models/types';
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
    /** Periodicidade das parcelas (padrão: mensal) */
    periodicity?: PeriodicityType;
}): FullFlowResult;
//# sourceMappingURL=FullFlowEngine.d.ts.map