/**
 * Rotas de administração de índices.
 *
 * GET  /api/indices/:tipo?dataInicial=&dataFinal=  → dados históricos
 * GET  /api/indices/cache/status                   → status do cache
 * POST /api/indices/:tipo/refresh                  → força atualização (ADMIN: header x-admin-token)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { IndexType } from '@correcao/core';
import {
  getIndexDataWithCache,
  forceRefreshIndex,
  cargaEmAndamento,
  BCB_SUPPORTED_INDEXES,
} from '../services/BCBService';
import { getSOFRWithCache, forceRefreshSOFR } from '../services/FREDService';
import { getAllCacheMeta } from '../services/DatabaseService';
import { requireAdmin, limitarOperacaoAdmin } from '../middleware/adminAuth';
import logger from '../middleware/logger';

export const indicesRouter = Router();

/** Refresh completo por índice: no máximo 3 a cada 10 minutos (além da deduplicação de cargas simultâneas). */
const REFRESH_LIMITE = 3;
const REFRESH_JANELA_MS = 10 * 60 * 1000;

/**
 * Aceita tanto DD/MM/YYYY (convenção do parâmetro `dataInicial`/`dataFinal`,
 * espelhando a API do BCB) quanto ISO YYYY-MM-DD. `new Date('31/01/2024')`
 * seria interpretado como MM/DD/YYYY (Invalid Date) e `new Date('01/10/2024')`
 * trocaria dia/mês silenciosamente — por isso o parse explícito.
 *
 * Ambos viram data civil LOCAL ao meio-dia (componentes), para que a data não
 * mude com o fuso do servidor ao ser convertida para 'YYYY-MM-DD'.
 */
function parseDataParam(valor: string): Date {
  const brMatch = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const isoMatch = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (brMatch || isoMatch) {
    const [y, m, d] = brMatch
      ? [Number(brMatch[3]), Number(brMatch[2]), Number(brMatch[1])]
      : [Number(isoMatch![1]), Number(isoMatch![2]), Number(isoMatch![3])];
    const data = new Date(y, m - 1, d, 12);
    return data.getFullYear() === y && data.getMonth() === m - 1 && data.getDate() === d ? data : new Date(NaN);
  }
  return new Date(valor);
}

function isRefreshSuportado(tipo: string): boolean {
  return tipo === IndexType.SOFR || BCB_SUPPORTED_INDEXES.includes(tipo as IndexType);
}

/** GET /api/indices/cache/status */
indicesRouter.get('/cache/status', (_req: Request, res: Response) => {
  const meta = getAllCacheMeta();
  res.json(meta);
});

/** GET /api/indices/:tipo */
indicesRouter.get('/:tipo', async (req: Request, res: Response) => {
  const tipo = req.params.tipo as IndexType;
  const { dataInicial, dataFinal } = req.query;

  if (!dataInicial || !dataFinal) {
    return res.status(400).json({ error: 'dataInicial e dataFinal são obrigatórios' });
  }

  const start = parseDataParam(dataInicial as string);
  const end = parseDataParam(dataFinal as string);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Datas inválidas' });
  }

  try {
    let result;
    if (tipo === IndexType.SOFR) {
      result = await getSOFRWithCache(start, end);
    } else {
      result = await getIndexDataWithCache(tipo, start, end);
    }

    return res.json({
      indexType: tipo,
      fromCache: result.fromCache,
      warning: result.warning,
      count: result.data.length,
      data: result.data.map(d => ({
        date: d.date.toISOString().slice(0, 10),
        value: d.value,
      })),
    });
  } catch (error: any) {
    logger.error(`Erro ao buscar índice ${tipo}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/indices/:tipo/refresh
 *
 * Ordem: tipo suportado (400) → credencial administrativa (503/401/403) →
 * limite por operação (429) → refresh. Refresh simultâneo do mesmo índice
 * (outro admin, cron) compartilha a carga em andamento.
 */
indicesRouter.post(
  '/:tipo/refresh',
  (req: Request, res: Response, next: NextFunction) => {
    if (!isRefreshSuportado(req.params.tipo)) {
      return res.status(400).json({ error: `Indexador ${req.params.tipo} não suportado para refresh` });
    }
    next();
  },
  requireAdmin,
  limitarOperacaoAdmin({
    operacao: req => `indices:refresh:${req.params.tipo}`,
    limite: REFRESH_LIMITE,
    janelaMs: REFRESH_JANELA_MS,
  }),
  async (req: Request, res: Response) => {
    const tipo = req.params.tipo as IndexType;
    const compartilhado = cargaEmAndamento(tipo) === 'completa';

    try {
      const inserted = tipo === IndexType.SOFR ? await forceRefreshSOFR() : await forceRefreshIndex(tipo);

      return res.json({
        success: true,
        inserted,
        deduplicated: compartilhado,
        message: compartilhado
          ? `Atualização de ${tipo} já estava em andamento; ${inserted} novos registros inseridos`
          : `${inserted} novos registros inseridos para ${tipo}`,
      });
    } catch (error: any) {
      logger.error(`Erro ao atualizar índice ${tipo}:`, error);
      return res.status(500).json({ error: error.message });
    }
  }
);
