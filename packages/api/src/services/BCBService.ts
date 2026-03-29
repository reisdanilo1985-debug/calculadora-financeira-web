/**
 * Serviço de integração com a API SGS do Banco Central do Brasil.
 *
 * Endpoint base:
 *   https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados
 *   ?formato=json&dataInicial=DD/MM/YYYY&dataFinal=DD/MM/YYYY
 *
 * Séries utilizadas:
 *   CDI: 12
 *   Selic Meta: 432
 *   Selic Over: 1178
 *   IPCA: 433
 *   IGP-M: 189
 *   INCC: 192
 */

import axios, { AxiosError } from 'axios';
import { IndexType, IndexDataPoint } from '@correcao/core';
import { parseBCBDate, toBCBDate } from '@correcao/core';
import {
  saveIndexData,
  getIndexData,
  getLastCachedDate,
} from './DatabaseService';
import logger from '../middleware/logger';

const BCB_BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

/** Mapa de IndexType → código da série no SGS */
const SGS_SERIES: Partial<Record<IndexType, number>> = {
  [IndexType.CDI]: 12,
  [IndexType.SELIC_META]: 432,
  [IndexType.SELIC_OVER]: 1178,
  [IndexType.IPCA]: 433,
  [IndexType.IGPM]: 189,
  [IndexType.INCC]: 192,
};

interface BCBResponse {
  data: string;   // DD/MM/YYYY
  valor: string;  // valor como string (ex: "10.65")
}

/**
 * Busca dados de uma série no BCB com retry e backoff exponencial.
 */
async function fetchFromBCB(
  seriesCode: number,
  startDate: Date,
  endDate: Date,
  retries = 3
): Promise<IndexDataPoint[]> {
  const url = `${BCB_BASE_URL}.${seriesCode}/dados`;
  const params = {
    formato: 'json',
    dataInicial: toBCBDate(startDate),
    dataFinal: toBCBDate(endDate),
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`BCB SGS série ${seriesCode}: ${params.dataInicial} → ${params.dataFinal}`);
      const response = await axios.get<BCBResponse[]>(url, {
        params,
        timeout: 15000,
        headers: { 'Accept': 'application/json' },
      });

      return response.data.map(item => ({
        date: parseBCBDate(item.data),
        value: parseFloat(item.valor.replace(',', '.')),
      }));
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.warn(`BCB tentativa ${attempt}/${retries} falhou: ${axiosError.message}`);

      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw new Error(
          `Falha ao buscar série ${seriesCode} do BCB após ${retries} tentativas: ${axiosError.message}`
        );
      }
    }
  }

  return [];
}

/**
 * TTL em horas por tipo de indexador.
 */
function getTTLHours(indexType: IndexType): number {
  // Diários (CDI, Selic, SOFR): 4h
  if ([IndexType.CDI, IndexType.SELIC_META, IndexType.SELIC_OVER].includes(indexType)) {
    return 4;
  }
  // Mensais (IPCA, IGP-M, INCC): 24h
  return 24;
}

/**
 * Verifica se o cache está expirado para um índice.
 */
function isCacheExpired(lastUpdated: Date | null, ttlHours: number): boolean {
  if (!lastUpdated) return true;
  const ageHours = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
  return ageHours > ttlHours;
}

/**
 * Busca dados de um índice BCB, usando cache quando disponível.
 *
 * Estratégia:
 *   1. Verifica cache local
 *   2. Se cache expirado ou sem dados: busca do BCB e armazena
 *   3. Se API indisponível: usa cache com aviso
 */
export async function getIndexDataWithCache(
  indexType: IndexType,
  startDate: Date,
  endDate: Date
): Promise<{ data: IndexDataPoint[]; fromCache: boolean; warning?: string }> {
  const seriesCode = SGS_SERIES[indexType];
  if (!seriesCode) {
    throw new Error(`Indexador ${indexType} não tem série BCB associada.`);
  }

  const ttlHours = getTTLHours(indexType);
  const lastCachedDate = getLastCachedDate(indexType);

  // Verifica se precisa buscar dados novos
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const needsFetch =
    !lastCachedDate ||
    lastCachedDate < today ||
    isCacheExpired(lastCachedDate, ttlHours);

  if (needsFetch) {
    try {
      // Se há algum dado em cache, busca apenas o incremento
      const fetchStart = lastCachedDate
        ? new Date(lastCachedDate.getTime() + 86400000) // +1 dia
        : new Date('2000-01-01');

      const newData = await fetchFromBCB(seriesCode, fetchStart, today);

      if (newData.length > 0) {
        saveIndexData(indexType, newData);
        logger.info(`Cache atualizado: ${newData.length} registros para ${indexType}`);
      }
    } catch (error) {
      const warning = `API BCB indisponível para ${indexType}. Usando dados em cache.`;
      logger.warn(warning);

      // Usa cache existente como fallback
      const cachedData = getIndexData(indexType, startDate, endDate);
      return { data: normalizeToAnnual(indexType, cachedData), fromCache: true, warning };
    }
  }

  // Retorna dados do cache para o período solicitado
  const data = getIndexData(indexType, startDate, endDate);
  return { data: normalizeToAnnual(indexType, data), fromCache: !needsFetch };
}

/**
 * Força atualização completa do histórico de um índice.
 */
export async function forceRefreshIndex(indexType: IndexType): Promise<number> {
  const seriesCode = SGS_SERIES[indexType];
  if (!seriesCode) {
    throw new Error(`Indexador ${indexType} não tem série BCB associada.`);
  }

  const today = new Date();
  const historicalStart = new Date('2000-01-01');

  const data = await fetchFromBCB(seriesCode, historicalStart, today);
  const inserted = saveIndexData(indexType, data);

  logger.info(`Refresh completo de ${indexType}: ${inserted} novos registros`);
  return inserted;
}

/**
 * Indexadores cujos dados BCB são fornecidos como taxa DIÁRIA (% a.d.)
 * e precisam ser convertidos para taxa ANUAL (% a.a.) antes de usar no engine.
 *
 * CDI (série 12): retorna taxa diária efetiva em % a.d.
 * Selic Meta (série 432) e Selic Over (série 1178): retornam taxa anual em % a.a.
 */
const DAILY_RATE_INDEXES = new Set<IndexType>([IndexType.CDI]);

/**
 * Converte taxa diária % a.d. para taxa anual equivalente % a.a. (base 252 dias úteis).
 * Fórmula: annual = ((1 + daily/100)^252 - 1) * 100
 */
function dailyToAnnualRate(dailyPercent: number): number {
  return (Math.pow(1 + dailyPercent / 100, 252) - 1) * 100;
}

/**
 * Normaliza os dados de um índice para sempre retornar taxas anuais % a.a.
 * (converte CDI de diária para anual; demais índices já retornam anual).
 */
function normalizeToAnnual(indexType: IndexType, data: IndexDataPoint[]): IndexDataPoint[] {
  if (!DAILY_RATE_INDEXES.has(indexType)) return data;
  return data.map(point => ({ ...point, value: dailyToAnnualRate(point.value) }));
}

/** Lista de indexadores suportados pelo BCB */
export const BCB_SUPPORTED_INDEXES = Object.keys(SGS_SERIES) as IndexType[];
