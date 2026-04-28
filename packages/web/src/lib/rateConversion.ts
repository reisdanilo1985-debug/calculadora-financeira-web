export type RateMode = 'aa' | 'am';

/**
 * Converte uma taxa percentual ao mês para sua equivalente ao ano (composta).
 *   i_aa = ((1 + i_am/100)^12 - 1) * 100
 * Quando o modo já é 'aa', retorna a taxa inalterada.
 */
export function toAnnual(rate: number, mode: RateMode): number {
  if (mode === 'aa') return rate;
  return (Math.pow(1 + rate / 100, 12) - 1) * 100;
}
