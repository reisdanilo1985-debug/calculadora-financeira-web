/**
 * Serviço de integração com o FRED (Federal Reserve Economic Data).
 * Utilizado para obter dados do SOFR.
 *
 * Utiliza o endpoint CSV público do FRED - SEM necessidade de API Key.
 * Endpoint: https://fred.stlouisfed.org/graph/fredgraph.csv?id=SOFR
 */

import axios from 'axios';
import { IndexType, IndexDataPoint } from '@correcao/core';
import { saveIndexData, getIndexData, getLastCachedDate } from './DatabaseService';
import logger from '../middleware/logger';

const FRED_CSV_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=SOFR';

/**
 * Busca dados do SOFR via CSV público do FRED (sem API Key).
 */
async function fetchSOFRFromFREDCSV(
  startDate: Date,
  endDate: Date
): Promise<IndexDataPoint[]> {
  try {
    logger.info(`FRED CSV SOFR: ${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`);

    const response = await axios.get<string>(FRED_CSV_URL, {
      timeout: 20000,
      responseType: 'text',
      headers: { 'Accept': 'text/csv,text/plain,*/*' },
    });

    const lines = response.data.split('\n').slice(1); // pula o header "observation_date,SOFR"
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);

    const points: IndexDataPoint[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const [dateStr, valueStr] = trimmed.split(',');
      if (!dateStr || !valueStr || valueStr === '.' || valueStr === '') continue;

      // Filtrar pelo período solicitado
      if (dateStr < startStr || dateStr > endStr) continue;

      const value = parseFloat(valueStr);
      if (isNaN(value)) continue;

      points.push({
        date: new Date(dateStr + 'T12:00:00'),
        value,
      });
    }

    logger.info(`FRED CSV: ${points.length} registros SOFR carregados`);
    return points;
  } catch (error: any) {
    throw new Error(`Falha ao buscar SOFR do FRED CSV: ${error.message}`);
  }
}

/**
 * Busca dados do SOFR com cache local.
 */
export async function getSOFRWithCache(
  startDate: Date,
  endDate: Date
): Promise<{ data: IndexDataPoint[]; fromCache: boolean; warning?: string }> {
  const lastCachedDate = getLastCachedDate(IndexType.SOFR);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const needsFetch = !lastCachedDate || lastCachedDate < today;

  if (needsFetch) {
    try {
      // Busca desde o início do SOFR se não houver cache, ou só o incremento
      const fetchStart = lastCachedDate
        ? new Date(lastCachedDate.getTime() + 86400000)
        : new Date('2018-04-02');

      const newData = await fetchSOFRFromFREDCSV(fetchStart, today);

      if (newData.length > 0) {
        saveIndexData(IndexType.SOFR, newData);
        logger.info(`Cache SOFR atualizado: ${newData.length} novos registros`);
      }
    } catch (error: any) {
      const warning = `FRED indisponível. Usando dados SOFR em cache. (${error.message})`;
      logger.warn(warning);
      const cachedData = getIndexData(IndexType.SOFR, startDate, endDate);
      return { data: cachedData, fromCache: true, warning };
    }
  }

  const data = getIndexData(IndexType.SOFR, startDate, endDate);
  return { data, fromCache: !needsFetch };
}

/**
 * Força atualização completa do histórico do SOFR (desde 2018).
 */
export async function forceRefreshSOFR(): Promise<number> {
  const start = new Date('2018-04-02');
  const today = new Date();

  logger.info('[SOFR] Iniciando refresh completo via FRED CSV público...');
  const data = await fetchSOFRFromFREDCSV(start, today);
  const inserted = saveIndexData(IndexType.SOFR, data);

  logger.info(`[SOFR] Refresh completo: ${inserted} novos registros inseridos`);
  return inserted;
}
