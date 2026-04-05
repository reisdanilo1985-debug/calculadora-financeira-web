/**
 * Rotas de administração de índices.
 *
 * GET  /api/indices/:tipo?dataInicial=&dataFinal=  → dados históricos
 * GET  /api/indices/cache/status                   → status do cache
 * POST /api/indices/:tipo/refresh                  → força atualização
 */

import { Router, Request, Response } from 'express';
import { IndexType } from '@correcao/core';
import { getIndexDataWithCache, forceRefreshIndex, BCB_SUPPORTED_INDEXES } from '../services/BCBService';
import { getSOFRWithCache, forceRefreshSOFR } from '../services/FREDService';
import { getAllCacheMeta } from '../services/DatabaseService';
import logger from '../middleware/logger';

export const indicesRouter = Router();

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

  const start = new Date(dataInicial as string);
  const end = new Date(dataFinal as string);

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

/** POST /api/indices/:tipo/refresh */
indicesRouter.post('/:tipo/refresh', async (req: Request, res: Response) => {
  const tipo = req.params.tipo as IndexType;

  try {
    let inserted: number;
    if (tipo === IndexType.SOFR) {
      inserted = await forceRefreshSOFR();
    } else if (BCB_SUPPORTED_INDEXES.includes(tipo)) {
      inserted = await forceRefreshIndex(tipo);
    } else {
      return res.status(400).json({ error: `Indexador ${tipo} não suportado para refresh` });
    }

    return res.json({
      success: true,
      inserted,
      message: `${inserted} novos registros inseridos para ${tipo}`,
    });
  } catch (error: any) {
    logger.error(`Erro ao atualizar índice ${tipo}:`, error);
    return res.status(500).json({ error: error.message });
  }
});
