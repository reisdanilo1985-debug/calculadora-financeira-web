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
  /** Spread sobre o CDI equivalente (composto) a.a. — a leitura "CDI + X%". */
  spreadSobreCdiComp: number;
  /** Spread sobre o CDI equivalente (linear) a.a. */
  spreadSobreCdiLin: number;
  /** Spread (a.a.) que resulta em exatos 100% do CDI = cupom cambial. */
  spreadEquilibrio: number;
}

/**
 * USD/EUR + spread → equivalente em reais (pré, % do CDI e CDI + spread).
 * Paridade coberta: o custo hedgeado da dívida externa expresso na régua local.
 */
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
    // "CDI + spread": quanto o custo hedgeado fica acima (ou abaixo) do CDI.
    spreadSobreCdiComp: (1 + preEquivComp) / (1 + cdiAa) - 1,
    spreadSobreCdiLin: preEquivLin - cdiAa,
    spreadEquilibrio: cupomEstrangeiroAa,
  };
}

// ─────────────────── Inverso: CDI + spread → moeda + spread ───────────────────

export interface CdiToCrossCcyInput {
  /** CDI a.a. (fração). */
  cdiAa: number;
  /** Spread local sobre o CDI, a.a. (fração) — a perna "CDI + X%". */
  spreadLocalAa: number;
  /** Cupom cambial da moeda no vértice, a.a. (fração). */
  cupomEstrangeiroAa: number;
}

export interface CdiToCrossCcyResult {
  /** Câmbio a termo implícito a.a. (fração). */
  cambioFwdAa: number;
  /** Spread em moeda estrangeira equivalente (composto) a.a. (fração). */
  spreadEstrangeiroComp: number;
  /** Spread em moeda estrangeira equivalente (linear) a.a. (fração). */
  spreadEstrangeiroLin: number;
  /** Pré equivalente (composto) da perna local, para conferência. */
  preEquivComp: number;
  /** % do CDI da perna local (composto). */
  pctCdiComp: number;
}

/**
 * CDI + spread (perna local) → spread em USD/EUR equivalente sob hedge completo.
 *
 * Inverte a paridade coberta. Fechado: igualando o custo hedgeado externo ao
 * local, (1+cambioFwd)(1+spreadExt) = (1+CDI)(1+spreadLocal), e como
 * (1+cambioFwd) = (1+CDI)/(1+cupom), cai em:
 *   spreadExt = (1+spreadLocal)·(1+cupom) − 1   (composto)
 *   spreadExt ≈ spreadLocal + cupom             (linear)
 */
export function cdiToCrossCcy(input: CdiToCrossCcyInput): CdiToCrossCcyResult {
  const { cdiAa, spreadLocalAa, cupomEstrangeiroAa } = input;
  if (cdiAa <= 0) throw new Error('cdiToCrossCcy: cdiAa deve ser > 0.');

  const cambioFwdAa = (1 + cdiAa) / (1 + cupomEstrangeiroAa) - 1;
  const preEquivComp = (1 + cdiAa) * (1 + spreadLocalAa) - 1;

  return {
    cambioFwdAa,
    spreadEstrangeiroComp: (1 + spreadLocalAa) * (1 + cupomEstrangeiroAa) - 1,
    spreadEstrangeiroLin: spreadLocalAa + cupomEstrangeiroAa,
    preEquivComp,
    pctCdiComp: preEquivComp / cdiAa,
  };
}
