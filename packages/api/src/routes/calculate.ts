/**
 * Rotas de cálculo — suporta Teses T1-T5 (Fase 1).
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  CalculationInput,
  IndexType,
  DayCountBasis,
  ThesisType,
  AmortizationSystem,
  GracePeriodType,
  InterestType,
  Currency,
  DCFPerpetuityConfig,
  PeriodicityType,
  MissingIndexDataError,
  calculate,
  getPremisesRequiredFrom,
  parseDataCivil,
} from '@correcao/core';
import { getIndexDataWithCache } from '../services/BCBService';
import { getSOFRWithCache } from '../services/FREDService';
import logger from '../middleware/logger';

export const calculateRouter = Router();

/**
 * Validação leve de tipos (não de regras de negócio — isso permanece por tese
 * mais abaixo). Objetivo: rejeitar com 400 claro em vez de deixar `Number()`/
 * `new Date()` produzirem `NaN`/`Invalid Date` silenciosos que só explodiriam
 * dentro do core.
 */
const amortizationSchema = z.object({
  date: z.string(),
  type: z.enum(['FIXED', 'PERCENTAGE', 'PERIODIC']),
  value: z.number(),
  // Enum fechado: periodicidade desconhecida travava a expansão do cronograma (E09)
  periodicity: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).optional(),
  periodicEndDate: z.string().optional(),
  isPeriodicPercentage: z.boolean().optional(),
  direction: z.enum(['OUT', 'IN']).optional(),
});

const calculateBodySchema = z.object({
  thesisType: z.string().optional(),
  initialAmount: z.number().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  indexType: z.string().optional(),
  dayCountBasis: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  prefixedRate: z.number().optional(),
  spread: z
    .object({
      mode: z.enum(['percentage', 'additive']),
      value: z.number(),
      additiveBase: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
  amortizations: z.array(amortizationSchema).optional(),
  futurePremises: z.array(z.object({ startDate: z.string(), endDate: z.string(), rate: z.number() })).optional(),
  gracePeriod: z.object({ type: z.string(), endDate: z.string() }).optional(),
  cashFlows: z
    .array(z.object({ id: z.string().optional(), date: z.string(), amount: z.number(), label: z.string().optional() }))
    .optional(),
  discountRate: z.number().optional(),
  referenceDate: z.string().optional(),
  perpetuity: z
    .object({
      growthRate: z.number(),
      periodicity: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
      baseCashFlow: z.number().optional(),
    })
    .optional(),
  amortizationSystem: z.string().optional(),
  remunerationRate: z.number().optional(),
  numberOfPeriods: z.number().optional(),
  installmentPeriodicity: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).optional(),
  interestType: z.string().optional(),
  interestRate: z.number().optional(),
});

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
    /** OUT = amortização (default), IN = aporte/captação */
    direction?: string;
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
  perpetuity?: DCFPerpetuityConfig;
  // T4 – Fluxo Completo
  amortizationSystem?: AmortizationSystem;
  remunerationRate?: number;
  numberOfPeriods?: number;
  installmentPeriodicity?: PeriodicityType;
  // T5 – Correção com Juros
  interestType?: InterestType;
  interestRate?: number;
}

/** Data informada no payload que não pôde ser lida como data civil */
export class DataInvalidaError extends Error {
  constructor(campo: string, valor: unknown) {
    super(`Data inválida em ${campo}: "${String(valor)}". Use AAAA-MM-DD.`);
    this.name = 'DataInvalidaError';
  }
}

/**
 * Lê a data do payload como DATA CIVIL (meia-noite local), igual em qualquer
 * fuso de servidor: vale a data escrita ('2025-01-03', '2025-01-03T12:00:00',
 * '2025-01-03T00:00:00Z' → 03/01/2025). `new Date(str)` lia 'AAAA-MM-DD' como
 * UTC e, num servidor em São Paulo, recuava um dia.
 */
export function dataCivil(valor: unknown, campo: string): Date {
  const d = typeof valor === 'string' ? parseDataCivil(valor, null) : null;
  if (!d) throw new DataInvalidaError(campo, valor);
  return d;
}

