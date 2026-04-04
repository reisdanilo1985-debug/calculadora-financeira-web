"use strict";
/**
 * Motor de cálculo principal — orquestra todos os engines e serviços.
 * Suporta as Teses T1-T5 da Fase 1.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculate = calculate;
exports.getPremisesRequiredFrom = getPremisesRequiredFrom;
const decimal_js_1 = __importDefault(require("decimal.js"));
const types_1 = require("../models/types");
const CDIEngine_1 = require("../engines/CDIEngine");
const MonthlyIndexEngine_1 = require("../engines/MonthlyIndexEngine");
const SOFREngine_1 = require("../engines/SOFREngine");
const PrefixedEngine_1 = require("../engines/PrefixedEngine");
const DCFEngine_1 = require("../engines/DCFEngine");
const FullFlowEngine_1 = require("../engines/FullFlowEngine");
const AmortizationService_1 = require("./AmortizationService");
const GracePeriodService_1 = require("./GracePeriodService");
const InterestService_1 = require("./InterestService");
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
const ENGINE_MAP = {
    [types_1.IndexType.CDI]: CDIEngine_1.calculateCDI,
    [types_1.IndexType.SELIC_META]: CDIEngine_1.calculateCDI,
    [types_1.IndexType.SELIC_OVER]: CDIEngine_1.calculateCDI,
    [types_1.IndexType.IPCA]: MonthlyIndexEngine_1.calculateMonthlyIndex,
    [types_1.IndexType.IGPM]: MonthlyIndexEngine_1.calculateMonthlyIndex,
    [types_1.IndexType.INCC]: MonthlyIndexEngine_1.calculateMonthlyIndex,
    [types_1.IndexType.SOFR]: SOFREngine_1.calculateSOFR,
    [types_1.IndexType.PREFIXADA]: PrefixedEngine_1.calculatePrefixed,
};
function validateInput(input) {
    if (!input.initialAmount || input.initialAmount <= 0) {
        throw new Error('Montante inicial deve ser maior que zero.');
    }
    if (!input.startDate || !input.endDate) {
        throw new Error('Datas de início e fim são obrigatórias.');
    }
    if (input.startDate >= input.endDate) {
        throw new Error('A data de início deve ser anterior à data de fim.');
    }
    if (input.indexType === types_1.IndexType.PREFIXADA && !input.prefixedRate) {
        throw new Error('Taxa pré-fixada é obrigatória para indexador PREFIXADA.');
    }
}
function detectProjections(rows) {
    const firstProjected = rows.find(r => r.isProjected);
    return {
        hasProjections: !!firstProjected,
        projectionStartDate: firstProjected?.date,
    };
}
/** Wrapper para T2 – Valor Presente (DCF) */
function calculateDCFWrapper(input) {
    if (!input.cashFlows?.length) {
        throw new Error('Fluxos de caixa são obrigatórios para Valor Presente.');
    }
    if (!input.discountRate) {
        throw new Error('Taxa de desconto é obrigatória para Valor Presente.');
    }
    const refDate = input.referenceDate
        ? new Date(input.referenceDate)
        : new Date(input.startDate);
    refDate.setHours(0, 0, 0, 0);
    const currency = input.currency ?? types_1.Currency.BRL;
    const dcfResult = (0, DCFEngine_1.calculateDCF)({
        cashFlows: input.cashFlows.map(cf => ({
            ...cf,
            date: new Date(cf.date),
        })),
        discountRate: input.discountRate,
        referenceDate: refDate,
        dayCountBasis: input.dayCountBasis,
        currency,
    });
    // Memória de cálculo para compatibilidade com gráfico/tabela
    const memoryRows = dcfResult.flows.map(f => ({
        date: f.date,
        indexRate: input.discountRate,
        dailyFactor: f.discountFactor,
        accumulatedFactor: f.discountFactor,
        balance: f.pv,
        isProjected: false,
        description: `Nominal: ${f.nominalAmount.toFixed(2)} | VP: ${f.pv.toFixed(2)} | ${(f.contributionPercent).toFixed(1)}%`,
    }));
    const totalNominal = dcfResult.totalNominal;
    return {
        initialAmount: totalNominal,
        finalAmount: dcfResult.totalPV,
        accumulatedFactor: totalNominal > 0 ? dcfResult.totalPV / totalNominal : 0,
        variationPercent: totalNominal > 0 ? (dcfResult.totalPV / totalNominal - 1) * 100 : 0,
        startDate: refDate,
        endDate: input.endDate,
        indexType: input.indexType,
        dayCountBasis: input.dayCountBasis,
        totalAmortized: 0,
        memoryRows,
        hasProjections: false,
        thesisType: types_1.ThesisType.VALOR_PRESENTE,
        currency,
        dcfResult,
    };
}
/** Wrapper para T4 – Fluxo Completo SAC/Price/Bullet */
function calculateFullFlowWrapper(input) {
    if (!input.numberOfPeriods || input.numberOfPeriods <= 0) {
        throw new Error('Número de períodos é obrigatório para Fluxo Completo.');
    }
    if (!input.remunerationRate || input.remunerationRate <= 0) {
        throw new Error('Taxa de remuneração é obrigatória para Fluxo Completo.');
    }
    if (!input.amortizationSystem) {
        throw new Error('Sistema de amortização é obrigatório para Fluxo Completo.');
    }
    const currency = input.currency ?? types_1.Currency.BRL;
    const fullFlowResult = (0, FullFlowEngine_1.calculateFullFlow)({
        principal: input.initialAmount,
        startDate: input.startDate,
        numberOfPeriods: input.numberOfPeriods,
        annualRate: input.remunerationRate,
        amortizationSystem: input.amortizationSystem,
        currency,
        gracePeriod: input.gracePeriod,
    });
    // Converte para memória padrão para compatibilidade com gráfico
    const memoryRows = fullFlowResult.rows.map(row => ({
        date: row.date,
        indexRate: input.remunerationRate,
        dailyFactor: 1,
        accumulatedFactor: 1,
        balance: row.closingBalance,
        amortizationAmount: row.amortization > 0 ? row.amortization : undefined,
        isProjected: false,
        description: row.isGracePeriod
            ? `Carência Tipo ${input.gracePeriod?.type ?? types_1.GracePeriodType.A} — Juros: ${row.interest.toFixed(2)}`
            : `Juros: ${row.interest.toFixed(2)} | Amort: ${row.amortization.toFixed(2)}`,
    }));
    return {
        initialAmount: input.initialAmount,
        finalAmount: fullFlowResult.rows[fullFlowResult.rows.length - 1]?.closingBalance ?? 0,
        accumulatedFactor: 1,
        variationPercent: 0,
        startDate: input.startDate,
        endDate: memoryRows[memoryRows.length - 1]?.date ?? input.endDate,
        indexType: input.indexType,
        dayCountBasis: input.dayCountBasis,
        totalAmortized: fullFlowResult.totalAmortized,
        memoryRows,
        hasProjections: false,
        thesisType: types_1.ThesisType.FLUXO_COMPLETO,
        currency,
        fullFlowResult,
    };
}
/**
 * Executa o cálculo completo, roteando pela tese selecionada.
 */
