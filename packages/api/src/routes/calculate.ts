/**
 * Rotas de cálculo — suporta Teses T1-T5 (Fase 1).
 */

import { Router, Request, Response } from 'express';
import {
  CalculationInput,
  IndexType,
  DayCountBasis,
  ThesisType,
  AmortizationSystem,
  GracePeriodType,
  InterestType,
  Currency,
  calculate,
  getPremisesRequiredFrom,
} from '@correcao/core';
import { getIndexDataWithCache } from '../services/BCBService';
import { getSOFRWithCache } from '../services/FREDService';
import logger from '../middleware/logger';

export const calculateRouter = Router();

interface CalculateRequest {
  // Tese
  thesisType?: ThesisType;
  // Campos comuns
  initialAmount: number;
  startDate: string;
  endDate: string;
  indexType: IndexType;
  dayCountBasis: DayCountBasis;
  currency?: Currency;
  // T1/T3/T5
  prefixedRate?: number;
  spread?: {
    mode: 'percentage' | 'additive';
    value: number;
    additiveBase?: DayCountBasis;
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
  // T3 – Carência
  gracePeriod?: {
    type: GracePeriodType;
    endDate: string;
  };
  // T2 – Valor Presente
  cashFlows?: {
    id?: string;
    date: string;
    amount: number;
    label?: string;
  }[];
  discountRate?: number;
  referenceDate?: string;
  // T4 – Fluxo Completo
  amortizationSystem?: AmortizationSystem;
  remunerationRate?: number;
  numberOfPeriods?: number;
  // T5 – Correção com Juros
  interestType?: InterestType;
  interestRate?: number;
}

async function fetchIndexData(
  indexType: IndexType,
  startDate: Date,
  endDate: Date
): Promise<{ data: any[]; warning?: string }> {
  if (indexType === IndexType.SOFR) {
    return getSOFRWithCache(startDate, endDate);
  }
  if (indexType === IndexType.PREFIXADA) {
    return { data: [], fromCache: false } as any;
  }
  return getIndexDataWithCache(indexType, startDate, endDate);
}

calculateRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as CalculateRequest;

  try {
    const thesis = body.thesisType ?? ThesisType.CORRECAO_SIMPLES;

    // Validação básica compartilhada
    const needsEndDate = thesis !== ThesisType.FLUXO_COMPLETO && thesis !== ThesisType.VALOR_PRESENTE;
    if (!body.startDate || (needsEndDate && !body.endDate)) {
      return res.status(400).json({ error: 'startDate e endDate são obrigatórios' });
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Datas inválidas.' });
    }

    // T2 – Valor Presente: não precisa de dados de índice
    if (thesis === ThesisType.VALOR_PRESENTE) {
      if (!body.cashFlows?.length) {
        return res.status(400).json({ error: 'cashFlows é obrigatório para Valor Presente.' });
      }
      if (!body.discountRate) {
        return res.status(400).json({ error: 'discountRate é obrigatório para Valor Presente.' });
      }

      const input: CalculationInput = {
        initialAmount: body.cashFlows.reduce((s, f) => s + f.amount, 0),
        startDate,
        endDate,
        indexType: body.indexType ?? IndexType.PREFIXADA,
        dayCountBasis: body.dayCountBasis ?? DayCountBasis.DC365,
        thesisType: ThesisType.VALOR_PRESENTE,
        cashFlows: body.cashFlows.map(f => ({
          id: f.id,
          date: new Date(f.date),
          amount: f.amount,
          label: f.label,
        })),
        discountRate: body.discountRate,
        referenceDate: body.referenceDate ? new Date(body.referenceDate) : startDate,
        currency: body.currency ?? Currency.BRL,
      };

      const result = calculate(input);
      return res.json(serializeResult(result));
    }

    // T4 – Fluxo Completo: não precisa de dados de índice externo
    if (thesis === ThesisType.FLUXO_COMPLETO) {
      if (!body.initialAmount || body.initialAmount <= 0) {
        return res.status(400).json({ error: 'initialAmount é obrigatório para Fluxo Completo.' });
      }
      if (!body.numberOfPeriods) {
        return res.status(400).json({ error: 'numberOfPeriods é obrigatório para Fluxo Completo.' });
      }
      if (!body.remunerationRate) {
        return res.status(400).json({ error: 'remunerationRate é obrigatório para Fluxo Completo.' });
      }
      if (!body.amortizationSystem) {
        return res.status(400).json({ error: 'amortizationSystem é obrigatório para Fluxo Completo.' });
      }

      const input: CalculationInput = {
        initialAmount: body.initialAmount,
        startDate,
        endDate,
        indexType: body.indexType ?? IndexType.PREFIXADA,
        dayCountBasis: body.dayCountBasis ?? DayCountBasis.DC365,
        thesisType: ThesisType.FLUXO_COMPLETO,
        amortizationSystem: body.amortizationSystem,
        remunerationRate: body.remunerationRate,
        numberOfPeriods: body.numberOfPeriods,
        currency: body.currency ?? Currency.BRL,
        gracePeriod: body.gracePeriod
          ? { type: body.gracePeriod.type, endDate: new Date(body.gracePeriod.endDate) }
          : undefined,
      };

      const result = calculate(input);
      return res.json(serializeResult(result));
    }

    // T1, T3, T5 – precisa de dados de índice
    if (!body.initialAmount || !body.indexType) {
      return res.status(400).json({ error: 'initialAmount e indexType são obrigatórios' });
    }

    const needsIndexData = body.indexType !== 'PREFIXADA';
    let indexData: any[] = [];
    let warning: string | undefined;

    if (needsIndexData) {
      const result = await fetchIndexData(body.indexType, startDate, endDate);
      indexData = result.data;
      warning = result.warning;

      const premisesRequiredFrom = getPremisesRequiredFrom(endDate, indexData);

      if (premisesRequiredFrom && (!body.futurePremises || body.futurePremises.length === 0)) {
        return res.status(422).json({
          error: 'Premissas futuras necessárias',
          premisesRequiredFrom: premisesRequiredFrom.toISOString(),
          lastAvailableRate: indexData[indexData.length - 1]?.value ?? null,
          lastAvailableDate: indexData[indexData.length - 1]?.date?.toISOString() ?? null,
          message: `Dados disponíveis até ${indexData[indexData.length - 1]?.date?.toISOString() ?? 'N/A'}.`,
        });
      }
    }

    const input: CalculationInput = {
      initialAmount: body.initialAmount,
      startDate,
      endDate,
      indexType: body.indexType,
      dayCountBasis: body.dayCountBasis ?? DayCountBasis.DC365,
      prefixedRate: body.prefixedRate,
      spread: body.spread,
      indexData,
      thesisType: thesis,
      currency: body.currency ?? Currency.BRL,
      amortizations: body.amortizations?.map(a => ({
        date: new Date(a.date),
        type: a.type as any,
        value: a.value,
        periodicity: a.periodicity as any,
        periodicEndDate: a.periodicEndDate ? new Date(a.periodicEndDate) : undefined,
        isPeriodicPercentage: a.isPeriodicPercentage,
      })),
      futurePremises: body.futurePremises?.map(p => ({
        startDate: new Date(p.startDate),
        endDate: new Date(p.endDate),
        rate: p.rate,
      })),
      gracePeriod: body.gracePeriod
        ? { type: body.gracePeriod.type, endDate: new Date(body.gracePeriod.endDate) }
        : undefined,
      interestType: body.interestType,
      interestRate: body.interestRate,
    };

    logger.info(`Calculando ${body.indexType} [${thesis}] para ${body.initialAmount}`, {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    });

    const result = calculate(input);
    return res.json({ ...serializeResult(result), warning });
  } catch (error: any) {
    logger.error('Erro no cálculo:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no cálculo.' });
  }
});

