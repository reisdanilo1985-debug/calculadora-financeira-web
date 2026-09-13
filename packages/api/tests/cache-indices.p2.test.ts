/**
 * E02 (auditoria 2026-09-12; casos V-IDX-3a, V-IDX-3b, V-IDX-3c) — TTL do cache
 * de índices aplicado sobre `fetched_at`, janela de revisão e uma carga por
 * índice por vez. Relacionado: F3-02 (404 do SGS não gera aviso).
 *
 * SGS e FRED simulados com msw (nada vai à rede). Cada teste usa um SQLite
 * ':memory:' novo.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { http, HttpResponse } from 'msw';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IndexType } from '@correcao/core';
import { server } from './setup';
import { createApp } from '../src/app';
import {
  getIndexDataWithCache,
  forceRefreshIndex,
  cargaEmAndamento,
  REVISION_WINDOW_DAYS_DAILY,
} from '../src/services/BCBService';
import { getSOFRWithCache } from '../src/services/FREDService';
import {
  closeDB,
  saveIndexData,
  getIndexData,
  getIndexFetchedAt,
  setIndexFetchedAt,
  getAllCacheMeta,
} from '../src/services/DatabaseService';

// ───────────────────────────── utilitários de data ─────────────────────────────

const localDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseBr = (s: string) => {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
};
const fmtBr = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => localDay(new Date());
const horasAtras = (h: number) => new Date(Date.now() - h * 3600 * 1000);
const util = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
function diasUteis(a: Date, b: Date): Date[] {
  const out: Date[] = [];
  for (let d = localDay(a); d <= b; d = addDias(d, 1)) if (util(d)) out.push(d);
  return out;
}

// ───────────────────────────────── simulador SGS ─────────────────────────────────

const SERIES_DIARIAS = new Set([12, 432, 1178]);

interface OpcoesSgs {
  /** Valor publicado para (série, dia); undefined → valor padrão. */
  valor?: (serie: number, d: Date) => string | undefined;
  /** Atraso de cada resposta (para exercitar concorrência). */
  atrasoMs?: number;
  /** Responde este status de falha em todas as consultas. */
  falha?: number;
}

