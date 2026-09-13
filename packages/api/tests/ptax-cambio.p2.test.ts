/**
 * E06 / E07 / F3-01 (auditoria 2026-09-12) — PTAX por boletim, erro × "sem
 * cotação" e datas civis em servidor America/Sao_Paulo e UTC.
 *
 * A Olinda e o SGS são simulados com msw a partir das fixtures oficiais da
 * auditoria (fixtures/F3-olinda-*.json, F3-sgs-1-2025-01.json,
 * F3-sgs-21619-2025-01.json), FILTRANDO pelas datas pedidas — assim um dia
 * deslocado na consulta muda o resultado, como na API real.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { http, HttpResponse } from 'msw';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { server } from './setup';
import { createApp } from '../src/app';
import { PtaxService, PtaxSourceError } from '../src/services/PtaxService';

// ─────────────────────────────── fixtures oficiais ───────────────────────────────

type Boletim = {
  paridadeCompra: number; paridadeVenda: number; cotacaoCompra: number; cotacaoVenda: number;
  dataHoraCotacao: string; tipoBoletim: string;
};

const b = (cc: number, cv: number, dh: string, tipo: string, pc = 1, pv = 1): Boletim => ({
  paridadeCompra: pc, paridadeVenda: pv, cotacaoCompra: cc, cotacaoVenda: cv, dataHoraCotacao: dh, tipoBoletim: tipo,
});

/** F3-olinda-moeda-periodo-USD-2025-01-02_2025-01-03.json */
const USD_BOLETINS: Boletim[] = [
  b(6.2252, 6.2258, '2025-01-02 10:10:25.056', 'Abertura'),
  b(6.214, 6.2146, '2025-01-02 11:10:26.481', 'Intermediário'),
  b(6.2024, 6.203, '2025-01-02 12:10:12.686', 'Intermediário'),
  b(6.1902, 6.1908, '2025-01-02 13:09:42.485', 'Intermediário'),
  b(6.208, 6.2086, '2025-01-02 13:09:42.489', 'Fechamento'),
  b(6.1618, 6.1624, '2025-01-03 10:11:26.859', 'Abertura'),
  b(6.143, 6.1436, '2025-01-03 11:02:27.209', 'Intermediário'),
  b(6.1616, 6.1622, '2025-01-03 12:06:27.08', 'Intermediário'),
  b(6.1564, 6.157, '2025-01-03 13:07:30.495', 'Intermediário'),
  b(6.1557, 6.1563, '2025-01-03 13:07:30.503', 'Fechamento'),
];

/** F3-olinda-moeda-periodo-EUR-2025-01-02_2025-01-03.json */
const EUR_BOLETINS: Boletim[] = [
  b(6.4232, 6.425, '2025-01-02 10:10:25.056', 'Abertura', 1.0318, 1.032),
  b(6.4091, 6.4104, '2025-01-02 11:10:26.481', 'Intermediário', 1.0314, 1.0315),
  b(6.3903, 6.3922, '2025-01-02 12:10:12.686', 'Intermediário', 1.0303, 1.0305),
  b(6.3598, 6.361, '2025-01-02 13:09:42.485', 'Intermediário', 1.0274, 1.0275),
  b(6.3781, 6.3793, '2025-01-02 13:09:42.489', 'Fechamento', 1.0274, 1.0275),
  b(6.3442, 6.3454, '2025-01-03 10:11:26.859', 'Abertura', 1.0296, 1.0297),
  b(6.3224, 6.3236, '2025-01-03 11:02:27.209', 'Intermediário', 1.0292, 1.0293),
  b(6.3471, 6.3483, '2025-01-03 12:06:27.08', 'Intermediário', 1.0301, 1.0302),
  b(6.3337, 6.3349, '2025-01-03 13:07:30.495', 'Intermediário', 1.0288, 1.0289),
  b(6.333, 6.3342, '2025-01-03 13:07:30.503', 'Fechamento', 1.0288, 1.0289),
];

