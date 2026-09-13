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
/** TDI = (1 + CDI)^(1/252) − 1 — taxa DI diária implícita na taxa anual base 252. */
export declare function taxaDiDiaria(cdiAa: Decimal.Value): Decimal;
/** % do CDI (B3) equivalente a uma taxa a.a. base 252: p = [(1 + taxa)^(1/252) − 1] / TDI. */
export declare function pctCdiB3(taxaAa: Decimal.Value, cdiAa: Decimal.Value): Decimal;
/** Taxa a.a. base 252 do acúmulo diário a p% do CDI (B3): (1 + p·TDI)^252 − 1. */
export declare function taxaDePctCdiB3(pct: Decimal.Value, cdiAa: Decimal.Value): Decimal;
/** Fuso de referência das datas civis da aplicação. */
export declare const FUSO_BR = "America/Sao_Paulo";
/** Data civil 'AAAA-MM-DD' de um instante no fuso dado (padrão America/Sao_Paulo). */
export declare function isoCivilNoFuso(instante: Date, timeZone?: string): string;
/**
 * Lê uma data textual como DATA CIVIL (Date à meia-noite local), igual em
 * qualquer fuso de servidor:
 *  - 'AAAA-MM-DD' ou 'DD/MM/AAAA'                → a própria data;
 *  - 'AAAA-MM-DDThh:mm[:ss[.fff]]' sem fuso        → a data escrita (hora de parede);
 *  - com 'Z' ou deslocamento (ex.: '-03:00')       → a data civil do instante em
 *    America/Sao_Paulo (ou no fuso informado); com `timeZone = null`, ignora o
 *    fuso e vale a data escrita (regra "prefixo AAAA-MM-DD").
 * Formato não reconhecido ou data inexistente → null.
 */
export declare function parseDataCivil(valor: string, timeZone?: string | null): Date | null;
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
 * Número de trocas de sinal do fluxo em ordem cronológica. Fluxos no mesmo dia
 * são somados antes (entram com o mesmo expoente no XNPV); totais nulos são
 * ignorados.
 *
 * Regra de sinais de Descartes: há no máximo tantas TIRs quanto trocas de sinal.
 * Com MAIS DE UMA troca a TIR pode não ser única — a raiz devolvida por `xirr`
 * depende do chute — e a TIR não serve como critério de decisão (use o VPL).
 */
export declare function trocasDeSinal(fluxos: FluxoDatado[]): number;
/**
 * Taxa interna de retorno de fluxos datados (equivalente a XIRR do Excel).
 * Newton-Raphson com fallback para bissecção. Retorna taxa efetiva anual (fração).
 *
 * Atenção: com mais de uma troca de sinal (ver `trocasDeSinal`) pode haver mais
 * de uma TIR; esta função devolve UMA delas (a que o chute alcança).
 */
export declare function xirr(fluxos: FluxoDatado[], guess?: number): number;
/** Parcela constante (PMT do Excel): pv·i / (1 − (1+i)^(−n)). */
export declare function pmt(i: number, n: number, pv: number): number;
/** Componente de juros da parcela `per` (1-indexado) de um financiamento Price. */
export declare function ipmt(i: number, per: number, n: number, pv: number): number;
/** Componente de amortização da parcela `per` (1-indexado) de um financiamento Price. */
export declare function ppmt(i: number, per: number, n: number, pv: number): number;
//# sourceMappingURL=primitives.d.ts.map