function simuladorSgs(opcoes: OpcoesSgs = {}) {
  const reqs: { serie: number; di: string; df: string }[] = [];
  let ativos = 0;
  let maxAtivos = 0;

  const handler = http.get(/https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.(\d+)\/dados/, async ({ request }) => {
    const url = new URL(request.url);
    const serie = Number(url.pathname.match(/bcdata\.sgs\.(\d+)\//)![1]);
    const di = url.searchParams.get('dataInicial')!;
    const df = url.searchParams.get('dataFinal')!;
    reqs.push({ serie, di, df });
    ativos++;
    maxAtivos = Math.max(maxAtivos, ativos);
    try {
      if (opcoes.atrasoMs) await new Promise(r => setTimeout(r, opcoes.atrasoMs));
      if (opcoes.falha) {
        return HttpResponse.json({ error: `falha simulada ${opcoes.falha}` }, { status: opcoes.falha });
      }
      const diaria = SERIES_DIARIAS.has(serie);
      const out: { data: string; valor: string }[] = [];
      for (let d = parseBr(di); d <= parseBr(df); d = addDias(d, 1)) {
        if (diaria ? !util(d) : d.getDate() !== 1) continue;
        const padrao = serie === 12 ? '0.045513' : diaria ? '14.25' : '0.43';
        out.push({ data: fmtBr(d), valor: opcoes.valor?.(serie, d) ?? padrao });
      }
      if (out.length === 0) {
        return HttpResponse.json(
          { erro: { statusCode: 404, detail: 'br.gov.bcb.pec.sgs.comum.excecoes.SGSNegocioException: Value(s) not found' } },
          { status: 404 }
        );
      }
      return HttpResponse.json(out);
    } finally {
      ativos--;
    }
  });

  return { handler, reqs, maxAtivos: () => maxAtivos };
}

// ─────────────────────────── banco em memória por teste ───────────────────────────

const dbPathOriginal = process.env.DATABASE_PATH;
beforeAll(() => {
  closeDB();
  process.env.DATABASE_PATH = ':memory:';
});
beforeEach(() => {
  closeDB();
  process.env.DATABASE_PATH = ':memory:';
});
afterAll(() => {
  closeDB();
  process.env.DATABASE_PATH = dbPathOriginal;
});

// ───────────────────────────────────── testes ─────────────────────────────────────

describe('E02 — duas consultas seguidas: a 2ª vem do cache, sem rede', () => {
  const app = createApp();

  it('V-IDX-3a — CDI 02/01→10/01/2025 pela rota: fromCache=true, sem nova consulta, sem aviso, < 1 s', async () => {
    const sim = simuladorSgs();
    server.use(sim.handler);
    const rota = '/api/indices/CDI?dataInicial=02/01/2025&dataFinal=10/01/2025';

    const r1 = await request(app).get(rota);
    expect(r1.status).toBe(200);
    expect(r1.body.fromCache).toBe(false);
    expect(r1.body.warning).toBeUndefined();
    expect(r1.body.count).toBe(7);
    const consultas = sim.reqs.length;
    expect(consultas).toBeGreaterThan(0);

    const t0 = Date.now();
    const r2 = await request(app).get(rota);
    const ms = Date.now() - t0;

    expect(r2.status).toBe(200);
    expect(r2.body.fromCache).toBe(true);
    expect(r2.body.warning).toBeUndefined();
    expect(r2.body.data).toEqual(r1.body.data);
    expect(sim.reqs.length).toBe(consultas); // nenhuma ida à fonte
    expect(ms).toBeLessThan(1000);
  });

  it('V-IDX-3b — IPCA 01/01→01/07/2025 (mensal) pela rota: 2ª consulta do cache, sem rede', async () => {
    const sim = simuladorSgs();
    server.use(sim.handler);
    const rota = '/api/indices/IPCA?dataInicial=01/01/2025&dataFinal=01/07/2025';

    const r1 = await request(app).get(rota);
    expect(r1.body).toMatchObject({ fromCache: false, count: 7 });
    expect(sim.reqs).toHaveLength(1);

    const t0 = Date.now();
    const r2 = await request(app).get(rota);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r2.body).toMatchObject({ fromCache: true, count: 7 });
    expect(r2.body.warning).toBeUndefined();
    expect(sim.reqs).toHaveLength(1);
  });

  it('V-IDX-3c — último CDI publicado (10/09/2026) gravado agora: nova consulta não vai à rede nem avisa', async () => {
    const sim = simuladorSgs();
    server.use(sim.handler);
    saveIndexData(IndexType.CDI, [{ date: new Date(2026, 8, 10, 12), value: 0.055131 }]);

    const t0 = Date.now();
    const r = await getIndexDataWithCache(IndexType.CDI, new Date(2026, 8, 1), new Date(2026, 8, 11));

    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.warning).toBeUndefined();
    expect(r.fromCache).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(sim.reqs).toHaveLength(0);
  });
});

