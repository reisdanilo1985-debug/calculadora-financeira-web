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
export declare function applyAmortizations(rows: CalculationMemoryRow[], amortizations: AmortizationEntry[], rowsDatedAtAccrualEnd?: boolean): CalculationMemoryRow[];
/**
 * Calcula o valor total amortizado em um conjunto de linhas.
 */
export declare function calcTotalAmortized(rows: CalculationMemoryRow[]): number;
/**
 * Calcula o valor total aportado em um conjunto de linhas.
 */
export declare function calcTotalContributed(rows: CalculationMemoryRow[]): number;
//# sourceMappingURL=AmortizationService.d.ts.map