import { Router, Request, Response } from 'express';
import { getMarketPulse } from '../services/MarketDashboardService';
import logger from '../middleware/logger';

export const marketRouter = Router();

marketRouter.get('/pulse', async (_req: Request, res: Response) => {
  try {
    const data = await getMarketPulse();
    return res.json(data);
  } catch (error: any) {
    logger.error('Erro ao buscar pulso de mercado:', error);
    return res.status(500).json({ error: error.message });
  }
});
