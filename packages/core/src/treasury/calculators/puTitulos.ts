/**
 * §2.10 PU de títulos BR (base 252). LTN/Prefixado (zero-cupom) e NTN-F (cupom semestral).
 * Função pura. Taxas em fração decimal; du = dias úteis ANBIMA do título.
 */

import Decimal from 'decimal.js';
import { D } from '../primitives';

export interface LtnInput {
  /** Valor nominal (face). */
  vn: number;
  /** Taxa de desconto a.a. base 252 (fração). */
  iaa: number;
  /** Dias úteis até o vencimento. */
  du: number;
}

export function puLtn(input: LtnInput): { pu: number } {
  const { vn, iaa, du } = input;
  if (du <= 0) throw new Error('puLtn: du deve ser > 0.');
  const pu = D(vn).div(D(1).plus(iaa).pow(D(du).div(252)));
  return { pu: pu.toNumber() };
}

export interface NtnfInput {
  /** Valor de face. */
  face: number;
  /** Taxa de desconto (YTM) a.a. base 252 (fração). */
  iaa: number;
  /** Taxa de cupom anual (fração, ex.: 0.10). Cupom semestral = (1+rate)^(1/m)−1. */
  couponRateAnnual: number;
  /** Pagamentos por ano (2 para semestral). */
  m: number;
  /** Dias úteis até cada pagamento de cupom (ascendente; o último carrega a face). */
  cuponsDu: number[];
}

export interface NtnfFlow {
  du: number;
  valor: number;
  vp: number;
}

export interface NtnfResult {
  pu: number;
  /** Cupom periódico em valor monetário. */
  cupomPeriodico: number;
  fluxos: NtnfFlow[];
}

export function puNtnf(input: NtnfInput): NtnfResult {
  const { face, iaa, couponRateAnnual, m, cuponsDu } = input;
  if (!cuponsDu.length) throw new Error('puNtnf: cuponsDu não pode ser vazio.');

  // Cupom periódico pela convenção NTN-F: (1+taxa)^(1/m) − 1
  const cupomTaxa = D(1).plus(couponRateAnnual).pow(D(1).div(m)).minus(1);
  const cupomValor = D(face).mul(cupomTaxa);

  const fluxos: NtnfFlow[] = [];
  let pu = D(0);
  const ult = cuponsDu.length - 1;

  cuponsDu.forEach((du, idx) => {
    const fluxo = idx === ult ? cupomValor.plus(face) : cupomValor;
    const vp = fluxo.div(D(1).plus(iaa).pow(D(du).div(252)));
    pu = pu.plus(vp);
    fluxos.push({ du, valor: fluxo.toNumber(), vp: vp.toNumber() });
  });

  return {
    pu: pu.toNumber(),
    cupomPeriodico: cupomValor.toNumber(),
    fluxos,
  };
}
