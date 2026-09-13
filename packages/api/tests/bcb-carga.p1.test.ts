/**
 * E01 (auditoria 2026-09-12, casos V-IDX-2b / V-IDX-2c) — carga histórica do BCB
 * com cache vazio.
 *
 * Antes: a carga pedia 2000→hoje numa única consulta; para séries diárias o SGS
 * recusa janelas > 10 anos (HTTP 406), então o cache vazio virava "0 pontos +
 * aviso" e o refresh forçado falhava "após 3 tentativas".
 *
 * Aqui o SGS é simulado com msw (nada vai à rede):
 *   - série diária (12, 432, 1178) com janela > 10 anos → 406 (mesmo corpo do SGS);
 *   - janela sem dados → 404 com corpo JSON do SGS (ou 200 com o mesmo corpo,
 *     como o SGS real faz quando a resposta vem do cache do BCB);
 *   - caso contrário → dados sintéticos (dias úteis seg–sex para diárias; dia 1º
 *     de cada mês para mensais).
 * Cada teste usa um SQLite ':memory:' novo (cache realmente vazio).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { IndexType } from '@correcao/core';
import { server } from './setup';
import {
  getIndexDataWithCache,
  forceRefreshIndex,
  splitIntoWindows,
  SGS_DAILY_WINDOW_YEARS,
} from '../src/services/BCBService';
import { closeDB, getIndexData, getLastCachedDate, saveIndexData, setIndexFetchedAt } from '../src/services/DatabaseService';

// ───────────────────────────── utilitários de data ─────────────────────────────

const dia = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const localDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseBr = (s: string) => {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
};
const fmtBr = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const hoje = () => localDay(new Date());

/**
 * Regra do simulador para "janela > 10 anos": dataFinal ≥ dataInicial + 10 anos
 * civis. É mais restritiva que o SGS real (que aceitou 01/01/2010→01/01/2020),
 * então passar aqui implica passar lá.
 */
const excede10Anos = (di: Date, df: Date) => df >= new Date(di.getFullYear() + 10, di.getMonth(), di.getDate());

const HISTORICO = dia(2000, 1, 1);
/** Marcador (no log do simulador) de "sem dados" respondido com HTTP 200 + corpo de 404. */
const SEM_DADOS_200 = 2404;
const SERIES_DIARIAS = new Set([12, 432, 1178]);

// ───────────────────────────────── simulador SGS ─────────────────────────────────

interface Requisicao {
  serie: number;
  di: Date;
  df: Date;
  status: number;
  pontos: number;
}

interface OpcoesSimulador {
  /** Primeiro dia com dado publicado (default: sem limite). */
  inicioSerie?: Date;
  /** Último dia com dado publicado (default: sem limite). */
  ultimaPublicacao?: Date;
  /** Força uma resposta de falha para a requisição (ex.: 406/503) — retorna o status ou undefined. */
  falha?: (r: { serie: number; di: Date; df: Date }) => number | undefined;
  /**
   * Status HTTP da resposta "sem dados" (default 404). O SGS real devolve o
   * mesmo corpo de 404 com HTTP 200 quando a resposta vem do cache do BCB.
   */
  statusSemDados?: 200 | 404;
}

