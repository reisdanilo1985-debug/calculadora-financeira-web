/**
 * §2.4 Pré ↔ % do CDI. Função pura. Taxas em fração decimal.
 *
 * Convenção B3 ("% do DI", Caderno de Fórmulas CDB/DI): o percentual incide
 * sobre a taxa DI DIÁRIA, não sobre a taxa anual:
 *   TDI          = (1 + CDI)^(1/252) − 1
 *   fator diário = 1 + p·TDI
 *   pré equiv.   = (1 + p·TDI)^252 − 1
 *   p            = [(1 + pré)^(1/252) − 1] / TDI
 * Mesma convenção do CDIEngine da Calculadora principal. Com CDI constante a
 * conversão é exata (ida e volta perfeita); a razão anual pré ÷ CDI é só uma
 * aproximação (superestima p acima de 100% do CDI) e NÃO é usada aqui.
 */

import { D, pctCdiB3, taxaDePctCdiB3 } from '../primitives';

export interface PreParaCdiInput {
  /** Taxa pré a.a. (fração). */
  preAa: number;
  /** CDI a.a. (fração). */
  cdiAa: number;
}

export interface PreParaCdiResult {
  /** Percentual do CDI (convenção B3, sobre a taxa DI diária). Ex.: 1.10 = 110%. */
  pctCdi: number;
  spreadCompSobreCdi: number;
}

export function preParaCdi(input: PreParaCdiInput): PreParaCdiResult {
  const { preAa, cdiAa } = input;
  if (cdiAa <= 0) throw new Error('preParaCdi: cdiAa deve ser > 0.');
  if (preAa <= -1) throw new Error('preParaCdi: preAa deve ser maior que −100%.');
  return {
    pctCdi: pctCdiB3(preAa, cdiAa).toNumber(),
    spreadCompSobreCdi: D(1).plus(preAa).div(D(1).plus(cdiAa)).minus(1).toNumber(),
  };
}

export interface CdiParaPreInput {
  /** Percentual do CDI (ex.: 1.10 para 110%). */
  pctCdi: number;
  cdiAa: number;
}

export function cdiParaPre(input: CdiParaPreInput): { preAa: number } {
  const { pctCdi, cdiAa } = input;
  if (cdiAa <= 0) throw new Error('cdiParaPre: cdiAa deve ser > 0.');
  return { preAa: taxaDePctCdiB3(pctCdi, cdiAa).toNumber() };
}
