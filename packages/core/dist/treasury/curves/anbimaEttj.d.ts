/**
 * Parser da ETTJ ANBIMA (Estrutura a Termo das Taxas de Juros) — curva
 * institucional de fechamento, derivada de DI1 + títulos públicos.
 *
 * Entrada: texto do CSV devolvido por POST em
 *   https://www.anbima.com.br/informacoes/est-termo/CZ-down.asp
 *   (Idioma=PT&Dt_Ref=DD/MM/YYYY&saida=csv)
 * Estrutura relevante do arquivo (latin-1, `;`-separado, decimal vírgula):
 *   1ª linha: "DD/MM/YYYY;Beta 1;..."           → data de referência
 *   Tabela "Vertices;ETTJ IPCA;ETTJ PREF;..."   → coluna IPCA = curva REAL
 *   Tabela "PREFIXADOS (CIRCULAR 3.361)"        → curva PRÉ granular (21 du+)
 *
 * Convenção de saída (idêntica à do Tesouro): vértices em DIAS ÚTEIS,
 * taxas em FRAÇÃO decimal. Função PURA (sem I/O); a rede vive na API.
 * Cabeçalhos detectados por regex ASCII-safe (acentos podem vir corrompidos).
 */
import { CurvasTesouro } from './tesouroCurve';
/**
 * Parseia o CSV da ETTJ ANBIMA em curvas pré e real.
 * Lança se a data de referência ou a curva pré não puderem ser extraídas.
 */
export declare function parseEttjAnbima(csv: string): CurvasTesouro;
//# sourceMappingURL=anbimaEttj.d.ts.map