function calculate(input) {
    const thesis = input.thesisType ?? types_1.ThesisType.CORRECAO_SIMPLES;
    // T2 – Valor Presente
    if (thesis === types_1.ThesisType.VALOR_PRESENTE) {
        return calculateDCFWrapper(input);
    }
    // T4 – Fluxo Completo
    if (thesis === types_1.ThesisType.FLUXO_COMPLETO) {
        return calculateFullFlowWrapper(input);
    }
    // T1, T3, T5 – baseados em indexadores de mercado
    validateInput(input);
    const engine = ENGINE_MAP[input.indexType];
    if (!engine) {
        throw new Error(`Indexador não suportado: ${input.indexType}`);
    }
    let rows = engine(input);
    if (rows.length === 0) {
        throw new Error('Nenhum dado de índice disponível para o período informado.');
    }
    // T5 – aplica juros remuneratórios (simples ou compostos) sobre a correção
    if (thesis === types_1.ThesisType.CORRECAO_COM_JUROS && input.interestRate && input.interestRate > 0) {
        const interestType = input.interestType ?? types_1.InterestType.COMPOSTA;
        rows = (0, InterestService_1.applyInterest)(rows, input.initialAmount, input.interestRate, interestType, input.startDate, input.dayCountBasis);
    }
    // T3 – aplica carência
    let gracePeriodInfo = undefined;
    if (thesis === types_1.ThesisType.CORRECAO_COM_CARENCIA && input.gracePeriod) {
        const gpResult = (0, GracePeriodService_1.applyGracePeriod)(rows, input.initialAmount, input.gracePeriod);
        rows = gpResult.rows;
        gracePeriodInfo = {
            type: input.gracePeriod.type,
            endDate: input.gracePeriod.endDate,
            deferredInterest: gpResult.deferredInterest,
            interestPayments: gpResult.interestPayments,
        };
    }
    // Aplica amortizações
    if (input.amortizations && input.amortizations.length > 0) {
        const expandedAmorts = (0, AmortizationService_1.expandPeriodicAmortizations)(input.amortizations);
        rows = (0, AmortizationService_1.applyAmortizations)(rows, expandedAmorts);
    }
    const lastRow = rows[rows.length - 1];
    const finalAmount = new decimal_js_1.default(lastRow.balance);
    const initialAmount = new decimal_js_1.default(input.initialAmount);
    const accumulatedFactor = new decimal_js_1.default(lastRow.accumulatedFactor);
    const variationPercent = accumulatedFactor.minus(1).mul(100);
    const { hasProjections, projectionStartDate } = detectProjections(rows);
    const totalAmortized = (0, AmortizationService_1.calcTotalAmortized)(rows);
    return {
        initialAmount: input.initialAmount,
        finalAmount: finalAmount.toNumber(),
        accumulatedFactor: accumulatedFactor.toNumber(),
        variationPercent: variationPercent.toNumber(),
        startDate: input.startDate,
        endDate: input.endDate,
        indexType: input.indexType,
        dayCountBasis: input.dayCountBasis,
        totalAmortized,
        memoryRows: rows,
        hasProjections,
        projectionStartDate,
        thesisType: thesis,
        currency: input.currency ?? types_1.Currency.BRL,
        gracePeriodInfo,
    };
}
function getPremisesRequiredFrom(endDate, indexData) {
    if (!indexData.length)
        return new Date();
    const lastDataDate = indexData.reduce((max, d) => (d.date > max ? d.date : max), indexData[0].date);
    // endDate é exclusiva nos cálculos (getBusinessDaysBetween e buildMonthSegments
    // iteram `while (current < endDate)`), portanto o último dia efetivamente
    // calculado é endDate - 1. Premissas só são necessárias se (endDate - 1) > lastDataDate.
    const lastNeededDate = new Date(endDate);
    lastNeededDate.setDate(lastNeededDate.getDate() - 1);
    if (lastNeededDate <= lastDataDate)
        return null;
    const nextDay = new Date(lastDataDate);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay;
}
//# sourceMappingURL=CalculationEngine.js.map