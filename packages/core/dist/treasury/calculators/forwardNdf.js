"use strict";
/**
 * §2.12 Forward / NDF USD-BRL (paridade coberta). Função pura.
 * Cada perna na sua base: BR 252 / USD 360. O forward elimina arbitragem de
 * juros — NÃO é previsão de câmbio.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.forwardUsdBrl = forwardUsdBrl;
exports.ndfAjuste = ndfAjuste;
const primitives_1 = require("../primitives");
function forwardUsdBrl(input) {
    const { spot, iBrAa, du, cupomUsdAa, dc } = input;
    const fatorBr = (0, primitives_1.D)(1).plus(iBrAa).pow((0, primitives_1.D)(du).div(252));
    const fatorUsd = (0, primitives_1.D)(1).plus(cupomUsdAa).pow((0, primitives_1.D)(dc).div(360));
    const forward = (0, primitives_1.D)(spot).mul(fatorBr).div(fatorUsd);
    return {
        fatorBr: fatorBr.toNumber(),
        fatorUsd: fatorUsd.toNumber(),
        forward: forward.toNumber(),
        pontos: forward.minus(spot).toNumber(),
    };
}
/** Liquidação NDF comprado em USD: (PTAX − K) · notional. */
function ndfAjuste(input) {
    const { ptaxVencimento, kContratado, notionalUsd } = input;
    return {
        ajusteBrl: (0, primitives_1.D)(ptaxVencimento).minus(kContratado).mul(notionalUsd).toNumber(),
    };
}
//# sourceMappingURL=forwardNdf.js.map