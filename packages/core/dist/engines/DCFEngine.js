"use strict";
/**
 * Engine para Valor Presente (Discounted Cash Flow) — Tese T2.
 *
 * Fórmula: VP = Σ CF / (1 + r)^t, onde t é calculado pela base de dias configurada.
 * Fluxos com sinal (saídas negativas, entradas positivas): o VP total é o VPL.
 * Fluxo na própria data de referência entra com t = 0.
 *
 * Perpetuidade (Gordon), avaliada na data N do último fluxo explícito:
 *   VT_N = FC_base × (1 + g_p) / (r_p − g_p),   VP(VT) = VT_N / (1 + r)^t_N
 * r_p e g_p são as taxas equivalentes ao período do fluxo perpétuo: (1 + taxa a.a.)^(1/k) − 1,
 * com k períodos por ano. Exige r > g.
 *
 * TIR: taxa anual i com VPL(i) = 0, na MESMA contagem de tempo do VP (base 252/360/365).
 * Com perpetuidade, o valor terminal é recalculado em cada i (i > g).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDCF = calculateDCF;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
const businessDays_1 = require("../utils/businessDays");
const periodicity_1 = require("../utils/periodicity");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
/** Faixa de busca da TIR, em fração a.a. */
const TIR_MIN = -0.99;
const TIR_MAX = 10;
const TIR_PONTOS_VARREDURA = 800;
/**
 * Calcula a fração de tempo em anos entre duas datas, conforme a base.
 */
function calcTimeFraction(from, to, basis) {
    if (from.getTime() === to.getTime())
        return new decimal_js_1.default(0);
    if (basis === types_1.DayCountBasis.DU252) {
        const busDays = (0, businessDays_1.getBusinessDaysBetween)(from, to).length;
        return new decimal_js_1.default(busDays).div(252);
    }
    const msPerDay = 24 * 60 * 60 * 1000;
    const calDays = Math.max(0, Math.round((to.getTime() - from.getTime()) / msPerDay));
    return new decimal_js_1.default(calDays).div(basis === types_1.DayCountBasis.DC360 ? 360 : 365);
}
const inicioDoDia = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};
const dataBr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
/** Taxa equivalente ao período: (1 + x)^(1/k) − 1 */
const taxaDoPeriodo = (anual, k) => anual.plus(1).pow(new decimal_js_1.default(1).div(k)).minus(1);
/** VPL em ponto flutuante — só para localizar a TIR (varredura + bissecção). */
function vplNumber(i, fluxos, perp) {
    let soma = 0;
    for (const f of fluxos)
        soma += f.amount * Math.pow(1 + i, -f.t);
    if (perp && perp.base !== 0) {
        const ip = Math.pow(1 + i, 1 / perp.k) - 1;
        const gp = Math.pow(1 + perp.g, 1 / perp.k) - 1;
        soma += (perp.base * (1 + gp)) / (ip - gp) * Math.pow(1 + i, -perp.tN);
    }
    return soma;
}
/**
 * TIRs (fração a.a.) entre −99% e 1.000% a.a.: varredura com passo mais fino perto do
 * limite inferior e bissecção em cada troca de sinal (tolerância 1e-12 na taxa).
 */
function encontrarTirs(fluxos, perp) {
    const inferior = perp ? Math.max(TIR_MIN, perp.g) : TIR_MIN;
    const f = (i) => vplNumber(i, fluxos, perp);
    const pontos = [];
    // Com perpetuidade, i = g é um polo (VT infinito): começa logo acima dele.
    for (let s = perp ? 1 : 0; s <= TIR_PONTOS_VARREDURA; s++) {
        pontos.push(inferior + (TIR_MAX - inferior) * Math.pow(s / TIR_PONTOS_VARREDURA, 2));
    }
    const raizes = [];
    let a = pontos[0];
    let fa = f(a);
    for (let p = 1; p < pontos.length; p++) {
        const b = pontos[p];
        const fb = f(b);
        if (Number.isFinite(fa) && Number.isFinite(fb)) {
            if (fa === 0)
                raizes.push(a);
            else if (fa * fb < 0) {
                let lo = a;
                let hi = b;
                let flo = fa;
                for (let it = 0; it < 200 && hi - lo > 1e-12; it++) {
                    const mid = (lo + hi) / 2;
                    const fm = f(mid);
                    if (fm === 0) {
                        lo = hi = mid;
                        break;
                    }
                    if (flo * fm < 0)
                        hi = mid;
                    else {
                        lo = mid;
                        flo = fm;
                    }
                }
                raizes.push((lo + hi) / 2);
            }
        }
        a = b;
        fa = fb;
    }
    if (Number.isFinite(fa) && fa === 0)
        raizes.push(a);
    return raizes;
}
/**
 * Calcula o Valor Presente de um conjunto de fluxos futuros.
 */