/** F3-olinda-dolar-periodo-2025-11-01_2025-11-30.json (20/11 é feriado: sem boletim) */
const USD_FECHAMENTO_NOV_2025: [number, number, string][] = [
  [5.3499, 5.3505, '2025-11-03 13:06:25.333'], [5.384, 5.3846, '2025-11-04 13:07:26.986'],
  [5.3792, 5.3798, '2025-11-05 13:07:26.804'], [5.3445, 5.3451, '2025-11-06 13:02:49.425'],
  [5.3561, 5.3567, '2025-11-07 13:10:31.908'], [5.3175, 5.3181, '2025-11-10 13:03:31.138'],
  [5.2723, 5.2729, '2025-11-11 13:07:30.004'], [5.2879, 5.2885, '2025-11-12 13:11:25.169'],
  [5.2814, 5.282, '2025-11-13 13:07:27.563'], [5.2946, 5.2952, '2025-11-14 13:11:28.202'],
  [5.3102, 5.3108, '2025-11-17 13:07:28.766'], [5.3355, 5.3361, '2025-11-18 13:10:26.459'],
  [5.334, 5.3346, '2025-11-19 13:09:27.626'], [5.3896, 5.3902, '2025-11-21 13:06:33.395'],
  [5.3942, 5.3948, '2025-11-24 13:02:26.741'], [5.3835, 5.3841, '2025-11-25 13:05:27.685'],
  [5.3688, 5.3694, '2025-11-26 13:03:30.935'], [5.3484, 5.349, '2025-11-27 13:07:26.522'],
  [5.3332, 5.3338, '2025-11-28 13:10:31.721'],
];

/** F3-olinda-moedas.json */
const MOEDAS = ['AUD', 'CAD', 'CHF', 'DKK', 'EUR', 'GBP', 'JPY', 'NOK', 'SEK', 'USD'].map(s => ({
  simbolo: s, nomeFormatado: s, tipoMoeda: 'A',
}));

/** F3-sgs-21619-2025-01.json (EUR venda) e F3-sgs-1-2025-01.json (USD venda) */
const DIAS_JAN_2025 = [2, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 27, 28, 29, 30, 31];
const SGS_21619 = [6.3793, 6.3342, 6.3533, 6.3013, 6.3179, 6.2723, 6.2501, 6.2288, 6.2461, 6.2231, 6.2144, 6.2427, 6.2924, 6.2864, 6.218, 6.1757, 6.1971, 6.2236, 6.1435, 6.1063, 6.1555, 6.0616];
const SGS_1 = [6.2086, 6.1563, 6.1119, 6.0741, 6.1321, 6.0896, 6.0965, 6.1079, 6.0671, 6.0377, 6.0322, 6.0609, 6.0498, 6.044, 5.9674, 5.9399, 5.8925, 5.9272, 5.893, 5.8596, 5.9006, 5.8301];

// ─────────────────────────── valores de referência (ref/F3-F.json) ───────────────────────────

const REF = {
  usd20250102Venda: 6.2086,
  usd0102a0103Dias: 2,
  usd0102a0103MediaVenda: 6.18245,
  usd0101a0102Dias: 1,
  usdAberturaVenda: 6.2258,
  usdIntermediarioN: 3,
  usdIntermediarioMedia: 6.2028,
  usdTodosN: 5,
  eurAbertura: { n: 1, media: 6.425 },
  eurIntermediario: { n: 3, media: 6.387866666666667 },
  eurFechamento: { n: 1, media: 6.3793 },
  eurTodos: { n: 5, media: 6.39358 },
  usdNov2025Dias: 19,
  usdNov2025Media: 5.340852631578947,
  fxEurJan2025Media: 6.2374363636363634,
};

// ───────────────────────────────── simuladores ─────────────────────────────────

const pedidosOlinda: { endpoint: string; moeda?: string; di: string; df: string }[] = [];

/** "'01-02-2025'" (MM-DD-AAAA entre aspas, como a Olinda recebe) → '2025-01-02' */
function isoDeOlinda(param: string | null): string {
  const [m, d, y] = String(param).replace(/^'|'$/g, '').split('-');
  return `${y}-${m}-${d}`;
}
const dia = (dh: string) => dh.slice(0, 10);

