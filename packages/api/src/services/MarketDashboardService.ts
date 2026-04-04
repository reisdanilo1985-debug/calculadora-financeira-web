const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
import logger from '../middleware/logger';

export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

const TICKERS = [
  { symbol: '^BVSP', name: 'Ibovespa' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'NASDAQ' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
  { symbol: 'ETH-USD', name: 'Ethereum' },
  { symbol: 'SOL-USD', name: 'Solana' },
  { symbol: 'USDBRL=X', name: 'USD/BRL' },
  { symbol: 'CL=F', name: 'Petróleo WTI' },
  { symbol: 'DX-Y.NYB', name: 'DXY' },
];

let cacheData: MarketAsset[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos

export async function getMarketPulse(): Promise<MarketAsset[]> {
  const now = Date.now();
  if (cacheData.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cacheData;
  }

  try {
    const symbols = TICKERS.map(t => t.symbol);
    const results = await yahooFinance.quote(symbols) as any[];
    
    // Map the results back to our interface format
    const assets: MarketAsset[] = results.map((quote: any) => {
      const tickerInfo = TICKERS.find(t => t.symbol === quote.symbol);
      return {
        symbol: quote.symbol,
        name: tickerInfo?.name || quote.symbol,
        price: quote.regularMarketPrice || 0,
        change: quote.regularMarketChange || 0,
        changePercent: quote.regularMarketChangePercent || 0,
        currency: quote.currency || 'USD'
      };
    });

    // Ensure assets are in the requested order based on original TICKERS array
    const sortedAssets = TICKERS
      .map(t => assets.find(a => a.symbol === t.symbol) as MarketAsset)
      .filter(Boolean);

    cacheData = sortedAssets;
    cacheTimestamp = now;
    
    return sortedAssets;
  } catch (error: any) {
    console.error('CRITICAL YAHOO ERROR:', error);
    logger.error(`Erro ao buscar pulse do mercado: ${error.message}`);
    // Na falha mantemos o cache persistente mesmo se expirado como fallback
    return cacheData; 
  }
}
