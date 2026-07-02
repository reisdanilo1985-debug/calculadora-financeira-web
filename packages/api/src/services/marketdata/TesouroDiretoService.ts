/**
 * Serviço de curvas do Tesouro Direto (Tesouro Transparente — dados abertos).
 *
 * Baixa o CSV público de preços/taxas (sem auth), extrai as linhas de papéis
 * zero-cupom e monta as curvas PRÉ (LTN) e REAL (NTN-B Principal) via o builder
 * puro do core (`construirCurvasTesouro`).
 *
 * Cache em memória + LKG (mesmo padrão do snapshot/PtaxService): o CSV tem ~14 MB
 * e é atualizado 1×/dia útil, então TTL de 6h evita downloads repetidos. Em falha
 * de rede, devolve a última curva válida marcada como não-ao-vivo.
 *
 * Convenção: taxas em FRAÇÃO decimal na saída (o core divide por 100).
 */

import axios from 'axios';
import { construirCurvasTesouro, CurvasTesouro, TesouroRow } from '@correcao/core';
import { proxyConfig } from './proxyAgent';
import logger from '../../middleware/logger';

const CSV_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv';

const TTL_MS = 6 * 60 * 60 * 1000; // 6h

let cache: { curvas: CurvasTesouro; fetchedAt: number } | null = null;

/** Data BR "DD/MM/YYYY" → Date (meio-dia local, evita deslize de fuso). */
function parseBrDate(s: string): Date {
  const [d, m, y] = s.trim().split('/').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Extrai as linhas relevantes (pré/real, qualquer variante) do CSV.
 * Colunas (`;`-separado): Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;
 * Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
 */
function parseCsv(csv: string): TesouroRow[] {
  const linhas = csv.split('\n');
  const rows: TesouroRow[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;
    const c = linha.split(';');
    if (c.length < 5) continue;

    const tipo = c[0].trim();
    // Pré-filtro grosseiro: mantém pré e IPCA (exclui IGP-M/Selic). A
    // classificação zero-cupom exata (LTN / NTN-B Principal) é do core.
    if (!/prefixado|ipca/i.test(tipo)) continue;

    const dataVencimento = parseBrDate(c[1]);
    const dataBase = parseBrDate(c[2]);
    const taxaVendaManha = parseFloat(c[4].replace(',', '.'));

    if (
      isNaN(dataVencimento.getTime()) ||
      isNaN(dataBase.getTime()) ||
      !isFinite(taxaVendaManha)
    ) {
      continue;
    }

    rows.push({ tipoTitulo: tipo, dataVencimento, dataBase, taxaVendaManha });
  }

  return rows;
}

/**
 * Retorna as curvas do Tesouro (cache 6h + LKG).
 * @param force ignora o TTL e rebaixa imediatamente.
 * @returns `{ curvas, live }` — `live=false` quando serviu o LKG após falha; `null` se nunca houve dado.
 */
export async function getCurvasTesouro(
  force = false
): Promise<{ curvas: CurvasTesouro; live: boolean } | null> {
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return { curvas: cache.curvas, live: true };
  }

  try {
    const resp = await axios.get<string>(CSV_URL, {
      timeout: 45000,
      responseType: 'text',
      headers: { Accept: 'text/csv,text/plain,*/*' },
      ...proxyConfig(),
    });

    const rows = parseCsv(resp.data);
    if (!rows.length) throw new Error('CSV sem títulos pré/real utilizáveis.');

    const curvas = construirCurvasTesouro(rows);
    cache = { curvas, fetchedAt: Date.now() };
    logger.info(
      `[Tesouro] curvas montadas: pré=${curvas.diPre.length} real=${curvas.real.length} base=${curvas.dataBase
        .toISOString()
        .slice(0, 10)}`
    );
    return { curvas, live: true };
  } catch (e: any) {
    logger.warn(`[Tesouro] falha ao montar curvas: ${e.message}`);
    return cache ? { curvas: cache.curvas, live: false } : null;
  }
}
