"use strict";
/**
 * §2.5 CDI + spread ↔ % do CDI. Função pura. Taxas em fração decimal.
 *
 * O "% do CDI" segue a convenção B3 (percentual sobre a taxa DI DIÁRIA, a mesma
 * do CDIEngine da Calculadora principal):
 *   TDI      = (1 + CDI)^(1/252) − 1
 *   p        = [(1 + total)^(1/252) − 1] / TDI
 *   total(p) = (1 + p·TDI)^252 − 1
 * As variantes "Comp"/"Lin" referem-se à COMPOSIÇÃO do spread sobre o CDI:
 *   totalComp = (1 + CDI)·(1 + spread) − 1   (spread composto, base 252)
 *   totalLin  = CDI + spread                 (spread aditivo)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cdiSpreadParaPct = cdiSpreadParaPct;
exports.pctParaCdiSpread = pctParaCdiSpread;
const primitives_1 = require("../primitives");
function cdiSpreadParaPct(input) {
    const { cdiAa, spreadAa } = input;
    if (cdiAa <= 0)
        throw new Error('cdiSpreadParaPct: cdiAa deve ser > 0.');
    if (spreadAa <= -1)
        throw new Error('cdiSpreadParaPct: spreadAa deve ser maior que −100%.');
    const totalComp = (0, primitives_1.D)(1).plus(cdiAa).mul((0, primitives_1.D)(1).plus(spreadAa)).minus(1);
    const totalLin = (0, primitives_1.D)(cdiAa).plus(spreadAa);
    return {
        totalComp: totalComp.toNumber(),
        totalLin: totalLin.toNumber(),
        pctCdiComp: (0, primitives_1.pctCdiB3)(totalComp, cdiAa).toNumber(),
        pctCdiLin: (0, primitives_1.pctCdiB3)(totalLin, cdiAa).toNumber(),
    };
}
function pctParaCdiSpread(input) {
    const { pctCdi, cdiAa } = input;
    if (cdiAa <= 0)
        throw new Error('pctParaCdiSpread: cdiAa deve ser > 0.');
    const totalAa = (0, primitives_1.taxaDePctCdiB3)(pctCdi, cdiAa);
    return {
        totalAa: totalAa.toNumber(),
        spreadLin: totalAa.minus(cdiAa).toNumber(),
        spreadComp: (0, primitives_1.D)(1).plus(totalAa).div((0, primitives_1.D)(1).plus(cdiAa)).minus(1).toNumber(),
    };
}
//# sourceMappingURL=cdiSpread.js.map