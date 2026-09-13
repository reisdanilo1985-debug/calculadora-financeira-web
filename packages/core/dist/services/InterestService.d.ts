/**
 * Serviço de juros remuneratórios para Tese T5.
 *
 * Aplica juros simples ou compostos sobre o saldo já corrigido pelo indexador.
 *
 * Juros Compostos: saldo_final = saldo_corrigido × (1 + taxa)^t
 * Juros Simples:   saldo_final = saldo_corrigido + capital_inicial × taxa × t
 *
 * t é medido até o FIM do intervalo que cada linha representa:
 *   - linhas datadas no início do acúmulo (CDI/Selic, SOFR, pré): até a data
 *     da próxima linha, e até a data final na última linha;
 *   - linhas datadas no fim do acúmulo (índices mensais): até a própria data.
 * Assim a última linha leva os juros até a data final (antes parava no último
 * dia útil e perdia o intervalo final).
 *
 * Com amortizações, a propagação por razão de fatores equivale a juros simples
 * sobre o principal remanescente depois do evento.
 */
import { CalculationMemoryRow, InterestType, DayCountBasis } from '../models/types';
/**
 * Aplica juros remuneratórios (simples ou compostos) sobre as linhas
 * já corrigidas pelo indexador de mercado (T1 base).
 *
 * @param rows       Linhas de memória produzidas pelo engine de índice
 * @param initialAmount  Montante original (base para juros simples)
 * @param annualRate     Taxa anual em % (ex: 6 para 6% a.a.)
 * @param interestType   SIMPLES ou COMPOSTA
 * @param startDate      Data de início do contrato
 * @param dayCountBasis  Base de dias para o cálculo do fator de tempo
 * @param endDate        Data final do cálculo (fim do intervalo da última linha)
 * @param rowsDatedAtAccrualEnd  true para engines que datam a linha no fim do acúmulo
 */
export declare function applyInterest(rows: CalculationMemoryRow[], initialAmount: number, annualRate: number, interestType: InterestType, startDate: Date, dayCountBasis: DayCountBasis, endDate?: Date, rowsDatedAtAccrualEnd?: boolean): CalculationMemoryRow[];
//# sourceMappingURL=InterestService.d.ts.map