import axios from 'axios';
import { Currency, ExchangeRatePoint, ExchangeSummaryMetrics } from '@correcao/core';
import logger from '../middleware/logger';

const SGS_SERIES: Partial<Record<Currency, number>> = {
  [Currency.USD]: 1,     // Dólar (Venda)
  [Currency.EUR]: 21619, // Euro (Venda)
  [Currency.JPY]: 21621, // Iene (Venda)
  [Currency.GBP]: 21623, // Libra (Venda)
  [Currency.CHF]: 21625, // Franco Suíço (Venda)
};

const BCB_BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

function formatDateSGS(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export async function getExchangeRates(
  currency: Currency,
  startDate: Date,
  endDate: Date
): Promise<ExchangeRatePoint[]> {
  if (currency === Currency.BRL) {
    return []; // 1 to 1
  }

  const series = SGS_SERIES[currency];

  try {
    if (series) {
      // Usar API BCB SGS
      const url = `${BCB_BASE_URL}.${series}/dados`;
      const params = {
        formato: 'json',
        dataInicial: formatDateSGS(startDate),
        dataFinal: formatDateSGS(endDate)
      };
      
      const { data } = await axios.get(url, { params, timeout: 15000 });
      
      return data.map((item: any) => {
        const [day, month, year] = item.data.split('/');
        return {
          date: new Date(`${year}-${month}-${day}T12:00:00`),
          sellValue: parseFloat(item.valor)
        };
      });
    } else {
      // Fallback para AwesomeAPI (Ex: CNY)
      // startDate e endDate em formato YYYYMMDD
      const startStr = startDate.toISOString().slice(0, 10).replace(/-/g, '');
      const endStr = endDate.toISOString().slice(0, 10).replace(/-/g, '');
      
      const url = `https://economia.awesomeapi.com.br/json/daily/${currency}-BRL/10000`;
      const { data } = await axios.get(url, { 
        params: { start_date: startStr, end_date: endStr },
        timeout: 15000 
      });

      return data.map((item: any) => ({
        date: new Date(parseInt(item.timestamp) * 1000),
        sellValue: parseFloat(item.ask)
      })).reverse(); // Retorna descrescente, revertemos para cronológico
    }
  } catch (error: any) {
    logger.error(`Erro ao buscar câmbio para ${currency}: ${error.message}`);
    return [];
  }
}

export async function getExchangeSummary(
  currency: Currency,
  startDate: Date,
  endDate: Date,
  rates?: ExchangeRatePoint[]
): Promise<ExchangeSummaryMetrics | null> {
  if (currency === Currency.BRL) return null;

  const data = rates || await getExchangeRates(currency, startDate, endDate);
  if (data.length === 0) return null;

  let sum = 0;
  let minRate = Number.MAX_VALUE;
  let maxRate = Number.MIN_VALUE;
  let minDate = data[0].date;
  let maxDate = data[0].date;

  for (const point of data) {
    sum += point.sellValue;
    if (point.sellValue < minRate) {
      minRate = point.sellValue;
      minDate = point.date;
    }
    if (point.sellValue > maxRate) {
      maxRate = point.sellValue;
      maxDate = point.date;
    }
  }

  const averageRate = sum / data.length;

  let crossRateUSD = undefined;
  if (currency !== Currency.USD) {
    const usdRates = await getExchangeRates(Currency.USD, startDate, endDate);
    if (usdRates.length > 0) {
      const usdAverage = usdRates.reduce((acc, p) => acc + p.sellValue, 0) / usdRates.length;
      crossRateUSD = averageRate / usdAverage;
    }
  }

  return {
    currency,
    periodStart: startDate,
    periodEnd: endDate,
    averageRate,
    minRate,
    minRateDate: minDate,
    maxRate,
    maxRateDate: maxDate,
    crossRateUSD
  };
}
