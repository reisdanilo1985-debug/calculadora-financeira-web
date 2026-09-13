"use strict";
/**
 * §2.10 PU de títulos BR (base 252). LTN/Prefixado (zero-cupom) e NTN-F (cupom semestral).
 * Função pura. Taxas em fração decimal; du = dias úteis ANBIMA do título.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.puLtn = puLtn;
exports.taxaCupomPeriodicoNtnf = taxaCupomPeriodicoNtnf;
exports.puNtnf = puNtnf;
const primitives_1 = require("../primitives");
function puLtn(input) {
    const { vn, iaa, du } = input;
    if (du <= 0)
        throw new Error('puLtn: du deve ser > 0.');
    const pu = (0, primitives_1.D)(vn).div((0, primitives_1.D)(1).plus(iaa).pow((0, primitives_1.D)(du).div(252)));
    return { pu: pu.toNumber() };
}
/**
 * Taxa do cupom periódico pela convenção NTN-F (STN/ANBIMA): (1 + taxa)^(1/m) − 1.
 * Ex.: 10% a.a. semestral → 4,8808848…% (cupom de R$ 48,80885 por R$ 1.000).
 * Compartilhada com o calculador de duration (modo 'ntnf').
 */
function taxaCupomPeriodicoNtnf(couponRateAnnual, m) {
    return (0, primitives_1.D)(1).plus(couponRateAnnual).pow((0, primitives_1.D)(1).div(m)).minus(1);
}
function puNtnf(input) {
    const { face, iaa, couponRateAnnual, m, cuponsDu } = input;
    if (!cuponsDu.length)
        throw new Error('puNtnf: cuponsDu não pode ser vazio.');
    // Cupom periódico pela convenção NTN-F: (1+taxa)^(1/m) − 1
    const cupomTaxa = taxaCupomPeriodicoNtnf(couponRateAnnual, m);
    const cupomValor = (0, primitives_1.D)(face).mul(cupomTaxa);
    const fluxos = [];
    let pu = (0, primitives_1.D)(0);
    const ult = cuponsDu.length - 1;
    cuponsDu.forEach((du, idx) => {
        const fluxo = idx === ult ? cupomValor.plus(face) : cupomValor;
        const vp = fluxo.div((0, primitives_1.D)(1).plus(iaa).pow((0, primitives_1.D)(du).div(252)));
        pu = pu.plus(vp);
        fluxos.push({ du, valor: fluxo.toNumber(), vp: vp.toNumber() });
    });
    return {
        pu: pu.toNumber(),
        cupomPeriodico: cupomValor.toNumber(),
        fluxos,
    };
}
//# sourceMappingURL=puTitulos.js.map