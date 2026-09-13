"use strict";
/**
 * §2.4 Pré ↔ % do CDI. Função pura. Taxas em fração decimal.
 *
 * Convenção B3 ("% do DI", Caderno de Fórmulas CDB/DI): o percentual incide
 * sobre a taxa DI DIÁRIA, não sobre a taxa anual:
 *   TDI          = (1 + CDI)^(1/252) − 1
 *   fator diário = 1 + p·TDI
 *   pré equiv.   = (1 + p·TDI)^252 − 1
 *   p            = [(1 + pré)^(1/252) − 1] / TDI
 * Mesma convenção do CDIEngine da Calculadora principal. Com CDI constante a
 * conversão é exata (ida e volta perfeita); a razão anual pré ÷ CDI é só uma
 * aproximação (superestima p acima de 100% do CDI) e NÃO é usada aqui.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.preParaCdi = preParaCdi;
exports.cdiParaPre = cdiParaPre;
const primitives_1 = require("../primitives");
function preParaCdi(input) {
    const { preAa, cdiAa } = input;
    if (cdiAa <= 0)
        throw new Error('preParaCdi: cdiAa deve ser > 0.');
    if (preAa <= -1)
        throw new Error('preParaCdi: preAa deve ser maior que −100%.');
    return {
        pctCdi: (0, primitives_1.pctCdiB3)(preAa, cdiAa).toNumber(),
        spreadCompSobreCdi: (0, primitives_1.D)(1).plus(preAa).div((0, primitives_1.D)(1).plus(cdiAa)).minus(1).toNumber(),
    };
}
function cdiParaPre(input) {
    const { pctCdi, cdiAa } = input;
    if (cdiAa <= 0)
        throw new Error('cdiParaPre: cdiAa deve ser > 0.');
    return { preAa: (0, primitives_1.taxaDePctCdiB3)(pctCdi, cdiAa).toNumber() };
}
//# sourceMappingURL=preCdi.js.map