function criarSimuladorSgs(opcoes: OpcoesSimulador = {}) {
  const requisicoes: Requisicao[] = [];

  const handler = http.get(/https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.(\d+)\/dados/, ({ request }) => {
    const url = new URL(request.url);
    const serie = Number(url.pathname.match(/bcdata\.sgs\.(\d+)\//)![1]);
    const di = parseBr(url.searchParams.get('dataInicial')!);
    const df = parseBr(url.searchParams.get('dataFinal')!);
    const registra = (status: number, pontos = 0) => requisicoes.push({ serie, di, df, status, pontos });

    const diaria = SERIES_DIARIAS.has(serie);
    if (diaria && excede10Anos(di, df)) {
      registra(406);
      return HttpResponse.json(
        {
          error: 'O sistema aceita uma janela de consulta de, no máximo, 10 anos em séries de periodicidade diária',
          message: 'Para acessar uma série de periodicidade diária, é necessário informar a dataInicial...',
        },
        { status: 406 }
      );
    }

    const statusFalha = opcoes.falha?.({ serie, di, df });
    if (statusFalha) {
      registra(statusFalha);
      return HttpResponse.json({ error: `falha simulada ${statusFalha}` }, { status: statusFalha });
    }

    const ini = opcoes.inicioSerie && opcoes.inicioSerie > di ? opcoes.inicioSerie : di;
    const fim = opcoes.ultimaPublicacao && opcoes.ultimaPublicacao < df ? opcoes.ultimaPublicacao : df;
    const out: { data: string; valor: string }[] = [];
    for (let d = localDay(ini); d <= fim; d = addDias(d, 1)) {
      if (diaria) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;
        out.push({ data: fmtBr(d), valor: serie === 12 ? '0.045513' : '14.25' });
      } else if (d.getDate() === 1) {
        out.push({ data: fmtBr(d), valor: '0.43' });
      }
    }

    if (out.length === 0) {
      const status = opcoes.statusSemDados ?? 404;
      registra(status === 404 ? 404 : SEM_DADOS_200);
      return HttpResponse.json(
        { erro: { statusCode: 404, detail: 'br.gov.bcb.pec.sgs.comum.excecoes.SGSNegocioException: Value(s) not found' } },
        { status }
      );
    }
    registra(200, out.length);
    return HttpResponse.json(out);
  });

  return { handler, requisicoes };
}

/** Janelas pedidas cobrem [inicio, fim] exatamente: contíguas, sem lacuna/sobreposição, nenhuma > 10 anos. */
function verificaCobertura(reqs: Requisicao[], inicio: Date, fim: Date) {
  expect(reqs.length).toBeGreaterThan(0);
  const chaves = reqs.map(r => `${fmtBr(r.di)}-${fmtBr(r.df)}`);
  expect(new Set(chaves).size).toBe(reqs.length); // cada janela pedida uma única vez

  const ord = [...reqs].sort((a, b) => a.di.getTime() - b.di.getTime());
  expect(fmtBr(ord[0].di)).toBe(fmtBr(inicio));
  expect(fmtBr(ord[ord.length - 1].df)).toBe(fmtBr(fim));
  for (let i = 0; i < ord.length; i++) {
    expect(ord[i].di <= ord[i].df).toBe(true);
    expect(excede10Anos(ord[i].di, ord[i].df)).toBe(false);
    if (i > 0) expect(fmtBr(ord[i].di)).toBe(fmtBr(addDias(ord[i - 1].df, 1)));
  }
}

/**
 * Nenhuma requisição recusada (406) ou com erro. 404 é tolerado: a última janela
 * pode, em datas raras, cair só em fim de semana (sem dado sintético).
 */
function semFalhas(reqs: Requisicao[]) {
  expect(reqs.filter(q => q.status !== 200 && q.status !== 404)).toEqual([]);
  expect(reqs.filter(q => q.status === 404).length).toBeLessThanOrEqual(1);
}

/** Dias seg–sex em [a, b]. */
function diasUteisSimulados(a: Date, b: Date): number {
  let n = 0;
  for (let d = localDay(a); d <= b; d = addDias(d, 1)) if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  return n;
}

// ─────────────────────────── banco em memória por teste ───────────────────────────

const dbPathOriginal = process.env.DATABASE_PATH;
beforeAll(() => {
  closeDB();
  process.env.DATABASE_PATH = ':memory:';
});
beforeEach(() => {
  closeDB(); // próxima chamada abre um ':memory:' novo → cache vazio
});
afterAll(() => {
  closeDB();
  process.env.DATABASE_PATH = dbPathOriginal;
});

// ───────────────────────────────────── testes ─────────────────────────────────────

describe('splitIntoWindows — particionamento das janelas do SGS', () => {
  it(`2000→hoje em janelas de ${SGS_DAILY_WINDOW_YEARS} anos: contíguas, cobrindo tudo, nenhuma > 10 anos`, () => {
    const fim = hoje();
    const janelas = splitIntoWindows(HISTORICO, fim, SGS_DAILY_WINDOW_YEARS);
    const reqs = janelas.map(w => ({ serie: 12, di: w.start, df: w.end, status: 200, pontos: 0 }));
    verificaCobertura(reqs, HISTORICO, fim);
    for (const w of janelas) {
      expect(w.end < new Date(w.start.getFullYear() + SGS_DAILY_WINDOW_YEARS, w.start.getMonth(), w.start.getDate())).toBe(true);
    }
  });

  it('bordas: 29/02, viradas de ano, intervalo curto e intervalo vazio', () => {
    const a = splitIntoWindows(dia(2000, 2, 29), dia(2010, 3, 1), 3);
    verificaCobertura(a.map(w => ({ serie: 12, di: w.start, df: w.end, status: 200, pontos: 0 })), dia(2000, 2, 29), dia(2010, 3, 1));
    expect(fmtBr(a[0].end)).toBe('28/02/2003');

    const b = splitIntoWindows(dia(2003, 1, 1), dia(2005, 12, 31), 3); // exatamente 3 anos
    expect(b).toHaveLength(1);
    const c = splitIntoWindows(dia(2003, 1, 1), dia(2006, 1, 1), 3); // 3 anos + 1 dia
    expect(c.map(w => `${fmtBr(w.start)}-${fmtBr(w.end)}`)).toEqual(['01/01/2003-31/12/2005', '01/01/2006-01/01/2006']);

    expect(splitIntoWindows(dia(2026, 9, 10), dia(2026, 9, 10), 3)).toHaveLength(1);
    expect(splitIntoWindows(dia(2026, 9, 11), dia(2026, 9, 10), 3)).toEqual([]);
    // hora do dia é descartada (ex.: data em cache às 12:00 + 1 dia)
    const d = splitIntoWindows(new Date(2020, 0, 1, 12), new Date(2020, 0, 5, 23, 59), 3);
    expect(d.map(w => `${fmtBr(w.start)}-${fmtBr(w.end)}`)).toEqual(['01/01/2020-05/01/2020']);
  });
});

describe('V-IDX-2b — getIndexDataWithCache com cache vazio', () => {
  it('CDI 02/01/2025→31/01/2025 retorna 22 pontos e nenhum aviso; carga 2000→hoje em janelas ≤ 10 anos', async () => {
    const sim = criarSimuladorSgs();
    server.use(sim.handler);

    const r = await getIndexDataWithCache(IndexType.CDI, dia(2025, 1, 2), dia(2025, 1, 31));

    expect(r.warning).toBeUndefined();
    expect(r.data).toHaveLength(22);
    expect(r.data[0].date.toISOString().slice(0, 10)).toBe('2025-01-02');
    expect(r.data[21].date.toISOString().slice(0, 10)).toBe('2025-01-31');
    for (const p of r.data) expect(Number.isFinite(p.value)).toBe(true);

    expect(sim.requisicoes.every(q => q.serie === 12)).toBe(true);
    semFalhas(sim.requisicoes);
    verificaCobertura(sim.requisicoes, HISTORICO, hoje());
    expect(sim.requisicoes.length).toBeGreaterThanOrEqual(3); // 26+ anos não cabem em menos de 3 janelas de ≤ 10 anos

    // tudo o que o SGS entregou foi gravado
    const servidos = sim.requisicoes.reduce((s, q) => s + q.pontos, 0);
    expect(getIndexData(IndexType.CDI, HISTORICO, hoje())).toHaveLength(servidos);
  });
});

describe('V-IDX-2c — forceRefreshIndex com cache vazio', () => {
  it('CDI: insere o histórico completo (≥ 6.704) paginado, total inserido = total servido', async () => {
    const sim = criarSimuladorSgs();
    server.use(sim.handler);

    const inseridos = await forceRefreshIndex(IndexType.CDI);

    const servidos = sim.requisicoes.reduce((s, q) => s + q.pontos, 0);
    expect(servidos).toBe(diasUteisSimulados(HISTORICO, hoje()));
    expect(inseridos).toBe(servidos);
    expect(inseridos).toBeGreaterThanOrEqual(6704);
    semFalhas(sim.requisicoes);
    verificaCobertura(sim.requisicoes, HISTORICO, hoje());
    expect(getIndexData(IndexType.CDI, HISTORICO, hoje())).toHaveLength(inseridos);

    // Segundo refresh: mesma paginação, nada novo a inserir.
    const sim2 = criarSimuladorSgs();
    server.use(sim2.handler);
    expect(await forceRefreshIndex(IndexType.CDI)).toBe(0);
    verificaCobertura(sim2.requisicoes, HISTORICO, hoje());
  });

  it.each([
    [IndexType.SELIC_META, 432],
    [IndexType.SELIC_OVER, 1178],
  ])('%s (série %s, diária) também é paginada', async (indexType, serie) => {
    const sim = criarSimuladorSgs();
    server.use(sim.handler);

    const inseridos = await forceRefreshIndex(indexType);

    expect(sim.requisicoes.every(q => q.serie === serie)).toBe(true);
    semFalhas(sim.requisicoes);
    verificaCobertura(sim.requisicoes, HISTORICO, hoje());
    expect(inseridos).toBe(diasUteisSimulados(HISTORICO, hoje()));
  });
});

describe('séries mensais — sem partição', () => {
  it('IPCA (433): uma única consulta 2000→hoje, sem aviso, dados gravados', async () => {
    const sim = criarSimuladorSgs();
    server.use(sim.handler);

    const r = await getIndexDataWithCache(IndexType.IPCA, dia(2024, 1, 1), dia(2024, 6, 1));

    expect(r.warning).toBeUndefined();
    expect(r.data).toHaveLength(6);
    expect(sim.requisicoes).toHaveLength(1);
    expect(sim.requisicoes[0]).toMatchObject({ serie: 433, status: 200 });
    expect(fmtBr(sim.requisicoes[0].di)).toBe('01/01/2000');
    expect(fmtBr(sim.requisicoes[0].df)).toBe(fmtBr(hoje()));
  });

  it('IGP-M (189): forceRefreshIndex insere todos os meses numa única consulta', async () => {
    const sim = criarSimuladorSgs();
    server.use(sim.handler);

    const inseridos = await forceRefreshIndex(IndexType.IGPM);

    const h = hoje();
    const meses = (h.getFullYear() - 2000) * 12 + h.getMonth() + 1;
    expect(inseridos).toBe(meses);
    expect(sim.requisicoes).toHaveLength(1);
  });
});

describe('404 do SGS = "sem dado no intervalo" (não é falha)', () => {
  it('última janela sem dados: sem aviso, sem retry, dados das demais janelas preservados', async () => {
    const sim = criarSimuladorSgs({ ultimaPublicacao: dia(2023, 12, 29) });
    server.use(sim.handler);

    const r = await getIndexDataWithCache(IndexType.CDI, dia(2023, 12, 1), dia(2023, 12, 31));

    expect(r.warning).toBeUndefined();
    expect(r.data).toHaveLength(diasUteisSimulados(dia(2023, 12, 1), dia(2023, 12, 29)));
    const vazias = sim.requisicoes.filter(q => q.status === 404);
    expect(vazias).toHaveLength(1); // 404 não é repetido
    expect(fmtBr(vazias[0].df)).toBe(fmtBr(hoje()));
    verificaCobertura(sim.requisicoes, HISTORICO, hoje());
  });

  it('série que só começa em 2010: janelas iniciais 404 não interrompem a carga', async () => {
    const sim = criarSimuladorSgs({ inicioSerie: dia(2010, 6, 1) });
    server.use(sim.handler);

    const inseridos = await forceRefreshIndex(IndexType.CDI);

    expect(sim.requisicoes.filter(q => q.status === 404).length).toBeGreaterThan(0);
    verificaCobertura(sim.requisicoes, HISTORICO, hoje());
    expect(inseridos).toBe(diasUteisSimulados(dia(2010, 6, 1), hoje()));
  });

  it('carga incremental sem dado novo (404): sem aviso', async () => {
    const ontem = addDias(hoje(), -1);
    saveIndexData(IndexType.CDI, [{ date: ontem, value: 0.055131 }]);
    // Cache sem data de busca: força a carga incremental (o TTL agora vale sobre fetched_at)
    setIndexFetchedAt(IndexType.CDI, null);
    const sim = criarSimuladorSgs({ ultimaPublicacao: ontem });
    server.use(sim.handler);

    const r = await getIndexDataWithCache(IndexType.CDI, addDias(hoje(), -10), hoje());

    expect(r.warning).toBeUndefined();
    expect(r.data).toHaveLength(1);
    expect(sim.requisicoes).toHaveLength(1);
    expect(sim.requisicoes[0].status).toBe(404);
    expect(fmtBr(sim.requisicoes[0].di)).toBe(fmtBr(hoje()));
  });

  it('"sem dados" com HTTP 200 + corpo de 404 (cache do BCB): sem aviso e sem retry', async () => {
    const ontem = addDias(hoje(), -1);
    saveIndexData(IndexType.CDI, [{ date: ontem, value: 0.055131 }]);
    // Cache sem data de busca: força a carga incremental (o TTL agora vale sobre fetched_at)
    setIndexFetchedAt(IndexType.CDI, null);
    const sim = criarSimuladorSgs({ ultimaPublicacao: ontem, statusSemDados: 200 });
    server.use(sim.handler);

    const r = await getIndexDataWithCache(IndexType.CDI, addDias(hoje(), -10), hoje());

    expect(r.warning).toBeUndefined();
    expect(r.data).toHaveLength(1);
    expect(sim.requisicoes.map(q => q.status)).toEqual([SEM_DADOS_200]);
  });
});

describe('falha real continua sendo erro/aviso', () => {
  it('406 numa janela do meio: aviso, sem retry, janelas anteriores gravadas; a próxima chamada retoma sem lacuna', async () => {
    const janelas = splitIntoWindows(HISTORICO, hoje(), SGS_DAILY_WINDOW_YEARS);
    const terceira = janelas[2];
    const sim = criarSimuladorSgs({
      falha: q => (fmtBr(q.di) === fmtBr(terceira.start) ? 406 : undefined),
    });
    server.use(sim.handler);

    const r = await getIndexDataWithCache(IndexType.CDI, dia(2000, 1, 1), dia(2025, 1, 31));

    expect(r.warning).toMatch(/indisponível/);
    expect(sim.requisicoes.map(q => q.status)).toEqual([200, 200, 406]); // 406 não é repetido; janelas seguintes não são pedidas
    // o que veio das 2 primeiras janelas ficou no cache e é devolvido
    const gravados = diasUteisSimulados(HISTORICO, janelas[1].end);
    expect(r.data).toHaveLength(gravados);
    const ultimo = getLastCachedDate(IndexType.CDI)!;
    expect(ultimo <= addDias(janelas[1].end, 1)).toBe(true);

    // SGS normalizado: retoma do dia seguinte ao último em cache até hoje, sem lacuna
    const sim2 = criarSimuladorSgs();
    server.use(sim2.handler);
    const r2 = await getIndexDataWithCache(IndexType.CDI, dia(2000, 1, 1), hoje());
    expect(r2.warning).toBeUndefined();
    verificaCobertura(sim2.requisicoes, addDias(localDay(ultimo), 1), hoje());
    expect(r2.data).toHaveLength(diasUteisSimulados(HISTORICO, hoje()));
  });

  it('forceRefreshIndex com 406 lança erro identificando a janela', async () => {
    const janelas = splitIntoWindows(HISTORICO, hoje(), SGS_DAILY_WINDOW_YEARS);
    const sim = criarSimuladorSgs({
      falha: q => (fmtBr(q.di) === fmtBr(janelas[1].start) ? 406 : undefined),
    });
    server.use(sim.handler);

    await expect(forceRefreshIndex(IndexType.CDI)).rejects.toThrow(
      new RegExp(`HTTP 406.*janela 2/${janelas.length}`)
    );
    expect(getIndexData(IndexType.CDI, HISTORICO, hoje())).toHaveLength(diasUteisSimulados(HISTORICO, janelas[0].end));
  });

  it(
    '5xx persistente: repete 3 vezes e falha (refresh lança erro)',
    async () => {
      const sim = criarSimuladorSgs({ falha: () => 503 });
      server.use(sim.handler);

      await expect(forceRefreshIndex(IndexType.CDI)).rejects.toThrow(/após 3 tentativas/);
      expect(sim.requisicoes.map(q => q.status)).toEqual([503, 503, 503]);
    },
    20000
  );
});
