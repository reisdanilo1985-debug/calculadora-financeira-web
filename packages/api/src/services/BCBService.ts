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
 *
 * Limites do SGS tratados aqui:
 *   - séries diárias (12, 432, 1178) aceitam no máximo 10 anos por consulta
 *     (HTTP 406) → cargas longas são feitas em janelas de SGS_DAILY_WINDOW_YEARS;
 *   - intervalo sem dados → HTTP 404 (ou 200, quando servido do cache do BCB)
 *     com corpo {"erro":{"statusCode":404}} → "nenhum ponto", não falha.
 *
 * Cache (E02):
 *   - o TTL é aplicado sobre `fetched_at` (instante da última sincronização com
 *     a fonte, gravado em cache_meta), e não sobre a data da última observação;
 *   - a carga incremental reconsulta uma janela de revisão curta antes da última
 *     observação e atualiza valores que a fonte tenha revisado;
 *   - uma carga por índice por vez (consultas e refresh concorrentes compartilham
 *     a mesma carga).
 */

import axios, { AxiosError } from 'axios';
import { IndexType, IndexDataPoint } from '@correcao/core';
import { parseBCBDate, toBCBDate } from '@correcao/core';
import {
  saveIndexDataDetailed,
  getIndexData,
  getLastCachedDate,
  getIndexFetchedAt,
  setIndexFetchedAt,
} from './DatabaseService';
import { proxyConfig } from './marketdata/proxyAgent';
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

/**
 * Séries de periodicidade DIÁRIA no SGS. Para elas o SGS recusa (HTTP 406,
 * "janela de consulta de, no máximo, 10 anos em séries de periodicidade
 * diária") qualquer consulta com janela > 10 anos — por isso a carga histórica
 * é particionada. Conferido na API real (set/2026): 12, 432 e 1178 → 406 para
 * 2000→2026; IGP-M 189 e INCC 192 (mensais) → 200 na janela inteira.
 */
const SGS_DAILY_SERIES = new Set<number>([12, 432, 1178]);

/**
 * Tamanho (em anos civis) de cada janela da carga de séries diárias.
 * Bem abaixo do teto de 10 anos do SGS e dimensionado pela latência medida na
 * API real: o tempo de resposta cresce com o nº de linhas (~4–8 ms/linha) e o
 * gateway do BCB corta em ~30 s. Janela de 3 anos ≈ 750 linhas (CDI) ou ≈ 1.100
 * (Selic Meta 432, que tem valor em todo dia corrido) → 2,5–4,6 s medidos, com
 * folga para o timeout de 15 s por requisição. Janelas de 9 anos da série 432
 * estouraram o gateway (30 s) na medição.
 */
export const SGS_DAILY_WINDOW_YEARS = 3;

/** Início da carga histórica (data local, sem deslocamento de fuso). */
const HISTORICAL_START = new Date(2000, 0, 1);

/** Retry/backoff da consulta ao SGS. */
const BCB_RETRIES = 3;
const BCB_RETRY_BASE_MS = 1000;

/**
 * Janela de revisão da carga incremental: quanto antes da última observação em
 * cache a consulta recomeça, para capturar valores revisados pela fonte.
 *   - séries diárias: 14 dias corridos (≈ 10 dias úteis);
 *   - séries mensais: as 2 últimas competências em cache.
 * Como a janela é bem maior que o TTL (4 h / 24 h), uma revisão perdida numa
 * tentativa que falhou é capturada na sincronização seguinte.
 */
export const REVISION_WINDOW_DAYS_DAILY = 14;
export const REVISION_WINDOW_MONTHS = 2;

// ───────────────────────── coordenação de cargas por índice ─────────────────────────

export type TipoCarga = 'incremental' | 'completa';

const cargasEmAndamento = new Map<string, { tipo: TipoCarga; promessa: Promise<unknown> }>();

/**
 * Garante uma carga por chave (índice) por vez:
 *   - pedido do mesmo tipo de uma carga em andamento → compartilha a mesma promessa;
 *   - incremental durante uma completa → compartilha a completa (que cobre a incremental);
 *   - completa durante uma incremental → encadeia: começa quando a incremental terminar.
 */
