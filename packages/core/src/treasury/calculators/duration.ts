/**
 * §2.9 Duration (Macaulay/Modificada), DV01 e Convexidade.
 * Regime EFETIVO ANUAL: desconto (1+y)^t, t em anos. Função pura.
 *
 * Cupom periódico = face · couponRateAnnual / m (convenção simples por período).
 */

import Decimal from 'decimal.js';
import { D } from '../primitives';

export interface DurationInput {
  /** Valor de face. */
  face: number;
  /** Taxa de cupom anual (fração, ex.: 0.10). */
  couponRateAnnual: number;
  /** Yield to maturity efetivo anual (fração, ex.: 0.13). */
  ytm: number;
  /** Pagamentos por ano. */
  m: number;
  /** Número de períodos (cupons) até o vencimento. */
  n: number;
}

export interface DurationResult {
  preco: number;
  macaulayDuration: number;
  modifiedDuration: number;
  dv01: number;
  convexidade: number;
}

export function duration(input: DurationInput): DurationResult {
  const { face, couponRateAnnual, ytm, m, n } = input;
  if (m <= 0 || n <= 0) throw new Error('duration: m e n devem ser > 0.');

  const cupom = D(face).mul(couponRateAnnual).div(m);
  const y = D(ytm);

  let preco = D(0);
  let somaTVp = D(0);
  let somaConvex = D(0);

  for (let k = 1; k <= n; k++) {
    const fluxo = k === n ? cupom.plus(face) : cupom;
    const t = D(k).div(m); // anos
    const vp = fluxo.div(y.plus(1).pow(t));
    preco = preco.plus(vp);
    somaTVp = somaTVp.plus(t.mul(vp));
    // t·(t+1)·VP
    somaConvex = somaConvex.plus(t.mul(t.plus(1)).mul(vp));
  }

  const macaulay = somaTVp.div(preco);
  const modDur = macaulay.div(y.plus(1));
  const dv01 = modDur.mul(preco).mul(0.0001);
  const convex = somaConvex.div(preco.mul(y.plus(1).pow(2)));

  return {
    preco: preco.toNumber(),
    macaulayDuration: macaulay.toNumber(),
    modifiedDuration: modDur.toNumber(),
    dv01: dv01.toNumber(),
    convexidade: convex.toNumber(),
  };
}
