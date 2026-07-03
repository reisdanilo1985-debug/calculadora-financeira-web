"use strict";
/**
 * §2.2/§2.3 Cross-currency genérico → % do CDI (USD ou EUR + spread).
 * Paridade coberta, convenção BR: (1+CDI) = (1+ΔFX)·(1+cupom).
 * Função pura. Taxas em fração decimal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.crossCcyToCdi = crossCcyToCdi;
exports.cdiToCrossCcy = cdiToCrossCcy;
/**
 * USD/EUR + spread → equivalente em reais (pré, % do CDI e CDI + spread).
 * Paridade coberta: o custo hedgeado da dívida externa expresso na régua local.
 */
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
        // "CDI + spread": quanto o custo hedgeado fica acima (ou abaixo) do CDI.
        spreadSobreCdiComp: (1 + preEquivComp) / (1 + cdiAa) - 1,
        spreadSobreCdiLin: preEquivLin - cdiAa,
        spreadEquilibrio: cupomEstrangeiroAa,
    };
}
/**
 * CDI + spread (perna local) → spread em USD/EUR equivalente sob hedge completo.
 *
 * Inverte a paridade coberta. Fechado: igualando o custo hedgeado externo ao
 * local, (1+cambioFwd)(1+spreadExt) = (1+CDI)(1+spreadLocal), e como
 * (1+cambioFwd) = (1+CDI)/(1+cupom), cai em:
 *   spreadExt = (1+spreadLocal)·(1+cupom) − 1   (composto)
 *   spreadExt ≈ spreadLocal + cupom             (linear)
 */
function cdiToCrossCcy(input) {
    const { cdiAa, spreadLocalAa, cupomEstrangeiroAa } = input;
    if (cdiAa <= 0)
        throw new Error('cdiToCrossCcy: cdiAa deve ser > 0.');
    const cambioFwdAa = (1 + cdiAa) / (1 + cupomEstrangeiroAa) - 1;
    const preEquivComp = (1 + cdiAa) * (1 + spreadLocalAa) - 1;
    return {
        cambioFwdAa,
        spreadEstrangeiroComp: (1 + spreadLocalAa) * (1 + cupomEstrangeiroAa) - 1,
        spreadEstrangeiroLin: spreadLocalAa + cupomEstrangeiroAa,
        preEquivComp,
        pctCdiComp: preEquivComp / cdiAa,
    };
}
//# sourceMappingURL=crossCcy.js.map