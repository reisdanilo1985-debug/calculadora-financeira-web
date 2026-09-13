"use strict";
/**
 * Motor de cálculo WACC — Metodologia Damodaran (NYU Stern)
 *
 * Custo Médio Ponderado de Capital (WACC / CMPC)
 *
 * Fórmulas:
 *   β Alavancado   = β_desl × (1 + (1 - T) × D/E)
 *   Ke             = Rf + β_alav × ERP + CRP + SP
 *   Kd_after_tax   = Kd × (1 - T)
 *   WACC           = Ke × (E/V) + Kd_after_tax × (D/V)
 *
 * Onde:
 *   Rf  = Taxa livre de risco (Risk-Free Rate)
 *   β   = Beta do setor (desalavancado por Damodaran)
 *   ERP = Equity Risk Premium (prêmio pelo risco de mercado)
 *   CRP = Country Risk Premium (prêmio de risco-país)
 *   SP  = Size Premium (prêmio de tamanho, opcional)
 *   T   = Alíquota de IR efetiva
 *   D   = Dívida (valor de mercado)
 *   E   = Equity / Market Cap (valor de mercado)
 *   V   = D + E (valor total da firma)
 *   Kd  = Custo da dívida pré-imposto
 *
 * Moeda e regime: Rf, ERP, CRP e Kd devem estar na MESMA moeda e no MESMO regime (nominal/real).
 * Para levar uma taxa de uma moeda a outra use `ajustarTaxaPorDiferencialInflacao` (Fisher).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ajustarTaxaPorDiferencialInflacao = ajustarTaxaPorDiferencialInflacao;
exports.taxaRealDeNominal = taxaRealDeNominal;
exports.calcularSensibilidadeWACC = calcularSensibilidadeWACC;
exports.calcularWACC = calcularWACC;
const decimal_js_1 = __importDefault(require("decimal.js"));
/**
 * Converte uma taxa de uma moeda/regime para outra pelo diferencial de inflação (paridade de Fisher):
 *   (1 + taxa_destino) = (1 + taxa_origem) × (1 + π_destino) / (1 + π_origem)
 * Todas as taxas em % a.a. Ex.: Rf USD 3,95% com π USD 2% e π BRL 3% → Rf BRL 4,9691%.
 * Com π_destino = 0 obtém-se a taxa real da moeda de origem.
 */
function ajustarTaxaPorDiferencialInflacao(taxaPct, inflacaoOrigemPct, inflacaoDestinoPct) {
    const um = new decimal_js_1.default(1);
    return um.plus(new decimal_js_1.default(taxaPct).div(100))
        .mul(um.plus(new decimal_js_1.default(inflacaoDestinoPct).div(100)))
        .div(um.plus(new decimal_js_1.default(inflacaoOrigemPct).div(100)))
        .minus(1)
        .mul(100)
        .toNumber();
}
/** Taxa real (% a.a.) a partir da nominal e da inflação da mesma moeda: (1 + n)/(1 + π) − 1. */
function taxaRealDeNominal(taxaNominalPct, inflacaoPct) {
    return ajustarTaxaPorDiferencialInflacao(taxaNominalPct, inflacaoPct, 0);
}
function nucleoWACC(input) {
    const { taxaLivreDeRisco: Rf, premioRiscoMercado: ERP, betaDesalavancado: betaDesl, premioRiscoPais: CRP, premioTamanho: SP = 0, marketCap: E, dividaBruta: D, aliquotaIR: T_pct, custoDividaPreTax: Kd_pre, } = input;
    // Normalizar alíquota (34% → 0.34)
    const T = T_pct / 100;
    // 1. Estrutura de Capital (Market Values)
    const V = E + D;
    const we = E / V; // Peso do Equity
    const wd = D / V; // Peso da Dívida
    // 2. Re-alavancagem do Beta (Fórmula de Hamada)
    // Considera o efeito da alavancagem financeira no risco sistemático
    const betaAlav = D > 0
        ? betaDesl * (1 + (1 - T) * (D / E))
        : betaDesl; // Sem dívida: beta alavancado = desalavancado
    // 3. Custo do Equity (Ke) — CAPM com prêmios Damodaran
    const Ke = (Rf + betaAlav * ERP + CRP + SP) / 100; // normalizado para decimal
    // 4. Custo da Dívida After-Tax (Kd)
    const Kd = (Kd_pre / 100) * (1 - T);
    // 5. WACC
    const wacc = Ke * we + Kd * wd;
    return { V, we, wd, betaAlav, Ke, Kd, wacc };
}
/**
 * Sensibilidade do WACC a choques isolados (demais premissas constantes), recalculada pelo motor:
 *   - Rf, ERP, Kd antes do IR e IR: +1 p.p.;
 *   - β: +10% (equivale a +10% no β alavancado, pois Hamada é linear em β desalavancado);
 *   - IR +1 p.p. inclui a realavancagem do β (decomposto em efeito via Kd e via β);
 *   - D/E: +10% (relativo), mantendo V = E + D constante e Kd inalterado.
 * Resultados em pontos percentuais do WACC.
 */