describe('E02 — TTL sobre fetched_at e janela de revisão', () => {
  /** Cache CDI com ~30 dias corridos de dias úteis terminando 5 dias antes de hoje. */
  function semearCdi() {
    const pontos = diasUteis(addDias(hoje(), -35), addDias(hoje(), -5)).map(d => ({ date: d, value: 0.045513 }));
    saveIndexData(IndexType.CDI, pontos);
    return pontos;
  }

  it('dentro do TTL diário (3 h): sem consulta, mesmo com a última observação anterior a hoje', async () => {
    semearCdi();
    setIndexFetchedAt(IndexType.CDI, horasAtras(3));
    const sim = simuladorSgs();
    server.use(sim.handler);

    const r = await getIndexDataWithCache(IndexType.CDI, addDias(hoje(), -40), hoje());

    expect(sim.reqs).toHaveLength(0);
    expect(r.fromCache).toBe(true);
  });

  it(`TTL vencido (5 h): reconsulta ${REVISION_WINDOW_DAYS_DAILY} dias antes da última observação e atualiza o valor revisado`, async () => {
    const pontos = semearCdi();
    setIndexFetchedAt(IndexType.CDI, horasAtras(5));
    const ultimo = pontos[pontos.length - 1].date;
    const revisado = pontos[pontos.length - 3].date; // dentro da janela de revisão
    const antigo = pontos[0].date; // fora da janela: não é reconsultado
    const sim = simuladorSgs({
      valor: (_s, d) => (iso(d) === iso(revisado) ? '0.050000' : iso(d) === iso(antigo) ? '0.099999' : undefined),
    });
    server.use(sim.handler);

    const r = await getIndexDataWithCache(IndexType.CDI, addDias(hoje(), -40), hoje());

    expect(r.warning).toBeUndefined();
    expect(r.fromCache).toBe(false);
    expect(sim.reqs).toEqual([
      { serie: 12, di: fmtBr(addDias(ultimo, -REVISION_WINDOW_DAYS_DAILY)), df: fmtBr(hoje()) },
    ]);
    expect(getIndexData(IndexType.CDI, revisado, revisado)[0].value).toBe(0.05); // revisão detectada e gravada
    expect(getIndexData(IndexType.CDI, antigo, antigo)[0].value).toBe(0.045513);
    expect(Date.now() - getIndexFetchedAt(IndexType.CDI)!.getTime()).toBeLessThan(5000);

    // E a consulta seguinte volta a ser servida do cache.
    const r2 = await getIndexDataWithCache(IndexType.CDI, addDias(hoje(), -40), hoje());
    expect(r2.fromCache).toBe(true);
    expect(sim.reqs).toHaveLength(1);
  });

  it('mensal: TTL de 24 h; vencido → reconsulta as 2 últimas competências', async () => {
    saveIndexData(IndexType.IPCA, [
      { date: new Date(2025, 4, 1), value: 0.26 },
      { date: new Date(2025, 5, 1), value: 0.24 },
      { date: new Date(2025, 6, 1), value: 0.26 },
    ]);
    const sim = simuladorSgs({ valor: (_s, d) => (iso(d) === '2025-06-01' ? '0.2400001' : undefined) });
    server.use(sim.handler);

    setIndexFetchedAt(IndexType.IPCA, horasAtras(23));
    await getIndexDataWithCache(IndexType.IPCA, new Date(2025, 0, 1), new Date(2025, 6, 1));
    expect(sim.reqs).toHaveLength(0);

    setIndexFetchedAt(IndexType.IPCA, horasAtras(25));
    const r = await getIndexDataWithCache(IndexType.IPCA, new Date(2025, 0, 1), new Date(2025, 6, 1));
    expect(r.warning).toBeUndefined();
    expect(sim.reqs).toHaveLength(1);
    expect(sim.reqs[0].di).toBe('01/06/2025');
    expect(getIndexData(IndexType.IPCA, new Date(2025, 5, 1), new Date(2025, 5, 1))[0].value).toBe(0.2400001);
    expect(getIndexData(IndexType.IPCA, new Date(2025, 4, 1), new Date(2025, 4, 1))[0].value).toBe(0.26);
  });

  it('carga sem ponto novo (404 do SGS) também renova fetched_at — sem aviso (F3-02)', async () => {
    saveIndexData(IndexType.IGPM, [{ date: new Date(2025, 6, 1), value: 0.5 }]);
    setIndexFetchedAt(IndexType.IGPM, null); // nunca sincronizado → retoma no dia seguinte
    const sim = simuladorSgs({ valor: () => undefined });
    server.use(
      http.get(/https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.189\/dados/, ({ request }) => {
        const url = new URL(request.url);
        sim.reqs.push({ serie: 189, di: url.searchParams.get('dataInicial')!, df: url.searchParams.get('dataFinal')! });
        return HttpResponse.json({ erro: { statusCode: 404, detail: 'Value(s) not found' } }, { status: 404 });
      })
    );

    const r = await getIndexDataWithCache(IndexType.IGPM, new Date(2025, 0, 1), hoje());

    expect(r.warning).toBeUndefined();
    expect(sim.reqs.map(q => q.di)).toEqual(['02/07/2025']);
    expect(getIndexFetchedAt(IndexType.IGPM)).not.toBeNull();
    await getIndexDataWithCache(IndexType.IGPM, new Date(2025, 0, 1), hoje());
    expect(sim.reqs).toHaveLength(1);
  });

  it.each([404, 200])(
    'cenário de bcb-carga.p1 com TTL vencido: dado de ontem + "sem dados" (HTTP %s) → 1 consulta a partir de hoje, sem aviso',
    async statusSemDados => {
      const ontem = addDias(hoje(), -1);
      saveIndexData(IndexType.CDI, [{ date: ontem, value: 0.055131 }]);
      setIndexFetchedAt(IndexType.CDI, null); // gravado agora conta como sincronizado; simula "nunca sincronizado"
      const reqs: { di: string; status: number }[] = [];
      server.use(
        http.get(/https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.12\/dados/, ({ request }) => {
          reqs.push({ di: new URL(request.url).searchParams.get('dataInicial')!, status: statusSemDados });
          return HttpResponse.json(
            { erro: { statusCode: 404, detail: 'br.gov.bcb.pec.sgs.comum.excecoes.SGSNegocioException: Value(s) not found' } },
            { status: statusSemDados }
          );
        })
      );

      const r = await getIndexDataWithCache(IndexType.CDI, addDias(hoje(), -10), hoje());

      expect(r.warning).toBeUndefined();
      expect(r.data).toHaveLength(1);
      expect(reqs).toEqual([{ di: fmtBr(hoje()), status: statusSemDados }]);
    }
  );

  it('falha real: aviso, fetched_at limpo (próxima consulta tenta de novo) e cache preservado', async () => {
    saveIndexData(IndexType.IPCA, [{ date: new Date(2025, 6, 1), value: 0.26 }]);
    setIndexFetchedAt(IndexType.IPCA, horasAtras(30));
    const falha = simuladorSgs({ falha: 406 });
    server.use(falha.handler);

    const r = await getIndexDataWithCache(IndexType.IPCA, new Date(2025, 0, 1), new Date(2025, 6, 1));
    expect(r.warning).toMatch(/indisponível/);
    expect(r.fromCache).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(getIndexFetchedAt(IndexType.IPCA)).toBeNull();

    const ok = simuladorSgs();
    server.use(ok.handler);
    const r2 = await getIndexDataWithCache(IndexType.IPCA, new Date(2025, 0, 1), new Date(2025, 6, 1));
    expect(r2.warning).toBeUndefined();
    expect(ok.reqs).toHaveLength(1);
    expect(ok.reqs[0].di).toBe('02/07/2025'); // retomada após falha: dia seguinte ao último dado
  });
});

