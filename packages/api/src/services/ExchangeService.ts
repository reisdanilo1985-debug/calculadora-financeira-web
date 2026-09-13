import axios from 'axios';
import { Currency, ExchangeRatePoint, ExchangeSummaryMetrics } from '@correcao/core';
import { proxyConfig } from './marketdata/proxyAgent';
import logger from '../middleware/logger';

const SGS_SERIES: Partial<Record<Currency, number>> = {
  [Currency.USD]: 1,     // Dólar (Venda)
  [Currency.EUR]: 21619, // Euro (Venda)
  [Currency.JPY]: 21621, // Iene (Venda)
  [Currency.GBP]: 21623, // Libra (Venda)
  [Currency.CHF]: 21625, // Franco Suíço (Venda)
};

const BCB_BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

/**
 * Datas de consulta são datas CIVIS representadas como Date local (as rotas
 * convertem "AAAA-MM-DD" por componentes, ao meio-dia) — por isso os
 * componentes locais. Nunca passar `new Date("AAAA-MM-DD")`: é meia-noite UTC
 * e, em America/Sao_Paulo, cai no dia anterior (F3-01).
 */
function componentesCivis(date: Date): { y: string; m: string; d: string } {
  return {
    y: String(date.getFullYear()),
    m: String(date.getMonth() + 1).padStart(2, '0'),
    d: String(date.getDate()).padStart(2, '0'),
  };
}

function formatDateSGS(date: Date): string {
  const { y, m, d } = componentesCivis(date);
  return `${d}/${m}/${y}`;
}

/** Data civil de Brasília (UTC−3) de um instante Unix, como Date local ao meio-dia. */
function diaCivilBrasilia(epochSeconds: number): Date {
  const [y, m, d] = new Date(epochSeconds * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
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
      
      const { data } = await axios.get(url, { params, timeout: 15000, ...proxyConfig() });
      
      return data.map((item: any) => {
        const [day, month, year] = item.data.split('/');
        return {
          date: new Date(`${year}-${month}-${day}T12:00:00`),
          sellValue: parseFloat(item.valor)
        };
      });
    } else {
      // Fallback para AwesomeAPI (Ex: CNY)
      // startDate e endDate em formato YYYYMMDD (data civil, componentes locais)
      const ini = componentesCivis(startDate);
      const fim = componentesCivis(endDate);
      const startStr = `${ini.y}${ini.m}${ini.d}`;
      const endStr = `${fim.y}${fim.m}${fim.d}`;

      const url = `https://economia.awesomeapi.com.br/json/daily/${currency}-BRL/10000`;
      const { data } = await axios.get(url, {
        params: { start_date: startStr, end_date: endStr },
        timeout: 15000,
        ...proxyConfig(),
      });

      // timestamp = instante da última cotação do dia; a data do ponto é a data
      // civil em Brasília (um fechamento após 21h BRT já é o dia seguinte em UTC).
      return data.map((item: any) => ({
        date: diaCivilBrasilia(parseInt(item.timestamp)),
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