function calculateDCF(params) {
    const { cashFlows, discountRate, referenceDate, dayCountBasis, currency, perpetuity } = params;
    if (!cashFlows.length) {
        throw new Error('Ao menos um fluxo de caixa é necessário.');
    }
    if (!Number.isFinite(discountRate) || discountRate <= -100) {
        throw new Error('Taxa de desconto deve ser maior que −100% a.a.');
    }
    const rate = new decimal_js_1.default(discountRate).div(100);
    const refDate = inicioDoDia(referenceDate);
    const ordenados = cashFlows
        .map(f => ({ ...f, date: inicioDoDia(new Date(f.date)) }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    const flowResults = [];
    let explicitPV = new decimal_js_1.default(0);
    let totalNominal = new decimal_js_1.default(0);
    let weightedTime = new decimal_js_1.default(0);
    let algumVpNegativo = false;
    for (const flow of ordenados) {
        if (!Number.isFinite(flow.amount)) {
            throw new Error(`Valor inválido no fluxo de ${dataBr(flow.date)}.`);
        }
        if (flow.date < refDate) {
            throw new Error(`Fluxo em ${dataBr(flow.date)} é anterior à data de referência (${dataBr(refDate)}).`);
        }
        const t = calcTimeFraction(refDate, flow.date, dayCountBasis);
        // PV = FV / (1 + r)^t
        const discountFactor = new decimal_js_1.default(1).div(rate.plus(1).pow(t));
        const pv = new decimal_js_1.default(flow.amount).mul(discountFactor);
        if (pv.isNegative())
            algumVpNegativo = true;
        flowResults.push({
            date: flow.date,
            nominalAmount: flow.amount,
            pv: pv.toNumber(),
            discountFactor: discountFactor.toNumber(),
            timeFractionYears: t.toNumber(),
            contributionPercent: 0, // calculated after totaling
        });
        explicitPV = explicitPV.plus(pv);
        totalNominal = totalNominal.plus(new decimal_js_1.default(flow.amount));
        weightedTime = weightedTime.plus(t.mul(pv));
    }
    // ── Perpetuidade (Gordon) ──
    let terminal;
    let terminalPV = new decimal_js_1.default(0);
    let perpTir;
    if (perpetuity) {
        const k = 12 / (0, periodicity_1.monthsPerPeriod)(perpetuity.periodicity);
        if (!Number.isFinite(perpetuity.growthRate) || perpetuity.growthRate <= -100) {
            throw new Error('Crescimento da perpetuidade deve ser maior que −100% a.a.');
        }
        const g = new decimal_js_1.default(perpetuity.growthRate).div(100);
        if (!rate.gt(g)) {
            throw new Error(`Perpetuidade exige taxa de desconto (${discountRate}% a.a.) maior que o crescimento (${perpetuity.growthRate}% a.a.).`);
        }
        const ultimo = flowResults[flowResults.length - 1];
        const base = perpetuity.baseCashFlow != null
            ? new decimal_js_1.default(perpetuity.baseCashFlow)
            : flowResults
                .filter(f => f.date.getTime() === ultimo.date.getTime())
                .reduce((s, f) => s.plus(f.nominalAmount), new decimal_js_1.default(0));
        if (!base.isFinite())
            throw new Error('Fluxo base da perpetuidade inválido.');
        const rp = taxaDoPeriodo(rate, k);
        const gp = taxaDoPeriodo(g, k);
        const nominal = base.mul(gp.plus(1)).div(rp.minus(gp));
        const tN = new decimal_js_1.default(ultimo.timeFractionYears);
        const df = new decimal_js_1.default(1).div(rate.plus(1).pow(tN));
        terminalPV = nominal.mul(df);
        if (terminalPV.isNegative())
            algumVpNegativo = true;
        // Duration de uma perpetuidade crescente, medida em N: (1 + r_p) / (r_p − g_p) períodos
        const durPerpAnos = rp.plus(1).div(rp.minus(gp)).div(k);
        weightedTime = weightedTime.plus(terminalPV.mul(tN.plus(durPerpAnos)));
        terminal = {
            date: ultimo.date,
            baseCashFlow: base.toNumber(),
            growthRate: perpetuity.growthRate,
            periodicity: perpetuity.periodicity,
            periodDiscountRate: rp.mul(100).toNumber(),
            periodGrowthRate: gp.mul(100).toNumber(),
            nominalValue: nominal.toNumber(),
            discountFactor: df.toNumber(),
            timeFractionYears: tN.toNumber(),
            pv: terminalPV.toNumber(),
            contributionPercent: 0,
        };
        perpTir = { base: base.toNumber(), k, g: g.toNumber(), tN: tN.toNumber() };
    }
    const totalPV = explicitPV.plus(terminalPV);
    // Macaulay duration = Σ(t * PV) / TotalPV — só definida com todos os VPs ≥ 0
    const macaulayDuration = algumVpNegativo
        ? null
        : totalPV.gt(0) ? weightedTime.div(totalPV).toNumber() : 0;
    // Contribution %
    for (const fr of flowResults) {
        fr.contributionPercent = totalPV.isZero()
            ? 0
            : new decimal_js_1.default(fr.pv).div(totalPV).mul(100).toNumber();
    }
    if (terminal) {
        terminal.contributionPercent = totalPV.isZero() ? 0 : terminalPV.div(totalPV).mul(100).toNumber();
    }
    // ── Trocas de sinal (fluxos da mesma data somados; o fluxo perpétuo vem por último) ──
    const porData = new Map();
    for (const f of flowResults) {
        porData.set(f.date.getTime(), (porData.get(f.date.getTime()) ?? new decimal_js_1.default(0)).plus(f.nominalAmount));
    }
    const sinais = [...porData.keys()].sort((a, b) => a - b).map(k => porData.get(k).cmp(0));
    if (perpTir)
        sinais.push(Math.sign(perpTir.base));
    let signChanges = 0;
    let anterior = 0;
    for (const s of sinais) {
        if (s === 0)
            continue;
        if (anterior !== 0 && s !== anterior)
            signChanges++;
        anterior = s;
    }
    const result = {
        referenceDate,
        discountRate,
        dayCountBasis,
        currency,
        totalPV: totalPV.toNumber(),
        explicitPV: explicitPV.toNumber(),
        totalNominal: totalNominal.toNumber(),
        macaulayDuration,
        flows: flowResults,
        terminalValue: terminal,
        signChanges,
    };
    // ── TIR (só com saídas e entradas) ──
    const temPositivo = sinais.some(s => s > 0);
    const temNegativo = sinais.some(s => s < 0);
    if (temPositivo && temNegativo) {
        const fluxosTir = flowResults.map(f => ({ amount: f.nominalAmount, t: f.timeFractionYears }));
        const tirs = encontrarTirs(fluxosTir, perpTir);
        const pct = (x) => x * 100;
        if (tirs.length === 0) {
            result.irrWarning = 'Não há TIR entre −99% e 1.000% a.a. para estes fluxos.';
        }
        else {
            const alvo = rate.toNumber();
            const escolhida = tirs.reduce((m, x) => (Math.abs(x - alvo) < Math.abs(m - alvo) ? x : m), tirs[0]);
            result.irr = pct(escolhida);
            result.irrMonthly = pct(Math.pow(1 + escolhida, 1 / 12) - 1);
            result.irrs = tirs.map(pct);
            if (tirs.length > 1) {
                result.irrWarning =
                    `TIR múltipla: ${tirs.length} taxas zeram o VPL. A TIR exibida é a mais próxima da taxa de desconto; decida pelo VPL.`;
            }
            else if (signChanges > 1) {
                result.irrWarning =
                    `O fluxo troca de sinal ${signChanges} vezes: a TIR pode não ser única. Decida pelo VPL à taxa de desconto.`;
            }
        }
    }
    return result;
}
//# sourceMappingURL=DCFEngine.js.map