export function coordenarCarga<T>(chave: string, tipo: TipoCarga, executar: () => Promise<T>): Promise<T> {
  const atual = cargasEmAndamento.get(chave);
  if (atual && (atual.tipo === tipo || atual.tipo === 'completa')) {
    return atual.promessa as Promise<T>;
  }

  const anterior = atual ? atual.promessa.then(() => undefined, () => undefined) : Promise.resolve();
  const promessa = anterior.then(executar);
  cargasEmAndamento.set(chave, { tipo, promessa });

  const limpar = () => {
    if (cargasEmAndamento.get(chave)?.promessa === promessa) cargasEmAndamento.delete(chave);
  };
  promessa.then(limpar, limpar); // também marca a rejeição como tratada
  return promessa;
}

/** Tipo da carga em andamento para a chave (índice), ou null. */
export function cargaEmAndamento(chave: string): TipoCarga | null {
  return cargasEmAndamento.get(chave)?.tipo ?? null;
}

interface BCBResponse {
  data: string;   // DD/MM/YYYY
  valor: string;  // valor como string (ex: "10.65")
}

/** Intervalo fechado de datas locais [start, end] (dias inteiros). */
export interface SgsWindow {
  start: Date;
  end: Date;
}

/** Data local à meia-noite (descarta hora), via componentes — imune a fuso/horário de verão. */
function localDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Particiona [startDate, endDate] em janelas contíguas de no máximo `maxYears`
 * anos civis: cada janela termina na véspera do "aniversário" de `maxYears`
 * anos do seu início e a seguinte começa no dia seguinte — sem sobreposição
 * nem lacuna de dias. A última janela termina exatamente em endDate.
 * Intervalo vazio (start > end) → [].
 */
export function splitIntoWindows(startDate: Date, endDate: Date, maxYears: number): SgsWindow[] {
  if (!Number.isInteger(maxYears) || maxYears < 1) {
    throw new Error(`splitIntoWindows: maxYears deve ser inteiro ≥ 1 (recebido ${maxYears}).`);
  }
  const end = localDay(endDate);
  let start = localDay(startDate);
  const windows: SgsWindow[] = [];

  while (start <= end) {
    // new Date(y, m, d - 1) normaliza viradas de mês/ano e 29/02.
    const windowEnd = new Date(start.getFullYear() + maxYears, start.getMonth(), start.getDate() - 1);
    if (windowEnd >= end) {
      windows.push({ start, end });
      break;
    }
    windows.push({ start, end: windowEnd });
    start = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate() + 1);
  }
  return windows;
}

/** Janelas de consulta para uma série: diárias particionadas; mensais em uma única janela. */
function sgsWindowsFor(seriesCode: number, startDate: Date, endDate: Date): SgsWindow[] {
  if (SGS_DAILY_SERIES.has(seriesCode)) {
    return splitIntoWindows(startDate, endDate, SGS_DAILY_WINDOW_YEARS);
  }
  const start = localDay(startDate);
  const end = localDay(endDate);
  return start <= end ? [{ start, end }] : [];
}

/**
 * Corpo de "sem dado no intervalo" do SGS:
 *   {"erro":{"statusCode":404,"detail":"...SGSNegocioException: Value(s) not found"}}
 * Na API real esse corpo chega com HTTP 404 na primeira consulta e, quando
 * servido do cache do BCB, com HTTP 200 (verificado em set/2026).
 */
function isSgsNoDataBody(body: unknown): boolean {
  const erro = body && typeof body === 'object' && !Array.isArray(body) ? (body as any).erro : undefined;
  return !!erro && typeof erro === 'object' && Number(erro.statusCode) === 404;
}

/**
 * HTTP 404 com corpo JSON = "sem dado no intervalo". Um 404 com corpo não-JSON
 * (página HTML de proxy/gateway) continua sendo falha.
 */
function isSgsNoData(error: AxiosError): boolean {
  const res = error.response;
  return !!res && res.status === 404 && typeof res.data === 'object' && res.data !== null;
}

/** Só vale repetir falhas transitórias: rede/timeout, 5xx, 408 e 429. Demais 4xx (ex.: 406) falham na hora. */
function isRetryable(error: AxiosError): boolean {
  const status = error.response?.status;
  if (status === undefined) return true;
  return status >= 500 || status === 408 || status === 429;
}

