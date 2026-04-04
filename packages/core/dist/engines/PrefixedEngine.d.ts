/**
 * Engine de cálculo para taxa pré-fixada.
 *
 * Fórmulas por base:
 *   Base 252 d.u.: fator = (1 + taxa/100) ^ (du / 252)
 *   Base 360 d.c.: fator = (1 + taxa/100) ^ (dc / 360)
 *   Base 365 d.c.: fator = (1 + taxa/100) ^ (dc / 365)
 */
import { CalculationInput, CalculationMemoryRow } from '../models/types';
/**
 * Calcula a correção via taxa pré-fixada.
 *
 * @param input Input de cálculo (deve ter prefixedRate definido)
 * @returns Array de linhas da memória de cálculo
 */
export declare function calculatePrefixed(input: CalculationInput): CalculationMemoryRow[];
//# sourceMappingURL=PrefixedEngine.d.ts.map