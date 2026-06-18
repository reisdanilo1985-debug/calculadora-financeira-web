/**
 * §2.12 Forward / NDF USD-BRL (paridade coberta). Função pura.
 * Cada perna na sua base: BR 252 / USD 360. O forward elimina arbitragem de
 * juros — NÃO é previsão de câmbio.
 */

import { D } from '../primitives';

export interface ForwardInput {
  /** Câmbio à vista (R$/US$). */
  spot: number;
  /** DI pré (BR) interpolado a.a. base 252 (fração). */
  iBrAa: number;
  /** Dias úteis até o vencimento. */
  du: number;
  /** Cupom cambial USD interpolado a.a. base 360 (fração). */
  cupomUsdAa: number;
  /** Dias corridos até o vencimento. */
  dc: number;
}

export interface ForwardResult {
  fatorBr: number;
  fatorUsd: number;
  forward: number;
  /** Pontos a termo (forward − spot). */
  pontos: number;
}

export function forwardUsdBrl(input: ForwardInput): ForwardResult {
  const { spot, iBrAa, du, cupomUsdAa, dc } = input;
  const fatorBr = D(1).plus(iBrAa).pow(D(du).div(252));
  const fatorUsd = D(1).plus(cupomUsdAa).pow(D(dc).div(360));
  const forward = D(spot).mul(fatorBr).div(fatorUsd);
  return {
    fatorBr: fatorBr.toNumber(),
    fatorUsd: fatorUsd.toNumber(),
    forward: forward.toNumber(),
    pontos: forward.minus(spot).toNumber(),
  };
}

export interface NdfInput {
  /** PTAX no vencimento. */
  ptaxVencimento: number;
  /** Strike contratado. */
  kContratado: number;
  /** Notional em USD. */
  notionalUsd: number;
}

/** Liquidação NDF comprado em USD: (PTAX − K) · notional. */
export function ndfAjuste(input: NdfInput): { ajusteBrl: number } {
  const { ptaxVencimento, kContratado, notionalUsd } = input;
  return {
    ajusteBrl: D(ptaxVencimento).minus(kContratado).mul(notionalUsd).toNumber(),
  };
}
