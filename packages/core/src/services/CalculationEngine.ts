/**
 * Motor de cálculo principal — orquestra todos os engines e serviços.
 * Suporta as Teses T1-T5 da Fase 1.
 */

import Decimal from 'decimal.js';
import {
  CalculationInput,
  CalculationMemoryRow,
  CalculationResult,
  DayCountBasis,
  IndexType,
  ThesisType,
  InterestType,
  Currency,
  GracePeriodType,
} from '../models/types';
import { calculateCDI } from '../engines/CDIEngine';
import { calculateMonthlyIndex } from '../engines/MonthlyIndexEngine';
import { calculateSOFR } from '../engines/SOFREngine';
import { calculatePrefixed } from '../engines/PrefixedEngine';
import { calculateDCF } from '../engines/DCFEngine';
import { calculateFullFlow } from '../engines/FullFlowEngine';
import {
  applyAmortizations,
  calcTotalAmortized,
  expandPeriodicAmortizations,
} from './AmortizationService';
import { applyGracePeriod } from './GracePeriodService';
import { applyInterest } from './InterestService';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

type EngineFunction = (input: CalculationInput) => CalculationMemoryRow[];

const ENGINE_MAP: Record<IndexType, EngineFunction> = {
  [IndexType.CDI]: calculateCDI,
  [IndexType.SELIC_META]: calculateCDI,
  [IndexType.SELIC_OVER]: calculateCDI,
  [IndexType.IPCA]: calculateMonthlyIndex,
  [IndexType.IGPM]: calculateMonthlyIndex,
  [IndexType.INCC]: calculateMonthlyIndex,
  [IndexType.SOFR]: calculateSOFR,
  [IndexType.PREFIXADA]: calculatePrefixed,
};

function validateInput(input: CalculationInput): void {
  if (!input.initialAmount || input.initialAmount <= 0) {
    throw new Error('Montante inicial deve ser maior que zero.');
  }
  if (!input.startDate || !input.endDate) {
    throw new Error('Datas de início e fim são obrigatórias.');
  }
  if (input.startDate >= input.endDate) {
    throw new Error('A data de início deve ser anterior à data de fim.');
  }
  if (input.indexType === IndexType.PREFIXADA && !input.prefixedRate) {
    throw new Error('Taxa pré-fixada é obrigatória para indexador PREFIXADA.');
  }
}

function detectProjections(
  rows: CalculationMemoryRow[]
): { hasProjections: boolean; projectionStartDate?: Date } {
  const firstProjected = rows.find(r => r.isProjected);
  return {
    hasProjections: !!firstProjected,
    projectionStartDate: firstProjected?.date,
  };
}

/** Wrapper para T2 – Valor Presente (DCF) */
function calculateDCFWrapper(input: CalculationInput): CalculationResult {
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

  const currency = input.currency ?? Currency.BRL;

  const dcfResult = calculateDCF({
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
  const memoryRows: CalculationMemoryRow[] = dcfResult.flows.map(f => ({
    date: f.date,
    indexRate: input.discountRate!,
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
    variationPercent:
      totalNominal > 0 ? (dcfResult.totalPV / totalNominal - 1) * 100 : 0,
    startDate: refDate,
    endDate: input.endDate,
    indexType: input.indexType,
    dayCountBasis: input.dayCountBasis,
    totalAmortized: 0,
    memoryRows,
    hasProjections: false,
    thesisType: ThesisType.VALOR_PRESENTE,
    currency,
    dcfResult,
  };
}

/** Wrapper para T4 – Fluxo Completo SAC/Price/Bullet */
function calculateFullFlowWrapper(input: CalculationInput): CalculationResult {
  if (!input.numberOfPeriods || input.numberOfPeriods <= 0) {
    throw new Error('Número de períodos é obrigatório para Fluxo Completo.');
  }
  if (!input.remunerationRate || input.remunerationRate <= 0) {
    throw new Error('Taxa de remuneração é obrigatória para Fluxo Completo.');
  }
  if (!input.amortizationSystem) {
    throw new Error('Sistema de amortização é obrigatório para Fluxo Completo.');
  }

  const currency = input.currency ?? Currency.BRL;

  const fullFlowResult = calculateFullFlow({
    principal: input.initialAmount,
    startDate: input.startDate,
    numberOfPeriods: input.numberOfPeriods,
    annualRate: input.remunerationRate,
    amortizationSystem: input.amortizationSystem,
    currency,
    gracePeriod: input.gracePeriod,
  });

  // Converte para memória padrão para compatibilidade com gráfico
  const memoryRows: CalculationMemoryRow[] = fullFlowResult.rows.map(row => ({
    date: row.date,
    indexRate: input.remunerationRate!,
    dailyFactor: 1,
    accumulatedFactor: 1,
    balance: row.closingBalance,
    amortizationAmount: row.amortization > 0 ? row.amortization : undefined,
    isProjected: false,
    description: row.isGracePeriod
      ? `Carência Tipo ${input.gracePeriod?.type ?? GracePeriodType.A} — Juros: ${row.interest.toFixed(2)}`
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
    thesisType: ThesisType.FLUXO_COMPLETO,
    currency,
    fullFlowResult,
  };
}

/**
 * Executa o cálculo completo, roteando pela tese selecionada.
 */
export function calculate(input: CalculationInput): CalculationResult {
  const thesis = input.thesisType ?? ThesisType.CORRECAO_SIMPLES;

  // T2 – Valor Presente
  if (thesis === ThesisType.VALOR_PRESENTE) {
    return calculateDCFWrapper(input);
  }

  // T4 – Fluxo Completo
  if (thesis === ThesisType.FLUXO_COMPLETO) {
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
  if (thesis === ThesisType.CORRECAO_COM_JUROS && input.interestRate && input.interestRate > 0) {
    const interestType = input.interestType ?? InterestType.COMPOSTA;
    rows = applyInterest(
      rows,
      input.initialAmount,
      input.interestRate,
      interestType,
      input.startDate,
      input.dayCountBasis
    );
  }

  // T3 – aplica carência
  let gracePeriodInfo = undefined;
  if (thesis === ThesisType.CORRECAO_COM_CARENCIA && input.gracePeriod) {
    const gpResult = applyGracePeriod(rows, input.initialAmount, input.gracePeriod);
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
    const expandedAmorts = expandPeriodicAmortizations(input.amortizations);
    rows = applyAmortizations(rows, expandedAmorts);
  }

  const lastRow = rows[rows.length - 1];
  const finalAmount = new Decimal(lastRow.balance);
  const initialAmount = new Decimal(input.initialAmount);
  const accumulatedFactor = new Decimal(lastRow.accumulatedFactor);
  const variationPercent = accumulatedFactor.minus(1).mul(100);

  const { hasProjections, projectionStartDate } = detectProjections(rows);
  const totalAmortized = calcTotalAmortized(rows);

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
    currency: input.currency ?? Currency.BRL,
    gracePeriodInfo,
  };
}

export function getPremisesRequiredFrom(
  endDate: Date,
  indexData: { date: Date }[]
): Date | null {
  if (!indexData.length) return new Date();

  const lastDataDate = indexData.reduce(
    (max, d) => (d.date > max ? d.date : max),
    indexData[0].date
  );

  if (endDate <= lastDataDate) return null;

  const nextDay = new Date(lastDataDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay;
}
