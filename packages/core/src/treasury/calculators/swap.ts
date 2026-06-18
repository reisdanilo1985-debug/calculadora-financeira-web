/**
 * §2.11 Swap CDI × Pré — Marcação a Mercado (MtM).
 * Posição de referência: recebe pré / paga CDI. Modelo SIMPLIFICADO
 * (perna flutuante reseta ao mercado ⇒ vale o CDI acumulado). Função pura.
 */

import { D } from '../primitives';

export interface SwapMtMInput {
  notional: number;
  /** Taxa pré contratada a.a. base 252 (fração). */
  preContratada: number;
  /** Taxa pré de mercado a.a. base 252 no prazo remanescente (fração). */
  preMercadoAa: number;
  /** Dias úteis totais do contrato. */
  duTotal: number;
  /** Dias úteis decorridos. */
  duDecorridos: number;
  /** Fator do CDI acumulado desde o início (ex.: 1.0480). */
  fatorCdiAcumulado: number;
}

export interface SwapMtMResult {
  duRem: number;
  resgatePre: number;
  pvPre: number;
  pvCdi: number;
  /** MtM (>0 favorece quem recebe pré). */
  mtm: number;
}

export function swapCdiPreMtM(input: SwapMtMInput): SwapMtMResult {
  const { notional, preContratada, preMercadoAa, duTotal, duDecorridos, fatorCdiAcumulado } = input;
  const duRem = duTotal - duDecorridos;
  if (duRem < 0) throw new Error('swapCdiPreMtM: duDecorridos não pode exceder duTotal.');

  const resgatePre = D(notional).mul(D(1).plus(preContratada).pow(D(duTotal).div(252)));
  const pvPre = resgatePre.div(D(1).plus(preMercadoAa).pow(D(duRem).div(252)));
  const pvCdi = D(notional).mul(fatorCdiAcumulado);
  const mtm = pvPre.minus(pvCdi);

  return {
    duRem,
    resgatePre: resgatePre.toNumber(),
    pvPre: pvPre.toNumber(),
    pvCdi: pvCdi.toNumber(),
    mtm: mtm.toNumber(),
  };
}
