"use strict";
/**
 * §2.6 IPCA+ (NTN-B) → Pré / % do CDI. Função pura. Taxas em fração decimal.
 * Usa Fisher multiplicativo (atalho real+ipca subestima em prazos longos).
 *
 * % do CDI:
 *   pctCdiB3 → convenção B3 (percentual sobre a taxa DI diária):
 *              [(1 + nominal)^(1/252) − 1] / [(1 + CDI)^(1/252) − 1] — use este;
 *   pctCdi   → razão anual nominal ÷ CDI: APROXIMAÇÃO da planilha, mantida por
 *              compatibilidade e rotulada em `convencao`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipcaMais = ipcaMais;
const primitives_1 = require("../primitives");
function ipcaMais(input) {
    const { realAa, ipcaAa, cdiAa, preMercadoAa } = input;
    if (cdiAa <= 0)
        throw new Error('ipcaMais: cdiAa deve ser > 0.');
    const nominalAa = (0, primitives_1.D)(1).plus(realAa).mul((0, primitives_1.D)(1).plus(ipcaAa)).minus(1); // Fisher
    if (!nominalAa.gt(-1))
        throw new Error('ipcaMais: a taxa nominal resultante deve ser maior que −100%.');
    const result = {
        nominalAa: nominalAa.toNumber(),
        pctCdiB3: (0, primitives_1.pctCdiB3)(nominalAa, cdiAa).toNumber(),
        pctCdi: nominalAa.div(cdiAa).toNumber(),
        convencao: 'Pct Cdi B3 = % do CDI sobre a taxa DI diária (B3); Pct Cdi = razão anual nominal ÷ CDI (aproximação).',
    };
    if (preMercadoAa !== undefined) {
        const breakevenInf = (1 + preMercadoAa) / (1 + realAa) - 1;
        result.breakevenInf = breakevenInf;
        result.veredito = ipcaAa > breakevenInf ? 'IPCA+ ganha' : 'Pré ganha';
    }
    return result;
}
//# sourceMappingURL=ipca.js.map