"use strict";
/**
 * §2.7 TIR / VPL para fluxos irregulares (datados). Função pura.
 * Reaproveita os solvers xirr/xnpv das primitivas.
 *
 * TIR múltipla: com mais de uma troca de sinal no fluxo (regra de Descartes)
 * pode haver mais de uma TIR, e a raiz devolvida depende do chute do solver.
 * Nesse caso o resultado traz `alertaTirMultipla` e o veredito passa a ser
 * decidido pelo VPL ao custo de capital (VPL > 0 → Aceitar), nunca pela TIR.
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
    const trocas = (0, primitives_1.trocasDeSinal)(fluxos);
    const tirMultipla = trocas > 1;
    const result = {
        tirAnual,
        tirMensal: (0, primitives_1.equivalente)(tirAnual, 1 / 12),
        trocasDeSinal: trocas,
    };
    if (taxaDesconto !== undefined) {
        result.vpl = (0, primitives_1.xnpv)(taxaDesconto, fluxos);
    }
    if (tirMultipla) {
        result.alertaTirMultipla =
            `TIR múltipla: o fluxo troca de sinal ${trocas} vezes, então pode haver até ${trocas} TIRs ` +
                'e a TIR exibida é só uma delas (depende do chute do solver). Decida pelo VPL ao custo de capital.';
    }
    if (custoCapital !== undefined) {
        if (tirMultipla) {
            const vplCusto = (0, primitives_1.xnpv)(custoCapital, fluxos);
            result.vplCustoCapital = vplCusto;
            result.veredito = vplCusto > 0 ? 'Aceitar' : 'Rejeitar';
            result.criterioVeredito = 'VPL';
        }
        else {
            result.veredito = tirAnual > custoCapital ? 'Aceitar' : 'Rejeitar';
            result.criterioVeredito = 'TIR';
        }
    }
    return result;
}
//# sourceMappingURL=tirVpl.js.map