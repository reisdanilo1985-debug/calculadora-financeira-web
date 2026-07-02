"use strict";
/**
 * §2.4 Pré ↔ % do CDI. Função pura. Taxas em fração decimal.
 *
 * Ressalva (documentar na UI): a razão de taxas é a aproximação de mesa
 * (exata só com CDI constante). O acúmulo real de "p% do CDI" é diário.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.preParaCdi = preParaCdi;
exports.cdiParaPre = cdiParaPre;
function preParaCdi(input) {
    const { preAa, cdiAa } = input;
    if (cdiAa <= 0)
        throw new Error('preParaCdi: cdiAa deve ser > 0.');
    return {
        pctCdi: preAa / cdiAa,
        spreadCompSobreCdi: (1 + preAa) / (1 + cdiAa) - 1,
    };
}
function cdiParaPre(input) {
    return { preAa: input.pctCdi * input.cdiAa };
}
//# sourceMappingURL=preCdi.js.map