"use strict";
/**
 * Construção das curvas pré (nominal) e real a partir dos dados abertos do
 * Tesouro Direto (Tesouro Transparente).
 *
 * Instrumentos usados (zero-cupom → a taxa É a taxa zero no vértice):
 *   - Curva PRÉ  ← "Tesouro Prefixado"  (LTN)
 *   - Curva REAL ← "Tesouro IPCA+"      (NTN-B Principal)
 * Os papéis "com Juros Semestrais" (NTN-F / NTN-B) são ignorados aqui para não
 * introduzir viés de cupom na taxa zero. IGP-M e Selic também são ignorados.
 *
 * Convenção de unidade (trava de precisão nº 3): o `prazo` dos vértices é em
 * DIAS ÚTEIS (base 252 BR), computado de `Data Base` → `Data Vencimento`.
 * Função PURA: recebe linhas já parseadas (sem I/O, sem rede). O parsing de CSV
 * e a rede vivem na camada de API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.construirCurvasTesouro = construirCurvasTesouro;
const primitives_1 = require("../primitives");
/** Normaliza rótulo: minúsculas, sem acento, espaços colapsados. */
function norm(s) {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // remove marcas diacríticas combinantes
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
/** LTN — pré zero-cupom (exclui "com juros semestrais"). */
function isPreZero(tipo) {
    return norm(tipo) === 'tesouro prefixado';
}
/** NTN-B Principal — real zero-cupom (exclui "com juros semestrais"). */
function isRealZero(tipo) {
    return norm(tipo) === 'tesouro ipca+';
}
/** ms de um dia — para comparar datas por valor. */
function sameDay(a, b) {
    return (a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate());
}
/**
 * Monta as curvas a partir das linhas do Tesouro. Filtra para o pregão
 * (`Data Base`) mais recente, computa o prazo em du e devolve vértices ordenados.
 *
 * @param rows     linhas já parseadas (qualquer histórico; a função filtra o topo).
 * @param dataRef  opcional — força a data base de referência (default: a mais recente).
 */
function construirCurvasTesouro(rows, dataRef) {
    if (!rows.length)
        throw new Error('construirCurvasTesouro: nenhuma linha fornecida.');
    // Data base = a fornecida ou a mais recente presente nos dados.
    const dataBase = dataRef ??
        rows.reduce((max, r) => (r.dataBase.getTime() > max.getTime() ? r.dataBase : max), rows[0].dataBase);
    const doDia = rows.filter(r => sameDay(r.dataBase, dataBase));
    const montar = (pred) => {
        const porPrazo = new Map(); // du → taxa (fração); dedup por prazo
        for (const r of doDia) {
            if (!pred(r.tipoTitulo))
                continue;
            const du = (0, primitives_1.diasUteis)(dataBase, r.dataVencimento);
            if (du <= 0)
                continue; // já vencido / mesmo dia
            if (!isFinite(r.taxaVendaManha))
                continue;
            porPrazo.set(du, r.taxaVendaManha / 100);
        }
        return [...porPrazo.entries()]
            .map(([prazo, taxa]) => ({ prazo, taxa }))
            .sort((a, b) => a.prazo - b.prazo);
    };
    return {
        diPre: montar(isPreZero),
        real: montar(isRealZero),
        dataBase,
    };
}
//# sourceMappingURL=tesouroCurve.js.map