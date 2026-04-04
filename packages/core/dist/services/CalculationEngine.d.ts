/**
 * Motor de cálculo principal — orquestra todos os engines e serviços.
 * Suporta as Teses T1-T5 da Fase 1.
 */
import { CalculationInput, CalculationResult } from '../models/types';
/**
 * Executa o cálculo completo, roteando pela tese selecionada.
 */
export declare function calculate(input: CalculationInput): CalculationResult;
export declare function getPremisesRequiredFrom(endDate: Date, indexData: {
    date: Date;
}[]): Date | null;
//# sourceMappingURL=CalculationEngine.d.ts.map