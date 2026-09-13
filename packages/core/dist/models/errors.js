"use strict";
/**
 * Erros de domínio do motor de cálculo.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingIndexDataError = void 0;
exports.agruparIntervalos = agruparIntervalos;
/**
 * Lançado quando o período pedido tem dias (ou meses) sem dado oficial e sem
 * premissa. Antes, esses dias entravam silenciosamente com taxa 0%.
 */
class MissingIndexDataError extends Error {
    constructor(indexLabel, intervalos, mensal = false) {
        const fmt = (d) => mensal
            ? `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
            : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        const lista = intervalos
            .map(i => (i.inicio.getTime() === i.fim.getTime() ? fmt(i.inicio) : `${fmt(i.inicio)} a ${fmt(i.fim)}`))
            .join('; ');
        super(`Sem dado oficial nem premissa para ${indexLabel} em: ${lista}. Informe premissas para esses ${mensal ? 'meses' : 'dias'} ou ajuste o período.`);
        this.name = 'MissingIndexDataError';
        this.intervalos = intervalos;
    }
}
exports.MissingIndexDataError = MissingIndexDataError;
/**
 * Agrupa datas ordenadas em intervalos, juntando datas separadas por até
 * `folgaDias` dias corridos (para que fins de semana não quebrem o intervalo).
 */
function agruparIntervalos(datas, folgaDias) {
    const intervalos = [];
    for (const d of datas) {
        const ultimo = intervalos[intervalos.length - 1];
        if (ultimo && Math.round((d.getTime() - ultimo.fim.getTime()) / 86400000) <= folgaDias) {
            ultimo.fim = new Date(d);
        }
        else {
            intervalos.push({ inicio: new Date(d), fim: new Date(d) });
        }
    }
    return intervalos;
}
//# sourceMappingURL=errors.js.map