function calcularSensibilidadeWACC(input) {
    const base = nucleoWACC(input);
    const baseFinita = Number.isFinite(base.wacc);
    const delta = (n) => (baseFinita && Number.isFinite(n.wacc) ? (n.wacc - base.wacc) * 100 : null);
    const chocado = (n) => (baseFinita && Number.isFinite(n.wacc) ? n.wacc * 100 : null);
    const item = (id, premissa, choque, descricao, n) => ({ id, premissa, choque, waccChocado: chocado(n), deltaWaccPP: delta(n), descricao });
    const rf = nucleoWACC({ ...input, taxaLivreDeRisco: input.taxaLivreDeRisco + 1 });
    const erp = nucleoWACC({ ...input, premioRiscoMercado: input.premioRiscoMercado + 1 });
    const beta = nucleoWACC({ ...input, betaDesalavancado: input.betaDesalavancado * 1.1 });
    const kd = nucleoWACC({ ...input, custoDividaPreTax: input.custoDividaPreTax + 1 });
    const ir = nucleoWACC({ ...input, aliquotaIR: input.aliquotaIR + 1 });
    // D/E +10% com V constante
    const V = input.marketCap + input.dividaBruta;
    const deChocado = (input.dividaBruta / input.marketCap) * 1.1;
    const eChocado = V / (1 + deChocado);
    const de = nucleoWACC({ ...input, marketCap: eChocado, dividaBruta: V - eChocado });
    const itemIR = item('ir', 'Alíquota de IR', '+1 p.p.', 'Reduz o Kd após IR e realavanca o β (Hamada) com a nova alíquota.', ir);
    const deltaIR = itemIR.deltaWaccPP;
    if (deltaIR !== null) {
        // Efeito via Kd: Wd × ΔKd_após_IR; o restante vem da realavancagem do β (Ke × We)
        const viaCustoDivida = base.wd * (ir.Kd - base.Kd) * 100;
        itemIR.decomposicao = { viaCustoDivida, viaBeta: deltaIR - viaCustoDivida };
    }
    return [
        item('rf', 'Taxa livre de risco (Rf)', '+1 p.p.', 'Ke sobe 1 p.p.; efeito no WACC = We × 1 p.p.', rf),
        item('beta', 'Beta (β)', '+10%', 'β desalavancado × 1,10 (β alavancado sobe 10%); efeito = We × 0,1 × β_alav × ERP.', beta),
        item('erp', 'Prêmio de risco de mercado (ERP)', '+1 p.p.', 'Ke sobe β_alav × 1 p.p.; efeito = We × β_alav × 1 p.p.', erp),
        item('kd', 'Custo da dívida antes do IR (Kd)', '+1 p.p.', 'Kd após IR sobe (1 − T) × 1 p.p.; efeito = Wd × (1 − T) × 1 p.p.', kd),
        itemIR,
        item('de', 'Alavancagem (D/E)', '+10%', 'D/E × 1,10 com V = E + D constante e Kd inalterado; realavanca o β e muda os pesos.', de),
    ];
}
/**
 * Calcula o WACC seguindo a metodologia Damodaran.
 * Função pura — sem I/O, ideal para testes unitários.
 */
