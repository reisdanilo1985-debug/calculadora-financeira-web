"use strict";
/**
 * §2.2/§2.3 Cross-currency genérico → % do CDI (USD ou EUR + spread).
 *
 * Paridade coberta NO PRAZO, convenção B3 (Manual de Apreçamento de Futuros,
 * eq. 2.1: cupom cambial LINEAR base 360):
 *   fator BRL       = (1 + CDI)^(du/252) ÷ (1 + cupom·dc/360) × (1 + spread·dc/360)
 *   pré equivalente = fator BRL^(252/du) − 1        (anualizado base 252)
 * Sem prazo (du e dc ausentes) vale 252 du / 360 dc, onde linear e composto
 * coincidem: (1 + CDI)/(1 + cupom)·(1 + spread) − 1 — a paridade anual.
 *
 * % do CDI:
 *   pctCdiB3Comp / pctCdiB3Lin → convenção B3 (percentual sobre a taxa DI diária);
 *                                é a régua usada na decisão e nos demais calculadores.
 *   pctCdiComp / pctCdiLin     → razão anual taxa ÷ CDI: APROXIMAÇÃO da planilha,
 *                                mantida por compatibilidade e rotulada em `convencao`.
 *
 * Função pura. Taxas em fração decimal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.crossCcyToCdi = crossCcyToCdi;
exports.cdiToCrossCcy = cdiToCrossCcy;
const primitives_1 = require("../primitives");
/** Prazo informado (du e dc inteiros ≥ 1) ou o ano-base 252 du / 360 dc. */
function resolverPrazo(nome, du, dc) {
    if (du == null && dc == null)
        return { du: 252, dc: 360, informado: false };
    if (du == null || dc == null) {
        throw new Error(`${nome}: informe du e dc do prazo juntos (ou nenhum dos dois).`);
    }
    if (!Number.isInteger(du) || du < 1) {
        throw new Error(`${nome}: du (dias úteis do prazo) deve ser um inteiro maior ou igual a 1; recebido ${du}.`);
    }
    if (!Number.isInteger(dc) || dc < 1) {
        throw new Error(`${nome}: dc (dias corridos do prazo) deve ser um inteiro maior ou igual a 1; recebido ${dc}.`);
    }
    return { du, dc, informado: true };
}
/** Fator linear base 360 no prazo, 1 + taxa·dc/360 — precisa ser positivo. */
function fatorLinear360(nome, rotulo, taxa, dc) {
    const fator = (0, primitives_1.D)(1).plus((0, primitives_1.D)(taxa).mul(dc).div(360));
    if (!fator.gt(0)) {
        throw new Error(`${nome}: 1 + ${rotulo}·dc/360 deve ser positivo (${rotulo} de ${taxa} inválido para ${dc} dc).`);
    }
    return fator;
}
/** (1 + CDI)^(du/252). */
const fatorCdi252 = (cdiAa, du) => (0, primitives_1.D)(1).plus(cdiAa).pow((0, primitives_1.D)(du).div(252));
/** Taxa a.a. base 252 de um fator do prazo: fator^(252/du) − 1. */
const anualiza252 = (fator, du) => fator.pow((0, primitives_1.D)(252).div(du)).minus(1);
const NOTA_PCT_CDI = 'Pct Cdi B3 = % do CDI sobre a taxa DI diária (B3); Pct Cdi Comp/Lin = razão anual taxa ÷ CDI (aproximação).';
function textoPrazo(p, formula) {
    return p.informado
        ? `Prazo ${p.du} du / ${p.dc} dc — ${formula}, anualizado base 252.`
        : 'Sem prazo informado — paridade anual (equivale a 252 du / 360 dc).';
}
/**
 * USD/EUR + spread → equivalente em reais (pré, % do CDI e CDI + spread).
 * Paridade coberta: o custo hedgeado da dívida externa expresso na régua local.
 */