describe('E02 — migração de bancos existentes (sem a coluna fetched_at)', () => {
  it('adiciona fetched_at preenchido com last_updated; TTL passa a valer sem ida à rede', async () => {
    const arquivo = path.join(os.tmpdir(), `correcao-p2-legado-${process.pid}-${Date.now()}.db`);
    const legado = new Database(arquivo);
    legado.exec(`
      CREATE TABLE index_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT, index_type TEXT NOT NULL, date TEXT NOT NULL,
        value REAL NOT NULL, created_at TEXT DEFAULT (datetime('now')), UNIQUE(index_type, date)
      );
      CREATE TABLE cache_meta (
        index_type TEXT PRIMARY KEY, last_date TEXT, total_records INTEGER DEFAULT 0,
        last_updated TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO index_data (index_type, date, value) VALUES ('CDI', '2026-09-10', 0.055131);
      INSERT INTO cache_meta VALUES ('CDI', '2026-09-10', 1, datetime('now', '-1 hour'));
    `);
    legado.close();

    closeDB();
    process.env.DATABASE_PATH = arquivo;
    try {
      const meta = getAllCacheMeta();
      expect(meta).toHaveLength(1);
      expect(meta[0].fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      const idadeMin = (Date.now() - getIndexFetchedAt(IndexType.CDI)!.getTime()) / 60000;
      expect(idadeMin).toBeGreaterThan(55);
      expect(idadeMin).toBeLessThan(65);

      const sim = simuladorSgs();
      server.use(sim.handler);
      const r = await getIndexDataWithCache(IndexType.CDI, new Date(2026, 8, 1), new Date(2026, 8, 11));
      expect(sim.reqs).toHaveLength(0);
      expect(r).toMatchObject({ fromCache: true });
      expect(r.data).toHaveLength(1);

      // reabrir não duplica a migração
      closeDB();
      expect(getAllCacheMeta()[0].fetchedAt).toBe(meta[0].fetchedAt);
    } finally {
      closeDB();
      process.env.DATABASE_PATH = ':memory:';
      for (const sufixo of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(arquivo + sufixo);
        } catch {
          /* já removido */
        }
      }
    }
  });
});