function calcularWACC(input) {
    const { taxaLivreDeRisco: Rf, premioRiscoMercado: ERP, betaDesalavancado: betaDesl, premioRiscoPais: CRP, premioTamanho: SP = 0, marketCap: E, dividaBruta: D, aliquotaIR: T_pct, custoDividaPreTax: Kd_pre, } = input;
    // 1. Estrutura de Capital (Market Values)
    const V = E + D;
    if (V <= 0)
        throw new Error('O valor total da firma (Equity + Dívida) deve ser positivo.');
    // 2–5. Pesos, β realavancado (Hamada), Ke, Kd após IR e WACC
    const { we, wd, betaAlav, Ke, Kd, wacc } = nucleoWACC(input);
    // Memorial de cálculo
    const fmt = (v, casas = 2) => v.toFixed(casas).replace('.', ',');
    const fmtPct = (v) => `${fmt(v * 100)}%`;
    const memorial = [
        {
            titulo: 'Estrutura de Capital',
            formula: 'V = E + D',
            formulaComValores: `V = ${E.toLocaleString('pt-BR')} + ${D.toLocaleString('pt-BR')}`,
            resultado: V,
            unidade: input.moeda,
            descricao: 'Valor total da firma = Equity (Market Cap) + Dívida Bruta',
        },
        {
            titulo: 'Peso do Equity (We)',
            formula: 'We = E ÷ V',
            formulaComValores: `We = ${E.toLocaleString('pt-BR')} ÷ ${V.toLocaleString('pt-BR')}`,
            resultado: we * 100,
            unidade: '%',
            descricao: 'Proporção do equity no financiamento total da firma (valores de mercado)',
        },
        {
            titulo: 'Peso da Dívida (Wd)',
            formula: 'Wd = D ÷ V',
            formulaComValores: `Wd = ${D.toLocaleString('pt-BR')} ÷ ${V.toLocaleString('pt-BR')}`,
            resultado: wd * 100,
            unidade: '%',
            descricao: 'Proporção da dívida no financiamento total da firma (valores de mercado)',
        },
        {
            titulo: 'Beta Alavancado (β)',
            formula: 'β_alav = β_desl × (1 + (1 − T) × D/E)',
            formulaComValores: D > 0
                ? `β_alav = ${fmt(betaDesl, 4)} × (1 + (1 − ${fmt(T_pct)}%) × ${fmt(D / E, 4)})`
                : `β_alav = ${fmt(betaDesl, 4)} (sem alavancagem financeira)`,
            resultado: betaAlav,
            unidade: '',
            descricao: 'Fórmula de Hamada — incorpora o risco financeiro (dívida) ao beta setorial',
        },
        {
            titulo: 'Custo do Capital Próprio (Ke)',
            formula: 'Ke = Rf + β × ERP + CRP + SP',
            formulaComValores: `Ke = ${fmt(Rf)}% + ${fmt(betaAlav, 4)} × ${fmt(ERP)}% + ${fmt(CRP)}% + ${fmt(SP)}%`,
            resultado: Ke * 100,
            unidade: '% a.a.',
            descricao: 'CAPM com ajustes Damodaran: prêmio de risco-país (CRP) e prêmio de tamanho (SP)',
        },
        {
            titulo: 'Custo da Dívida After-Tax (Kd)',
            formula: 'Kd = Kd_bruto × (1 − T)',
            formulaComValores: `Kd = ${fmt(Kd_pre)}% × (1 − ${fmt(T_pct)}%)`,
            resultado: Kd * 100,
            unidade: '% a.a.',
            descricao: 'Custo efetivo da dívida após o benefício fiscal do pagamento de juros (tax shield)',
        },
        {
            titulo: 'WACC — Custo Médio Ponderado de Capital',
            formula: 'WACC = Ke × We + Kd × Wd',
            formulaComValores: `WACC = ${fmtPct(Ke)} × ${fmt(we * 100)}% + ${fmtPct(Kd)} × ${fmt(wd * 100)}%`,
            resultado: wacc * 100,
            unidade: '% a.a.',
            descricao: 'Taxa mínima de atratividade da firma — remunera equity e credores proporcionalmente',
        },
    ];
    return {
        valorTotalFirma: V,
        pesoEquity: we * 100,
        pesoDivida: wd * 100,
        betaAlavancado: betaAlav,
        custoEquity: Ke * 100,
        custoDividaAfterTax: Kd * 100,
        wacc: wacc * 100,
        sensibilidade: calcularSensibilidadeWACC(input),
        memorial,
    };
}
//# sourceMappingURL=WaccEngine.js.map