/**
 * Cliente HTTP para a API da calculadora.
 */

import axios from 'axios';

const rawUrl = import.meta.env.VITE_API_URL || '';
const baseURL = rawUrl.endsWith('/api') ? rawUrl : (rawUrl ? `${rawUrl}/api` : '/api');

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export interface CalculationMemoryRow {
  date: string;
  indexRate: number;
  dailyFactor: number;
  accumulatedFactor: number;
  balance: number;
  amortizationAmount?: number;
  isProjected: boolean;
  description?: string;
}

export interface CalculationResult {
  initialAmount: number;
  finalAmount: number;
  accumulatedFactor: number;
  variationPercent: number;
  startDate: string;
  endDate: string;
  indexType: string;
  dayCountBasis: number;
  totalAmortized: number;
  memoryRows: CalculationMemoryRow[];
  hasProjections: boolean;
  projectionStartDate?: string;
  warning?: string;
  thesisType?: ThesisType;
  currency?: Currency;
  dcfResult?: DCFResult;
  fullFlowResult?: FullFlowResult;
  gracePeriodInfo?: GracePeriodInfo;
}

export interface CalculationRequest {
  initialAmount: number;
  startDate: string;
  endDate: string;
  indexType: string;
  dayCountBasis: number;
  prefixedRate?: number;
  spread?: {
    mode: 'percentage' | 'additive';
    value: number;
  };
  amortizations?: {
    date: string;
    type: string;
    value: number;
    periodicity?: string;
    periodicEndDate?: string;
    isPeriodicPercentage?: boolean;
  }[];
  futurePremises?: {
    startDate: string;
    endDate: string;
    rate: number;
  }[];
  thesisType?: ThesisType;
  currency?: Currency;
  // T2
  cashFlows?: { id?: string; date: string; amount: number; label?: string }[];
  discountRate?: number;
  referenceDate?: string;
  // T3
  gracePeriod?: { type: GracePeriodType; endDate: string };
  // T4
  amortizationSystem?: AmortizationSystem;
  remunerationRate?: number;
  numberOfPeriods?: number;
  // T5
  interestType?: InterestType;
  interestRate?: number;
}

export type ThesisType = 'CORRECAO_SIMPLES' | 'VALOR_PRESENTE' | 'CORRECAO_COM_CARENCIA' | 'FLUXO_COMPLETO' | 'CORRECAO_COM_JUROS';
export type GracePeriodType = 'A' | 'B' | 'C' | 'D';
export type AmortizationSystem = 'SAC' | 'PRICE' | 'BULLET';
export type Currency = 'BRL' | 'USD' | 'EUR';
export type InterestType = 'SIMPLES' | 'COMPOSTA';

export interface DCFFlowResult {
  date: string;
  nominalAmount: number;
  pv: number;
  discountFactor: number;
  timeFractionYears: number;
  contributionPercent: number;
}

export interface DCFResult {
  referenceDate: string;
  discountRate: number;
  totalPV: number;
  totalNominal: number;
  macaulayDuration: number;
  flows: DCFFlowResult[];
}

export interface FullFlowMemoryRow {
  periodNumber: number;
  date: string;
  openingBalance: number;
  monetaryCorrection: number;
  interest: number;
  amortization: number;
  totalPayment: number;
  closingBalance: number;
  isGracePeriod: boolean;
  description?: string;
}

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

export interface GracePeriodInfo {
  type: GracePeriodType;
  endDate: string;
  deferredInterest: number;
  interestPayments: number;
}

export interface PremisesRequiredResponse {
  error: string;
  premisesRequiredFrom: string;
  lastAvailableRate: number | null;
  lastAvailableDate: string | null;
  message: string;
}

export interface CacheStatusItem {
  indexType: string;
  lastDate: string | null;
  totalRecords: number;
  lastUpdated: string;
}

/** Executa um cálculo de correção financeira */
export async function runCalculation(request: CalculationRequest): Promise<CalculationResult> {
  const { data } = await api.post<CalculationResult>('/calcular', request);
  return data;
}

