"use strict";
/**
 * §2.2/§2.3 Cross-currency genérico → % do CDI (USD ou EUR + spread).
 * Paridade coberta, convenção BR: (1+CDI) = (1+ΔFX)·(1+cupom).
 * Função pura. Taxas em fração decimal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.crossCcyToCdi = crossCcyToCdi;
function crossCcyToCdi(input) {
    const { spreadEstrangeiroAa, cdiAa, cupomEstrangeiroAa } = input;
    if (cdiAa <= 0)
        throw new Error('crossCcyToCdi: cdiAa deve ser > 0.');
    const cambioFwdAa = (1 + cdiAa) / (1 + cupomEstrangeiroAa) - 1;
    const preEquivComp = (1 + cambioFwdAa) * (1 + spreadEstrangeiroAa) - 1;
    const preEquivLin = cambioFwdAa + spreadEstrangeiroAa;
    return {
        cambioFwdAa,
        preEquivComp,
        preEquivLin,
        pctCdiComp: preEquivComp / cdiAa,
        pctCdiLin: preEquivLin / cdiAa,
        spreadEquilibrio: cupomEstrangeiroAa,
    };
}
//# sourceMappingURL=crossCcy.js.map