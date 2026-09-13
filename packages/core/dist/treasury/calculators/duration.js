"use strict";
/**
 * §2.9 Duration (Macaulay/Modificada), DV01 e Convexidade.
 * Regime EFETIVO ANUAL: desconto (1+y)^t, t = k/m anos. Função pura.
 *
 * Convenção do cupom periódico (`convencaoCupom`, declarada no resultado):
 *   'simples' (padrão) → cupom = face · taxa / m  (taxa nominal dividida por m);
 *   'ntnf'             → cupom = face · [(1 + taxa)^(1/m) − 1], a convenção NTN-F
 *                        de `puNtnf`. Como t = k/m = du/252 com du = 252·k/m, o
 *                        preço coincide com o PU NTN-F do mesmo título.
 * As duas dão preços diferentes para a mesma "taxa de cupom" (10% a.a. semestral:
 * cupom 50,00 × 48,81 por 1.000) — por isso a convenção vem sempre explícita.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.duration = duration;
const primitives_1 = require("../primitives");
const puTitulos_1 = require("./puTitulos");
const ROTULO_CONVENCAO = {
    simples: 'Simples: cupom = face × taxa ÷ m (difere do PU NTN-F)',
    ntnf: 'NTN-F: cupom = face × [(1 + taxa)^(1/m) − 1], t = k/m = du/252 (mesmo PU do calculador NTN-F)',
};
/**
 * Limites de domínio. O laço abaixo faz uma potência Decimal de expoente
 * fracionário por período e roda de forma síncrona: sem teto, n = 100.000
 * leva ~12 s e n = 1.000.000 trava o event loop da API. 1.200 períodos cobrem
 * 100 anos de cupons mensais (~0,1 s). A rota /api/tesouraria/calc/duration
 * aplica os mesmos limites no schema zod.
 */
const MAX_PERIODOS = 1200;
/** Pagamentos por ano: de anual (1) a diário corrido (365). */
const MIN_PAGAMENTOS_ANO = 1;
const MAX_PAGAMENTOS_ANO = 365;
function duration(input) {
    const { face, couponRateAnnual, ytm, m, n } = input;
    const convencao = input.convencaoCupom ?? 'simples';
    if (convencao !== 'simples' && convencao !== 'ntnf') {
        throw new Error(`duration: convencaoCupom deve ser 'simples' ou 'ntnf'; recebido ${String(convencao)}.`);
    }
    // Number.isInteger também barra NaN/Infinity (que antes passavam por `<= 0`).
    if (!Number.isInteger(n) || n < 1 || n > MAX_PERIODOS) {
        throw new Error(`duration: n (número de períodos) deve ser um inteiro entre 1 e ${MAX_PERIODOS}; recebido ${n}.`);
    }
    if (!Number.isInteger(m) || m < MIN_PAGAMENTOS_ANO || m > MAX_PAGAMENTOS_ANO) {
        throw new Error(`duration: m (pagamentos por ano) deve ser um inteiro entre ${MIN_PAGAMENTOS_ANO} e ${MAX_PAGAMENTOS_ANO}; recebido ${m}.`);
    }
    const cupom = convencao === 'ntnf'
        ? (0, primitives_1.D)(face).mul((0, puTitulos_1.taxaCupomPeriodicoNtnf)(couponRateAnnual, m))
        : (0, primitives_1.D)(face).mul(couponRateAnnual).div(m);
    const y = (0, primitives_1.D)(ytm);
    let preco = (0, primitives_1.D)(0);
    let somaTVp = (0, primitives_1.D)(0);
    let somaConvex = (0, primitives_1.D)(0);
    for (let k = 1; k <= n; k++) {
        const fluxo = k === n ? cupom.plus(face) : cupom;
        const t = (0, primitives_1.D)(k).div(m); // anos
        const vp = fluxo.div(y.plus(1).pow(t));
        preco = preco.plus(vp);
        somaTVp = somaTVp.plus(t.mul(vp));
        // t·(t+1)·VP
        somaConvex = somaConvex.plus(t.mul(t.plus(1)).mul(vp));
    }
    const macaulay = somaTVp.div(preco);
    const modDur = macaulay.div(y.plus(1));
    const dv01 = modDur.mul(preco).mul(0.0001);
    const convex = somaConvex.div(preco.mul(y.plus(1).pow(2)));
    return {
        preco: preco.toNumber(),
        macaulayDuration: macaulay.toNumber(),
        modifiedDuration: modDur.toNumber(),
        dv01: dv01.toNumber(),
        convexidade: convex.toNumber(),
        cupomPeriodico: cupom.toNumber(),
        convencao: ROTULO_CONVENCAO[convencao],
    };
}
//# sourceMappingURL=duration.js.map