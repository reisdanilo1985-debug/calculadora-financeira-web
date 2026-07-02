"use strict";
/**
 * §2.9 Duration (Macaulay/Modificada), DV01 e Convexidade.
 * Regime EFETIVO ANUAL: desconto (1+y)^t, t em anos. Função pura.
 *
 * Cupom periódico = face · couponRateAnnual / m (convenção simples por período).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.duration = duration;
const primitives_1 = require("../primitives");
function duration(input) {
    const { face, couponRateAnnual, ytm, m, n } = input;
    if (m <= 0 || n <= 0)
        throw new Error('duration: m e n devem ser > 0.');
    const cupom = (0, primitives_1.D)(face).mul(couponRateAnnual).div(m);
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
    };
}
//# sourceMappingURL=duration.js.map