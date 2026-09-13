/**
 * Motor de cálculo principal — orquestra todos os engines e serviços.
 * Suporta as Teses T1-T5 da Fase 1.
 */
import { CalculationInput, CalculationResult, IndexType } from '../models/types';
/**
 * Executa o cálculo completo, roteando pela tese selecionada.
 */
export declare function calculate(input: CalculationInput): CalculationResult;
/**
 * Data a partir da qual o período precisa de premissas (null = dados cobrem o período).
 *
 * A cobertura depende da natureza da série:
 * - índices mensais (IPCA/IGP-M/INCC): por competência — a observação datada no
 *   dia 1 cobre o mês inteiro; exige premissa a partir do dia 1 do primeiro mês
 *   sem observação;
 * - CDI/Selic: por dia útil — fins de semana e feriados após o último dado não
 *   exigem premissa;
 * - SOFR: até 4 dias corridos após a última publicação (fim de semana prolongado);
 * - demais: por dia corrido.
 *
 * Sem `indexType`, uma série em que todas as observações caem no dia 1 é tratada
 * como mensal.
 */
export declare function getPremisesRequiredFrom(endDate: Date, indexData: {
    date: Date;
}[], indexType?: IndexType | string): Date | null;
//# sourceMappingURL=CalculationEngine.d.ts.map