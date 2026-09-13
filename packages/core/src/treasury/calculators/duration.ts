/**
 * §2.9 Duration (Macaulay/Modificada), DV01 e Convexidade.
 * Regime EFETIVO ANUAL: desconto (1+y)^t, t = k/m anos. Função pura.
 *
 * Convenção do cupom periódico (`convencaoCupom`, declarada no resultado):
 *   'simples' (padrão) → cupom = face · taxa / m  (taxa nominal dividida por m);
 *   'ntnf'             → cupom = face · [(1 + taxa)^(1/m) − 1], a convenção NTN-F
 *                        de `puNtnf`. Como t = k/m = du/252 com du = 252·k/m, o
 *                        preço coincide com o PU NTN-F do mesmo título.
 * As duas dão preços diferentes para a mesma "taxa de cupom" (10% a.a. semestral:
 * cupom 50,00 × 48,81 por 1.000) — por isso a convenção vem sempre explícita.
 */

import Decimal from 'decimal.js';
import { D } from '../primitives';
import { taxaCupomPeriodicoNtnf } from './puTitulos';

/** 'simples' = face·taxa/m; 'ntnf' = face·[(1+taxa)^(1/m) − 1] (convenção NTN-F). */
export type ConvencaoCupom = 'simples' | 'ntnf';

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
  /** Convenção do cupom periódico. Padrão: 'simples'. */
  convencaoCupom?: ConvencaoCupom;
}

export interface DurationResult {
  preco: number;
  macaulayDuration: number;
  modifiedDuration: number;
  dv01: number;
  convexidade: number;
  /** Cupom periódico em valor monetário. */
  cupomPeriodico: number;
  /** Convenção de cupom aplicada, em texto (exibida no resultado). */
  convencao: string;
}

const ROTULO_CONVENCAO: Record<ConvencaoCupom, string> = {
  simples: 'Simples: cupom = face × taxa ÷ m (difere do PU NTN-F)',
  ntnf: 'NTN-F: cupom = face × [(1 + taxa)^(1/m) − 1], t = k/m = du/252 (mesmo PU do calculador NTN-F)',
};

/**
 * Limites de domínio. O laço abaixo faz uma potência Decimal de expoente
 * fracionário por período e roda de forma síncrona: sem teto, n = 100.000
 * leva ~12 s e n = 1.000.000 trava o event loop da API. 1.200 períodos cobrem
 * 100 anos de cupons mensais (~0,1 s). A rota /api/tesouraria/calc/duration
 * aplica os mesmos limites no schema zod.
 */
const MAX_PERIODOS = 1200;
/** Pagamentos por ano: de anual (1) a diário corrido (365). */
const MIN_PAGAMENTOS_ANO = 1;
const MAX_PAGAMENTOS_ANO = 365;

export function duration(input: DurationInput): DurationResult {
  const { face, couponRateAnnual, ytm, m, n } = input;
  const convencao: ConvencaoCupom = input.convencaoCupom ?? 'simples';
  if (convencao !== 'simples' && convencao !== 'ntnf') {
    throw new Error(`duration: convencaoCupom deve ser 'simples' ou 'ntnf'; recebido ${String(convencao)}.`);
  }
  // Number.isInteger também barra NaN/Infinity (que antes passavam por `<= 0`).
  if (!Number.isInteger(n) || n < 1 || n > MAX_PERIODOS) {
    throw new Error(
      `duration: n (número de períodos) deve ser um inteiro entre 1 e ${MAX_PERIODOS}; recebido ${n}.`
    );
  }
  if (!Number.isInteger(m) || m < MIN_PAGAMENTOS_ANO || m > MAX_PAGAMENTOS_ANO) {
    throw new Error(
      `duration: m (pagamentos por ano) deve ser um inteiro entre ${MIN_PAGAMENTOS_ANO} e ${MAX_PAGAMENTOS_ANO}; recebido ${m}.`
    );
  }

  const cupom =
    convencao === 'ntnf'
      ? D(face).mul(taxaCupomPeriodicoNtnf(couponRateAnnual, m))
      : D(face).mul(couponRateAnnual).div(m);
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
    cupomPeriodico: cupom.toNumber(),
    convencao: ROTULO_CONVENCAO[convencao],
  };
}
