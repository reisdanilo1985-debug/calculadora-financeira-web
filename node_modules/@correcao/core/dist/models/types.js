"use strict";
/**
 * Tipos e interfaces centrais da Calculadora de Correção Financeira.
 * Todas as funções do motor de cálculo operam sobre estes tipos.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Currency = exports.InterestType = exports.AmortizationSystem = exports.GracePeriodType = exports.ThesisType = exports.PeriodicityType = exports.AmortizationType = exports.DayCountBasis = exports.IndexType = void 0;
/** Indexadores suportados pela calculadora */
var IndexType;
(function (IndexType) {
    IndexType["CDI"] = "CDI";
    IndexType["SELIC_META"] = "SELIC_META";
    IndexType["SELIC_OVER"] = "SELIC_OVER";
    IndexType["IPCA"] = "IPCA";
    IndexType["IGPM"] = "IGPM";
    IndexType["INCC"] = "INCC";
    IndexType["SOFR"] = "SOFR";
    IndexType["PREFIXADA"] = "PREFIXADA";
})(IndexType || (exports.IndexType = IndexType = {}));
/** Base de cálculo para juros */
var DayCountBasis;
(function (DayCountBasis) {
    /** 252 dias úteis — padrão para CDI e Selic */
    DayCountBasis[DayCountBasis["DU252"] = 252] = "DU252";
    /** 360 dias corridos — padrão para SOFR e alguns pré-fixados */
    DayCountBasis[DayCountBasis["DC360"] = 360] = "DC360";
    /** 365 dias corridos — padrão para IPCA, IGP-M, INCC */
    DayCountBasis[DayCountBasis["DC365"] = 365] = "DC365";
})(DayCountBasis || (exports.DayCountBasis = DayCountBasis = {}));
/** Tipo de amortização */
var AmortizationType;
(function (AmortizationType) {
    /** Valor absoluto fixo a ser amortizado na data */
    AmortizationType["FIXED"] = "FIXED";
    /** Percentual do saldo devedor na data de amortização */
    AmortizationType["PERCENTAGE"] = "PERCENTAGE";
    /** Amortizações recorrentes (gera cronograma automático) */
    AmortizationType["PERIODIC"] = "PERIODIC";
})(AmortizationType || (exports.AmortizationType = AmortizationType = {}));
/** Periodicidade para amortizações periódicas */
var PeriodicityType;
(function (PeriodicityType) {
    PeriodicityType["MONTHLY"] = "MONTHLY";
    PeriodicityType["QUARTERLY"] = "QUARTERLY";
    PeriodicityType["SEMIANNUAL"] = "SEMIANNUAL";
    PeriodicityType["ANNUAL"] = "ANNUAL";
})(PeriodicityType || (exports.PeriodicityType = PeriodicityType = {}));
/** Tipo de tese de cálculo (Fase 1) */
var ThesisType;
(function (ThesisType) {
    ThesisType["CORRECAO_SIMPLES"] = "CORRECAO_SIMPLES";
    ThesisType["VALOR_PRESENTE"] = "VALOR_PRESENTE";
    ThesisType["CORRECAO_COM_CARENCIA"] = "CORRECAO_COM_CARENCIA";
    ThesisType["FLUXO_COMPLETO"] = "FLUXO_COMPLETO";
    ThesisType["CORRECAO_COM_JUROS"] = "CORRECAO_COM_JUROS";
})(ThesisType || (exports.ThesisType = ThesisType = {}));
/** Tipo de carência */
var GracePeriodType;
(function (GracePeriodType) {
    /** Juros capitalizam ao saldo (anatocismo) */
    GracePeriodType["A"] = "A";
    /** Saldo congelado, juros diferidos */
    GracePeriodType["B"] = "B";
    /** Juros pagos durante carência, principal preservado */
    GracePeriodType["C"] = "C";
    /** Customizado (= Tipo A na Fase 1) */
    GracePeriodType["D"] = "D";
})(GracePeriodType || (exports.GracePeriodType = GracePeriodType = {}));
/** Sistema de amortização */
var AmortizationSystem;
(function (AmortizationSystem) {
    AmortizationSystem["SAC"] = "SAC";
    AmortizationSystem["PRICE"] = "PRICE";
    AmortizationSystem["BULLET"] = "BULLET";
})(AmortizationSystem || (exports.AmortizationSystem = AmortizationSystem = {}));
/** Tipo de capitalização dos juros */
var InterestType;
(function (InterestType) {
    InterestType["SIMPLES"] = "SIMPLES";
    InterestType["COMPOSTA"] = "COMPOSTA";
})(InterestType || (exports.InterestType = InterestType = {}));
/** Moeda */
var Currency;
(function (Currency) {
    Currency["BRL"] = "BRL";
    Currency["USD"] = "USD";
    Currency["EUR"] = "EUR";
    Currency["GBP"] = "GBP";
    Currency["JPY"] = "JPY";
    Currency["CHF"] = "CHF";
    Currency["CNY"] = "CNY";
})(Currency || (exports.Currency = Currency = {}));
//# sourceMappingURL=types.js.map