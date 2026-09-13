import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { simulateOptionsStrategy } from '@correcao/core';
import { optionsMarketProvider } from '../services/OptionsMarketProvider';
import logger from '../middleware/logger';

export const optionsRouter = Router();

const nonNegative = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const costSide = z.object({ fixedPerOrder: nonNegative, perContract: nonNegative, percentNotional: nonNegative.max(1) });
const leg = z.object({
  id: z.string().min(1).max(80), symbol: z.string().max(30), instrument: z.enum(['OPTION', 'UNDERLYING']),
  side: z.enum(['LONG', 'SHORT']), optionType: z.enum(['CALL', 'PUT']).optional(), quantity: positive,
  multiplier: positive, strike: positive.optional(), expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  premium: nonNegative, impliedVolatility: positive.max(5).optional(),
}).superRefine((value, ctx) => {
  if (value.instrument === 'OPTION' && (!value.optionType || !value.strike || !value.expiry)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Opções exigem tipo, strike e vencimento.' });
  }
});
const simulationSchema = z.object({
  strategyName: z.string().max(100).optional(),
  market: z.object({
    symbol: z.string().min(2).max(20), spot: positive, valuationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    riskFreeRate: z.number().finite().min(-1).max(5), dividendYield: z.number().finite().min(-1).max(5), currency: z.literal('BRL'),
  }),
  legs: z.array(leg).min(1).max(20),
  costs: z.object({ entry: costSide, exit: costSide, exercisePerContract: nonNegative, includeExitCosts: z.boolean() }),
  grid: z.object({ spotMin: nonNegative, spotMax: positive, spotSteps: z.number().int().min(5).max(201), dateSteps: z.number().int().min(2).max(60), volatilityShift: z.number().finite().min(-5).max(5) }),
});

optionsRouter.post('/simulate', (req: Request, res: Response) => {
  const parsed = simulationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Parâmetros inválidos.', details: parsed.error.flatten() });
  try {
    return res.json(simulateOptionsStrategy(parsed.data));
  } catch (error: any) {
    logger.warn(`[Options] Simulação recusada: ${error.message}`);
    return res.status(422).json({ error: error.message || 'Não foi possível simular a estratégia.' });
  }
});

optionsRouter.get('/underlying/:symbol', async (req: Request, res: Response) => {
  const symbol = req.params.symbol.trim().toUpperCase();
  if (!/^[A-Z]{4}\d{1,2}$/.test(symbol)) return res.status(400).json({ error: 'Informe um ticker B3 válido, como PETR4.' });
  const quote = await optionsMarketProvider.getUnderlying(symbol);
  if (!quote) return res.status(404).json({ error: 'Cotação indisponível. Informe o preço manualmente.' });
  return res.json(quote);
});
