"use strict";
/**
 * §2.11 Swap CDI × Pré — Marcação a Mercado (MtM).
 * Posição de referência: recebe pré / paga CDI. Modelo SIMPLIFICADO
 * (perna flutuante reseta ao mercado ⇒ vale o CDI acumulado). Função pura.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.swapCdiPreMtM = swapCdiPreMtM;
const primitives_1 = require("../primitives");
function swapCdiPreMtM(input) {
    const { notional, preContratada, preMercadoAa, duTotal, duDecorridos, fatorCdiAcumulado } = input;
    const duRem = duTotal - duDecorridos;
    if (duRem < 0)
        throw new Error('swapCdiPreMtM: duDecorridos não pode exceder duTotal.');
    const resgatePre = (0, primitives_1.D)(notional).mul((0, primitives_1.D)(1).plus(preContratada).pow((0, primitives_1.D)(duTotal).div(252)));
    const pvPre = resgatePre.div((0, primitives_1.D)(1).plus(preMercadoAa).pow((0, primitives_1.D)(duRem).div(252)));
    const pvCdi = (0, primitives_1.D)(notional).mul(fatorCdiAcumulado);
    const mtm = pvPre.minus(pvCdi);
    return {
        duRem,
        resgatePre: resgatePre.toNumber(),
        pvPre: pvPre.toNumber(),
        pvCdi: pvCdi.toNumber(),
        mtm: mtm.toNumber(),
    };
}
//# sourceMappingURL=swap.js.map