/**
 * §2.7 TIR / VPL para fluxos irregulares (datados). Função pura.
 * Reaproveita os solvers xirr/xnpv das primitivas.
 */

import { xirr, xnpv, FluxoDatado, equivalente } from '../primitives';

export interface TirVplInput {
  /** Fluxos datados (saídas negativas, entradas positivas). */
  fluxos: FluxoDatado[];
  /** Taxa de desconto a.a. (fração) para o VPL. Opcional (se ausente, só TIR). */
  taxaDesconto?: number;
  /** Custo de capital a.a. (fração) para o veredito. Opcional. */
  custoCapital?: number;
}

export interface TirVplResult {
  /** TIR anual (fração). */
  tirAnual: number;
  /** TIR mensal equivalente (fração). */
  tirMensal: number;
  /** VPL na taxa de desconto (presente quando taxaDesconto é informada). */
  vpl?: number;
  /** Veredito de aceitação (presente quando custoCapital é informado). */
  veredito?: 'Aceitar' | 'Rejeitar';
}

export function tirVpl(input: TirVplInput): TirVplResult {
  const { fluxos, taxaDesconto, custoCapital } = input;
  if (!fluxos || fluxos.length < 2) {
    throw new Error('tirVpl: ao menos dois fluxos datados são necessários.');
  }

  const tirAnual = xirr(fluxos);
  const result: TirVplResult = {
    tirAnual,
    tirMensal: equivalente(tirAnual, 1 / 12),
  };

  if (taxaDesconto !== undefined) {
    result.vpl = xnpv(taxaDesconto, fluxos);
  }
  if (custoCapital !== undefined) {
    result.veredito = tirAnual > custoCapital ? 'Aceitar' : 'Rejeitar';
  }

  return result;
}
