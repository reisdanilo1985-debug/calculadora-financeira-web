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
  MissingIndexDataError,
  calculate,
  getPremisesRequiredFrom,
} from '@correcao/core';
import { z } from 'zod';
import { dataCivil, fetchIndexData, missingDataResponse, normalizeSpread } from './calculate';
import { numero, numeroOpcional, validarCorpo } from '../middleware/validate';
import logger from '../middleware/logger';

export const compareRouter = Router();

// Tipos e enums do corpo (zod). Obrigatoriedade de datas, contagem de cenários
// e ordem das datas continuam nas checagens da rota (mensagens já conhecidas).
const cenarioSchema = z
  .object({
    label: z.string().max(120).nullish(),
    indexType: z.nativeEnum(IndexType),
    dayCountBasis: z.nativeEnum(DayCountBasis).nullish(),
    prefixedRate: numeroOpcional,
    spread: z
      .object({
        mode: z.enum(['percentage', 'additive']),
        value: numero,
        additiveBase: z.nativeEnum(DayCountBasis).nullish(),
      })
      .passthrough()
      .nullish(),
    futurePremises: z
      .array(z.object({ startDate: z.string(), endDate: z.string(), rate: numero }).passthrough())
      .max(1200)
      .nullish(),
  })
  .passthrough();

const compareBodySchema = z
  .object({
    initialAmount: numeroOpcional,
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
    currency: z.nativeEnum(Currency).nullish(),
    scenarios: z.array(cenarioSchema).nullish(),
  })
  .passthrough();

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

/**
 * Índices mensais datam cada linha no FIM do período apurado (fator até aquela data);
 * CDI, Selic, SOFR e Pré datam no dia em que a taxa incide (fator até o fim do dia).
 */
const LINHA_NO_FIM_DO_PERIODO = new Set<string>([IndexType.IPCA, IndexType.IGPM, IndexType.INCC]);

export interface PontoGrafico {
  /** 'AAAA-MM-DD' */
  date: string;
  variationPct: number;
  isProjected: boolean;
}

const dataIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const inicioDoDia = (d: Date | string) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/**
 * Pontos do gráfico do Comparador: 0% na data inicial, a variação acumulada até o dia 1
 * de cada mês e, por fim, a variação na data final pelo fator do resultado — a linha
 * termina exatamente no número do ranking. Antes, a amostra pegava a PRIMEIRA linha de
 * cada mês e descartava a última quando o mês já tinha aparecido (a linha parava antes
 * do fim e perdia o que só entrava na última linha).
 */
export function pontosDoGrafico(
  rows: { date: Date | string; accumulatedFactor: number; isProjected: boolean }[],
  startDate: Date,
  endDate: Date,
  fatorFinal: number,
  indexType: string
): PontoGrafico[] {
  const inicio = inicioDoDia(startDate);
  const fim = inicioDoDia(endDate);
  const linhas = rows
    .map(r => ({ t: inicioDoDia(r.date).getTime(), fator: r.accumulatedFactor, projetada: r.isProjected }))
    .sort((a, b) => a.t - b.t);
  const linhaNoFim = LINHA_NO_FIM_DO_PERIODO.has(indexType);

  const pontos: PontoGrafico[] = [{ date: dataIso(inicio), variationPct: 0, isProjected: false }];
  let i = 0;
  let vigente: (typeof linhas)[number] | undefined;
  for (let g = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1); g < fim; g = new Date(g.getFullYear(), g.getMonth() + 1, 1)) {
    const limite = g.getTime();
    // Valor no início do dia g: linha datada no fim do período vale até g (inclusive);
    // linha datada no dia da taxa só conta se for de um dia anterior a g.
    while (i < linhas.length && (linhaNoFim ? linhas[i].t <= limite : linhas[i].t < limite)) {
      vigente = linhas[i];
      i++;
    }
    pontos.push({
      date: dataIso(g),
      variationPct: vigente ? (vigente.fator - 1) * 100 : 0,
      isProjected: vigente?.projetada ?? false,
    });
  }
  pontos.push({
    date: dataIso(fim),
    variationPct: (fatorFinal - 1) * 100,
    isProjected: linhas[linhas.length - 1]?.projetada ?? false,
  });
  return pontos;
}

compareRouter.post('/cenarios', validarCorpo(compareBodySchema), async (req: Request, res: Response) => {
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

  let startDate: Date;
  let endDate: Date;
  try {
    startDate = dataCivil(body.startDate, 'startDate');
    endDate = dataCivil(body.endDate, 'endDate');
    for (const s of body.scenarios) {
      for (const p of s.futurePremises ?? []) {
        dataCivil(p.startDate, 'futurePremises.startDate');
        dataCivil(p.endDate, 'futurePremises.endDate');
      }
    }
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  if (startDate >= endDate) {
    return res.status(400).json({ error: 'startDate deve ser anterior a endDate.' });
  }

  const currency = body.currency ?? Currency.BRL;

  const scenarioResults = await Promise.all(
    body.scenarios.map(async (scenario) => {
      let indexData: any[] = [];
      try {
        let warning: string | undefined;

        if (scenario.indexType !== IndexType.PREFIXADA) {
          const fetched = await fetchIndexData(scenario.indexType, startDate, endDate);

          indexData = fetched.data;
          warning = (fetched as any).warning;

          const premisesFrom = getPremisesRequiredFrom(endDate, indexData, scenario.indexType);
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
          spread: normalizeSpread(scenario.spread),
          indexData,
          futurePremises: scenario.futurePremises?.map(p => ({
            startDate: dataCivil(p.startDate, 'futurePremises.startDate'),
            endDate: dataCivil(p.endDate, 'futurePremises.endDate'),
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
          points: pontosDoGrafico(result.memoryRows, startDate, endDate, result.accumulatedFactor, scenario.indexType),
          warning,
        };
      } catch (err: any) {
        if (err instanceof MissingIndexDataError || err?.name === 'MissingIndexDataError') {
          // Lacuna no futuro reabre o diálogo de premissas do cenário; lacuna no
          // histórico volta como erro do cenário, com a mensagem dos intervalos.
          const faltante = missingDataResponse(err, endDate, indexData, scenario.indexType);
          return {
            label: scenario.label,
            indexType: scenario.indexType,
            error: faltante.premisesRequiredFrom ? 'Premissas futuras necessárias' : faltante.error,
            detail: faltante.error,
            premisesRequiredFrom: faltante.premisesRequiredFrom,
            lastAvailableDate: faltante.lastAvailableDate,
            lastAvailableRate: faltante.lastAvailableRate,
            missingRanges: faltante.missingRanges,
          };
        }
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
