/**
 * Periodicidade de eventos recorrentes (amortizações periódicas, parcelas do Fluxo
 * Completo, perpetuidade do DCF) e soma de meses ancorada no dia original.
 */
import { PeriodicityType } from '../models/types';
/** Meses entre dois eventos da periodicidade. Lança para valor fora do enum. */
export declare function monthsPerPeriod(periodicity: PeriodicityType): number;
/** Soma meses mantendo o dia da âncora, limitado ao último dia do mês de destino (31/01 → 28/02 → 31/03) */
export declare function addMonthsAnchored(anchor: Date, months: number): Date;
//# sourceMappingURL=periodicity.d.ts.map