/** Busca dados históricos de um índice */
export async function getIndexData(
  indexType: string,
  startDate: string,
  endDate: string
): Promise<{ data: { date: string; value: number }[]; warning?: string }> {
  const { data } = await api.get(`/indices/${indexType}`, {
    params: { dataInicial: startDate, dataFinal: endDate },
  });
  return data;
}

/** Busca status do cache de todos os índices */
export async function getCacheStatus(): Promise<CacheStatusItem[]> {
  const { data } = await api.get<CacheStatusItem[]>('/indices/cache/status');
  return data;
}

/** Força atualização de um índice */
export async function refreshIndex(indexType: string): Promise<{ inserted: number; message: string }> {
  const { data } = await api.post(`/indices/${indexType}/refresh`);
  return data;
}

// ── Comparador de Cenários ──────────────────────────────────────────────────

export interface CompareScenarioInput {
  label: string;
  indexType: string;
  dayCountBasis: number;
  prefixedRate?: number;
  spread?: { mode: 'percentage' | 'additive'; value: number; additiveBase?: number };
  futurePremises?: { startDate: string; endDate: string; rate: number }[];
}

export interface CompareScenarioPoint {
  date: string;
  variationPct: number;
  isProjected: boolean;
}

export interface CompareScenarioResult {
  label: string;
  indexType: string;
  finalAmount?: number;
  variationPercent?: number;
  accumulatedFactor?: number;
  hasProjections?: boolean;
  points?: CompareScenarioPoint[];
  warning?: string;
  error?: string;
  premisesRequiredFrom?: string;
  lastAvailableDate?: string;
  lastAvailableRate?: number;
}

export interface CompareRequest {
  initialAmount: number;
  startDate: string;
  endDate: string;
  currency?: string;
  scenarios: CompareScenarioInput[];
}

export interface CompareResult {
  initialAmount: number;
  startDate: string;
  endDate: string;
  currency: string;
  scenarios: CompareScenarioResult[];
}

/** Executa uma comparação de múltiplos cenários */
export async function runComparison(request: CompareRequest): Promise<CompareResult> {
  const { data } = await api.post<CompareResult>('/comparar/cenarios', request);
  return data;
}

// ── Câmbio e Moedas ──────────────────────────────────────────────────────────

export interface ExchangeRateData {
  currency: string;
  count: number;
  data: { date: string; sellValue: number }[];
}

export interface ExchangeSummaryData {
  currency: string;
  periodStart: string;
  periodEnd: string;
  averageRate: number;
  minRate: number;
  minRateDate: string;
  maxRate: number;
  maxRateDate: string;
  crossRateUSD?: number;
}

/** Busca histórico de câmbio */
export async function getExchangeRates(
  currencies: string[],
  startDate: string,
  endDate: string
): Promise<ExchangeRateData[]> {
  const { data } = await api.get<ExchangeRateData[]>('/exchange/rates', {
    params: { currencies: currencies.join(','), startDate, endDate },
  });
  return data;
}

/** Busca sumário do câmbio no período */
export async function getExchangeSummary(
  currencies: string[],
  startDate: string,
  endDate: string
): Promise<ExchangeSummaryData[]> {
  const { data } = await api.get<ExchangeSummaryData[]>('/exchange/summary', {
    params: { currencies: currencies.join(','), startDate, endDate },
  });
  return data;
}

export interface LatestRate {
  currency: string;
  rate: number;
  date: string;
}

/** Busca a cotação mais recente de todas as moedas */
export async function getLatestRates(): Promise<LatestRate[]> {
  const { data } = await api.get<LatestRate[]>('/exchange/latest');
  return data;
}

// ── Mercado e Tickers ────────────────────────────────────────────────────────
export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  type: 'price' | 'yield' | 'index';
}

/** Busca cotações on-line de mercado */
export async function getMarketPulse(): Promise<MarketAsset[]> {
  const { data } = await api.get<MarketAsset[]>('/market/pulse');
  return data;
}

/** Verifica se premissas futuras são necessárias */
export async function checkPremisesRequired(
  indexType: string,
  endDate: string
): Promise<{ needsPremises: boolean; premisesRequiredFrom?: string; lastAvailableDate?: string }> {
  const { data } = await api.get('/calcular/premissas-necessarias', {
    params: { indexType, endDate },
  });
  return data;
}

export default api;
