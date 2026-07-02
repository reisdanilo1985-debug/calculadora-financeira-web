/**
 * Serviço da ETTJ ANBIMA — curva institucional de fechamento (pré + real).
 *
 * POST no endpoint público (sem auth) da ANBIMA; a divulgação ocorre ~20:00 BRT,
 * então tenta o último dia útil e recua até 5 dias úteis em falha/dado ausente.
 * Cache em memória 6h + LKG (mesmo padrão do TesouroDiretoService).
 *
 * Resposta em latin-1 → decodificada via Buffer antes do parse puro do core.
 */

import axios from 'axios';
import { parseEttjAnbima, CurvasTesouro, lastBusinessDayOn, addDays, toBCBDate } from '@correcao/core';
import { proxyConfig } from './proxyAgent';
import logger from '../../middleware/logger';

const ETTJ_URL = 'https://www.anbima.com.br/informacoes/est-termo/CZ-down.asp';
const TTL_MS = 6 * 60 * 60 * 1000; // 6h
const MAX_RECUO_DU = 5;

let cache: { curvas: CurvasTesouro; fetchedAt: number } | null = null;

/** Busca e parseia a ETTJ para uma data específica. Lança em falha. */
async function fetchEttj(data: Date): Promise<CurvasTesouro> {
  const body = new URLSearchParams({
    Idioma: 'PT',
    Dt_Ref: toBCBDate(data), // DD/MM/YYYY
    saida: 'csv',
  });

  const resp = await axios.post<ArrayBuffer>(ETTJ_URL, body.toString(), {
    timeout: 30000,
    responseType: 'arraybuffer',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/csv,text/plain,*/*',
    },
    ...proxyConfig(),
  });

  const csv = Buffer.from(resp.data as any).toString('latin1');
  return parseEttjAnbima(csv); // lança se não houver curva pré
}

/**
 * Retorna as curvas ANBIMA (cache 6h + LKG), recuando dias úteis se preciso.
 * @returns `{ curvas, live }` — `live=false` quando serviu o LKG; `null` se nunca houve dado.
 */
export async function getCurvasAnbima(
  force = false
): Promise<{ curvas: CurvasTesouro; live: boolean } | null> {
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return { curvas: cache.curvas, live: true };
  }

  let data = lastBusinessDayOn(new Date());
  for (let tentativa = 0; tentativa <= MAX_RECUO_DU; tentativa++) {
    try {
      const curvas = await fetchEttj(data);
      cache = { curvas, fetchedAt: Date.now() };
      logger.info(
        `[ANBIMA] ETTJ montada: pré=${curvas.diPre.length} real=${curvas.real.length} base=${curvas.dataBase
          .toISOString()
          .slice(0, 10)}`
      );
      return { curvas, live: true };
    } catch (e: any) {
      logger.warn(`[ANBIMA] ETTJ ${toBCBDate(data)} falhou: ${e.message}`);
      // Erro de REDE (host inalcançável/timeout): recuar data não ajuda — falha rápido.
      const codigo = e?.code ?? e?.cause?.code;
      if (['ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(codigo)) {
        break;
      }
      data = lastBusinessDayOn(addDays(data, -1)); // dia sem divulgação: recua um dia útil
    }
  }

  return cache ? { curvas: cache.curvas, live: false } : null;
}
