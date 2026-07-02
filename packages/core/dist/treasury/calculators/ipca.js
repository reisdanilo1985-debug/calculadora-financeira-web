"use strict";
/**
 * §2.6 IPCA+ (NTN-B) → Pré / % do CDI. Função pura. Taxas em fração decimal.
 * Usa Fisher multiplicativo (atalho real+ipca subestima em prazos longos).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipcaMais = ipcaMais;
function ipcaMais(input) {
    const { realAa, ipcaAa, cdiAa, preMercadoAa } = input;
    if (cdiAa <= 0)
        throw new Error('ipcaMais: cdiAa deve ser > 0.');
    const nominalAa = (1 + realAa) * (1 + ipcaAa) - 1; // Fisher
    const result = {
        nominalAa,
        pctCdi: nominalAa / cdiAa,
    };
    if (preMercadoAa !== undefined) {
        const breakevenInf = (1 + preMercadoAa) / (1 + realAa) - 1;
        result.breakevenInf = breakevenInf;
        result.veredito = ipcaAa > breakevenInf ? 'IPCA+ ganha' : 'Pré ganha';
    }
    return result;
}
//# sourceMappingURL=ipca.js.map