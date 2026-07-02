"use strict";
/**
 * §2.7 TIR / VPL para fluxos irregulares (datados). Função pura.
 * Reaproveita os solvers xirr/xnpv das primitivas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tirVpl = tirVpl;
const primitives_1 = require("../primitives");
function tirVpl(input) {
    const { fluxos, taxaDesconto, custoCapital } = input;
    if (!fluxos || fluxos.length < 2) {
        throw new Error('tirVpl: ao menos dois fluxos datados são necessários.');
    }
    const tirAnual = (0, primitives_1.xirr)(fluxos);
    const result = {
        tirAnual,
        tirMensal: (0, primitives_1.equivalente)(tirAnual, 1 / 12),
    };
    if (taxaDesconto !== undefined) {
        result.vpl = (0, primitives_1.xnpv)(taxaDesconto, fluxos);
    }
    if (custoCapital !== undefined) {
        result.veredito = tirAnual > custoCapital ? 'Aceitar' : 'Rejeitar';
    }
    return result;
}
//# sourceMappingURL=tirVpl.js.map