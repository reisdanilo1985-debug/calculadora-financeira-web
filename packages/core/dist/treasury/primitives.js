"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.D = void 0;
exports.diasUteis = diasUteis;
exports.diasCorridos = diasCorridos;
exports.days360 = days360;
exports.fator252 = fator252;
exports.fator360Linear = fator360Linear;
exports.fator360Comp = fator360Comp;
exports.equivalente = equivalente;
exports.nominalParaEfetiva = nominalParaEfetiva;
exports.efetivaParaNominal = efetivaParaNominal;
exports.interpolaTaxa = interpolaTaxa;
exports.xnpv = xnpv;
exports.xirr = xirr;
exports.pmt = pmt;
exports.ipmt = ipmt;
exports.ppmt = ppmt;
const decimal_js_1 = __importDefault(require("decimal.js"));
const businessDays_1 = require("../utils/businessDays");
decimal_js_1.default.set({ precision: 28, rounding: decimal_js_1.default.ROUND_HALF_UP });
/** Atalho para construir um Decimal. */
const D = (x) => new decimal_js_1.default(x);
exports.D = D;
// ───────────────────────────── Contagem de dias ─────────────────────────────
/** Dias úteis entre datas (calendário ANBIMA/feriados BR), padrão de mesa. */
function diasUteis(d0, d1) {
    return (0, businessDays_1.countBusinessDays)(d0, d1);
}
/** Dias corridos entre datas (d1 - d0). */
function diasCorridos(d0, d1) {
    return (0, businessDays_1.countCalendarDays)(d0, d1);
}
/**
 * Convenção 30/360 (método US/NASD), equivalente ao DAYS360 do Excel (método FALSE).
 * Regras: se D1 == 31 → 30; se D2 == 31 e D1 (ajustado) == 30 → 30.
 */
function days360(d0, d1) {
    let day1 = d0.getDate();
    let day2 = d1.getDate();
    const m1 = d0.getMonth() + 1;
    const m2 = d1.getMonth() + 1;
    const y1 = d0.getFullYear();
    const y2 = d1.getFullYear();
    if (day1 === 31)
        day1 = 30;
    if (day2 === 31 && day1 === 30)
        day2 = 30;
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (day2 - day1);
}
// ──────────────────── Capitalização e equivalência de taxa ───────────────────
/** fator = (1 + i)^(du/252). */
function fator252(iaa, du) {
    return (0, exports.D)(1).plus(iaa).pow((0, exports.D)(du).div(252)).toNumber();
}
/** fator linear = 1 + i·(dc/360). */
function fator360Linear(iaa, dc) {
    return (0, exports.D)(1).plus((0, exports.D)(iaa).mul((0, exports.D)(dc).div(360))).toNumber();
}
/** fator composto = (1 + i)^(dc/360). */
function fator360Comp(iaa, dc) {
    return (0, exports.D)(1).plus(iaa).pow((0, exports.D)(dc).div(360)).toNumber();
}
/** Taxa equivalente para uma fração de ano. Ex.: mensal → fracaoAno = 1/12. */
function equivalente(iaa, fracaoAno) {
    return (0, exports.D)(1).plus(iaa).pow(fracaoAno).minus(1).toNumber();
}
/** Taxa nominal (linear, m capitalizações) → efetiva anual. */
function nominalParaEfetiva(nominal, m) {
    return (0, exports.D)(1).plus((0, exports.D)(nominal).div(m)).pow(m).minus(1).toNumber();
}
/** Taxa efetiva anual → nominal (linear, m capitalizações). */
function efetivaParaNominal(iaa, m) {
    return (0, exports.D)(1).plus(iaa).pow((0, exports.D)(1).div(m)).minus(1).mul(m).toNumber();
}
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
function interpolaTaxa(prazo, vertices, taxas, metodo = 'linear') {
    if (vertices.length === 0 || vertices.length !== taxas.length) {
        throw new Error('interpolaTaxa: vetores de vértices e taxas devem ter o mesmo tamanho (>0).');
    }
    const pairs = vertices
        .map((x, i) => ({ x, y: taxas[i] }))
        .sort((a, b) => a.x - b.x);
    // Extrapolação flat
    if (prazo <= pairs[0].x)
        return pairs[0].y;
    if (prazo >= pairs[pairs.length - 1].x)
        return pairs[pairs.length - 1].y;
    // Localiza o segmento [xi, xj]
    let i = 0;
    while (i < pairs.length - 1 && !(prazo >= pairs[i].x && prazo <= pairs[i + 1].x))
        i++;
    const { x: xi, y: yi } = pairs[i];
    const { x: xj, y: yj } = pairs[i + 1];
    const w = (0, exports.D)(prazo - xi).div(xj - xi); // peso ∈ [0,1]
    if (metodo === 'linear') {
        return (0, exports.D)(yi).plus((0, exports.D)(yj).minus(yi).mul(w)).toNumber();
    }
    // log-linear no fator de desconto: df = (1+y)^(-x); interpola ln(df); volta a taxa
    const lnDfi = (0, exports.D)(1).plus(yi).pow(-xi).ln();
    const lnDfj = (0, exports.D)(1).plus(yj).pow(-xj).ln();
    const lnDf = lnDfi.plus(lnDfj.minus(lnDfi).mul(w));
    const df = lnDf.exp();
    // taxa = df^(-1/prazo) - 1
    return df.pow((0, exports.D)(-1).div(prazo)).minus(1).toNumber();
}
/** Σ CF_k / (1+taxa)^((data_k - data_0)/365). Datas relativas ao primeiro fluxo. */
function xnpv(taxa, fluxos) {
    if (!fluxos.length)
        throw new Error('xnpv: ao menos um fluxo é necessário.');
    const d0 = fluxos[0].date;
    let soma = (0, exports.D)(0);
    for (const f of fluxos) {
        const t = (0, exports.D)((0, businessDays_1.countCalendarDays)(d0, f.date)).div(365);
        soma = soma.plus((0, exports.D)(f.amount).div((0, exports.D)(1).plus(taxa).pow(t)));
    }
    return soma.toNumber();
}
/** Derivada de xnpv em relação à taxa (para Newton-Raphson). */
function dXnpv(taxa, fluxos) {
    const d0 = fluxos[0].date;
    let soma = (0, exports.D)(0);
    for (const f of fluxos) {
        const t = (0, exports.D)((0, businessDays_1.countCalendarDays)(d0, f.date)).div(365);
        // d/dr CF*(1+r)^(-t) = CF * (-t) * (1+r)^(-t-1)
        soma = soma.plus((0, exports.D)(f.amount).mul(t.neg()).mul((0, exports.D)(1).plus(taxa).pow(t.neg().minus(1))));
    }
    return soma.toNumber();
}
/**
 * Taxa interna de retorno de fluxos datados (equivalente a XIRR do Excel).
 * Newton-Raphson com fallback para bissecção. Retorna taxa efetiva anual (fração).
 */