/** Mensagem de erro do SGS (campo `error`/`erro.detail`), quando houver. */
function sgsErrorDetail(error: AxiosError): string {
  const data = error.response?.data as any;
  const detail = data && typeof data === 'object' ? data.error ?? data.erro?.detail : undefined;
  return typeof detail === 'string' ? ` — ${detail}` : '';
}

/**
 * Busca UMA janela de uma série no BCB com retry e backoff exponencial.
 * Janela sem dados (404 do SGS, ou 200 com o corpo de 404) → [] sem erro e sem retry.
 * Falha real (rede, timeout, 406, 5xx...) → lança erro.
 */
async function fetchFromBCB(
  seriesCode: number,
  startDate: Date,
  endDate: Date,
  retries = BCB_RETRIES
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
        ...proxyConfig(),
      });

      if (isSgsNoDataBody(response.data)) {
        logger.info(`BCB SGS série ${seriesCode}: sem dados entre ${params.dataInicial} e ${params.dataFinal} (HTTP ${response.status}, corpo de 404)`);
        return [];
      }
      if (!Array.isArray(response.data)) {
        const corpo = JSON.stringify(response.data ?? null).slice(0, 200);
        throw new Error(`resposta inesperada do SGS (HTTP ${response.status}, corpo não é uma lista JSON: ${corpo})`);
      }

      return response.data.map(item => ({
        date: parseBCBDate(item.data),
        value: parseFloat(item.valor.replace(',', '.')),
      }));
    } catch (error) {
      const axiosError = error as AxiosError;

      if (isSgsNoData(axiosError)) {
        logger.info(`BCB SGS série ${seriesCode}: sem dados entre ${params.dataInicial} e ${params.dataFinal} (HTTP 404)`);
        return [];
      }

      const status = axiosError.response?.status;
      const motivo = `${axiosError.message}${sgsErrorDetail(axiosError)}`;
      logger.warn(`BCB tentativa ${attempt}/${retries} falhou (série ${seriesCode}, ${params.dataInicial} → ${params.dataFinal}): ${motivo}`);

      if (!isRetryable(axiosError)) {
        throw new Error(`Falha ao buscar série ${seriesCode} do BCB (HTTP ${status}): ${motivo}`);
      }
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * BCB_RETRY_BASE_MS;
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw new Error(
          `Falha ao buscar série ${seriesCode} do BCB após ${retries} tentativas: ${motivo}`
        );
      }
    }
  }

  return [];
}

interface ResultadoCarga {
  received: number;
  inserted: number;
  /** Pontos já em cache cujo valor a fonte revisou (atualizados). */
  updated: number;
  windows: number;
}

/**
 * Busca [startDate, endDate] no SGS janela a janela (sequencialmente) e grava
 * no cache ao fim de CADA janela — uma falha no meio preserva o que já veio.
 *
 * Para na primeira janela que falhar, sem pular para as seguintes: a carga
 * incremental recomeça em "última data em cache + 1 dia", então uma lacuna no
 * meio do cache nunca seria reposta.
 *
 * Sucesso (todas as janelas) → marca `fetched_at` = agora (base do TTL), mesmo
 * sem ponto novo. Falha → limpa `fetched_at`, para a próxima consulta tentar de
 * novo em vez de tomar como sincronizado um cache carregado pela metade.
 */
async function fetchAndCacheRange(
  indexType: IndexType,
  seriesCode: number,
  startDate: Date,
  endDate: Date
): Promise<ResultadoCarga> {
  const windows = sgsWindowsFor(seriesCode, startDate, endDate);
  let received = 0;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    let points: IndexDataPoint[];
    try {
      points = await fetchFromBCB(seriesCode, w.start, w.end);
    } catch (error: any) {
      setIndexFetchedAt(indexType, null);
      const parcial = i > 0 ? ` ${inserted} registros novos das ${i} janelas anteriores foram gravados.` : '';
      throw new Error(
        `${error.message} [janela ${i + 1}/${windows.length}: ${toBCBDate(w.start)} → ${toBCBDate(w.end)}].${parcial}`
      );
    }
    received += points.length;
    if (points.length > 0) {
      const r = saveIndexDataDetailed(indexType, points, { marcarSincronizado: false });
      inserted += r.inserted;
      updated += r.updated;
    }
  }

  setIndexFetchedAt(indexType, new Date());
  if (updated > 0) {
    logger.info(`BCB SGS série ${seriesCode} (${indexType}): ${updated} valor(es) revisado(s) pela fonte atualizado(s) no cache`);
  }
  return { received, inserted, updated, windows: windows.length };
}

