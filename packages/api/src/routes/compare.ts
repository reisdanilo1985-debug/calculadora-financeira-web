/**
 * Rota de Comparação de Cenários.
 * POST /api/comparar/cenarios
 *
 * Recebe parâmetros base (montante, período) + array de cenários (indexador, spread, etc.)
 * e retorna o resultado de cada cenário calculado de forma independente.
 */

import { Router, Request, Response } from 'express';
import {
  IndexType,
  DayCountBasis,
  Currency,
  calculate,
  getPremisesRequiredFrom,
} from '@correcao/core';
import { getIndexDataWithCache } from '../services/BCBService';
import { getSOFRWithCache } from '../services/FREDService';
import logger from '../middleware/logger';

export const compareRouter = Router();

interface ScenarioInput {
  label: string;
  indexType: IndexType;
  dayCountBasis: DayCountBasis;
  prefixedRate?: number;
  spread?: {
    mode: 'percentage' | 'additive';
    value: number;
    additiveBase?: DayCountBasis;
  };
  futurePremises?: { startDate: string; endDate: string; rate: number }[];
}

interface CompareRequest {
  initialAmount: number;
  startDate: string;
  endDate: string;
  currency?: Currency;
  scenarios: ScenarioInput[];
}

/** Amostra pontos mensais de um array de memoryRows para o gráfico */
function sampleMonthly(rows: { date: Date | string; balance: number; accumulatedFactor: number; isProjected: boolean }[]) {
  if (!rows.length) return [];

  const seen = new Set<string>();
  const sampled: { date: string; variationPct: number; isProjected: boolean }[] = [];

  for (const row of rows) {
    const d = new Date(row.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!seen.has(key)) {
      seen.add(key);
      sampled.push({
        date: key + '-01',
        variationPct: (row.accumulatedFactor - 1) * 100,
        isProjected: row.isProjected,
      });
    }
  }

  // Garante o último ponto
  const last = rows[rows.length - 1];
  const lastKey = (() => {
    const d = new Date(last.date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  })();
  if (!seen.has(lastKey)) {
    sampled.push({
      date: lastKey + '-01',
      variationPct: (last.accumulatedFactor - 1) * 100,
      isProjected: last.isProjected,
    });
  }

  return sampled;
}

compareRouter.post('/cenarios', async (req: Request, res: Response) => {
  const body = req.body as CompareRequest;

  if (!body.initialAmount || body.initialAmount <= 0) {
    return res.status(400).json({ error: 'initialAmount é obrigatório.' });
  }
  if (!body.startDate || !body.endDate) {
    return res.status(400).json({ error: 'startDate e endDate são obrigatórios.' });
  }
  if (!body.scenarios?.length || body.scenarios.length < 2) {
    return res.status(400).json({ error: 'Informe ao menos 2 cenários para comparar.' });
  }
  if (body.scenarios.length > 6) {
    return res.status(400).json({ error: 'Máximo de 6 cenários por comparação.' });
  }

  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (startDate >= endDate) {
    return res.status(400).json({ error: 'startDate deve ser anterior a endDate.' });
  }

  const currency = body.currency ?? Currency.BRL;

  const scenarioResults = await Promise.all(
    body.scenarios.map(async (scenario) => {
      try {
        let indexData: any[] = [];
        let warning: string | undefined;

        if (scenario.indexType !== IndexType.PREFIXADA) {
          const fetched =
            scenario.indexType === IndexType.SOFR
              ? await getSOFRWithCache(startDate, endDate)
              : await getIndexDataWithCache(scenario.indexType, startDate, endDate);

          indexData = fetched.data;
          warning = (fetched as any).warning;

          const premisesFrom = getPremisesRequiredFrom(endDate, indexData);
          if (premisesFrom && (!scenario.futurePremises?.length)) {
            return {
              label: scenario.label,
              indexType: scenario.indexType,
              error: 'Premissas futuras necessárias',
              premisesRequiredFrom: premisesFrom.toISOString(),
              lastAvailableDate: indexData[indexData.length - 1]?.date?.toISOString() ?? null,
              lastAvailableRate: indexData[indexData.length - 1]?.value ?? null,
            };
          }
        }

        const result = calculate({
          initialAmount: body.initialAmount,
          startDate,
          endDate,
          indexType: scenario.indexType,
          dayCountBasis: scenario.dayCountBasis,
          prefixedRate: scenario.prefixedRate,
          spread: scenario.spread,
          indexData,
          futurePremises: scenario.futurePremises?.map(p => ({
            startDate: new Date(p.startDate),
            endDate: new Date(p.endDate),
            rate: p.rate,
          })),
          currency,
        });

        return {
          label: scenario.label,
          indexType: scenario.indexType,
          finalAmount: result.finalAmount,
          variationPercent: result.variationPercent,
          accumulatedFactor: result.accumulatedFactor,
          hasProjections: result.hasProjections,
          points: sampleMonthly(result.memoryRows),
          warning,
        };
      } catch (err: any) {
        return {
          label: scenario.label,
          indexType: scenario.indexType,
          error: err.message ?? 'Erro no cálculo deste cenário.',
        };
      }
    })
  );

  logger.info(`Comparação de ${body.scenarios.length} cenários`, {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    initialAmount: body.initialAmount,
  });

  return res.json({
    initialAmount: body.initialAmount,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    currency,
    scenarios: scenarioResults,
  });
});
