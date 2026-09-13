import logger from '../middleware/logger';
import { fetchProxyConfig } from './marketdata/proxyAgent';

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'], ...fetchProxyConfig() });

export interface UnderlyingQuote {
  symbol: string;
  price: number;
  currency: string;
  timestamp: string;
  source: string;
  delayed: boolean;
}

export interface OptionsMarketProvider {
  getUnderlying(symbol: string): Promise<UnderlyingQuote | null>;
}

const cache = new Map<string, { at: number; quote: UnderlyingQuote }>();
const TTL_MS = 30_000;

export class YahooUnderlyingProvider implements OptionsMarketProvider {
  async getUnderlying(rawSymbol: string): Promise<UnderlyingQuote | null> {
    const base = rawSymbol.trim().toUpperCase().replace(/\.SA$/, '');
    const symbol = `${base}.SA`;
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.quote;
    try {
      const data: any = await yahooFinance.quote(symbol);
      const price = data?.regularMarketPrice;
      if (!(price > 0)) return null;
      const quote: UnderlyingQuote = {
        symbol: base,
        price,
        currency: data.currency || 'BRL',
        timestamp: new Date().toISOString(),
        source: 'Yahoo Finance',
        delayed: true,
      };
      cache.set(symbol, { at: Date.now(), quote });
      return quote;
    } catch (error: any) {
      logger.warn(`[OptionsMarket] Cotação indisponível para ${symbol}: ${error.message}`);
      return null;
    }
  }
}

export const optionsMarketProvider: OptionsMarketProvider = new YahooUnderlyingProvider();
