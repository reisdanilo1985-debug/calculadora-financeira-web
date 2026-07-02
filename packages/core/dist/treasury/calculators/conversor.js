"use strict";
/**
 * §2.1 Conversor de taxas — equivalência de taxa efetiva e ponte 252↔360.
 * Função pura. Taxas em fração decimal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversor = conversor;
const primitives_1 = require("../primitives");
function conversor(input) {
    const { iaa, du, dc, m } = input;
    const result = {
        aoDiaUtil: (0, primitives_1.equivalente)(iaa, 1 / 252),
        aoMes: (0, primitives_1.equivalente)(iaa, 1 / 12),
        aoTrimestre: (0, primitives_1.equivalente)(iaa, 1 / 4),
        aoSemestre: (0, primitives_1.equivalente)(iaa, 1 / 2),
        aoAno: iaa,
        aoDiaCorrido: (0, primitives_1.equivalente)(iaa, 1 / 365),
    };
    if (du !== undefined && dc !== undefined) {
        if (du <= 0 || dc <= 0)
            throw new Error('conversor: du e dc devem ser > 0.');
        const fator = (0, primitives_1.fator252)(iaa, du);
        result.ponte = {
            fator,
            i360Comp: Math.pow(fator, 360 / dc) - 1,
            i360Linear: (fator - 1) * (360 / dc),
        };
    }
    if (m !== undefined && m > 0) {
        result.nominal = {
            efetivaDeNominal: (0, primitives_1.nominalParaEfetiva)(iaa, m),
            nominalDeEfetiva: (0, primitives_1.efetivaParaNominal)(iaa, m),
        };
    }
    return result;
}
//# sourceMappingURL=conversor.js.map