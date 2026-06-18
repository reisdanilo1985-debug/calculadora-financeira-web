/**
 * §2.2/§2.3 Cross-currency genérico → % do CDI (USD ou EUR + spread).
 * Paridade coberta, convenção BR: (1+CDI) = (1+ΔFX)·(1+cupom).
 * Função pura. Taxas em fração decimal.
 */

export interface CrossCcyInput {
  /** Spread em moeda estrangeira, a.a. (fração). */
  spreadEstrangeiroAa: number;
  /** CDI a.a. (fração). */
  cdiAa: number;
  /** Cupom cambial da moeda no vértice da vida média do papel, a.a. (fração). */
  cupomEstrangeiroAa: number;
}

export interface CrossCcyResult {
  /** Câmbio a termo implícito a.a. (fração). */
  cambioFwdAa: number;
  /** Pré equivalente (composto) a.a. (fração). */
  preEquivComp: number;
  /** Pré equivalente (linear) a.a. (fração). */
  preEquivLin: number;
  /** % do CDI (composto). */
  pctCdiComp: number;
  /** % do CDI (linear). */
  pctCdiLin: number;
  /** Spread (a.a.) que resulta em exatos 100% do CDI = cupom cambial. */
  spreadEquilibrio: number;
}

export function crossCcyToCdi(input: CrossCcyInput): CrossCcyResult {
  const { spreadEstrangeiroAa, cdiAa, cupomEstrangeiroAa } = input;
  if (cdiAa <= 0) throw new Error('crossCcyToCdi: cdiAa deve ser > 0.');

  const cambioFwdAa = (1 + cdiAa) / (1 + cupomEstrangeiroAa) - 1;
  const preEquivComp = (1 + cambioFwdAa) * (1 + spreadEstrangeiroAa) - 1;
  const preEquivLin = cambioFwdAa + spreadEstrangeiroAa;

  return {
    cambioFwdAa,
    preEquivComp,
    preEquivLin,
    pctCdiComp: preEquivComp / cdiAa,
    pctCdiLin: preEquivLin / cdiAa,
    spreadEquilibrio: cupomEstrangeiroAa,
  };
}