describe('E02/E10 — uma carga por índice por vez', () => {
  it('refresh concorrente do mesmo índice compartilha a carga (1 consulta à fonte)', async () => {
    const sim = simuladorSgs({ atrasoMs: 50 });
    server.use(sim.handler);

    const [a, b] = await Promise.all([forceRefreshIndex(IndexType.IGPM), forceRefreshIndex(IndexType.IGPM)]);

    expect(sim.reqs).toHaveLength(1);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(300);
    expect(cargaEmAndamento(IndexType.IGPM)).toBeNull();
  });

  it('consultas concorrentes com cache vazio fazem uma única carga', async () => {
    const sim = simuladorSgs({ atrasoMs: 30 });
    server.use(sim.handler);

    const [r1, r2] = await Promise.all([
      getIndexDataWithCache(IndexType.INCC, new Date(2025, 0, 1), new Date(2025, 5, 1)),
      getIndexDataWithCache(IndexType.INCC, new Date(2025, 0, 1), new Date(2025, 5, 1)),
    ]);

    expect(sim.reqs).toHaveLength(1);
    expect(r1.data).toHaveLength(6);
    expect(r2.data).toEqual(r1.data);
  });

  it('consulta durante refresh completo de cache já sincronizado (TTL vencido) responde do cache sem esperar', async () => {
    saveIndexData(IndexType.IGPM, [{ date: new Date(2025, 0, 1), value: 0.27 }]);
    setIndexFetchedAt(IndexType.IGPM, horasAtras(30));
    const sim = simuladorSgs({ atrasoMs: 400 });
    server.use(sim.handler);

    const refresh = forceRefreshIndex(IndexType.IGPM);
    expect(cargaEmAndamento(IndexType.IGPM)).toBe('completa');

    const t0 = Date.now();
    const r = await getIndexDataWithCache(IndexType.IGPM, new Date(2025, 0, 1), new Date(2025, 0, 1));
    expect(Date.now() - t0).toBeLessThan(300);
    expect(r).toMatchObject({ fromCache: true });

    await refresh;
    expect(sim.reqs).toHaveLength(1);
  });

  it('cache nunca sincronizado: consulta que chega no meio da carga histórica em janelas espera e recebe o histórico inteiro', async () => {
    const sim = simuladorSgs({ atrasoMs: 25 });
    server.use(sim.handler);
    const ini = new Date(2000, 0, 1);

    const primeira = getIndexDataWithCache(IndexType.SELIC_OVER, ini, hoje());
    await new Promise(r => setTimeout(r, 90)); // algumas janelas já gravadas
    expect(sim.reqs.length).toBeGreaterThan(1);
    expect(getIndexFetchedAt(IndexType.SELIC_OVER)).toBeNull(); // parcial não conta como sincronizado
    const segunda = await getIndexDataWithCache(IndexType.SELIC_OVER, ini, hoje());
    const r1 = await primeira;

    expect(segunda.data).toHaveLength(r1.data.length);
    expect(r1.data).toHaveLength(diasUteis(ini, hoje()).length);
    expect(new Set(sim.reqs.map(q => q.di)).size).toBe(sim.reqs.length); // uma única carga
    expect(getIndexFetchedAt(IndexType.SELIC_OVER)).not.toBeNull();
  });

  it('cache nunca sincronizado: consulta durante refresh completo espera a carga (não recebe histórico parcial)', async () => {
    const sim = simuladorSgs({ atrasoMs: 25 });
    server.use(sim.handler);
    const ini = new Date(2000, 0, 1);

    const refresh = forceRefreshIndex(IndexType.SELIC_META);
    await new Promise(r => setTimeout(r, 90));
    const r = await getIndexDataWithCache(IndexType.SELIC_META, ini, hoje());
    await refresh;

    expect(r.data).toHaveLength(diasUteis(ini, hoje()).length);
    expect(new Set(sim.reqs.map(q => q.di)).size).toBe(sim.reqs.length);
  });

  it('refresh completo pedido durante carga incremental é encadeado, sem sobreposição', async () => {
    const sim = simuladorSgs({ atrasoMs: 60 });
    server.use(sim.handler);

    const consulta = getIndexDataWithCache(IndexType.IPCA, new Date(2025, 0, 1), new Date(2025, 5, 1));
    expect(cargaEmAndamento(IndexType.IPCA)).toBe('incremental');
    const refresh = forceRefreshIndex(IndexType.IPCA);
    expect(cargaEmAndamento(IndexType.IPCA)).toBe('completa');

    await Promise.all([consulta, refresh]);
    expect(sim.reqs).toHaveLength(2);
    expect(sim.maxAtivos()).toBe(1);
  });
});

