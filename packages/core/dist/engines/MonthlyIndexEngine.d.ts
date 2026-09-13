/**
 * Engine de cálculo para indexadores mensais: IPCA, IGP-M, INCC.
 *
 * Fórmula:
 *   Para cada mês, o fator é aplicado proporcionalmente (pro-rata) quando as
 *   datas de início/fim não coincidem com o início/fim do mês.
 *
 *   fator_pro_rata = (1 + indice_mensal/100) ^ (dias_utilizados / dias_do_mes)
 *
 *   A base de cálculo (360 ou 365) configura o denominador do pro-rata.
 *
 *   Composição:
 *   - "% do índice" (ex: 110% do IPCA): taxa_mensal_efetiva = taxa_mensal × percentual/100
 *   - Índice + taxa (ex: IPCA + 6% a.a.): o fator do spread é composto em cada
 *     segmento, (1 + spread/100)^(dias_corridos_do_segmento/base), para que
 *     amortizações intermediárias deixem de render o spread a partir da data do evento.
 *
 *   Todo mês do período precisa de dado oficial ou de premissa; mês sem nenhum
 *   dos dois gera MissingIndexDataError (antes entrava com 0%).
 */
import { CalculationInput, CalculationMemoryRow } from '../models/types';
/**
 * Calcula a correção via IPCA/IGP-M/INCC para o período definido no input.
 *
 * @param input Input de cálculo (deve conter indexData com variações mensais)
 * @returns Array de linhas da memória de cálculo (uma por mês)
 */
export declare function calculateMonthlyIndex(input: CalculationInput): CalculationMemoryRow[];
//# sourceMappingURL=MonthlyIndexEngine.d.ts.map