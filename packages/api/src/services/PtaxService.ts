import axios from 'axios';
import { proxyConfig } from './marketdata/proxyAgent';
import logger from '../middleware/logger';

const OLINDA_BASE_URL = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';

export interface BcbCurrency {
  simbolo: string;
  nomeFormatado: string;
  tipoMoeda: string;
}

export type PtaxBulletinType = 'Abertura' | 'Intermediário' | 'Fechamento' | 'Todos';

export const PTAX_BULLETINS: readonly PtaxBulletinType[] = ['Abertura', 'Intermediário', 'Fechamento', 'Todos'];

export interface PtaxQuote {
  date: Date;
  buyRate: number;
  sellRate: number;
  buyParity?: number;
  sellParity?: number;
  bulletinType: string;
  /** dataHoraCotacao da Olinda, como publicada (horário de Brasília, "AAAA-MM-DD HH:mm:ss.SSS"). */
  timestamp: string;
}

/** Falha ao consultar a Olinda (rede, timeout, HTTP de erro, resposta inesperada) — distinta de "sem cotação". */
export class PtaxSourceError extends Error {
  constructor(message: string, readonly upstreamStatus?: number) {
    super(message);
    this.name = 'PtaxSourceError';
  }
}

/** Moeda que a PTAX (Olinda) não publica. */
export class PtaxUnsupportedCurrencyError extends Error {
  constructor(readonly currency: string, readonly available: string[]) {
    super(
      `Moeda ${currency} não é publicada pela PTAX do BCB.` +
        (available.length ? ` Moedas disponíveis: ${available.join(', ')}.` : '')
    );
    this.name = 'PtaxUnsupportedCurrencyError';
  }
}

/**
 * Formato MM-DD-YYYY exigido pela API Olinda.
 *
 * Recebe a data CIVIL como Date local (as rotas convertem "AAAA-MM-DD" com
 * componentes locais, ao meio-dia) — por isso lê getFullYear/getMonth/getDate.
 * Nunca passar `new Date("AAAA-MM-DD")` (meia-noite UTC, que em
 * America/Sao_Paulo cai no dia anterior).
 */
function formatOlindaDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${m}-${d}-${y}`;
}

/**
 * dataHoraCotacao da Olinda ("2025-01-02 13:09:42.489") está no horário de
 * Brasília e vem sem fuso. Interpretada com o fuso do servidor, o instante
 * mudaria entre Render (UTC) e uma máquina em São Paulo; fixamos -03:00
 * (sem horário de verão desde 2019; para boletins anteriores o deslocamento de
 * 1 h não altera a data civil, pois são publicados entre 10h e 13h30).
 */
function parseDataHoraCotacao(valor: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/.exec(String(valor));
  if (!m) return new Date(valor);
  const [, dia, hh, mm, ss = '00', frac = '0'] = m;
  // A Olinda omite zeros à direita dos milissegundos ("12:06:27.08").
  return new Date(`${dia}T${hh}:${mm}:${ss}.${frac.padEnd(3, '0')}-03:00`);
}

/** Data civil (Brasília) de uma cotação: os 10 primeiros caracteres de dataHoraCotacao. */
function diaDaCotacao(q: PtaxQuote): string {
  return /^\d{4}-\d{2}-\d{2}/.test(q.timestamp) ? q.timestamp.slice(0, 10) : q.date.toISOString().slice(0, 10);
}

/** Minúsculas sem acento ("Intermediário" ≡ "intermediario"). */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Converte o texto do parâmetro `bulletin` num boletim conhecido (sem diferenciar acento/caixa), ou null. */
export function parsePtaxBulletin(valor: unknown): PtaxBulletinType | null {
  if (typeof valor !== 'string') return null;
  const alvo = normalizar(valor);
  return PTAX_BULLETINS.find(b => normalizar(b) === alvo) ?? null;
}

function numero(valor: unknown): number | undefined {
  if (valor === null || valor === undefined || valor === '') return undefined;
  const n = typeof valor === 'number' ? valor : parseFloat(String(valor));
  return Number.isFinite(n) ? n : undefined;
}

/** GET na Olinda; qualquer falha vira PtaxSourceError (nunca "lista vazia"). */
async function consultarOlinda(url: string, descricao: string): Promise<any[]> {
  try {
    const { data } = await axios.get(url, { timeout: 15000, ...proxyConfig() });
    if (!data || !Array.isArray(data.value)) {
      throw new PtaxSourceError(`resposta inesperada da Olinda para ${descricao} (sem lista "value")`);
    }
    return data.value;
  } catch (error: any) {
    if (error instanceof PtaxSourceError) throw error;
    const status: number | undefined = error?.response?.status;
    const motivo = status ? `HTTP ${status}` : error?.message ?? String(error);
    throw new PtaxSourceError(`Falha ao consultar a PTAX no BCB (Olinda) para ${descricao}: ${motivo}`, status);
  }
}

export class PtaxService {
  private static currenciesCache: BcbCurrency[] | null = null;
  private static lastCacheUpdate: number = 0;
  private static lastCurrenciesFailure: number = 0;

  /** Retorna a lista de moedas suportadas pelo ptax ([] se a Olinda estiver indisponível). */
  static async getCurrencies(): Promise<BcbCurrency[]> {
    const now = Date.now();
    // Cache de 24 horas
    if (this.currenciesCache && now - this.lastCacheUpdate < 24 * 60 * 60 * 1000) {
      return this.currenciesCache;
    }
    // Falha recente: não repete a consulta a cada cotação (5 min).
    if (!this.currenciesCache && now - this.lastCurrenciesFailure < 5 * 60 * 1000) {
      return [];
    }

    try {
      const url = `${OLINDA_BASE_URL}/Moedas?$format=json`;
      const { data } = await axios.get(url, { timeout: 15000, ...proxyConfig() });
      if (data && Array.isArray(data.value) && data.value.length > 0) {
        this.currenciesCache = data.value;
        this.lastCacheUpdate = now;
        return data.value;
      }
      this.lastCurrenciesFailure = now;
      return this.currenciesCache ?? [];
    } catch (error: any) {
      logger.error(`Erro ao buscar moedas PTAX: ${error.message}`);
      this.lastCurrenciesFailure = now;
      return this.currenciesCache ?? [];
    }
  }

  /**
   * Garante que a moeda é publicada pela PTAX. Se a lista de moedas não puder
   * ser obtida, não bloqueia (a própria consulta de cotação sinaliza a falha).
   */
  static async assertSupportedCurrency(currency: string): Promise<void> {
    const moeda = currency.toUpperCase();
    const lista = await this.getCurrencies();
    if (lista.length === 0) return;
    const simbolos = lista.map(m => String(m.simbolo).toUpperCase());
    if (!simbolos.includes(moeda)) {
      throw new PtaxUnsupportedCurrencyError(moeda, [...simbolos].sort());
    }
  }

  /**
   * Consulta Dólar num período — SOMENTE o boletim de fechamento.
   *
   * O endpoint `CotacaoDolarPeriodo` da Olinda retorna apenas a cotação de
   * fechamento e NÃO inclui o campo `tipoBoletim`; por isso cada quote é
   * marcada como "Fechamento". Para abertura/intermediários use
   * getCurrencyPeriod('USD', ...).
   *
   * Falha da fonte → lança PtaxSourceError.
   */
  static async getDolarPeriod(startDate: Date, endDate: Date): Promise<PtaxQuote[]> {
    const startStr = formatOlindaDate(startDate);
    const endStr = formatOlindaDate(endDate);
    const url = `${OLINDA_BASE_URL}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${startStr}'&@dataFinalCotacao='${endStr}'&$format=json`;

    const itens = await consultarOlinda(url, `USD ${startStr} a ${endStr}`);
    return itens.map((item: any) => ({
      date: parseDataHoraCotacao(item.dataHoraCotacao),
      buyRate: parseFloat(item.cotacaoCompra),
      sellRate: parseFloat(item.cotacaoVenda),
      bulletinType: item.tipoBoletim || 'Fechamento',
      timestamp: item.dataHoraCotacao,
    }));
  }

  /**
   * Consulta qualquer moeda num período (inclusive USD), com TODOS os boletins
   * do dia (abertura, intermediários e fechamento) via `CotacaoMoedaPeriodo`.
   *
   * Falha da fonte → lança PtaxSourceError.
   */
  static async getCurrencyPeriod(currency: string, startDate: Date, endDate: Date): Promise<PtaxQuote[]> {
    const moeda = currency.toUpperCase();
    const startStr = formatOlindaDate(startDate);
    const endStr = formatOlindaDate(endDate);
    const url = `${OLINDA_BASE_URL}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${encodeURIComponent(moeda)}'&@dataInicial='${startStr}'&@dataFinalCotacao='${endStr}'&$format=json`;

    const itens = await consultarOlinda(url, `${moeda} ${startStr} a ${endStr}`);
    return itens.map((item: any) => ({
      date: parseDataHoraCotacao(item.dataHoraCotacao),
      buyRate: parseFloat(item.cotacaoCompra),
      sellRate: parseFloat(item.cotacaoVenda),
      buyParity: numero(item.paridadeCompra),
      sellParity: numero(item.paridadeVenda),
      bulletinType: item.tipoBoletim || 'Desconhecido',
      timestamp: item.dataHoraCotacao,
    }));
  }

  /**
   * Cotações do boletim escolhido no período e sumarizações.
   *
   *   - USD + Fechamento → CotacaoDolarPeriodo (só fechamento, resposta menor);
   *   - USD + Abertura/Intermediário/Todos e demais moedas → CotacaoMoedaPeriodo,
   *     que devolve os 5 boletins do dia. "Todos" mantém todos eles.
   *
   * Sem cotação no período → null. Falha da fonte → PtaxSourceError.
   */
  static async getSummaryPeriod(currency: string, startDate: Date, endDate: Date, bulletin: PtaxBulletinType = 'Fechamento') {
    const moeda = currency.toUpperCase();
    const quotes = moeda === 'USD' && bulletin === 'Fechamento'
      ? await this.getDolarPeriod(startDate, endDate)
      : await this.getCurrencyPeriod(moeda, startDate, endDate);

    // A Olinda devolve tipoBoletim com sufixos variáveis ("Fechamento PTAX",
    // "Intermediário"...) — match parcial sem diferenciar caixa/acento.
    const alvo = normalizar(bulletin);
    const filteredQuotes = (bulletin === 'Todos'
      ? [...quotes]
      : quotes.filter(q => normalizar(q.bulletinType).includes(alvo))
    ).sort((a, b) => a.date.getTime() - b.date.getTime());

    if (filteredQuotes.length === 0) return null;

    let sumBuy = 0;
    let sumSell = 0;
    let minSellRate = Number.POSITIVE_INFINITY;
    let maxSellRate = Number.NEGATIVE_INFINITY;
    let minSellDate = filteredQuotes[0].date;
    let maxSellDate = filteredQuotes[0].date;

    // Agrupar por dia (data civil de Brasília) para contar os dias com dados
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

      dateSet.add(diaDaCotacao(q));
    }

    const count = filteredQuotes.length;
    const lastQuote = filteredQuotes[filteredQuotes.length - 1];

    return {
      currency: moeda,
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
