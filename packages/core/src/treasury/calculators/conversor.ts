/**
 * §2.1 Conversor de taxas — equivalência de taxa efetiva e ponte 252↔360.
 * Função pura. Taxas em fração decimal.
 */

import { equivalente, fator252, nominalParaEfetiva, efetivaParaNominal } from '../primitives';

export interface ConversorInput {
  /** Taxa efetiva anual base 252 (fração, ex.: 0.144). */
  iaa: number;
  /** Dias úteis da janela (para a ponte 252↔360). Opcional. */
  du?: number;
  /** Dias corridos da janela (para a ponte 252↔360). Opcional. */
  dc?: number;
  /** Número de capitalizações para nominal↔efetiva. Opcional. */
  m?: number;
}

export interface ConversorResult {
  aoDiaUtil: number;
  aoMes: number;
  aoTrimestre: number;
  aoSemestre: number;
  aoAno: number;
  aoDiaCorrido: number;
  /** Ponte 252↔360 (presente quando du e dc são informados). */
  ponte?: {
    fator: number;
    i360Comp: number;
    i360Linear: number;
  };
  /** Nominal↔efetiva (presente quando m é informado). */
  nominal?: {
    efetivaDeNominal: number;
    nominalDeEfetiva: number;
  };
}

export function conversor(input: ConversorInput): ConversorResult {
  const { iaa, du, dc, m } = input;

  const result: ConversorResult = {
    aoDiaUtil: equivalente(iaa, 1 / 252),
    aoMes: equivalente(iaa, 1 / 12),
    aoTrimestre: equivalente(iaa, 1 / 4),
    aoSemestre: equivalente(iaa, 1 / 2),
    aoAno: iaa,
    aoDiaCorrido: equivalente(iaa, 1 / 365),
  };

  if (du !== undefined && dc !== undefined) {
    if (du <= 0 || dc <= 0) throw new Error('conversor: du e dc devem ser > 0.');
    const fator = fator252(iaa, du);
    result.ponte = {
      fator,
      i360Comp: Math.pow(fator, 360 / dc) - 1,
      i360Linear: (fator - 1) * (360 / dc),
    };
  }

  if (m !== undefined && m > 0) {
    result.nominal = {
      efetivaDeNominal: nominalParaEfetiva(iaa, m),
      nominalDeEfetiva: efetivaParaNominal(iaa, m),
    };
  }

  return result;
}
