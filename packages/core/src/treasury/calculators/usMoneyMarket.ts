/**
 * §2.13 EUA — Money Market, SOFR e day counts. Função pura.
 * Taxas em fração decimal.
 */

import { D, days360, diasCorridos } from '../primitives';

// ───────────────────────────── T-bill (preço ↔ yields) ───────────────────────

export interface TbillInput {
  face: number;
  preco: number;
  /** Dias até o vencimento. */
  dias: number;
}

export interface TbillResult {
  /** Discount yield (base 360). */
  discountYield: number;
  /** Money-market yield (base 360). */
  mmy: number;
  /** Bond-equivalent yield (base 365). */
  bey: number;
  /** Effective annual yield. */
  eay: number;
}

export function tbillYields(input: TbillInput): TbillResult {
  const { face, preco, dias } = input;
  if (dias <= 0 || preco <= 0) throw new Error('tbillYields: dias e preco devem ser > 0.');
  const desconto = D(face).minus(preco);
  return {
    discountYield: desconto.div(face).mul(D(360).div(dias)).toNumber(),
    mmy: desconto.div(preco).mul(D(360).div(dias)).toNumber(),
    bey: desconto.div(preco).mul(D(365).div(dias)).toNumber(),
    eay: D(face).div(preco).pow(D(365).div(dias)).minus(1).toNumber(),
  };
}

// ─────────────────────────── SOFR + spread → efetiva ─────────────────────────

export interface SofrSpreadInput {
  sofrAa: number;
  spreadAa: number;
  /** Dias do período. */
  dias: number;
}

export interface SofrSpreadResult {
  allInAa: number;
  juroPeriodo: number;
  eay: number;
}

export function sofrSpreadEay(input: SofrSpreadInput): SofrSpreadResult {
  const { sofrAa, spreadAa, dias } = input;
  if (dias <= 0) throw new Error('sofrSpreadEay: dias deve ser > 0.');
  const allInAa = D(sofrAa).plus(spreadAa);
  const juroPeriodo = allInAa.mul(D(dias).div(360));
  const eay = D(1).plus(juroPeriodo).pow(D(360).div(dias)).minus(1);
  return {
    allInAa: allInAa.toNumber(),
    juroPeriodo: juroPeriodo.toNumber(),
    eay: eay.toNumber(),
  };
}

// ─────────────────────── Juros por convenção de dias ─────────────────────────

export interface JurosConvencoesInput {
  notional: number;
  /** Taxa a.a. (fração). */
  taxa: number;
  d0: Date;
  d1: Date;
}

export interface JurosConvencoesResult {
  dias30360: number;
  diasAct: number;
  juros30360: number;
  jurosAct360: number;
  jurosAct365: number;
}

export function jurosConvencoes(input: JurosConvencoesInput): JurosConvencoesResult {
  const { notional, taxa, d0, d1 } = input;
  const d30 = days360(d0, d1);
  const dAct = diasCorridos(d0, d1);
  return {
    dias30360: d30,
    diasAct: dAct,
    juros30360: D(notional).mul(taxa).mul(D(d30).div(360)).toNumber(),
    jurosAct360: D(notional).mul(taxa).mul(D(dAct).div(360)).toNumber(),
    jurosAct365: D(notional).mul(taxa).mul(D(dAct).div(365)).toNumber(),
  };
}
