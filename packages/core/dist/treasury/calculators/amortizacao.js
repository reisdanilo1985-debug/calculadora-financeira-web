"use strict";
/**
 * §2.8 Amortização — Price (parcela constante) & SAC (amortização constante).
 * Função pura. Taxa periódica em fração decimal. Retorna ambas as tabelas + totais.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.amortizacao = amortizacao;
const decimal_js_1 = __importDefault(require("decimal.js"));
const primitives_1 = require("../primitives");
function buildPrice(principal, i, n) {
    const parcelaValor = (0, primitives_1.D)((0, primitives_1.pmt)(i, n, principal));
    const parcelas = [];
    let saldo = (0, primitives_1.D)(principal);
    let totalJuros = (0, primitives_1.D)(0);
    let totalParcelas = (0, primitives_1.D)(0);
    for (let k = 1; k <= n; k++) {
        const juros = saldo.mul(i);
        let amort = parcelaValor.minus(juros);
        let parcela = parcelaValor;
        // Última parcela: zera o saldo residual de arredondamento
        if (k === n) {
            amort = saldo;
            parcela = juros.plus(amort);
        }
        saldo = saldo.minus(amort);
        totalJuros = totalJuros.plus(juros);
        totalParcelas = totalParcelas.plus(parcela);
        parcelas.push({
            periodo: k,
            juros: juros.toNumber(),
            amortizacao: amort.toNumber(),
            parcela: parcela.toNumber(),
            saldo: saldo.toNumber(),
        });
    }
    return {
        parcelas,
        totalJuros: totalJuros.toNumber(),
        totalParcelas: totalParcelas.toNumber(),
        pmt: parcelaValor.toNumber(),
    };
}
function buildSac(principal, i, n) {
    const amort = (0, primitives_1.D)(principal).div(n);
    const parcelas = [];
    let saldo = (0, primitives_1.D)(principal);
    let totalJuros = (0, primitives_1.D)(0);
    let totalParcelas = (0, primitives_1.D)(0);
    for (let k = 1; k <= n; k++) {
        const juros = saldo.mul(i);
        const parcela = amort.plus(juros);
        saldo = saldo.minus(amort);
        if (k === n)
            saldo = new decimal_js_1.default(0); // residual de arredondamento
        totalJuros = totalJuros.plus(juros);
        totalParcelas = totalParcelas.plus(parcela);
        parcelas.push({
            periodo: k,
            juros: juros.toNumber(),
            amortizacao: amort.toNumber(),
            parcela: parcela.toNumber(),
            saldo: saldo.toNumber(),
        });
    }
    return {
        parcelas,
        totalJuros: totalJuros.toNumber(),
        totalParcelas: totalParcelas.toNumber(),
    };
}
function amortizacao(input) {
    const { principal, i, n } = input;
    if (principal <= 0 || n <= 0)
        throw new Error('amortizacao: principal e n devem ser > 0.');
    return {
        price: buildPrice(principal, i, n),
        sac: buildSac(principal, i, n),
    };
}
//# sourceMappingURL=amortizacao.js.map