function xirr(fluxos, guess = 0.1) {
    if (fluxos.length < 2)
        throw new Error('xirr: ao menos dois fluxos são necessários.');
    const temPositivo = fluxos.some(f => f.amount > 0);
    const temNegativo = fluxos.some(f => f.amount < 0);
    if (!temPositivo || !temNegativo) {
        throw new Error('xirr: é necessário ao menos um fluxo positivo e um negativo.');
    }
    // Newton-Raphson
    let rate = guess;
    for (let it = 0; it < 100; it++) {
        const f = xnpv(rate, fluxos);
        const df = dXnpv(rate, fluxos);
        if (!isFinite(f) || !isFinite(df) || Math.abs(df) < 1e-14)
            break;
        const next = rate - f / df;
        if (!isFinite(next) || next <= -1)
            break;
        if (Math.abs(next - rate) < 1e-12)
            return next;
        rate = next;
    }
    // Fallback: bissecção procurando troca de sinal em [-0.9999, 100]
    let lo = -0.9999;
    let hi = 100;
    let flo = xnpv(lo, fluxos);
    let fhi = xnpv(hi, fluxos);
    if (flo * fhi > 0) {
        // varredura grosseira para localizar o intervalo
        let prev = lo;
        let fprev = flo;
        const steps = 2000;
        for (let s = 1; s <= steps; s++) {
            const r = lo + ((hi - lo) * s) / steps;
            const fr = xnpv(r, fluxos);
            if (isFinite(fr) && fprev * fr <= 0) {
                lo = prev;
                hi = r;
                flo = fprev;
                fhi = fr;
                break;
            }
            prev = r;
            fprev = fr;
        }
        if (flo * fhi > 0)
            throw new Error('xirr: não foi possível localizar a raiz.');
    }
    for (let it = 0; it < 200; it++) {
        const mid = (lo + hi) / 2;
        const fmid = xnpv(mid, fluxos);
        if (Math.abs(fmid) < 1e-10 || (hi - lo) / 2 < 1e-12)
            return mid;
        if (flo * fmid <= 0) {
            hi = mid;
            fhi = fmid;
        }
        else {
            lo = mid;
            flo = fmid;
        }
    }
    return (lo + hi) / 2;
}
/** Parcela constante (PMT do Excel): pv·i / (1 − (1+i)^(−n)). */
function pmt(i, n, pv) {
    if (i === 0)
        return (0, exports.D)(pv).div(n).toNumber();
    return (0, exports.D)(pv).mul(i).div((0, exports.D)(1).minus((0, exports.D)(1).plus(i).pow(-n))).toNumber();
}
/** Componente de juros da parcela `per` (1-indexado) de um financiamento Price. */
function ipmt(i, per, n, pv) {
    const parcela = (0, exports.D)(pmt(i, n, pv));
    let saldo = (0, exports.D)(pv);
    let juros = (0, exports.D)(0);
    for (let k = 1; k <= per; k++) {
        juros = saldo.mul(i);
        const principal = parcela.minus(juros);
        saldo = saldo.minus(principal);
    }
    return juros.toNumber();
}
/** Componente de amortização da parcela `per` (1-indexado) de um financiamento Price. */
function ppmt(i, per, n, pv) {
    return (0, exports.D)(pmt(i, n, pv)).minus(ipmt(i, per, n, pv)).toNumber();
}
//# sourceMappingURL=primitives.js.map