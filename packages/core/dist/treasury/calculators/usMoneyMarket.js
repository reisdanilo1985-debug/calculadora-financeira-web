"use strict";
/**
 * §2.13 EUA — Money Market, SOFR e day counts. Função pura.
 * Taxas em fração decimal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tbillYields = tbillYields;
exports.sofrSpreadEay = sofrSpreadEay;
exports.jurosConvencoes = jurosConvencoes;
const primitives_1 = require("../primitives");
function tbillYields(input) {
    const { face, preco, dias } = input;
    if (dias <= 0 || preco <= 0)
        throw new Error('tbillYields: dias e preco devem ser > 0.');
    const desconto = (0, primitives_1.D)(face).minus(preco);
    return {
        discountYield: desconto.div(face).mul((0, primitives_1.D)(360).div(dias)).toNumber(),
        mmy: desconto.div(preco).mul((0, primitives_1.D)(360).div(dias)).toNumber(),
        bey: desconto.div(preco).mul((0, primitives_1.D)(365).div(dias)).toNumber(),
        eay: (0, primitives_1.D)(face).div(preco).pow((0, primitives_1.D)(365).div(dias)).minus(1).toNumber(),
    };
}
function sofrSpreadEay(input) {
    const { sofrAa, spreadAa, dias } = input;
    if (dias <= 0)
        throw new Error('sofrSpreadEay: dias deve ser > 0.');
    const allInAa = (0, primitives_1.D)(sofrAa).plus(spreadAa);
    const juroPeriodo = allInAa.mul((0, primitives_1.D)(dias).div(360));
    const eay = (0, primitives_1.D)(1).plus(juroPeriodo).pow((0, primitives_1.D)(360).div(dias)).minus(1);
    return {
        allInAa: allInAa.toNumber(),
        juroPeriodo: juroPeriodo.toNumber(),
        eay: eay.toNumber(),
    };
}
function jurosConvencoes(input) {
    const { notional, taxa, d0, d1 } = input;
    const d30 = (0, primitives_1.days360)(d0, d1);
    const dAct = (0, primitives_1.diasCorridos)(d0, d1);
    return {
        dias30360: d30,
        diasAct: dAct,
        juros30360: (0, primitives_1.D)(notional).mul(taxa).mul((0, primitives_1.D)(d30).div(360)).toNumber(),
        jurosAct360: (0, primitives_1.D)(notional).mul(taxa).mul((0, primitives_1.D)(dAct).div(360)).toNumber(),
        jurosAct365: (0, primitives_1.D)(notional).mul(taxa).mul((0, primitives_1.D)(dAct).div(365)).toNumber(),
    };
}
//# sourceMappingURL=usMoneyMarket.js.map