describe('E02 — SOFR (FRED) com o mesmo TTL e janela de revisão', () => {
  function simuladorFred(valorPara: (dia: string) => string) {
    const reqs: number[] = [];
    const handler = http.get('https://fred.stlouisfed.org/graph/fredgraph.csv', () => {
      reqs.push(Date.now());
      const linhas = ['observation_date,SOFR'];
      for (const d of diasUteis(addDias(hoje(), -40), addDias(hoje(), -1))) linhas.push(`${iso(d)},${valorPara(iso(d))}`);
      return HttpResponse.text(linhas.join('\n'));
    });
    return { handler, reqs };
  }

  it('2ª consulta sem rede; TTL vencido → valor revisado dentro de 14 dias é atualizado', async () => {
    let revisar = false;
    const alvo = iso(diasUteis(addDias(hoje(), -8), addDias(hoje(), -2))[0]);
    const sim = simuladorFred(dia => (revisar && dia === alvo ? '5.31' : '5.30'));
    server.use(sim.handler);
    const ini = addDias(hoje(), -40);

    const r1 = await getSOFRWithCache(ini, hoje());
    expect(r1.fromCache).toBe(false);
    const r2 = await getSOFRWithCache(ini, hoje());
    expect(r2.fromCache).toBe(true);
    expect(sim.reqs).toHaveLength(1);

    revisar = true;
    setIndexFetchedAt(IndexType.SOFR, horasAtras(5));
    const r3 = await getSOFRWithCache(ini, hoje());
    expect(r3.warning).toBeUndefined();
    expect(sim.reqs).toHaveLength(2);
    const [y, m, d] = alvo.split('-').map(Number);
    expect(getIndexData(IndexType.SOFR, new Date(y, m - 1, d), new Date(y, m - 1, d))[0].value).toBe(5.31);
  });
});
