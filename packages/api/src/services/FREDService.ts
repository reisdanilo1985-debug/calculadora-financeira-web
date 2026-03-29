/**
 * Serviço de integração com a API FRED (Federal Reserve Economic Data).
 * Utilizado para obter dados do SOFR.
 *
 * API key gratuita: https://fred.stlouisfed.org/docs/api/api_key.html
 * Série: SOFR
 */

import axios, { AxiosError } from 'axios';
import { IndexType, IndexDataPoint } from '@correcao/core';
import { saveIndexData, getIndexData, getLastCachedDate } from './DatabaseService';
import logger from '../middleware/logger';

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const SOFR_SERIES_ID = 'SOFR';

interface FREDObservation {
  date: string;     // YYYY-MM-DD
  value: string;    // valor ou '.'
}

interface FREDResponse {
  observations: FREDObservation[];
}

function toFREDDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Busca dados do SOFR via API FRED.
 */
async function fetchSOFRFromFRED(
  startDate: Date,
  endDate: Date,
  apiKey: string
): Promise<IndexDataPoint[]> {
  try {
    logger.info(`FRED SOFR: ${toFREDDate(startDate)} → ${toFREDDate(endDate)}`);

    const response = await axios.get<FREDResponse>(FRED_BASE_URL, {
      params: {
        series_id: SOFR_SERIES_ID,
        api_key: apiKey,
        file_type: 'json',
        observation_start: toFREDDate(startDate),
        observation_end: toFREDDate(endDate),
        sort_order: 'asc',
      },
      timeout: 15000,
    });

    return response.data.observations
      .filter(obs => obs.value !== '.' && !isNaN(parseFloat(obs.value)))
      .map(obs => ({
        date: new Date(obs.date + 'T12:00:00'),
        value: parseFloat(obs.value),
      }));
  } catch (error) {
    const axiosError = error as AxiosError;
    throw new Error(`Falha ao buscar SOFR do FRED: ${axiosError.message}`);
  }
}

/**
 * Busca dados do SOFR com cache.
 */
export async function getSOFRWithCache(
  startDate: Date,
  endDate: Date
): Promise<{ data: IndexDataPoint[]; fromCache: boolean; warning?: string }> {
  const apiKey = process.env.FRED_API_KEY;

  if (!apiKey) {
    const cachedData = getIndexData(IndexType.SOFR, startDate, endDate);
    if (cachedData.length > 0) {
      return {
        data: cachedData,
        fromCache: true,
        warning: 'FRED_API_KEY não configurada. Usando dados em cache.',
      };
    }
    throw new Error(
      'FRED_API_KEY não configurada. Configure a variável de ambiente para buscar dados do SOFR.'
    );
  }

  const lastCachedDate = getLastCachedDate(IndexType.SOFR);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const needsFetch = !lastCachedDate || lastCachedDate < today;

  if (needsFetch) {
    try {
      const fetchStart = lastCachedDate
        ? new Date(lastCachedDate.getTime() + 86400000)
        : new Date('2018-04-02'); // Data de início do SOFR

      const newData = await fetchSOFRFromFRED(fetchStart, today, apiKey);

      if (newData.length > 0) {
        saveIndexData(IndexType.SOFR, newData);
        logger.info(`Cache SOFR atualizado: ${newData.length} registros`);
      }
    } catch (error) {
      const warning = `API FRED indisponível. Usando dados SOFR em cache.`;
      logger.warn(warning);
      const cachedData = getIndexData(IndexType.SOFR, startDate, endDate);
      return { data: cachedData, fromCache: true, warning };
    }
  }

  const data = getIndexData(IndexType.SOFR, startDate, endDate);
  return { data, fromCache: !needsFetch };
}

/**
 * Força atualização completa do histórico do SOFR.
 */
export async function forceRefreshSOFR(): Promise<number> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY não configurada.');

  const start = new Date('2018-04-02');
  const today = new Date();

  const data = await fetchSOFRFromFRED(start, today, apiKey);
  const inserted = saveIndexData(IndexType.SOFR, data);

  logger.info(`Refresh completo SOFR: ${inserted} novos registros`);
  return inserted;
}
