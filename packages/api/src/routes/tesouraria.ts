/**
 * Rotas de Tesouraria.
 *   GET  /api/tesouraria/premissas          → snapshot de premissas (escalares+curvas+proveniência)
 *   POST /api/tesouraria/premissas/refresh  → força reconstrução do snapshot
 *   POST /api/tesouraria/calc/:nome         → executa um dos 13 calculadores puros
 *
 * Convenção: taxas em FRAÇÃO decimal (0.144 = 14,40%), idêntica ao core.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  conversor,
  crossCcyToCdi,
  cdiToCrossCcy,
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

tesourariaRouter.post('/premissas/refresh', async (req: Request, res: Response) => {
  try {
    // ?fonte=tesouro pula a ANBIMA (override técnico p/ diagnóstico/comparação).
    const fonte = req.query.fonte === 'tesouro' ? 'tesouro' : 'auto';
    const snap = await getPremissasSnapshot(true, fonte);
    return res.json(snap);
  } catch (error: any) {
    logger.error('[TESOURARIA] Erro ao atualizar premissas:', error.message);
    return res.status(500).json({ error: 'Falha ao atualizar premissas de mercado.' });
  }
});

// ─────────────────────────────── Validação (zod) ──────────────────────────────

/** Aceita number ou string numérica (BR "1.234,56" ou "1234.56") e converte para number finito. */
const numeroFlexivel = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'deve ser um número válido' });
      return z.NEVER;
    }
    return n;
  });

const dataFlexivel = z
  .union([z.string(), z.date()])
  .transform((v, ctx) => {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'data inválida' });
      return z.NEVER;
    }
    return d;
  });

const fluxoSchema = z.object({
  date: dataFlexivel,
  amount: numeroFlexivel,
});

/** Schemas por calculador — valida os campos numéricos/data que a rota manipula antes de repassar ao core. */
const BODY_SCHEMAS: Record<string, z.ZodTypeAny> = {
  conversor: z.object({
    iaa: numeroFlexivel,
    du: numeroFlexivel.optional(),
    dc: numeroFlexivel.optional(),
    m: numeroFlexivel.optional(),
  }),
  'cross-ccy': z.object({
    modo: z.enum(['cdiParaMoeda', 'moedaParaCdi']).optional(),
    spreadEstrangeiroAa: numeroFlexivel.optional(),
    cdiAa: numeroFlexivel,
    cupomEstrangeiroAa: numeroFlexivel,
    spreadLocalAa: numeroFlexivel.optional(),
  }),
  'pre-cdi': z.object({
    modo: z.enum(['cdiParaPre', 'preParaCdi']).optional(),
    preAa: numeroFlexivel.optional(),
    pctCdi: numeroFlexivel.optional(),
    cdiAa: numeroFlexivel,
  }),
  'cdi-spread': z.object({
    modo: z.enum(['pctParaSpread', 'spreadParaPct']).optional(),
    cdiAa: numeroFlexivel,
    spreadAa: numeroFlexivel.optional(),
    pctCdi: numeroFlexivel.optional(),
  }),
  ipca: z.object({
    realAa: numeroFlexivel,
    ipcaAa: numeroFlexivel,
    cdiAa: numeroFlexivel,
    preMercadoAa: numeroFlexivel.optional(),
  }),
  'tir-vpl': z.object({
    fluxos: z.array(fluxoSchema).min(1, 'informe ao menos um fluxo'),
    taxaDesconto: numeroFlexivel.optional(),
    custoCapital: numeroFlexivel.optional(),
  }),
  amortizacao: z.object({
    principal: numeroFlexivel,
    i: numeroFlexivel,
    n: numeroFlexivel,
  }),
  duration: z.object({
    face: numeroFlexivel,
    couponRateAnnual: numeroFlexivel,
    ytm: numeroFlexivel,
    m: numeroFlexivel,
    n: numeroFlexivel,
  }),
  'pu-titulos': z.object({
    tipo: z.enum(['LTN', 'NTNF']).optional(),
    vn: numeroFlexivel.optional(),
    face: numeroFlexivel.optional(),
    iaa: numeroFlexivel,
    du: numeroFlexivel.optional(),
    couponRateAnnual: numeroFlexivel.optional(),
    m: numeroFlexivel.optional(),
    cuponsDu: z.array(numeroFlexivel).optional(),
  }),
  swap: z.object({
    notional: numeroFlexivel,
    preContratada: numeroFlexivel,
    preMercadoAa: numeroFlexivel,
    duTotal: numeroFlexivel,
    duDecorridos: numeroFlexivel,
    fatorCdiAcumulado: numeroFlexivel,
  }),
  'forward-ndf': z.object({
    modo: z.enum(['forward', 'ndf']).optional(),
    spot: numeroFlexivel.optional(),
    iBrAa: numeroFlexivel.optional(),
    du: numeroFlexivel.optional(),
    cupomUsdAa: numeroFlexivel.optional(),
    dc: numeroFlexivel.optional(),
    ptaxVencimento: numeroFlexivel.optional(),
    kContratado: numeroFlexivel.optional(),
    notionalUsd: numeroFlexivel.optional(),
  }),
  'us-money-market': z
    .object({
      modo: z.enum(['sofr', 'juros', 'tbill']).optional(),
      face: numeroFlexivel.optional(),
      preco: numeroFlexivel.optional(),
      dias: numeroFlexivel.optional(),
      sofrAa: numeroFlexivel.optional(),
      spreadAa: numeroFlexivel.optional(),
      notional: numeroFlexivel.optional(),
      taxa: numeroFlexivel.optional(),
      d0: dataFlexivel.optional(),
      d1: dataFlexivel.optional(),
    })
    .refine(b => b.modo !== 'juros' || (b.d0 && b.d1), { message: 'd0 e d1 são obrigatórios no modo "juros"' }),
};

/** Schema genérico de fallback: objeto simples, sem campos extras exigidos. */
const GENERIC_SCHEMA = z.record(z.unknown());

function validateBody(nome: string, body: unknown): { data?: any; error?: string } {
  const schema = BODY_SCHEMAS[nome] ?? GENERIC_SCHEMA;
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first.path.join('.');
    return { error: `${path ? path + ': ' : ''}${first.message}` };
  }
  return { data: parsed.data };
}

/** Converte fluxos com data string → Date. */
function parseFluxos(fluxos: any[]): { date: Date; amount: number }[] {
  return fluxos.map(f => ({ date: f.date instanceof Date ? f.date : new Date(f.date), amount: Number(f.amount) }));
}

/** Dispatcher: nome canônico → função do core, com adaptação de inputs. */
const CALCULADORES: Record<string, (body: any) => unknown> = {
  conversor: b => conversor(b),
  'cross-ccy': b => (b.modo === 'cdiParaMoeda' ? cdiToCrossCcy(b) : crossCcyToCdi(b)),
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

  const { data, error } = validateBody(nome, req.body);
  if (error) {
    return res.status(400).json({ error: `Payload inválido — ${error}` });
  }

  try {
    const result = fn(data);
    return res.json(result);
  } catch (error: any) {
    logger.warn(`[TESOURARIA] Erro em ${nome}: ${error.message}`);
    return res.status(400).json({ error: error.message || 'Erro no cálculo.' });
  }
});