/**
 * Início da carga incremental:
 *   - cache vazio → carga histórica completa;
 *   - cache sem sincronização válida (nunca sincronizado ou última tentativa
 *     falhou) → retoma no dia seguinte à última observação;
 *   - cache sincronizado com TTL vencido → recomeça na janela de revisão
 *     (14 dias corridos antes da última observação diária; 2 competências mensais).
 */
function inicioCargaIncremental(seriesCode: number, ultimo: Date | null, sincronizadoEm: Date | null): Date {
  if (!ultimo) return HISTORICAL_START;
  if (!sincronizadoEm) {
    return new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() + 1);
  }
  if (SGS_DAILY_SERIES.has(seriesCode)) {
    return new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() - REVISION_WINDOW_DAYS_DAILY);
  }
  return new Date(ultimo.getFullYear(), ultimo.getMonth() - (REVISION_WINDOW_MONTHS - 1), 1);
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
 * Verifica se o cache está expirado: `fetchedAt` é o instante da última
 * sincronização com a fonte (não a data da última observação).
 */
export function isCacheExpired(fetchedAt: Date | null, ttlHours: number, now: number = Date.now()): boolean {
  if (!fetchedAt) return true;
  const ageHours = (now - fetchedAt.getTime()) / (1000 * 60 * 60);
  return ageHours < 0 || ageHours > ttlHours;
}

/**
 * Busca dados de um índice BCB, usando cache quando disponível.
 *
 * Estratégia:
 *   1. Cache sincronizado há menos que o TTL → responde do cache, sem rede
 *   2. TTL vencido (ou nunca sincronizado) → carga incremental com janela de
 *      revisão (ou histórica, se o cache estiver vazio), uma por índice por vez
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
  const fetchedAt = getIndexFetchedAt(indexType);
  let needsFetch = isCacheExpired(fetchedAt, ttlHours);

  // Um refresh completo já está regravando o histórico de um cache que JÁ ESTAVA
  // sincronizado (só com TTL vencido): responde com ele em vez de esperar a carga
  // inteira. Cache nunca sincronizado (ex.: servidor recém-iniciado) → espera a
  // carga, para não devolver histórico pela metade.
  if (needsFetch && fetchedAt && cargaEmAndamento(indexType) === 'completa') {
    needsFetch = false;
  }

  if (needsFetch) {
    try {
      const { received, updated, windows } = await coordenarCarga(indexType, 'incremental', () => {
        // Estado lido dentro da carga: pode ter mudado enquanto outra carga terminava.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const fetchStart = inicioCargaIncremental(
          seriesCode,
          getLastCachedDate(indexType),
          getIndexFetchedAt(indexType)
        );
        return fetchAndCacheRange(indexType, seriesCode, fetchStart, today);
      });

      if (received > 0) {
        logger.info(`Cache atualizado: ${received} registros para ${indexType} (${windows} janela(s), ${updated} revisado(s))`);
      }
    } catch (error: any) {
      const warning = `API BCB indisponível para ${indexType}. Usando dados em cache.`;
      logger.warn(`${warning} Motivo: ${error?.message ?? error}`);

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
 * Força atualização completa do histórico de um índice (2000 → hoje), com a
 * mesma paginação da carga em getIndexDataWithCache. Falha em qualquer janela
 * lança erro (as janelas anteriores já ficam gravadas no cache). Valores
 * revisados pela fonte são atualizados.
 *
 * Refresh concorrente do mesmo índice (cron, admin, duplo clique) compartilha
 * a mesma carga — ver coordenarCarga.
 */
export async function forceRefreshIndex(indexType: IndexType): Promise<number> {
  const seriesCode = SGS_SERIES[indexType];
  if (!seriesCode) {
    throw new Error(`Indexador ${indexType} não tem série BCB associada.`);
  }

  const { received, inserted, updated, windows } = await coordenarCarga(indexType, 'completa', () =>
    fetchAndCacheRange(indexType, seriesCode, HISTORICAL_START, new Date())
  );

  logger.info(
    `Refresh completo de ${indexType}: ${inserted} novos registros, ${updated} revisado(s) (${received} recebidos em ${windows} janela(s))`
  );
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
