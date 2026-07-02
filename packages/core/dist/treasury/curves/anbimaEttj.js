"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEttjAnbima = parseEttjAnbima;
/** Número pt-BR ("1.008" → 1008; "13,8072" → 13.8072). NaN se inválido. */
function numBr(s) {
    const t = s.trim().replace(/\./g, '').replace(',', '.');
    return t === '' ? NaN : Number(t);
}
/** "DD/MM/YYYY" → Date (meio-dia local). null se inválida. */
function dataBr(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
    if (!m)
        return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
}
/**
 * Parseia o CSV da ETTJ ANBIMA em curvas pré e real.
 * Lança se a data de referência ou a curva pré não puderem ser extraídas.
 */
function parseEttjAnbima(csv) {
    const linhas = csv.split(/\r?\n/).map(l => l.trim());
    // ── Data de referência: primeiro campo da primeira linha não vazia. ──
    const primeira = linhas.find(l => l.length > 0) ?? '';
    const dataBase = dataBr(primeira.split(';')[0] ?? '');
    if (!dataBase) {
        throw new Error('parseEttjAnbima: data de referência não encontrada no CSV.');
    }
    // ── Curva PRÉ: tabela "PREFIXADOS (CIRCULAR 3.361)" → linhas "du;taxa". ──
    const diPre = [];
    const idxPre = linhas.findIndex(l => /PREFIXADOS.*3\.?361/i.test(l));
    if (idxPre >= 0) {
        for (let i = idxPre + 1; i < linhas.length; i++) {
            const l = linhas[i];
            if (!l) {
                if (diPre.length)
                    break; // fim da tabela
                continue;
            }
            if (/^vertices/i.test(l))
                continue; // cabeçalho "Vertices;Taxa (%a.a.)"
            const c = l.split(';');
            const prazo = numBr(c[0] ?? '');
            const taxa = numBr(c[1] ?? '');
            if (!isFinite(prazo) || !isFinite(taxa)) {
                if (diPre.length)
                    break; // saiu da região numérica
                continue;
            }
            diPre.push({ prazo, taxa: taxa / 100 });
        }
    }
    // ── Curva REAL: tabela "Vertices;ETTJ IPCA;ETTJ PREF;..." → coluna IPCA. ──
    const real = [];
    const idxIpca = linhas.findIndex(l => /^vertices;ettj ipca/i.test(l));
    if (idxIpca >= 0) {
        for (let i = idxIpca + 1; i < linhas.length; i++) {
            const l = linhas[i];
            if (!l)
                break; // tabela termina na linha em branco
            const c = l.split(';');
            const prazo = numBr(c[0] ?? '');
            const taxa = numBr(c[1] ?? '');
            if (!isFinite(prazo) || !isFinite(taxa))
                break;
            real.push({ prazo, taxa: taxa / 100 });
        }
    }
    if (!diPre.length) {
        throw new Error('parseEttjAnbima: curva pré (Circular 3.361) não encontrada.');
    }
    diPre.sort((a, b) => a.prazo - b.prazo);
    real.sort((a, b) => a.prazo - b.prazo);
    return { diPre, real, dataBase };
}
//# sourceMappingURL=anbimaEttj.js.map