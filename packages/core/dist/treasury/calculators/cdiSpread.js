"use strict";
/**
 * §2.5 CDI + spread ↔ % do CDI. Função pura. Taxas em fração decimal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cdiSpreadParaPct = cdiSpreadParaPct;
exports.pctParaCdiSpread = pctParaCdiSpread;
function cdiSpreadParaPct(input) {
    const { cdiAa, spreadAa } = input;
    if (cdiAa <= 0)
        throw new Error('cdiSpreadParaPct: cdiAa deve ser > 0.');
    const totalComp = (1 + cdiAa) * (1 + spreadAa) - 1;
    const totalLin = cdiAa + spreadAa;
    return {
        totalComp,
        totalLin,
        pctCdiComp: totalComp / cdiAa,
        pctCdiLin: totalLin / cdiAa,
    };
}
function pctParaCdiSpread(input) {
    const { pctCdi, cdiAa } = input;
    const totalAa = pctCdi * cdiAa;
    return {
        totalAa,
        spreadLin: totalAa - cdiAa,
        spreadComp: (1 + totalAa) / (1 + cdiAa) - 1,
    };
}
//# sourceMappingURL=cdiSpread.js.map