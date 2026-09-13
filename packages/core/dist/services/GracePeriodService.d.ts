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
import { CalculationMemoryRow, GracePeriodConfig, GracePeriodInfo } from '../models/types';
export declare function applyGracePeriod(rows: CalculationMemoryRow[], initialAmount: number, gracePeriod: GracePeriodConfig, rowsDatedAtAccrualEnd?: boolean): {
    rows: CalculationMemoryRow[];
} & Omit<GracePeriodInfo, 'type' | 'endDate'>;
//# sourceMappingURL=GracePeriodService.d.ts.map