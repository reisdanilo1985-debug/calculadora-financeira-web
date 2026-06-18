/**
 * Rotas de Tesouraria.
 *   GET  /api/tesouraria/premissas          → snapshot de premissas (escalares+curvas+proveniência)
 *   POST /api/tesouraria/premissas/refresh  → força reconstrução do snapshot
 *   POST /api/tesouraria/calc/:nome         → executa um dos 13 calculadores puros
 *
 * Convenção: taxas em FRAÇÃO decimal (0.144 = 14,40%), idêntica ao core.
 */

import { Router, Request, Response } from 'express';
import {
  conversor,
  crossCcyToCdi,
  preParaCdi,
  cdiParaPre,
  cdiSpreadParaPct,
  pctParaCdiSpread,
  ipcaMais,
  tirVpl,
  amortizacao,
  duration,
  puLtn,
  puNtnf,
  swapCdiPreMtM,
  forwardUsdBrl,
  ndfAjuste,
  tbillYields,
  sofrSpreadEay,
  jurosConvencoes,
} from '@correcao/core';
import { getPremissasSnapshot } from '../services/marketdata/snapshot';
import logger from '../middleware/logger';

export const tesourariaRouter = Router();

// ─────────────────────────────── Premissas ───────────────────────────────────

tesourariaRouter.get('/premissas', async (_req: Request, res: Response) => {
  try {
    const snap = await getPremissasSnapshot();
    return res.json(snap);
  } catch (error: any) {
    logger.error('[TESOURARIA] Erro ao montar premissas:', error.message);
    return res.status(500).json({ error: 'Falha ao obter premissas de mercado.' });
  }
});

tesourariaRouter.post('/premissas/refresh', async (_req: Request, res: Response) => {
  try {
    const snap = await getPremissasSnapshot(true);
    return res.json(snap);
  } catch (error: any) {
    logger.error('[TESOURARIA] Erro ao atualizar premissas:', error.message);
    return res.status(500).json({ error: 'Falha ao atualizar premissas de mercado.' });
  }
});

// ─────────────────────────────── Calculadores ────────────────────────────────

/** Converte fluxos com data string → Date. */
function parseFluxos(fluxos: any[]): { date: Date; amount: number }[] {
  if (!Array.isArray(fluxos)) throw new Error('fluxos deve ser uma lista.');
  return fluxos.map(f => ({ date: new Date(f.date), amount: Number(f.amount) }));
}

/** Dispatcher: nome canônico → função do core, com adaptação de inputs. */
const CALCULADORES: Record<string, (body: any) => unknown> = {
  conversor: b => conversor(b),
  'cross-ccy': b => crossCcyToCdi(b),
  'pre-cdi': b => (b.modo === 'cdiParaPre' ? cdiParaPre(b) : preParaCdi(b)),
  'cdi-spread': b => (b.modo === 'pctParaSpread' ? pctParaCdiSpread(b) : cdiSpreadParaPct(b)),
  ipca: b => ipcaMais(b),
  'tir-vpl': b => tirVpl({ ...b, fluxos: parseFluxos(b.fluxos) }),
  amortizacao: b => amortizacao(b),
  duration: b => duration(b),
  'pu-titulos': b => (b.tipo === 'NTNF' ? puNtnf(b) : puLtn(b)),
  swap: b => swapCdiPreMtM(b),
  'forward-ndf': b => (b.modo === 'ndf' ? ndfAjuste(b) : forwardUsdBrl(b)),
  'us-money-market': b => {
    switch (b.modo) {
      case 'sofr':
        return sofrSpreadEay(b);
      case 'juros':
        return jurosConvencoes({ ...b, d0: new Date(b.d0), d1: new Date(b.d1) });
      case 'tbill':
      default:
        return tbillYields(b);
    }
  },
};

tesourariaRouter.post('/calc/:nome', (req: Request, res: Response) => {
  const nome = req.params.nome;
  const fn = CALCULADORES[nome];
  if (!fn) {
    return res.status(404).json({ error: `Calculador desconhecido: ${nome}` });
  }
  try {
    const result = fn(req.body ?? {});
    return res.json(result);
  } catch (error: any) {
    logger.warn(`[TESOURARIA] Erro em ${nome}: ${error.message}`);
    return res.status(400).json({ error: error.message || 'Erro no cálculo.' });
  }
});