function serializeResult(result: any) {
  const base = {
    ...result,
    startDate: result.startDate instanceof Date ? result.startDate.toISOString() : result.startDate,
    endDate: result.endDate instanceof Date ? result.endDate.toISOString() : result.endDate,
    projectionStartDate: result.projectionStartDate instanceof Date
      ? result.projectionStartDate.toISOString()
      : result.projectionStartDate,
    memoryRows: result.memoryRows?.map((row: any) => ({
      ...row,
      date: row.date instanceof Date ? row.date.toISOString() : row.date,
    })),
  };

  // Serialize DCF result
  if (result.dcfResult) {
    base.dcfResult = {
      ...result.dcfResult,
      referenceDate: result.dcfResult.referenceDate instanceof Date
        ? result.dcfResult.referenceDate.toISOString()
        : result.dcfResult.referenceDate,
      flows: result.dcfResult.flows.map((f: any) => ({
        ...f,
        date: f.date instanceof Date ? f.date.toISOString() : f.date,
      })),
    };
  }

  // Serialize Full Flow result
  if (result.fullFlowResult) {
    base.fullFlowResult = {
      ...result.fullFlowResult,
      rows: result.fullFlowResult.rows.map((r: any) => ({
        ...r,
        date: r.date instanceof Date ? r.date.toISOString() : r.date,
      })),
    };
  }

  // Serialize Grace Period info
  if (result.gracePeriodInfo) {
    base.gracePeriodInfo = {
      ...result.gracePeriodInfo,
      endDate: result.gracePeriodInfo.endDate instanceof Date
        ? result.gracePeriodInfo.endDate.toISOString()
        : result.gracePeriodInfo.endDate,
    };
  }

  return base;
}

calculateRouter.get('/premissas-necessarias', async (req: Request, res: Response) => {
  const { indexType, endDate } = req.query;

  if (!indexType || !endDate) {
    return res.status(400).json({ error: 'indexType e endDate são obrigatórios' });
  }

  try {
    const end = new Date(endDate as string);
    const start = new Date('2000-01-01');

    const { data: indexData } = await fetchIndexData(
      indexType as IndexType,
      start,
      end
    );

    const requiredFrom = getPremisesRequiredFrom(end, indexData);

    return res.json({
      needsPremises: !!requiredFrom,
      premisesRequiredFrom: requiredFrom?.toISOString(),
      lastAvailableDate: indexData[indexData.length - 1]?.date?.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
