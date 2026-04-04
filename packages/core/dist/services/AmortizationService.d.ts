/**
 * Serviço de processamento de amortizações.
 *
 * Lógica:
 *   1. Ordena amortizações por data
 *   2. Para cada período entre amortizações: corrige o saldo pelo indexador
 *   3. Na data de cada amortização: subtrai o valor do saldo corrigido
 *   4. O novo saldo é a base para o próximo período
 */
import { AmortizationEntry, CalculationMemoryRow } from '../models/types';
/**
 * Expande amortizações periódicas em entradas individuais.
 */
export declare function expandPeriodicAmortizations(amortizations: AmortizationEntry[]): AmortizationEntry[];
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
export declare function applyAmortizations(rows: CalculationMemoryRow[], amortizations: AmortizationEntry[]): CalculationMemoryRow[];
/**
 * Calcula o valor total amortizado em um conjunto de linhas.
 */
export declare function calcTotalAmortized(rows: CalculationMemoryRow[]): number;
//# sourceMappingURL=AmortizationService.d.ts.map