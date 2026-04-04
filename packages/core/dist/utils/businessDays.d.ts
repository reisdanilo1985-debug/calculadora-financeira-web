/**
 * Utilitários para calendário de dias úteis brasileiros.
 * Inclui feriados nacionais de 2000 a 2035.
 */
/**
 * Verifica se uma data é feriado nacional brasileiro.
 */
export declare function isBrazilianHoliday(date: Date): boolean;
/**
 * Verifica se uma data é dia útil (não é sábado, domingo ou feriado nacional).
 */
export declare function isBusinessDay(date: Date): boolean;
/**
 * Adiciona n dias a uma data.
 */
export declare function addDays(date: Date, days: number): Date;
/**
 * Retorna todos os dias úteis entre duas datas (inclusive startDate, exclusive endDate).
 * Padrão do mercado brasileiro: o dia inicial conta, o dia final não conta.
 */
export declare function getBusinessDaysBetween(startDate: Date, endDate: Date): Date[];
/**
 * Retorna todos os dias corridos entre duas datas (inclusive startDate, exclusive endDate).
 */
export declare function getCalendarDaysBetween(startDate: Date, endDate: Date): Date[];
/**
 * Conta o número de dias úteis entre duas datas.
 */
export declare function countBusinessDays(startDate: Date, endDate: Date): number;
/**
 * Conta o número de dias corridos entre duas datas.
 */
export declare function countCalendarDays(startDate: Date, endDate: Date): number;
/**
 * Formata uma data como 'YYYY-MM-DD' (ISO).
 */
export declare function toISODate(date: Date): string;
/**
 * Formata uma data como 'DD/MM/YYYY' (padrão BCB).
 */
export declare function toBCBDate(date: Date): string;
/**
 * Parseia uma data no formato 'DD/MM/YYYY' (padrão BCB).
 */
export declare function parseBCBDate(str: string): Date;
/**
 * Retorna o último dia útil anterior ou igual a uma data.
 */
export declare function lastBusinessDayOn(date: Date): Date;
/**
 * Retorna o número de dias no mês de uma data.
 */
export declare function daysInMonth(date: Date): number;
//# sourceMappingURL=businessDays.d.ts.map