const MONTHLY_INDEXES = new Set<string>([IndexType.IPCA, IndexType.IGPM, IndexType.INCC]);

/**
 * Busca os dados do índice para o período. Além do intervalo pedido:
 * - SOFR: inclui a semana anterior, para que um início em dia sem publicação
 *   use a última taxa publicada antes dele;
 * - índices mensais: começa no dia 1 do mês inicial, onde o BCB data a
 *   variação do mês (um início no dia 15 excluiria a variação daquele mês).
 */
export async function fetchIndexData(
  indexType: IndexType,
  startDate: Date,
  endDate: Date
): Promise<{ data: any[]; warning?: string }> {
  if (indexType === IndexType.SOFR) {
    const from = new Date(startDate);
    from.setDate(from.getDate() - 7);
    return getSOFRWithCache(from, endDate);
  }
  if (indexType === IndexType.PREFIXADA) {
    return { data: [], fromCache: false } as any;
  }
  if (MONTHLY_INDEXES.has(indexType)) {
    return getIndexDataWithCache(indexType, new Date(startDate.getFullYear(), startDate.getMonth(), 1), endDate);
  }
  return getIndexDataWithCache(indexType, startDate, endDate);
}

/** Normaliza a base do spread aditivo (a UI e o Excel podem mandar número ou texto) */
export function normalizeSpread<T extends { mode: 'percentage' | 'additive'; value: number; additiveBase?: any }>(
  spread: T | undefined
): T | undefined {
  if (!spread) return spread;
  const base = spread.additiveBase;
  return base === undefined || base === null || base === ''
    ? { ...spread, additiveBase: undefined }
    : { ...spread, additiveBase: Number(base) as DayCountBasis };
}