const olindaHandlers = [
  http.get(/https:\/\/olinda\.bcb\.gov\.br\/olinda\/servico\/PTAX\/versao\/v1\/odata\/CotacaoDolarPeriodo.*/, ({ request }) => {
    const u = new URL(request.url);
    const di = isoDeOlinda(u.searchParams.get('@dataInicial'));
    const df = isoDeOlinda(u.searchParams.get('@dataFinalCotacao'));
    pedidosOlinda.push({ endpoint: 'CotacaoDolarPeriodo', di, df });
    const fechamentos = [
      ...USD_BOLETINS.filter(x => x.tipoBoletim === 'Fechamento').map(x => ({
        cotacaoCompra: x.cotacaoCompra, cotacaoVenda: x.cotacaoVenda, dataHoraCotacao: x.dataHoraCotacao,
      })),
      ...USD_FECHAMENTO_NOV_2025.map(([cc, cv, dh]) => ({ cotacaoCompra: cc, cotacaoVenda: cv, dataHoraCotacao: dh })),
    ];
    return HttpResponse.json({ value: fechamentos.filter(q => dia(q.dataHoraCotacao) >= di && dia(q.dataHoraCotacao) <= df) });
  }),
  http.get(/https:\/\/olinda\.bcb\.gov\.br\/olinda\/servico\/PTAX\/versao\/v1\/odata\/CotacaoMoedaPeriodo.*/, ({ request }) => {
    const u = new URL(request.url);
    const moeda = String(u.searchParams.get('@moeda')).replace(/^'|'$/g, '');
    const di = isoDeOlinda(u.searchParams.get('@dataInicial'));
    const df = isoDeOlinda(u.searchParams.get('@dataFinalCotacao'));
    pedidosOlinda.push({ endpoint: 'CotacaoMoedaPeriodo', moeda, di, df });
    if (!/^[A-Z]{3}$/.test(moeda)) {
      // F3-olinda-moeda-periodo-EURaspa: HTTP 400, corpo não-JSON
      return new HttpResponse('/*{\n  "codigo" : 400,\n  "mensagem" : "The URI is malformed."\n}*/', { status: 400 });
    }
    const base = moeda === 'USD' ? USD_BOLETINS : moeda === 'EUR' ? EUR_BOLETINS : [];
    return HttpResponse.json({ value: base.filter(q => dia(q.dataHoraCotacao) >= di && dia(q.dataHoraCotacao) <= df) });
  }),
  http.get('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/Moedas', () => HttpResponse.json({ value: MOEDAS })),
];

const pedidosSgs: { serie: number; di: string; df: string }[] = [];

