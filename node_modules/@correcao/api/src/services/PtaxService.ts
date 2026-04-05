import axios from 'axios';
import logger from '../middleware/logger';

const OLINDA_BASE_URL = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';

export interface BcbCurrency {
  simbolo: string;
  nomeFormatado: string;
  tipoMoeda: string;
}

export type PtaxBulletinType = 'Abertura' | 'Intermediário' | 'Fechamento' | 'Todos';

export interface PtaxQuote {
  date: Date;
  buyRate: number;
  sellRate: number;
  buyParity?: number;
  sellParity?: number;
  bulletinType: string;
  timestamp: string;
}

// Formato MM-DD-YYYY exigido pela API Olinda
function formatOlindaDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${m}-${d}-${y}`; 
}

export class PtaxService {
  private static currenciesCache: BcbCurrency[] | null = null;
  private static lastCacheUpdate: number = 0;

  /** Retorna a lista de moedas suportadas pelo ptax */
  static async getCurrencies(): Promise<BcbCurrency[]> {
    const now = Date.now();
    // Cache de 24 horas
    if (this.currenciesCache && now - this.lastCacheUpdate < 24 * 60 * 60 * 1000) {
      return this.currenciesCache;
    }

    try {
      const url = `${OLINDA_BASE_URL}/Moedas?$format=json`;
      const { data } = await axios.get(url, { timeout: 15000 });
      if (data && data.value) {
        this.currenciesCache = data.value;
        this.lastCacheUpdate = now;
        return data.value;
      }
      return [];
    } catch (error: any) {
      logger.error(`Erro ao buscar moedas PTAX: ${error.message}`);
      return [];
    }
  }

  /** Consulta Dólar num período */
  static async getDolarPeriod(startDate: Date, endDate: Date): Promise<PtaxQuote[]> {
    try {
      const startStr = formatOlindaDate(startDate);
      const endStr = formatOlindaDate(endDate);
      const url = `${OLINDA_BASE_URL}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${startStr}'&@dataFinalCotacao='${endStr}'&$format=json`;
      
      const { data } = await axios.get(url, { timeout: 15000 });
      return (data.value || []).map((item: any) => ({
        date: new Date(item.dataHoraCotacao),
        buyRate: parseFloat(item.cotacaoCompra),
        sellRate: parseFloat(item.cotacaoVenda),
        bulletinType: item.tipoBoletim || 'Desconhecido',
        timestamp: item.dataHoraCotacao
      }));
    } catch (error: any) {
      logger.error(`Erro ao buscar PTAX Dólar período: ${error.message}`);
      return [];
    }
  }

  /** Consulta qualquer moeda num período */
  static async getCurrencyPeriod(currency: string, startDate: Date, endDate: Date): Promise<PtaxQuote[]> {
    if (currency.toUpperCase() === 'USD') {
      return this.getDolarPeriod(startDate, endDate);
    }
    
    try {
      const startStr = formatOlindaDate(startDate);
      const endStr = formatOlindaDate(endDate);
      const url = `${OLINDA_BASE_URL}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${currency.toUpperCase()}'&@dataInicial='${startStr}'&@dataFinalCotacao='${endStr}'&$format=json`;
      
      const { data } = await axios.get(url, { timeout: 15000 });
      return (data.value || []).map((item: any) => ({
        date: new Date(item.dataHoraCotacao),
        buyRate: parseFloat(item.cotacaoCompra),
        sellRate: parseFloat(item.cotacaoVenda),
        buyParity: parseFloat(item.paridadeCompra),
        sellParity: parseFloat(item.paridadeVenda),
        bulletinType: item.tipoBoletim || 'Desconhecido',
        timestamp: item.dataHoraCotacao
      }));
    } catch (error: any) {
      logger.error(`Erro ao buscar PTAX ${currency} período: ${error.message}`);
      return [];
    }
  }

  /** Retorna apenas os fechamentos (ou um boletim específico) * e calcula sumarizações */
  static async getSummaryPeriod(currency: string, startDate: Date, endDate: Date, bulletin: PtaxBulletinType = 'Fechamento') {
    const quotes = await this.getCurrencyPeriod(currency, startDate, endDate);
    
    // Filtrar pelo boletim desejado (usualmente Fechamento)
    const filteredQuotes = bulletin === 'Todos' 
      ? quotes 
      : quotes.filter(q => q.bulletinType === bulletin);
    
    if (filteredQuotes.length === 0) return null;

    let sumBuy = 0;
    let sumSell = 0;
    let minSellRate = Number.MAX_VALUE;
    let maxSellRate = Number.MIN_VALUE;
    let minSellDate = filteredQuotes[0].date;
    let maxSellDate = filteredQuotes[0].date;

    // Agrupar por dia para contar os dias com dados
    const dateSet = new Set<string>();

    for (const q of filteredQuotes) {
      sumBuy += q.buyRate;
      sumSell += q.sellRate;
      
      if (q.sellRate < minSellRate) {
        minSellRate = q.sellRate;
        minSellDate = q.date;
      }
      if (q.sellRate > maxSellRate) {
        maxSellRate = q.sellRate;
        maxSellDate = q.date;
      }
      
      dateSet.add(q.date.toISOString().slice(0, 10));
    }

    const count = filteredQuotes.length;
    const lastQuote = filteredQuotes[filteredQuotes.length - 1];

    return {
      currency,
      periodStart: startDate,
      periodEnd: endDate,
      bulletinType: bulletin,
      averageBuyRate: sumBuy / count,
      averageSellRate: sumSell / count,
      minSellRate,
      minSellDate,
      maxSellRate,
      maxSellDate,
      businessDays: dateSet.size,
      lastQuoteBuy: lastQuote.buyRate,
      lastQuoteSell: lastQuote.sellRate,
      lastQuoteDate: lastQuote.date,
      quotes: filteredQuotes
    };
  }
}