function crossCcyToCdi(input) {
    const { spreadEstrangeiroAa, cdiAa, cupomEstrangeiroAa } = input;
    const nome = 'crossCcyToCdi';
    if (cdiAa <= 0)
        throw new Error(`${nome}: cdiAa deve ser > 0.`);
    const prazo = resolverPrazo(nome, input.du, input.dc);
    const fatorCdi = fatorCdi252(cdiAa, prazo.du);
    const fatorCupom = fatorLinear360(nome, 'cupom', cupomEstrangeiroAa, prazo.dc);
    const fatorSpread = fatorLinear360(nome, 'spread', spreadEstrangeiroAa, prazo.dc);
    const cambioFwdAa = anualiza252(fatorCdi.div(fatorCupom), prazo.du);
    const preEquivComp = anualiza252(fatorCdi.div(fatorCupom).mul(fatorSpread), prazo.du);
    const preEquivLin = cambioFwdAa.plus(spreadEstrangeiroAa);
    return {
        cambioFwdAa: cambioFwdAa.toNumber(),
        preEquivComp: preEquivComp.toNumber(),
        preEquivLin: preEquivLin.toNumber(),
        pctCdiB3Comp: (0, primitives_1.pctCdiB3)(preEquivComp, cdiAa).toNumber(),
        pctCdiB3Lin: (0, primitives_1.pctCdiB3)(preEquivLin, cdiAa).toNumber(),
        pctCdiComp: preEquivComp.div(cdiAa).toNumber(),
        pctCdiLin: preEquivLin.div(cdiAa).toNumber(),
        // "CDI + spread": quanto o custo hedgeado fica acima (ou abaixo) do CDI.
        spreadSobreCdiComp: (0, primitives_1.D)(1).plus(preEquivComp).div((0, primitives_1.D)(1).plus(cdiAa)).minus(1).toNumber(),
        spreadSobreCdiLin: preEquivLin.minus(cdiAa).toNumber(),
        spreadEquilibrio: cupomEstrangeiroAa,
        prazoDu: prazo.du,
        prazoDc: prazo.dc,
        convencao: `${textoPrazo(prazo, 'fator B3 (1+CDI)^(du/252) ÷ (1+cupom·dc/360) × (1+spread·dc/360)')} ${NOTA_PCT_CDI}`,
    };
}
/**
 * CDI + spread (perna local) → spread em USD/EUR equivalente sob hedge completo.
 *
 * Inverte a paridade coberta no prazo. Igualando o fator da perna local,
 * (1 + CDI)^(du/252)·(1 + spreadLocal)^(du/252), ao da perna externa hedgeada,
 * (1 + CDI)^(du/252) ÷ (1 + cupom·dc/360) × (1 + spreadExt·dc/360):
 *   spreadExt = [(1 + spreadLocal)^(du/252)·(1 + cupom·dc/360) − 1]·360/dc
 * No ano-base (252 du / 360 dc) cai em (1 + spreadLocal)·(1 + cupom) − 1.
 * Aproximação linear: spreadExt ≈ spreadLocal + cupom.
 */
function cdiToCrossCcy(input) {
    const { cdiAa, spreadLocalAa, cupomEstrangeiroAa } = input;
    const nome = 'cdiToCrossCcy';
    if (cdiAa <= 0)
        throw new Error(`${nome}: cdiAa deve ser > 0.`);
    if (spreadLocalAa <= -1)
        throw new Error(`${nome}: spreadLocalAa deve ser maior que −100%.`);
    const prazo = resolverPrazo(nome, input.du, input.dc);
    const fatorCdi = fatorCdi252(cdiAa, prazo.du);
    const fatorCupom = fatorLinear360(nome, 'cupom', cupomEstrangeiroAa, prazo.dc);
    const cambioFwdAa = anualiza252(fatorCdi.div(fatorCupom), prazo.du);
    const fatorSpreadLocal = (0, primitives_1.D)(1).plus(spreadLocalAa).pow((0, primitives_1.D)(prazo.du).div(252));
    const spreadEstrangeiroComp = fatorSpreadLocal.mul(fatorCupom).minus(1).mul(360).div(prazo.dc);
    const preEquivComp = (0, primitives_1.D)(1).plus(cdiAa).mul((0, primitives_1.D)(1).plus(spreadLocalAa)).minus(1);
    return {
        cambioFwdAa: cambioFwdAa.toNumber(),
        spreadEstrangeiroComp: spreadEstrangeiroComp.toNumber(),
        spreadEstrangeiroLin: (0, primitives_1.D)(spreadLocalAa).plus(cupomEstrangeiroAa).toNumber(),
        preEquivComp: preEquivComp.toNumber(),
        pctCdiB3Comp: (0, primitives_1.pctCdiB3)(preEquivComp, cdiAa).toNumber(),
        pctCdiComp: preEquivComp.div(cdiAa).toNumber(),
        prazoDu: prazo.du,
        prazoDc: prazo.dc,
        convencao: `${textoPrazo(prazo, '(1+spread·dc/360) = (1+spread local)^(du/252) × (1+cupom·dc/360)')} ${NOTA_PCT_CDI}`,
    };
}
//# sourceMappingURL=crossCcy.js.map