/** Corpo 422 para período com dias/meses sem dado oficial nem premissa */
/** Data em dd/mm/aaaa para textos exibidos ao usuário (campos de dados seguem ISO). */
function dataBrMensagem(d?: Date): string | undefined {
  if (!d || isNaN(d.getTime())) return undefined;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function missingDataResponse(error: MissingIndexDataError, endDate: Date, indexData: any[], indexType?: string) {
  const requiredFrom = getPremisesRequiredFrom(endDate, indexData, indexType);
  return {
    error: error.message,
    // Só reabre o diálogo de premissas quando a lacuna é no futuro (após o último dado)
    premisesRequiredFrom: requiredFrom ? requiredFrom.toISOString() : undefined,
    lastAvailableRate: indexData[indexData.length - 1]?.value ?? null,
    lastAvailableDate: indexData[indexData.length - 1]?.date?.toISOString() ?? null,
    missingRanges: error.intervalos.map(i => ({ start: i.inicio.toISOString(), end: i.fim.toISOString() })),
  };
}

calculateRouter.post('/', async (req: Request, res: Response) => {
  const parsed = calculateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first.path.join('.');
    return res.status(400).json({ error: `Payload inválido — ${path ? path + ': ' : ''}${first.message}` });
  }
  const body = parsed.data as CalculateRequest;

  try {
    const thesis = body.thesisType ?? ThesisType.CORRECAO_SIMPLES;

    // Validação básica compartilhada
    const needsEndDate = thesis !== ThesisType.FLUXO_COMPLETO && thesis !== ThesisType.VALOR_PRESENTE;
    if (!body.startDate || (needsEndDate && !body.endDate)) {
      return res.status(400).json({ error: 'startDate e endDate são obrigatórios' });
    }

    const startDate = dataCivil(body.startDate, 'startDate');
    // endDate é opcional para VALOR_PRESENTE/FLUXO_COMPLETO (needsEndDate=false) — nesse
    // caso, sem endDate informado, usa startDate como placeholder em vez de Invalid Date.
    const endDate = body.endDate ? dataCivil(body.endDate, 'endDate') : new Date(startDate);

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
          date: dataCivil(f.date, 'cashFlows.date'),
          amount: f.amount,
          label: f.label,
        })),
        discountRate: body.discountRate,
        referenceDate: body.referenceDate ? dataCivil(body.referenceDate, 'referenceDate') : startDate,
        perpetuity: body.perpetuity,
        currency: body.currency ?? Currency.BRL,
      };

      let result;
      try {
        result = calculate(input);
      } catch (error: any) {
        // Regras de entrada do DCF (fluxo antes da referência, taxa ≤ crescimento…) são erro do pedido
        return res.status(400).json({ error: error.message || 'Parâmetros inválidos para Valor Presente.' });
      }
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
        installmentPeriodicity: body.installmentPeriodicity,
        currency: body.currency ?? Currency.BRL,
        gracePeriod: body.gracePeriod
          ? { type: body.gracePeriod.type, endDate: dataCivil(body.gracePeriod.endDate, 'gracePeriod.endDate') }
          : undefined,
      };

      let result;
      try {
        result = calculate(input);
      } catch (error: any) {
        // Regras de entrada do cronograma (carência ≥ prazo, carência fora da periodicidade…) são erro do pedido
        return res.status(400).json({ error: error.message || 'Parâmetros inválidos para Fluxo Completo.' });
      }
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

      const premisesRequiredFrom = getPremisesRequiredFrom(endDate, indexData, body.indexType);

      if (premisesRequiredFrom && (!body.futurePremises || body.futurePremises.length === 0)) {
        return res.status(422).json({
          error: 'Premissas futuras necessárias',
          premisesRequiredFrom: premisesRequiredFrom.toISOString(),
          lastAvailableRate: indexData[indexData.length - 1]?.value ?? null,
          lastAvailableDate: indexData[indexData.length - 1]?.date?.toISOString() ?? null,
          message: `Dados disponíveis até ${dataBrMensagem(indexData[indexData.length - 1]?.date) ?? 'N/A'}.`,
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
      spread: normalizeSpread(body.spread),
      indexData,
      thesisType: thesis,
      currency: body.currency ?? Currency.BRL,
      amortizations: body.amortizations?.map(a => ({
        date: dataCivil(a.date, 'amortizations.date'),
        type: a.type as any,
        value: a.value,
        periodicity: a.periodicity as any,
        periodicEndDate: a.periodicEndDate ? dataCivil(a.periodicEndDate, 'amortizations.periodicEndDate') : undefined,
        isPeriodicPercentage: a.isPeriodicPercentage,
        direction: a.direction as any,
      })),
      futurePremises: body.futurePremises?.map(p => ({
        startDate: dataCivil(p.startDate, 'futurePremises.startDate'),
        endDate: dataCivil(p.endDate, 'futurePremises.endDate'),
        rate: p.rate,
      })),
      gracePeriod: body.gracePeriod
        ? { type: body.gracePeriod.type, endDate: dataCivil(body.gracePeriod.endDate, 'gracePeriod.endDate') }
        : undefined,
      interestType: body.interestType,
      interestRate: body.interestRate,
    };

    logger.info(`Calculando ${body.indexType} [${thesis}] para ${body.initialAmount}`, {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    });

    try {
      const result = calculate(input);
      return res.json({ ...serializeResult(result), warning });
    } catch (error: any) {
      if (error instanceof MissingIndexDataError || error?.name === 'MissingIndexDataError') {
        return res.status(422).json(missingDataResponse(error, endDate, indexData, body.indexType));
      }
      throw error;
    }
  } catch (error: any) {
    if (error instanceof DataInvalidaError) {
      return res.status(400).json({ error: error.message });
    }
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
      terminalValue: result.dcfResult.terminalValue
        ? {
            ...result.dcfResult.terminalValue,
            date: result.dcfResult.terminalValue.date instanceof Date
              ? result.dcfResult.terminalValue.date.toISOString()
              : result.dcfResult.terminalValue.date,
          }
        : undefined,
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

    const requiredFrom = getPremisesRequiredFrom(end, indexData, indexType as string);

    return res.json({
      needsPremises: !!requiredFrom,
      premisesRequiredFrom: requiredFrom?.toISOString(),
      lastAvailableDate: indexData[indexData.length - 1]?.date?.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
