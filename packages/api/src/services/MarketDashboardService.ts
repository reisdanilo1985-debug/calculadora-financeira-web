const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
import logger from '../middleware/logger';

export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  type: 'price' | 'yield' | 'index';
}

const TICKERS: { symbol: string; name: string; type: MarketAsset['type'] }[] = [
  { symbol: '^BVSP',      name: 'Ibovespa',       type: 'index' },
  { symbol: '^GSPC',      name: 'S&P 500',         type: 'index' },
  { symbol: '^IXIC',      name: 'NASDAQ',          type: 'index' },
  { symbol: '^VIX',       name: 'VIX',             type: 'index' },
  { symbol: 'GC=F',       name: 'Ouro',            type: 'price' },
  { symbol: 'SI=F',       name: 'Prata',           type: 'price' },
  { symbol: 'CL=F',       name: 'Petróleo WTI',    type: 'price' },
  { symbol: 'BTC-USD',    name: 'Bitcoin',         type: 'price' },
  { symbol: 'BTC=F',      name: 'BTC Futuro CME',  type: 'price' },
  { symbol: 'ETH-USD',    name: 'Ethereum',        type: 'price' },
  { symbol: 'SOL-USD',    name: 'Solana',          type: 'price' },
  { symbol: 'TIO=F',      name: 'Minério Ferro',   type: 'price' },
  { symbol: 'USDBRL=X',   name: 'USD/BRL',         type: 'price' },
  { symbol: 'DX-Y.NYB',   name: 'DXY',             type: 'index' },
  { symbol: '^TNX',       name: 'US 10Y',          type: 'yield' },
  { symbol: 'BR10YT=RR',  name: 'BR 10Y',          type: 'yield' },
  { symbol: 'JP10YT=RR',  name: 'JP 10Y',          type: 'yield' },
];

let cacheData: MarketAsset[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 segundos

export async function getMarketPulse(): Promise<MarketAsset[]> {
  const now = Date.now();
  if (cacheData.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cacheData;
  }

  try {
    const symbols = TICKERS.map(t => t.symbol);
    
    // Chunk requests into groups of 5 to avoid Yahoo Finance batch array limits or partial failures
    const results: any[] = [];
    for (let i = 0; i < symbols.length; i += 5) {
      const chunk = symbols.slice(i, i + 5);
      try {
        const res = await yahooFinance.quote(chunk);
        if (res) {
          if (Array.isArray(res)) {
            results.push(...res.filter(r => r && r.symbol));
          } else if (res.symbol) {
            results.push(res);
          }
        }
      } catch (err) {
        logger.warn(`[MarketDashboard] Falha ao buscar chunk: ${chunk.join(', ')}`);
      }
    }

    const assets: MarketAsset[] = results
      .filter(quote => quote && quote.symbol)
      .map((quote: any) => {
        const tickerInfo = TICKERS.find(t => t.symbol === quote.symbol);
        return {
          symbol: quote.symbol,
          name: tickerInfo?.name || quote.symbol,
          price: quote.regularMarketPrice || 0,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0,
          currency: quote.currency || 'USD',
          type: tickerInfo?.type || 'price',
        };
      });

    const sortedAssets = TICKERS
      .map(t => assets.find(a => a.symbol === t.symbol) as MarketAsset)
      .filter(Boolean);

    cacheData = sortedAssets;
    cacheTimestamp = now;

    return sortedAssets;
  } catch (error: any) {
    logger.error(`Erro ao buscar pulse do mercado: ${error.message}`);
    return cacheData;
  }
}
