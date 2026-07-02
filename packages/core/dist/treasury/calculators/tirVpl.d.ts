/**
 * §2.7 TIR / VPL para fluxos irregulares (datados). Função pura.
 * Reaproveita os solvers xirr/xnpv das primitivas.
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
    /** TIR anual (fração). */
    tirAnual: number;
    /** TIR mensal equivalente (fração). */
    tirMensal: number;
    /** VPL na taxa de desconto (presente quando taxaDesconto é informada). */
    vpl?: number;
    /** Veredito de aceitação (presente quando custoCapital é informado). */
    veredito?: 'Aceitar' | 'Rejeitar';
}
export declare function tirVpl(input: TirVplInput): TirVplResult;
//# sourceMappingURL=tirVpl.d.ts.map