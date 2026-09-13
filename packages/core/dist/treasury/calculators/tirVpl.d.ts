/**
 * §2.7 TIR / VPL para fluxos irregulares (datados). Função pura.
 * Reaproveita os solvers xirr/xnpv das primitivas.
 *
 * TIR múltipla: com mais de uma troca de sinal no fluxo (regra de Descartes)
 * pode haver mais de uma TIR, e a raiz devolvida depende do chute do solver.
 * Nesse caso o resultado traz `alertaTirMultipla` e o veredito passa a ser
 * decidido pelo VPL ao custo de capital (VPL > 0 → Aceitar), nunca pela TIR.
 */
import { FluxoDatado } from '../primitives';
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
export declare function tirVpl(input: TirVplInput): TirVplResult;
//# sourceMappingURL=tirVpl.d.ts.map