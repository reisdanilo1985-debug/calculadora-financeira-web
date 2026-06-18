/**
 * §2.4 Pré ↔ % do CDI. Função pura. Taxas em fração decimal.
 *
 * Ressalva (documentar na UI): a razão de taxas é a aproximação de mesa
 * (exata só com CDI constante). O acúmulo real de "p% do CDI" é diário.
 */

export interface PreParaCdiInput {
  /** Taxa pré a.a. (fração). */
  preAa: number;
  /** CDI a.a. (fração). */
  cdiAa: number;
}

export interface PreParaCdiResult {
  pctCdi: number;
  spreadCompSobreCdi: number;
}

export function preParaCdi(input: PreParaCdiInput): PreParaCdiResult {
  const { preAa, cdiAa } = input;
  if (cdiAa <= 0) throw new Error('preParaCdi: cdiAa deve ser > 0.');
  return {
    pctCdi: preAa / cdiAa,
    spreadCompSobreCdi: (1 + preAa) / (1 + cdiAa) - 1,
  };
}

export interface CdiParaPreInput {
  /** Percentual do CDI (ex.: 1.10 para 110%). */
  pctCdi: number;
  cdiAa: number;
}

export function cdiParaPre(input: CdiParaPreInput): { preAa: number } {
  return { preAa: input.pctCdi * input.cdiAa };
}
