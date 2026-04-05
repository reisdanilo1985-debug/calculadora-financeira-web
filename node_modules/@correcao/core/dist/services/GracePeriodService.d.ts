/**
 * Serviço de carência — aplica a lógica de carência sobre memória de cálculo
 * já processada pelos engines base (CDI, IPCA, etc.).
 *
 * Tipo A / D: sem modificação (juros capitalizam — comportamento padrão)
 * Tipo B: saldo congelado durante a carência
 * Tipo C: saldo congelado, juros contabilizados como pagamentos saídos
 */
import { CalculationMemoryRow, GracePeriodConfig, GracePeriodInfo } from '../models/types';
export declare function applyGracePeriod(rows: CalculationMemoryRow[], initialAmount: number, gracePeriod: GracePeriodConfig): {
    rows: CalculationMemoryRow[];
} & Omit<GracePeriodInfo, 'type' | 'endDate'>;
//# sourceMappingURL=GracePeriodService.d.ts.map