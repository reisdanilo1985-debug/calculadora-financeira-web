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
  parseDataCivil,
} from '@correcao/core';
import { getPremissasSnapshot } from '../services/marketdata/snapshot';
import { coordenarCarga } from '../services/BCBService';
import { limitarOperacaoAdmin } from '../middleware/adminAuth';
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

// O botão "Atualizar" da Tesouraria é público, então a rota não exige token (E10):
// em vez disso, reconstruções concorrentes são deduplicadas e há limite por fonte
// para uma requisição externa não disparar cargas repetidas nas fontes.
tesourariaRouter.post(
  '/premissas/refresh',
  limitarOperacaoAdmin({
    operacao: req => `tesouraria:premissas:${req.query.fonte === 'tesouro' ? 'tesouro' : 'auto'}`,
    limite: 6,
    janelaMs: 10 * 60 * 1000,
  }),
  async (req: Request, res: Response) => {
  try {
    // ?fonte=tesouro pula a ANBIMA (override técnico p/ diagnóstico/comparação).
    const fonte = req.query.fonte === 'tesouro' ? 'tesouro' : 'auto';
    const snap = await coordenarCarga(`tesouraria:premissas:${fonte}`, 'completa', () => getPremissasSnapshot(true, fonte));
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

/**
 * Data de entrada → DATA CIVIL (Date à meia-noite local), igual em qualquer fuso
 * de servidor (auditoria 2026-09-12, N02). `new Date('2026-03-01')` é meia-noite
 * UTC: num servidor em São Paulo virava 28/02 e o 30/360 contava 32 dias.
 *  - 'AAAA-MM-DD' / 'DD/MM/AAAA'  → a própria data;
 *  - datetime sem fuso            → a data escrita;
 *  - datetime com Z/deslocamento  → data civil do instante em America/Sao_Paulo.
 * Outros formatos (ex.: 'MM/DD/AAAA' lido em silêncio pelo Date) → 400.
 */
const dataFlexivel = z
  .union([z.string(), z.date()])
  .transform((v, ctx) => {
    const d = v instanceof Date ? v : parseDataCivil(v);
    if (!d || isNaN(d.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'data inválida (use AAAA-MM-DD ou DD/MM/AAAA)',
      });
      return z.NEVER;
    }
    return d;
  });

/**
 * Limites de domínio para calculadores com laço síncrono por período (duration,
 * amortização). Sem teto, n = 1.000.000 bloqueava o event loop por dezenas de
 * segundos (auditoria 2026-09-12, F2-04). 1.200 períodos = 100 anos mensais.
 * Espelha a validação de core/treasury/calculators/duration.ts — a API consome
 * o `dist` do core, então a rota valida por conta própria antes de chamar o core.
 */
const MAX_PERIODOS = 1200;
const MAX_PAGAMENTOS_ANO = 365;
/** Prazo do cross-currency: até 100 anos. */
const MAX_DU_PRAZO = 25200;
const MAX_DC_PRAZO = 36500;

/** Inteiro em [min, max], aceitando o mesmo formato flexível de numeroFlexivel. */
const inteiroNaFaixa = (min: number, max: number, descricao: string) => {
  const msg = `deve ser um inteiro entre ${min} e ${max} (${descricao})`;
  return numeroFlexivel.pipe(z.number().int(msg).min(min, msg).max(max, msg));
};

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
  'cross-ccy': z
    .object({
      modo: z.enum(['cdiParaMoeda', 'moedaParaCdi']).optional(),
      spreadEstrangeiroAa: numeroFlexivel.optional(),
      cdiAa: numeroFlexivel,
      cupomEstrangeiroAa: numeroFlexivel,
      spreadLocalAa: numeroFlexivel.optional(),
      // Prazo da paridade (N18): CDI em base 252 (du); cupom e spread lineares 360 (dc).
      du: inteiroNaFaixa(1, MAX_DU_PRAZO, 'dias úteis do prazo').optional(),
      dc: inteiroNaFaixa(1, MAX_DC_PRAZO, 'dias corridos do prazo').optional(),
    })
    .refine(b => (b.du == null) === (b.dc == null), {
      message: 'informe du e dc do prazo juntos (ou nenhum dos dois)',
      path: ['du'],
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
    // Mesmo teto de períodos: n alto gera 2 tabelas de n linhas (n = 1e6 ≈ 3 s de
    // CPU no core + resposta JSON de centenas de MB). Só o teto — n ≤ 0 continua
    // sendo rejeitado pelo core e n fracionário não é tratado aqui.
    n: numeroFlexivel.pipe(
      z.number().max(MAX_PERIODOS, `deve ser no máximo ${MAX_PERIODOS} (limite de parcelas)`)
    ),
  }),
  duration: z.object({
    face: numeroFlexivel,
    couponRateAnnual: numeroFlexivel,
    ytm: numeroFlexivel,
    m: inteiroNaFaixa(1, MAX_PAGAMENTOS_ANO, 'pagamentos por ano'),
    n: inteiroNaFaixa(1, MAX_PERIODOS, 'limite de períodos'),
    // N05: 'simples' (face·taxa/m, padrão) ou 'ntnf' ((1+taxa)^(1/m) − 1, igual ao PU NTN-F).
    convencaoCupom: z.enum(['simples', 'ntnf']).optional(),
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

/** Fluxos já validados pelo schema (data civil via dataFlexivel; valor numérico). */
function parseFluxos(fluxos: { date: Date; amount: number }[]): { date: Date; amount: number }[] {
  return fluxos.map(f => ({ date: f.date, amount: f.amount }));
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
        // d0/d1 já chegam como data civil local (dataFlexivel) — sem novo parse UTC.
        return jurosConvencoes({ ...b, d0: b.d0, d1: b.d1 });
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
