/**
 * Tipos e interfaces centrais da Calculadora de Correção Financeira.
 * Todas as funções do motor de cálculo operam sobre estes tipos.
 */
/** Indexadores suportados pela calculadora */
export declare enum IndexType {
    CDI = "CDI",
    SELIC_META = "SELIC_META",
    SELIC_OVER = "SELIC_OVER",
    IPCA = "IPCA",
    IGPM = "IGPM",
    INCC = "INCC",
    SOFR = "SOFR",
    PREFIXADA = "PREFIXADA"
}
/** Base de cálculo para juros */
export declare enum DayCountBasis {
    /** 252 dias úteis — padrão para CDI e Selic */
    DU252 = 252,
    /** 360 dias corridos — padrão para SOFR e alguns pré-fixados */
    DC360 = 360,
    /** 365 dias corridos — padrão para IPCA, IGP-M, INCC */
    DC365 = 365
}
/** Um ponto de dado de índice (taxa ou variação em um dado dia/mês) */
export interface IndexDataPoint {
    /** Data de referência do índice */
    date: Date;
    /**
     * Valor do índice:
     * - Para CDI/Selic: taxa anual em % (ex: 10.65 para 10,65% a.a.)
     * - Para IPCA/IGP-M/INCC: variação mensal em % (ex: 0.52 para 0,52%)
     * - Para SOFR: taxa anual em % (ex: 5.30 para 5,30% a.a.)
     * - Para pré-fixada: não usado (usuário informa diretamente)
     */
    value: number;
    /** Indica se este ponto é uma premissa futura (não dado oficial) */
    isProjected?: boolean;
}
/** Tipo de amortização */
export declare enum AmortizationType {
    /** Valor absoluto fixo a ser amortizado na data */
    FIXED = "FIXED",
    /** Percentual do saldo devedor na data de amortização */
    PERCENTAGE = "PERCENTAGE",
    /** Amortizações recorrentes (gera cronograma automático) */
    PERIODIC = "PERIODIC"
}
/** Periodicidade para amortizações periódicas */
export declare enum PeriodicityType {
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    SEMIANNUAL = "SEMIANNUAL",
    ANNUAL = "ANNUAL"
}
/** Uma entrada de amortização */
export interface AmortizationEntry {
    /** Data da amortização */
    date: Date;
    /** Tipo da amortização */
    type: AmortizationType;
    /**
     * Valor da amortização:
     * - FIXED: valor em R$ (ou moeda da operação)
     * - PERCENTAGE: percentual em % (ex: 10 para 10%)
     * - PERIODIC: valor por parcela (fixo) ou percentual (se percentualPeriodico=true)
     */
    value: number;
    /** Periodicidade (obrigatório para tipo PERIODIC) */
    periodicity?: PeriodicityType;
    /** Data final das amortizações periódicas */
    periodicEndDate?: Date;
    /** Se true, o valor da amortização periódica é percentual do saldo */
    isPeriodicPercentage?: boolean;
}
/** Spread/composição aplicado ao indexador */
export interface SpreadConfig {
    /**
     * Modo de aplicação do spread:
     * - 'percentage': percentual do indexador (ex: 110% do CDI → percentageOfIndex=110)
     * - 'additive': indexador + taxa adicional (ex: IPCA + 6% a.a.)
     */
    mode: 'percentage' | 'additive';
    /**
     * Valor do spread:
     * - Para mode='percentage': percentual (ex: 110 para 110% do CDI)
     * - Para mode='additive': taxa anual adicional em % (ex: 6 para 6% a.a.)
     */
    value: number;
    /**
     * Base da taxa adicional (apenas para mode='additive'):
     * - Padrão: DayCountBasis.DC365
     */
    additiveBase?: DayCountBasis;
}
/** Premissa futura para um período sem dados oficiais */
export interface FuturePremise {
    /** Data de início do período de premissa (inclusive) */
    startDate: Date;
    /** Data de fim do período de premissa (inclusive) */
    endDate: Date;
    /**
     * Taxa projetada:
     * - Para CDI/Selic/Pré-fixada: taxa anual em %
     * - Para IPCA/IGP-M/INCC: variação mensal em %
     * - Para SOFR: taxa anual em %
     */
    rate: number;
}
/** Input completo para o motor de cálculo */
export interface CalculationInput {
    /** Montante inicial a ser corrigido */
    initialAmount: number;
    /** Data de início da correção */
    startDate: Date;
    /** Data de fim da correção */
    endDate: Date;
    /** Indexador de correção */
    indexType: IndexType;
    /** Base de cálculo */
    dayCountBasis: DayCountBasis;
    /** Configuração de spread/composição (opcional) */
    spread?: SpreadConfig;
    /** Lista de amortizações (opcional) */
    amortizations?: AmortizationEntry[];
    /**
     * Dados históricos do índice — fornecidos pelo serviço de dados,
     * não pelo usuário diretamente
     */
    indexData?: IndexDataPoint[];
    /** Premissas futuras para período além dos dados disponíveis */
    futurePremises?: FuturePremise[];
    /**
     * Taxa anual para indexador pré-fixado (em %).
     * Obrigatório quando indexType === IndexType.PREFIXADA.
     */
    prefixedRate?: number;
    /** Tese de cálculo (default: CORRECAO_SIMPLES) */
    thesisType?: ThesisType;
    /** Configuração de carência (T3) */
    gracePeriod?: GracePeriodConfig;
    /** Tipo de capitalização (T5) */
    interestType?: InterestType;
    /** Taxa de juros remuneratórios anual em % (T5) */
    interestRate?: number;
    /** Moeda */
    currency?: Currency;
    /** Fluxos de caixa para DCF (T2) */
    cashFlows?: DCFCashFlow[];
    /** Taxa de desconto anual em % para DCF (T2) */
    discountRate?: number;
    /** Data de referência para DCF (T2) — default: startDate */
    referenceDate?: Date;
    /** Sistema de amortização para Fluxo Completo (T4) */
    amortizationSystem?: AmortizationSystem;
    /** Taxa de remuneração anual em % para Fluxo Completo (T4) */
    remunerationRate?: number;
    /** Número de períodos mensais para Fluxo Completo (T4) */
    numberOfPeriods?: number;
}
/** Uma linha da memória de cálculo */
export interface CalculationMemoryRow {
    /** Data da linha */
    date: Date;
    /** Taxa do dia/mês (em %, conforme indexador) */
    indexRate: number;
    /** Fator diário ou mensal (ex: 1.000432) */
    dailyFactor: number;
    /** Fator acumulado até esta data (ex: 1.12543) */
    accumulatedFactor: number;
    /** Saldo após correção e eventual amortização */
    balance: number;
    /** Valor amortizado nesta data (se houver) */
    amortizationAmount?: number;
    /** Se este dado é uma premissa futura */
    isProjected: boolean;
    /** Descrição adicional (ex: "Amortização de 10%") */
    description?: string;
}
/** Resultado completo do cálculo */
export interface CalculationResult {
    /** Montante inicial */
    initialAmount: number;
    /** Valor corrigido final */
    finalAmount: number;
    /** Fator de correção acumulado total */
    accumulatedFactor: number;
    /** Variação percentual total (%) */
    variationPercent: number;
    /** Data inicial */
    startDate: Date;
    /** Data final */
    endDate: Date;
    /** Indexador utilizado */
    indexType: IndexType;
    /** Base de cálculo utilizada */
    dayCountBasis: DayCountBasis;
    /** Total amortizado no período */
    totalAmortized: number;
    /** Memória de cálculo detalhada (linha por linha) */
    memoryRows: CalculationMemoryRow[];
    /** Se o resultado contém projeções (premissas futuras) */
    hasProjections: boolean;
    /** Data a partir da qual começam as projeções */
    projectionStartDate?: Date;
    /** Tese utilizada */
    thesisType?: ThesisType;
    /** Moeda */
    currency?: Currency;
    /** Resultado DCF (apenas para T2) */
    dcfResult?: DCFResult;
    /** Resultado Fluxo Completo (apenas para T4) */
    fullFlowResult?: FullFlowResult;
    /** Informações de carência (apenas para T3) */
    gracePeriodInfo?: GracePeriodInfo;
}
/** Metadados sobre os dados em cache de um índice */
export interface IndexCacheInfo {
    indexType: IndexType;
    lastDate: Date;
    totalRecords: number;
    lastUpdated: Date;
}
/** Tipo de tese de cálculo (Fase 1) */
export declare enum ThesisType {
    CORRECAO_SIMPLES = "CORRECAO_SIMPLES",
    VALOR_PRESENTE = "VALOR_PRESENTE",
    CORRECAO_COM_CARENCIA = "CORRECAO_COM_CARENCIA",
    FLUXO_COMPLETO = "FLUXO_COMPLETO",
    CORRECAO_COM_JUROS = "CORRECAO_COM_JUROS"
}
/** Tipo de carência */
export declare enum GracePeriodType {
    /** Juros capitalizam ao saldo (anatocismo) */
    A = "A",
    /** Saldo congelado, juros diferidos */
    B = "B",
    /** Juros pagos durante carência, principal preservado */
    C = "C",
    /** Customizado (= Tipo A na Fase 1) */
    D = "D"
}
/** Configuração de carência */
export interface GracePeriodConfig {
    type: GracePeriodType;
    /** Data de término da carência */
    endDate: Date;
}
/** Sistema de amortização */
export declare enum AmortizationSystem {
    SAC = "SAC",
    PRICE = "PRICE",
    BULLET = "BULLET"
}
/** Tipo de capitalização dos juros */
export declare enum InterestType {
    SIMPLES = "SIMPLES",
    COMPOSTA = "COMPOSTA"
}
/** Moeda */
export declare enum Currency {
    BRL = "BRL",
    USD = "USD",
    EUR = "EUR",
    GBP = "GBP",
    JPY = "JPY",
    CHF = "CHF",
    CNY = "CNY"
}
/** Representa um ponto de dado histórico de câmbio */
export interface ExchangeRatePoint {
    date: Date;
    /** Valor de fechamento para Venda (Sell Rate) em relação ao BRL (R$) */
    buyValue?: number;
    sellValue: number;
}
/** Métricas sumarizadas de um período para uma moeda */
export interface ExchangeSummaryMetrics {
    currency: Currency;
    periodStart: Date;
    periodEnd: Date;
    averageRate: number;
    minRate: number;
    minRateDate: Date;
    maxRate: number;
    maxRateDate: Date;
    /** Taxa cruzada média em relação ao Dólar (USD) no período */
    crossRateUSD?: number;
}
/** Fluxo de caixa para Valor Presente (T2) */
export interface DCFCashFlow {
    id?: string;
    /** Data do fluxo */
    date: Date;
    /** Valor nominal do fluxo */
    amount: number;
    /** Descrição opcional */
    label?: string;
}
/** Resultado de um fluxo individual no DCF */
export interface DCFFlowResult {
    date: Date;
    nominalAmount: number;
    pv: number;
    discountFactor: number;
    timeFractionYears: number;
    contributionPercent: number;
}
/** Resultado completo de Valor Presente (T2) */
export interface DCFResult {
    referenceDate: Date;
    discountRate: number;
    dayCountBasis: DayCountBasis;
    currency: Currency;
    totalPV: number;
    totalNominal: number;
    macaulayDuration: number;
    flows: DCFFlowResult[];
}
/** Linha da memória de cálculo para Fluxo Completo (T4) */
export interface FullFlowMemoryRow {
    periodNumber: number;
    date: Date;
    openingBalance: number;
    monetaryCorrection: number;
    interest: number;
    amortization: number;
    totalPayment: number;
    closingBalance: number;
    isGracePeriod: boolean;
    isProjected?: boolean;
    description?: string;
}
/** Resultado completo de Fluxo Completo (T4) */
export interface FullFlowResult {
    principal: number;
    annualRate: number;
    amortizationSystem: AmortizationSystem;
    currency: Currency;
    totalInterest: number;
    totalMonetaryCorrection: number;
    totalPayments: number;
    totalAmortized: number;
    rows: FullFlowMemoryRow[];
}
/** Informações de carência no resultado */
export interface GracePeriodInfo {
    type: GracePeriodType;
    endDate: Date;
    deferredInterest: number;
    interestPayments: number;
}
//# sourceMappingURL=types.d.ts.map