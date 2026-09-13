/**
 * Serviço de integração com o FRED (Federal Reserve Economic Data).
 * Utilizado para obter dados do SOFR.
 *
 * Utiliza o endpoint CSV público do FRED - SEM necessidade de API Key.
 * Endpoint: https://fred.stlouisfed.org/graph/fredgraph.csv?id=SOFR
 */

import axios from 'axios';
import { IndexType, IndexDataPoint } from '@correcao/core';
import {
  saveIndexDataDetailed,
  getIndexData,
  getLastCachedDate,
  getIndexFetchedAt,
  setIndexFetchedAt,
} from './DatabaseService';
import { coordenarCarga, cargaEmAndamento, isCacheExpired, REVISION_WINDOW_DAYS_DAILY } from './BCBService';
import { proxyConfig } from './marketdata/proxyAgent';
import logger from '../middleware/logger';

const FRED_CSV_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=SOFR';

/** SOFR é diário: mesmo TTL das séries diárias do BCB, sobre `fetched_at`. */
const SOFR_TTL_HOURS = 4;

/** Primeira publicação do SOFR (data local, sem deslocamento de fuso). */
const SOFR_START = new Date(2018, 3, 2);

/** Baixa o CSV no intervalo e grava; marca/limpa `fetched_at` conforme sucesso/falha. */
async function fetchAndCacheSOFR(start: Date, end: Date): Promise<{ received: number; inserted: number; updated: number }> {
  let data: IndexDataPoint[];
  try {
    data = await fetchSOFRFromFREDCSV(start, end);
  } catch (error) {
    setIndexFetchedAt(IndexType.SOFR, null);
    throw error;
  }
  const { inserted, updated } = data.length > 0
    ? saveIndexDataDetailed(IndexType.SOFR, data, { marcarSincronizado: false })
    : { inserted: 0, updated: 0 };
  setIndexFetchedAt(IndexType.SOFR, new Date());
  if (updated > 0) logger.info(`[SOFR] ${updated} valor(es) revisado(s) pelo FRED atualizado(s) no cache`);
  return { received: data.length, inserted, updated };
}

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
      ...proxyConfig(),
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
  // TTL sobre o instante da última sincronização com o FRED (E02), não sobre a
  // data da última observação — que é sempre anterior a "hoje".
  const fetchedAt = getIndexFetchedAt(IndexType.SOFR);
  let needsFetch = isCacheExpired(fetchedAt, SOFR_TTL_HOURS);

  if (needsFetch && fetchedAt && cargaEmAndamento(IndexType.SOFR) === 'completa') {
    needsFetch = false; // refresh completo sobre cache já sincronizado: responde com o cache atual
  }

  if (needsFetch) {
    try {
      const { received, updated } = await coordenarCarga(IndexType.SOFR, 'incremental', () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const last = getLastCachedDate(IndexType.SOFR);
        // Cache vazio → desde o início do SOFR; nunca sincronizado/falha anterior →
        // dia seguinte ao último dado; TTL vencido → janela de revisão de 14 dias.
        const fetchStart = !last
          ? SOFR_START
          : !getIndexFetchedAt(IndexType.SOFR)
            ? new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
            : new Date(last.getFullYear(), last.getMonth(), last.getDate() - REVISION_WINDOW_DAYS_DAILY);
        return fetchAndCacheSOFR(fetchStart, today);
      });

      if (received > 0) {
        logger.info(`Cache SOFR atualizado: ${received} registros recebidos (${updated} revisado(s))`);
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
  const { inserted, updated } = await coordenarCarga(IndexType.SOFR, 'completa', () => {
    logger.info('[SOFR] Iniciando refresh completo via FRED CSV público...');
    return fetchAndCacheSOFR(SOFR_START, new Date());
  });

  logger.info(`[SOFR] Refresh completo: ${inserted} novos registros inseridos, ${updated} revisado(s)`);
  return inserted;
}
