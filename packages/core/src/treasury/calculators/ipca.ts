/**
 * §2.6 IPCA+ (NTN-B) → Pré / % do CDI. Função pura. Taxas em fração decimal.
 * Usa Fisher multiplicativo (atalho real+ipca subestima em prazos longos).
 *
 * % do CDI:
 *   pctCdiB3 → convenção B3 (percentual sobre a taxa DI diária):
 *              [(1 + nominal)^(1/252) − 1] / [(1 + CDI)^(1/252) − 1] — use este;
 *   pctCdi   → razão anual nominal ÷ CDI: APROXIMAÇÃO da planilha, mantida por
 *              compatibilidade e rotulada em `convencao`.
 */

import { D, pctCdiB3 } from '../primitives';

export interface IpcaMaisInput {
  /** Taxa real a.a. (fração, ex.: 0.07). */
  realAa: number;
  /** IPCA projetado a.a. (fração, ex.: 0.045). */
  ipcaAa: number;
  /** CDI a.a. (fração). */
  cdiAa: number;
  /** Taxa pré de mercado a.a. (fração) para breakeven de inflação. Opcional. */
  preMercadoAa?: number;
}

export interface IpcaMaisResult {
  /** Taxa nominal a.a. via Fisher (fração). */
  nominalAa: number;
  /** % do CDI da taxa nominal — convenção B3 (taxa DI diária). */
  pctCdiB3: number;
  /** % do CDI pela razão anual nominal ÷ CDI — aproximação. */
  pctCdi: number;
  /** Régua de cada "% do CDI", para exibição. */
  convencao: string;
  /** Inflação de breakeven (presente quando preMercadoAa é informado). */
  breakevenInf?: number;
  /** Veredito IPCA+ vs Pré (presente quando preMercadoAa é informado). */
  veredito?: 'IPCA+ ganha' | 'Pré ganha';
}

export function ipcaMais(input: IpcaMaisInput): IpcaMaisResult {
  const { realAa, ipcaAa, cdiAa, preMercadoAa } = input;
  if (cdiAa <= 0) throw new Error('ipcaMais: cdiAa deve ser > 0.');

  const nominalAa = D(1).plus(realAa).mul(D(1).plus(ipcaAa)).minus(1); // Fisher
  if (!nominalAa.gt(-1)) throw new Error('ipcaMais: a taxa nominal resultante deve ser maior que −100%.');

  const result: IpcaMaisResult = {
    nominalAa: nominalAa.toNumber(),
    pctCdiB3: pctCdiB3(nominalAa, cdiAa).toNumber(),
    pctCdi: nominalAa.div(cdiAa).toNumber(),
    convencao: 'Pct Cdi B3 = % do CDI sobre a taxa DI diária (B3); Pct Cdi = razão anual nominal ÷ CDI (aproximação).',
  };

  if (preMercadoAa !== undefined) {
    const breakevenInf = (1 + preMercadoAa) / (1 + realAa) - 1;
    result.breakevenInf = breakevenInf;
    result.veredito = ipcaAa > breakevenInf ? 'IPCA+ ganha' : 'Pré ganha';
  }

  return result;
}
