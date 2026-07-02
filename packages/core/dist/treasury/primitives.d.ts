/**
 * Primitivas compartilhadas do motor de Tesouraria.
 *
 * Convenções (idênticas à planilha Tesouraria_Calculos.xlsx):
 *   - Taxas SEMPRE em fração decimal nesta camada (ex.: 0.144 para 14,40% a.a.).
 *     A conversão percentual → fração é responsabilidade da API/UI.
 *   - Base 252 (dias úteis BR): fator = (1 + i)^(du/252)
 *   - Base 360 linear (money market): fator = 1 + i·(dc/360)
 *   - Base 360 composto: fator = (1 + i)^(dc/360)
 *   - Sinais de fluxo de caixa: saídas negativas, entradas positivas.
 *
 * Toda aritmética usa decimal.js (regra crítica do projeto). As funções são
 * puras (sem I/O, sem rede) e retornam `number` apenas na fronteira.
 */
import Decimal from 'decimal.js';
/** Atalho para construir um Decimal. */
export declare const D: (x: Decimal.Value) => Decimal;
/** Dias úteis entre datas (calendário ANBIMA/feriados BR), padrão de mesa. */
export declare function diasUteis(d0: Date, d1: Date): number;
/** Dias corridos entre datas (d1 - d0). */
export declare function diasCorridos(d0: Date, d1: Date): number;
/**
 * Convenção 30/360 (método US/NASD), equivalente ao DAYS360 do Excel (método FALSE).
 * Regras: se D1 == 31 → 30; se D2 == 31 e D1 (ajustado) == 30 → 30.
 */
export declare function days360(d0: Date, d1: Date): number;
/** fator = (1 + i)^(du/252). */
export declare function fator252(iaa: number, du: number): number;
/** fator linear = 1 + i·(dc/360). */
export declare function fator360Linear(iaa: number, dc: number): number;
/** fator composto = (1 + i)^(dc/360). */
export declare function fator360Comp(iaa: number, dc: number): number;
/** Taxa equivalente para uma fração de ano. Ex.: mensal → fracaoAno = 1/12. */
export declare function equivalente(iaa: number, fracaoAno: number): number;
/** Taxa nominal (linear, m capitalizações) → efetiva anual. */
export declare function nominalParaEfetiva(nominal: number, m: number): number;
/** Taxa efetiva anual → nominal (linear, m capitalizações). */
export declare function efetivaParaNominal(iaa: number, m: number): number;
export type MetodoInterpolacao = 'linear' | 'loglinear_df';
/**
 * Interpola a taxa de uma curva num prazo arbitrário.
 *
 * @param prazo     prazo desejado (mesma unidade dos vértices: meses, du, anos…).
 * @param vertices  prazos dos vértices conhecidos.
 * @param taxas     taxas (fração decimal) correspondentes aos vértices.
 * @param metodo    'linear' (na taxa — o que a planilha faz via FORECAST) ou
 *                  'loglinear_df' (log-linear no fator de desconto, no-arbitrage).
 *
 * Extrapolação: FLAT nas pontas (mais seguro que extrapolar linearmente).
 */
export declare function interpolaTaxa(prazo: number, vertices: number[], taxas: number[], metodo?: MetodoInterpolacao): number;
export interface FluxoDatado {
    date: Date;
    amount: number;
}
/** Σ CF_k / (1+taxa)^((data_k - data_0)/365). Datas relativas ao primeiro fluxo. */
export declare function xnpv(taxa: number, fluxos: FluxoDatado[]): number;
/**
 * Taxa interna de retorno de fluxos datados (equivalente a XIRR do Excel).
 * Newton-Raphson com fallback para bissecção. Retorna taxa efetiva anual (fração).
 */
export declare function xirr(fluxos: FluxoDatado[], guess?: number): number;
/** Parcela constante (PMT do Excel): pv·i / (1 − (1+i)^(−n)). */
export declare function pmt(i: number, n: number, pv: number): number;
/** Componente de juros da parcela `per` (1-indexado) de um financiamento Price. */
export declare function ipmt(i: number, per: number, n: number, pv: number): number;
/** Componente de amortização da parcela `per` (1-indexado) de um financiamento Price. */
export declare function ppmt(i: number, per: number, n: number, pv: number): number;
//# sourceMappingURL=primitives.d.ts.map