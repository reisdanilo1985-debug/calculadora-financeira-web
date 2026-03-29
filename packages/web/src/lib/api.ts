/**
 * Cliente HTTP para a API da calculadora.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
