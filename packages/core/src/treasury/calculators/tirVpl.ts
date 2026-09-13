/**
 * §2.7 TIR / VPL para fluxos irregulares (datados). Função pura.
 * Reaproveita os solvers xirr/xnpv das primitivas.
 *
 * TIR múltipla: com mais de uma troca de sinal no fluxo (regra de Descartes)
 * pode haver mais de uma TIR, e a raiz devolvida depende do chute do solver.
 * Nesse caso o resultado traz `alertaTirMultipla` e o veredito passa a ser
 * decidido pelo VPL ao custo de capital (VPL > 0 → Aceitar), nunca pela TIR.
 */

import { xirr, xnpv, FluxoDatado, equivalente, trocasDeSinal } from '../primitives';

export interface TirVplInput {
  /** Fluxos datados (saídas negativas, entradas positivas). */
  fluxos: FluxoDatado[];
  /** Taxa de desconto a.a. (fração) para o VPL. Opcional (se ausente, só TIR). */
  taxaDesconto?: number;
  /** Custo de capital a.a. (fração) para o veredito. Opcional. */
  custoCapital?: number;
}

export interface TirVplResult {
  /** TIR anual (fração). Com `alertaTirMultipla`, é apenas UMA das TIRs possíveis. */
  tirAnual: number;
  /** TIR mensal equivalente (fração). */
  tirMensal: number;
  /** VPL na taxa de desconto (presente quando taxaDesconto é informada). */
  vpl?: number;
  /** Trocas de sinal do fluxo em ordem cronológica (> 1 ⇒ TIR pode não ser única). */
  trocasDeSinal: number;
  /** Presente quando há mais de uma troca de sinal (TIR possivelmente múltipla). */
  alertaTirMultipla?: string;
  /** VPL ao custo de capital (presente com TIR múltipla e custo informado). */
  vplCustoCapital?: number;
  /** Veredito de aceitação (presente quando custoCapital é informado). */
  veredito?: 'Aceitar' | 'Rejeitar';
  /** Régua do veredito: 'TIR' (fluxo convencional) ou 'VPL' (TIR múltipla). */
  criterioVeredito?: 'TIR' | 'VPL';
}

export function tirVpl(input: TirVplInput): TirVplResult {
  const { fluxos, taxaDesconto, custoCapital } = input;
  if (!fluxos || fluxos.length < 2) {
    throw new Error('tirVpl: ao menos dois fluxos datados são necessários.');
  }

  const tirAnual = xirr(fluxos);
  const trocas = trocasDeSinal(fluxos);
  const tirMultipla = trocas > 1;

  const result: TirVplResult = {
    tirAnual,
    tirMensal: equivalente(tirAnual, 1 / 12),
    trocasDeSinal: trocas,
  };

  if (taxaDesconto !== undefined) {
    result.vpl = xnpv(taxaDesconto, fluxos);
  }

  if (tirMultipla) {
    result.alertaTirMultipla =
      `TIR múltipla: o fluxo troca de sinal ${trocas} vezes, então pode haver até ${trocas} TIRs ` +
      'e a TIR exibida é só uma delas (depende do chute do solver). Decida pelo VPL ao custo de capital.';
  }

  if (custoCapital !== undefined) {
    if (tirMultipla) {
      const vplCusto = xnpv(custoCapital, fluxos);
      result.vplCustoCapital = vplCusto;
      result.veredito = vplCusto > 0 ? 'Aceitar' : 'Rejeitar';
      result.criterioVeredito = 'VPL';
    } else {
      result.veredito = tirAnual > custoCapital ? 'Aceitar' : 'Rejeitar';
      result.criterioVeredito = 'TIR';
    }
  }

  return result;
}
