/**
 * §2.5 CDI + spread ↔ % do CDI. Função pura. Taxas em fração decimal.
 */

export interface CdiSpreadParaPctInput {
  cdiAa: number;
  /** Spread a.a. (fração). */
  spreadAa: number;
}

export interface CdiSpreadParaPctResult {
  totalComp: number;
  totalLin: number;
  pctCdiComp: number;
  pctCdiLin: number;
}

export function cdiSpreadParaPct(input: CdiSpreadParaPctInput): CdiSpreadParaPctResult {
  const { cdiAa, spreadAa } = input;
  if (cdiAa <= 0) throw new Error('cdiSpreadParaPct: cdiAa deve ser > 0.');
  const totalComp = (1 + cdiAa) * (1 + spreadAa) - 1;
  const totalLin = cdiAa + spreadAa;
  return {
    totalComp,
    totalLin,
    pctCdiComp: totalComp / cdiAa,
    pctCdiLin: totalLin / cdiAa,
  };
}

export interface PctParaCdiSpreadInput {
  /** Percentual do CDI (ex.: 1.10 para 110%). */
  pctCdi: number;
  cdiAa: number;
}

export interface PctParaCdiSpreadResult {
  totalAa: number;
  spreadLin: number;
  spreadComp: number;
}

export function pctParaCdiSpread(input: PctParaCdiSpreadInput): PctParaCdiSpreadResult {
  const { pctCdi, cdiAa } = input;
  const totalAa = pctCdi * cdiAa;
  return {
    totalAa,
    spreadLin: totalAa - cdiAa,
    spreadComp: (1 + totalAa) / (1 + cdiAa) - 1,
  };
}
