import { Router, Request, Response } from 'express';
import { Currency } from '@correcao/core';
import { getExchangeRates, getExchangeSummary } from '../services/ExchangeService';
import {
  PtaxService,
  PtaxSourceError,
  PtaxUnsupportedCurrencyError,
  parsePtaxBulletin,
} from '../services/PtaxService';
import logger from '../middleware/logger';

export const exchangeRouter = Router();

/**
 * Datas de consulta como data CIVIL (F3-01).
 *
 * "AAAA-MM-DD" (o que o <input type="date"> envia) e "DD/MM/AAAA" viram Date
 * LOCAL ao meio-dia, montada por componentes — `new Date("2025-01-02")` seria
 * meia-noite UTC e, num servidor em America/Sao_Paulo, a janela consultada
 * recuaria um dia. Datas com hora ("2025-01-02T12:00:00", ISO com fuso) seguem
 * o parse nativo. Datas civis inexistentes (31/02) → Invalid Date.
 */
function parseDataCivil(valor: unknown): Date {
  if (typeof valor !== 'string') return new Date(NaN);
  const texto = valor.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (iso || br) {
    const [y, m, d] = iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [Number(br![3]), Number(br![2]), Number(br![1])];
    const data = new Date(y, m - 1, d, 12);
    return data.getFullYear() === y && data.getMonth() === m - 1 && data.getDate() === d ? data : new Date(NaN);
  }
  return new Date(texto);
}

/** Dia civil (componentes locais) para comparar início × fim sem a hora. */
function chaveDia(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Valida o par de datas; responde 400 e retorna null se inválido. */
function lerPeriodo(res: Response, startDate: unknown, endDate: unknown): { start: Date; end: Date } | null {
  const start = parseDataCivil(startDate);
  const end = parseDataCivil(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: 'Datas inválidas' });
    return null;
  }
  if (chaveDia(start) > chaveDia(end)) {
    res.status(400).json({ error: 'Data inicial posterior à data final' });
    return null;
  }
  return { start, end };
}

exchangeRouter.get('/rates', async (req: Request, res: Response) => {
  const { currencies, startDate, endDate } = req.query;

  if (!currencies || !startDate || !endDate) {
    return res.status(400).json({ error: 'currencies, startDate e endDate são obrigatórios' });
  }

  const periodo = lerPeriodo(res, startDate, endDate);
  if (!periodo) return;
  const { start, end } = periodo;

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

  const periodo = lerPeriodo(res, startDate, endDate);
  if (!periodo) return;
  const { start, end } = periodo;

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

// --- Rotas PTAX ---

exchangeRouter.get('/ptax/moedas', async (req: Request, res: Response) => {
  try {
    const currencies = await PtaxService.getCurrencies();
    if (currencies.length === 0) {
      return res.status(502).json({ error: 'Lista de moedas PTAX indisponível no BCB (Olinda). Tente novamente em alguns minutos.' });
    }
    return res.json(currencies);
  } catch (error: any) {
    logger.error('Erro ao buscar moedas PTAX:', error);
    return res.status(500).json({ error: error.message });
  }
});

exchangeRouter.get('/ptax/cotacao', async (req: Request, res: Response) => {
  const { currency, startDate, endDate, bulletin = 'Fechamento' } = req.query;

  if (!currency || !startDate || !endDate) {
    return res.status(400).json({ error: 'currency, startDate e endDate são obrigatórios' });
  }

  const periodo = lerPeriodo(res, startDate, endDate);
  if (!periodo) return;
  const { start, end } = periodo;

  const moeda = String(currency).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(moeda)) {
    return res.status(400).json({ error: 'Moeda inválida: use o código ISO de 3 letras (ex.: USD, EUR).' });
  }

  const boletim = parsePtaxBulletin(bulletin);
  if (!boletim) {
    return res.status(400).json({ error: 'Boletim inválido: use Abertura, Intermediário, Fechamento ou Todos.' });
  }

  try {
    await PtaxService.assertSupportedCurrency(moeda);

    const summary = await PtaxService.getSummaryPeriod(moeda, start, end, boletim);

    if (!summary) {
      return res.status(404).json({ error: 'Nenhuma cotação encontrada no período' });
    }

    return res.json(summary);
  } catch (error: any) {
    if (error instanceof PtaxUnsupportedCurrencyError) {
      return res.status(422).json({ error: error.message, available: error.available });
    }
    if (error instanceof PtaxSourceError) {
      logger.warn(`PTAX: ${error.message}`);
      return res.status(502).json({
        error: 'Fonte PTAX do BCB (Olinda) indisponível ou com erro. Não foi possível verificar se há cotação no período; tente novamente.',
        detail: error.message,
      });
    }
    logger.error('Erro ao buscar PTAX:', error);
    return res.status(500).json({ error: error.message });
  }
});