const sgsCambioHandler = http.get(/https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.(1|21619)\/dados/, ({ request }) => {
  const u = new URL(request.url);
  const serie = Number(u.pathname.match(/sgs\.(\d+)\//)![1]);
  const di = u.searchParams.get('dataInicial')!;
  const df = u.searchParams.get('dataFinal')!;
  pedidosSgs.push({ serie, di, df });
  const toIso = (s: string) => s.split('/').reverse().join('-');
  const valores = serie === 1 ? SGS_1 : SGS_21619;
  const out = DIAS_JAN_2025.map((d, i) => ({ data: `${String(d).padStart(2, '0')}/01/2025`, valor: valores[i].toFixed(4) }))
    .filter(p => toIso(p.data) >= toIso(di) && toIso(p.data) <= toIso(df));
  return out.length
    ? HttpResponse.json(out)
    : HttpResponse.json({ erro: { statusCode: 404, detail: 'Value(s) not found' } }, { status: 404 });
});

function usarSimuladores() {
  server.use(...olindaHandlers, sgsCambioHandler);
  pedidosOlinda.length = 0;
  pedidosSgs.length = 0;
}

const relativo = (a: number, ref: number) => Math.abs(a - ref) / Math.abs(ref);
const P = (q: Record<string, string>) => request(createApp()).get('/api/exchange/ptax/cotacao').query(q);

// ─────────────────────────────── F3-01: TZ × datas civis ───────────────────────────────
//
// O fuso não pode ser trocado em tempo de execução dentro do worker thread do
// vitest (process.env.TZ ali é uma cópia). O bloco abaixo roda no fuso do
// processo, e o teste "outro fuso" executa o MESMO bloco num processo filho com
// TZ=UTC (se este processo está em São Paulo) ou TZ=America/Sao_Paulo (se está
// em UTC). Para rodar só um fuso: `TZ=UTC npx vitest run tests/ptax-cambio.p2.test.ts`.

const OFFSET_ATUAL = new Date(2025, 0, 2, 12).getTimezoneOffset();
const TZ_ATUAL = OFFSET_ATUAL === 0 ? 'UTC' : OFFSET_ATUAL === 180 ? 'America/Sao_Paulo' : `offset ${OFFSET_ATUAL} min`;
const TZ_OUTRO = OFFSET_ATUAL === 0 ? 'America/Sao_Paulo' : 'UTC';

describe(`F3-01 — servidor com TZ=${TZ_ATUAL}`, () => {
  beforeEach(usarSimuladores);

  it('V-PTAX-1c — USD dia único "2025-01-02": venda 6,2086 e Olinda consultada no próprio dia', async () => {
    const r = await P({ currency: 'USD', startDate: '2025-01-02', endDate: '2025-01-02', bulletin: 'Fechamento' });
    expect(r.status).toBe(200);
    expect(r.body.lastQuoteSell).toBe(REF.usd20250102Venda);
    expect(pedidosOlinda).toEqual([{ endpoint: 'CotacaoDolarPeriodo', di: '2025-01-02', df: '2025-01-02' }]);
    // instante da cotação independe do fuso do servidor (dataHoraCotacao em Brasília)
    expect(r.body.lastQuoteDate).toBe('2025-01-02T16:09:42.489Z');
  });

  it('V-PTAX-1d / 1e — janela da UI "2025-01-02"→"2025-01-03": 2 dias, média de venda 6,18245', async () => {
    const r = await P({ currency: 'USD', startDate: '2025-01-02', endDate: '2025-01-03', bulletin: 'Fechamento' });
    expect(r.status).toBe(200);
    expect(r.body.businessDays).toBe(REF.usd0102a0103Dias);
    expect(relativo(r.body.averageSellRate, REF.usd0102a0103MediaVenda)).toBeLessThanOrEqual(1e-12);
  });

  it('"2025-01-01"→"2025-01-02": 1 dia (o 02/01 não é perdido)', async () => {
    const r = await P({ currency: 'USD', startDate: '2025-01-01', endDate: '2025-01-02' });
    expect(r.status).toBe(200);
    expect(r.body.businessDays).toBe(REF.usd0101a0102Dias);
  });

  it('V-PTAX-3c / 3d — "2025-11-01"→"2025-11-30": 19 dias com boletim, média 5,340852631578947', async () => {
    const r = await P({ currency: 'USD', startDate: '2025-11-01', endDate: '2025-11-30' });
    expect(r.status).toBe(200);
    expect(r.body.businessDays).toBe(REF.usdNov2025Dias);
    expect(relativo(r.body.averageSellRate, REF.usdNov2025Media)).toBeLessThanOrEqual(1e-12);
    expect(pedidosOlinda[0]).toMatchObject({ di: '2025-11-01', df: '2025-11-30' });
  });

  it('formatos com hora ("T12:00:00") e DD/MM/AAAA dão o mesmo resultado', async () => {
    const a = await P({ currency: 'USD', startDate: '2025-01-02T12:00:00', endDate: '2025-01-03T12:00:00' });
    const c = await P({ currency: 'USD', startDate: '02/01/2025', endDate: '03/01/2025' });
    expect(a.body.averageSellRate).toBe(c.body.averageSellRate);
    expect(a.body.businessDays).toBe(2);
  });

  it('V-FX-1d — /exchange/summary EUR "2025-01-02"→"2025-01-31": média 6,2374363636363634 (22 dias)', async () => {
    const r = await request(createApp())
      .get('/api/exchange/summary')
      .query({ currencies: 'EUR', startDate: '2025-01-02', endDate: '2025-01-31' });
    expect(r.status).toBe(200);
    expect(relativo(r.body[0].averageRate, REF.fxEurJan2025Media)).toBeLessThanOrEqual(1e-12);
    expect(r.body[0]).toMatchObject({ periodStart: '2025-01-02', periodEnd: '2025-01-31', minRateDate: '2025-01-31', maxRateDate: '2025-01-02' });
    expect(pedidosSgs.find(p => p.serie === 21619)).toEqual({ serie: 21619, di: '02/01/2025', df: '31/01/2025' });
  });

  it('/exchange/rates EUR dia único "2025-01-02" → 1 ponto datado 2025-01-02', async () => {
    const r = await request(createApp())
      .get('/api/exchange/rates')
      .query({ currencies: 'EUR', startDate: '2025-01-02', endDate: '2025-01-02' });
    expect(r.status).toBe(200);
    expect(r.body[0]).toMatchObject({ currency: 'EUR', count: 1, data: [{ date: '2025-01-02', sellValue: 6.3793 }] });
  });
});

describe('F3-01 — mesmos resultados no outro fuso', () => {
  it.skipIf(process.env.P2_TZ_PROCESSO_FILHO === '1')(
    `bloco F3-01 executado num processo com TZ=${TZ_OUTRO}`,
    () => {
      const apiDir = path.resolve(__dirname, '..');
      const vitest = path.resolve(apiDir, '..', '..', 'node_modules', 'vitest', 'vitest.mjs');
      const relatorio = path.join(os.tmpdir(), `correcao-p2-tz-${process.pid}-${Date.now()}.json`);
      const filho = spawnSync(
        process.execPath,
        [vitest, 'run', 'tests/ptax-cambio.p2.test.ts', '-t', 'F3-01 — servidor com TZ', '--reporter=json', `--outputFile=${relatorio}`],
        { cwd: apiDir, env: { ...process.env, TZ: TZ_OUTRO, P2_TZ_PROCESSO_FILHO: '1' }, encoding: 'utf8', timeout: 120000 }
      );
      const saida = `${filho.stdout ?? ''}\n${filho.stderr ?? ''}`.slice(-3000);
      let testes: { fullName: string; status: string }[] = [];
      try {
        const json = JSON.parse(fs.readFileSync(relatorio, 'utf8'));
        testes = json.testResults.flatMap((f: any) => f.assertionResults);
        fs.unlinkSync(relatorio);
      } catch {
        /* sem relatório: as asserções abaixo mostram a saída do processo filho */
      }
      const doBloco = testes.filter(t => t.fullName.includes(`F3-01 — servidor com TZ=${TZ_OUTRO}`));
      expect(filho.status, saida).toBe(0);
      expect(doBloco.length, saida).toBeGreaterThanOrEqual(7);
      expect(doBloco.filter(t => t.status !== 'passed'), saida).toEqual([]);
    },
    150000
  );
});

// ─────────────────────────────── E06: boletins ───────────────────────────────

describe('E06 — PTAX respeita o boletim escolhido', () => {
  beforeEach(usarSimuladores);
  const Q = (currency: string, bulletin: string) =>
    P({ currency, startDate: '2025-01-02T12:00:00', endDate: '2025-01-02T12:00:00', bulletin });
  const nMedia = (r: request.Response) => ({ n: r.body.quotes.length, media: r.body.averageSellRate });

  it('V-PTAX-2e — USD Abertura: {n: 1, venda 6,2258}', async () => {
    const r = await Q('USD', 'Abertura');
    expect(r.status).toBe(200);
    expect(nMedia(r)).toEqual({ n: 1, media: REF.usdAberturaVenda });
    expect(r.body.bulletinType).toBe('Abertura');
    expect(pedidosOlinda.map(p => p.endpoint)).toEqual(['CotacaoMoedaPeriodo']);
  });

  it('V-PTAX-2f — USD Intermediário: {n: 3, média 6,2028}', async () => {
    const r = await Q('USD', 'Intermediário');
    expect(r.status).toBe(200);
    expect(r.body.quotes).toHaveLength(REF.usdIntermediarioN);
    expect(relativo(r.body.averageSellRate, REF.usdIntermediarioMedia)).toBeLessThanOrEqual(1e-12);
  });

  it('V-PTAX-2g — USD Todos: 5 boletins (não se reduz ao fechamento)', async () => {
    const r = await Q('USD', 'Todos');
    expect(r.status).toBe(200);
    expect(r.body.quotes).toHaveLength(REF.usdTodosN);
    expect(r.body.quotes.map((q: any) => q.bulletinType)).toEqual(['Abertura', 'Intermediário', 'Intermediário', 'Intermediário', 'Fechamento']);
    expect(r.body.lastQuoteSell).toBe(6.2086); // último boletim do dia = fechamento
  });

  it('USD Fechamento continua usando CotacaoDolarPeriodo (1 cotação, 6,2086)', async () => {
    const r = await Q('USD', 'Fechamento');
    expect(nMedia(r)).toEqual({ n: 1, media: 6.2086 });
    expect(pedidosOlinda.map(p => p.endpoint)).toEqual(['CotacaoDolarPeriodo']);
  });

  it.each([
    ['Abertura', REF.eurAbertura],
    ['Intermediário', REF.eurIntermediario],
    ['Fechamento', REF.eurFechamento],
    ['Todos', REF.eurTodos],
  ])('V-PTAX-2a–2d — EUR %s', async (boletim, ref) => {
    const r = await Q('EUR', boletim);
    expect(r.status).toBe(200);
    expect(r.body.quotes).toHaveLength(ref.n);
    expect(relativo(r.body.averageSellRate, ref.media)).toBeLessThanOrEqual(1e-12);
  });

  it('boletim sem acento/caixa ("intermediario") é aceito; boletim desconhecido → 400', async () => {
    const r = await Q('USD', 'intermediario');
    expect(r.status).toBe(200);
    expect(r.body.bulletinType).toBe('Intermediário');
    const x = await Q('USD', 'Meio-dia');
    expect(x.status).toBe(400);
  });
});

// ─────────────────────────────── E07: erro × sem cotação ───────────────────────────────

describe('E07 — falha da fonte e moeda não suportada não viram "sem cotação"', () => {
  beforeEach(usarSimuladores);

  it('V-PTAX-3a — feriado (20/11/2025): 404 "Nenhuma cotação encontrada no período"', async () => {
    const r = await P({ currency: 'USD', startDate: '2025-11-20T12:00:00', endDate: '2025-11-20T12:00:00' });
    expect(`HTTP ${r.status}: ${r.body.error}`).toBe('HTTP 404: Nenhuma cotação encontrada no período');
  });

  it('V-PTAX-3e — moeda malformada "EUR\'" → 400, distinguível de "sem cotação"', async () => {
    const r = await P({ currency: "EUR'", startDate: '2025-01-02T12:00:00', endDate: '2025-01-03T12:00:00' });
    expect(r.status).toBe(400);
    expect(r.body.error).not.toMatch(/Nenhuma cotação/);
  });

  it('serviço: Olinda HTTP 400 lança PtaxSourceError (não devolve lista vazia)', async () => {
    await expect(PtaxService.getCurrencyPeriod("EUR'", new Date(2025, 0, 2, 12), new Date(2025, 0, 3, 12)))
      .rejects.toBeInstanceOf(PtaxSourceError);
  });

  it('V-PTAX-4b — CNY (fora da Olinda) → 422 moeda não suportada, com a lista disponível', async () => {
    const r = await P({ currency: 'CNY', startDate: '2025-01-02T12:00:00', endDate: '2025-01-03T12:00:00' });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/CNY não é publicada pela PTAX/);
    expect(r.body.available).toContain('USD');
  });

  it('Olinda fora do ar (HTTP 503) → 502 com mensagem de indisponibilidade', async () => {
    server.use(
      http.get(/https:\/\/olinda\.bcb\.gov\.br\/olinda\/servico\/PTAX\/versao\/v1\/odata\/CotacaoDolarPeriodo.*/, () =>
        new HttpResponse('Service Unavailable', { status: 503 })
      )
    );
    const r = await P({ currency: 'USD', startDate: '2025-01-02', endDate: '2025-01-03' });
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/indisponível/);
    expect(r.body.detail).toMatch(/HTTP 503/);
  });

  it('erro de rede na Olinda → 502 (não 404)', async () => {
    server.use(
      http.get(/https:\/\/olinda\.bcb\.gov\.br\/olinda\/servico\/PTAX\/versao\/v1\/odata\/CotacaoMoedaPeriodo.*/, () => HttpResponse.error())
    );
    const r = await P({ currency: 'EUR', startDate: '2025-01-02', endDate: '2025-01-03', bulletin: 'Todos' });
    expect(r.status).toBe(502);
  });

  it('lista de moedas indisponível: cotação segue sem validação; /ptax/moedas → 502', async () => {
    (PtaxService as any).currenciesCache = null;
    (PtaxService as any).lastCurrenciesFailure = 0;
    server.use(
      http.get('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/Moedas', () => new HttpResponse(null, { status: 500 }))
    );
    const r = await P({ currency: 'USD', startDate: '2025-01-02', endDate: '2025-01-02' });
    expect(r.status).toBe(200);
    const m = await request(createApp()).get('/api/exchange/ptax/moedas');
    expect(m.status).toBe(502);
    (PtaxService as any).lastCurrenciesFailure = 0;
  });

  it('datas: início > fim → 400; data inexistente (2025-02-30) → 400', async () => {
    const a = await P({ currency: 'USD', startDate: '2025-01-03', endDate: '2025-01-02' });
    expect(a.status).toBe(400);
    const c = await P({ currency: 'USD', startDate: '2025-02-30', endDate: '2025-03-02' });
    expect(c.status).toBe(400);
    expect(pedidosOlinda).toHaveLength(0);
  });
});
