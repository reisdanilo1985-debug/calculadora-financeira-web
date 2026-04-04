import { Router, Request, Response } from 'express';
import { Currency } from '@correcao/core';
import { getExchangeRates, getExchangeSummary } from '../services/ExchangeService';
import logger from '../middleware/logger';

export const exchangeRouter = Router();

exchangeRouter.get('/rates', async (req: Request, res: Response) => {
  const { currencies, startDate, endDate } = req.query;

  if (!currencies || !startDate || !endDate) {
    return res.status(400).json({ error: 'currencies, startDate e endDate são obrigatórios' });
  }

  const start = new Date(startDate as string);
  const end = new Date(endDate as string);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Datas inválidas' });
  }

  const currList = (currencies as string).split(',').map(c => c.trim().toUpperCase() as Currency);
  
  try {
    const results = [];
    for (const currency of currList) {
      if (Object.values(Currency).includes(currency)) {
        const rates = await getExchangeRates(currency, start, end);
        results.push({
          currency,
          count: rates.length,
          data: rates.map(d => ({
            date: d.date.toISOString().slice(0, 10),
            sellValue: d.sellValue
          }))
        });
      }
    }
    
    return res.json(results);
  } catch (error: any) {
    logger.error('Erro ao buscar taxas de câmbio:', error);
    return res.status(500).json({ error: error.message });
  }
});

exchangeRouter.get('/latest', async (req: Request, res: Response) => {
  const currencies = [Currency.USD, Currency.EUR, Currency.GBP, Currency.JPY, Currency.CHF, Currency.CNY];
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7); // últimos 7 dias para garantir pelo menos 1 dia útil

  try {
    const results: { currency: string; rate: number; date: string }[] = [];
    for (const currency of currencies) {
      const rates = await getExchangeRates(currency, start, end);
      if (rates.length > 0) {
        const latest = rates[rates.length - 1];
        results.push({
          currency,
          rate: latest.sellValue,
          date: latest.date.toISOString().slice(0, 10),
        });
      }
    }
    return res.json(results);
  } catch (error: any) {
    logger.error('Erro ao buscar cotações mais recentes:', error);
    return res.status(500).json({ error: error.message });
  }
});

exchangeRouter.get('/summary', async (req: Request, res: Response) => {
  const { currencies, startDate, endDate } = req.query;

  if (!currencies || !startDate || !endDate) {
    return res.status(400).json({ error: 'currencies, startDate e endDate são obrigatórios' });
  }

  const start = new Date(startDate as string);
  const end = new Date(endDate as string);

  const currList = (currencies as string).split(',').map(c => c.trim().toUpperCase() as Currency);
  
  try {
    const summaries = [];
    for (const currency of currList) {
      if (Object.values(Currency).includes(currency)) {
        const summary = await getExchangeSummary(currency, start, end);
        if (summary) {
          summaries.push({
            ...summary,
            periodStart: summary.periodStart.toISOString().slice(0, 10),
            periodEnd: summary.periodEnd.toISOString().slice(0, 10),
            minRateDate: summary.minRateDate.toISOString().slice(0, 10),
            maxRateDate: summary.maxRateDate.toISOString().slice(0, 10),
          });
        }
      }
    }
    
    return res.json(summaries);
  } catch (error: any) {
    logger.error('Erro ao processar resumo de câmbio:', error);
    return res.status(500).json({ error: error.message });
  }
});
