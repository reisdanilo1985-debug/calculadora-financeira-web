/**
 * §2.5 CDI + spread ↔ % do CDI. Função pura. Taxas em fração decimal.
 *
 * O "% do CDI" segue a convenção B3 (percentual sobre a taxa DI DIÁRIA, a mesma
 * do CDIEngine da Calculadora principal):
 *   TDI      = (1 + CDI)^(1/252) − 1
 *   p        = [(1 + total)^(1/252) − 1] / TDI
 *   total(p) = (1 + p·TDI)^252 − 1
 * As variantes "Comp"/"Lin" referem-se à COMPOSIÇÃO do spread sobre o CDI:
 *   totalComp = (1 + CDI)·(1 + spread) − 1   (spread composto, base 252)
 *   totalLin  = CDI + spread                 (spread aditivo)
 */

import { D, pctCdiB3, taxaDePctCdiB3 } from '../primitives';

export interface CdiSpreadParaPctInput {
  cdiAa: number;
  /** Spread a.a. (fração). */
  spreadAa: number;
}

export interface CdiSpreadParaPctResult {
  totalComp: number;
  totalLin: number;
  /** % do CDI (B3) equivalente ao total com spread composto. */
  pctCdiComp: number;
  /** % do CDI (B3) equivalente ao total com spread aditivo. */
  pctCdiLin: number;
}

export function cdiSpreadParaPct(input: CdiSpreadParaPctInput): CdiSpreadParaPctResult {
  const { cdiAa, spreadAa } = input;
  if (cdiAa <= 0) throw new Error('cdiSpreadParaPct: cdiAa deve ser > 0.');
  if (spreadAa <= -1) throw new Error('cdiSpreadParaPct: spreadAa deve ser maior que −100%.');
  const totalComp = D(1).plus(cdiAa).mul(D(1).plus(spreadAa)).minus(1);
  const totalLin = D(cdiAa).plus(spreadAa);
  return {
    totalComp: totalComp.toNumber(),
    totalLin: totalLin.toNumber(),
    pctCdiComp: pctCdiB3(totalComp, cdiAa).toNumber(),
    pctCdiLin: pctCdiB3(totalLin, cdiAa).toNumber(),
  };
}

export interface PctParaCdiSpreadInput {
  /** Percentual do CDI (ex.: 1.10 para 110%). */
  pctCdi: number;
  cdiAa: number;
}

export interface PctParaCdiSpreadResult {
  /** Taxa a.a. do acúmulo diário a p% do CDI (B3). */
  totalAa: number;
  spreadLin: number;
  spreadComp: number;
}

export function pctParaCdiSpread(input: PctParaCdiSpreadInput): PctParaCdiSpreadResult {
  const { pctCdi, cdiAa } = input;
  if (cdiAa <= 0) throw new Error('pctParaCdiSpread: cdiAa deve ser > 0.');
  const totalAa = taxaDePctCdiB3(pctCdi, cdiAa);
  return {
    totalAa: totalAa.toNumber(),
    spreadLin: totalAa.minus(cdiAa).toNumber(),
    spreadComp: D(1).plus(totalAa).div(D(1).plus(cdiAa)).minus(1).toNumber(),
  };
}
