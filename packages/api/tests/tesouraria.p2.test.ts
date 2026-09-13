/**
 * Auditoria 2026-09-12 — correções P2 da Tesouraria pela API (/api/tesouraria).
 *
 *  C11 — % do CDI pela convenção B3 (taxa DI diária).
 *  N18 — cross-currency com prazo (du/dc) na paridade.
 *  N05 — duration com convencaoCupom ('simples' | 'ntnf').
 *  N14 — TIR múltipla: alerta e veredito pelo VPL.
 *  N02 — datas 'AAAA-MM-DD' como data civil (30/360 igual em qualquer fuso) e
 *        dataRef do snapshot na data civil de São Paulo.
 *
 * Rodar com TZ=UTC e TZ=America/Sao_Paulo. A API consome o `dist` do core:
 * recompile o core (tsc -p packages/core) antes.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { dataRefSnapshot } from '../src/services/marketdata/snapshot';

const app = createApp();
const calc = (nome: string, corpo: unknown) => request(app).post(`/api/tesouraria/calc/${nome}`).send(corpo as object);

function r12(obtido: number, esperado: number) {
  const delta = Math.abs(obtido - esperado);
  const rel = esperado === 0 ? delta : delta / Math.abs(esperado);
  expect(Math.min(delta, rel), `obtido ${obtido}, esperado ${esperado}`).toBeLessThanOrEqual(1e-12);
}

const fl = (pares: [string, number][]) => pares.map(([date, amount]) => ({ date, amount }));

describe('C11 — % do CDI B3 pela API', () => {
  it('V-PCDI-1a-api / V-PCDI-2a-api', async () => {
    r12((await calc('pre-cdi', { preAa: 0.11, cdiAa: 0.1 })).body.pctCdi, 1.09497106783219);
    r12((await calc('pre-cdi', { modo: 'cdiParaPre', pctCdi: 1.1, cdiAa: 0.1 })).body.preAa, 0.11053203961611026);
  });

  it('V-CSP-1b-api / V-CSP-2a-api', async () => {
    r12((await calc('cdi-spread', { cdiAa: 0.144, spreadAa: 0.02 })).body.pctCdiComp, 1.1472426999196963);
    r12(
      (await calc('cdi-spread', { modo: 'pctParaSpread', pctCdi: 1.1, cdiAa: 0.144 })).body.spreadComp,
      0.013539986552668274
    );
  });

  it('V-XCCY-1e-api / V-IPCA-1b: % do CDI B3 presente; razão anual rotulada', async () => {
    const x = await calc('cross-ccy', { spreadEstrangeiroAa: 0.08, cdiAa: 0.144, cupomEstrangeiroAa: 0.05481 });
    expect(x.status).toBe(200);
    r12(x.body.pctCdiB3Comp, 1.1754823019870997);
    expect(x.body.convencao).toMatch(/razão anual.*aproximação/);
    const i = await calc('ipca', { realAa: 0.07, ipcaAa: 0.045, cdiAa: 0.144 });
    r12(i.body.pctCdiB3, 0.8300730552163241);
    expect(i.body.convencao).toMatch(/aproximação/);
  });
});

describe('N18 — cross-currency com prazo pela API', () => {
  const Y = { spreadEstrangeiroAa: 0.08, cdiAa: 0.144, cupomEstrangeiroAa: 0.05481 };

  it.each([
    ['V-XCCY-3a', 21, 30, 0.17301833225521557],
    ['V-XCCY-3b', 504, 720, 0.16968220040994073],
    ['V-XCCY-3c', 252, 365, 0.1716794210822918],
  ])('%s: %i du / %i dc', async (_id, du, dc, esperado) => {
    const res = await calc('cross-ccy', { ...Y, du, dc });
    expect(res.status).toBe(200);
    r12(res.body.preEquivComp, esperado);
    expect(res.body.prazoDu).toBe(du);
    expect(res.body.prazoDc).toBe(dc);
  });

  it('modo inverso também usa o prazo (ida e volta no prazo de 30 dc)', async () => {
    const ida = await calc('cross-ccy', { ...Y, du: 21, dc: 30 });
    const volta = await calc('cross-ccy', {
      modo: 'cdiParaMoeda',
      cdiAa: 0.144,
      spreadLocalAa: ida.body.spreadSobreCdiComp,
      cupomEstrangeiroAa: 0.05481,
      du: 21,
      dc: 30,
    });
    expect(volta.status).toBe(200);
    r12(volta.body.spreadEstrangeiroComp, 0.08);
  });

  it('prazo incompleto/inválido e cupom −100% → 400', async () => {
    expect((await calc('cross-ccy', { ...Y, du: 504 })).status).toBe(400);
    expect((await calc('cross-ccy', { ...Y, dc: 720 })).status).toBe(400);
    expect((await calc('cross-ccy', { ...Y, du: 0, dc: 720 })).status).toBe(400);
    expect((await calc('cross-ccy', { ...Y, du: 504, dc: '720,5' })).status).toBe(400);
    expect((await calc('cross-ccy', { ...Y, cupomEstrangeiroAa: -1 })).status).toBe(400); // V-XCCY-4b-api
  });
});

describe('N05 — duration convencaoCupom pela API', () => {
  const BOND = { face: 1000, couponRateAnnual: 0.1, ytm: 0.13, m: 2, n: 10 };

  it('V-XC-3a: modo ntnf = PU NTN-F do mesmo título (|Δ| ≤ R$ 0,01)', async () => {
    const dur = await calc('duration', { ...BOND, convencaoCupom: 'ntnf' });
    const pu = await calc('pu-titulos', {
      tipo: 'NTNF',
      face: 1000,
      iaa: 0.13,
      couponRateAnnual: 0.1,
      m: 2,
      cuponsDu: [126, 252, 378, 504, 630, 756, 882, 1008, 1134, 1260],
    });
    expect(dur.status).toBe(200);
    expect(Math.abs(dur.body.preco - pu.body.pu)).toBeLessThanOrEqual(0.01);
    expect(dur.body.convencao).toMatch(/^NTN-F/);
  });

  it('padrão simples rotulado; convenção inválida → 400', async () => {
    const r = await calc('duration', BOND);
    r12(r.body.preco, 905.5649049131216);
    expect(r.body.convencao).toMatch(/^Simples/);
    expect((await calc('duration', { ...BOND, convencaoCupom: 'bullet' })).status).toBe(400);
  });
});

describe('N14 — TIR múltipla pela API', () => {
  it('V-TIR-2a-api: −100/+230/−132, custo 15% → Aceitar pelo VPL, com alerta', async () => {
    const res = await calc('tir-vpl', {
      fluxos: fl([['2026-01-01', -100], ['2027-01-01', 230], ['2028-01-01', -132]]),
      custoCapital: 0.15,
      taxaDesconto: 0.15,
    });
    expect(res.status).toBe(200);
    expect(res.body.veredito).toBe('Aceitar');
    expect(res.body.criterioVeredito).toBe('VPL');
    expect(res.body.alertaTirMultipla).toMatch(/TIR múltipla/);
    r12(res.body.vplCustoCapital, 0.1890359168241966);
  });
});

describe(`N02 — datas civis na rota (TZ=${process.env.TZ ?? 'padrão'})`, () => {
  const juros = (d0: string, d1: string) =>
    calc('us-money-market', { modo: 'juros', notional: 1e6, taxa: 0.05, d0, d1 });

  it('V-USMM-6a/6b/6e: 01/03 → 31/03/2026 = 30 dias 30/360, R$ 4.166,67, 30 dias ACT', async () => {
    const res = await juros('2026-03-01', '2026-03-31');
    expect(res.status).toBe(200);
    expect(res.body.dias30360).toBe(30);
    r12(res.body.juros30360, 4166.666666666667);
    expect(res.body.diasAct).toBe(30);
  });

  it('V-USMM-6c/6d: 31/03 → 30/04 = 30; 15/01 → 15/07 = 180', async () => {
    expect((await juros('2026-03-31', '2026-04-30')).body.dias30360).toBe(30);
    expect((await juros('2026-01-15', '2026-07-15')).body.dias30360).toBe(180);
  });

  it('formatos equivalentes dão o mesmo resultado; formato ambíguo/inexistente → 400', async () => {
    expect((await juros('01/03/2026', '31/03/2026')).body.dias30360).toBe(30);
    expect((await juros('2026-03-01T15:00:00.000Z', '2026-03-31T15:00:00.000Z')).body.dias30360).toBe(30);
    expect((await juros('2026-03-01T12:00:00', '2026-03-31T12:00:00')).body.dias30360).toBe(30);
    expect((await juros('2026-02-30', '2026-03-31')).status).toBe(400);
    expect((await juros('03/31/2026', '04/30/2026')).status).toBe(400);
  });

  it('V-TIR-1a-api / V-TIR-1f-api: XIRR com datas ISO e DD/MM/AAAA (sem leitura MM/DD)', async () => {
    const iso = await calc('tir-vpl', {
      fluxos: fl([['2008-01-01', -10000], ['2008-03-01', 2750], ['2008-10-30', 4250], ['2009-02-15', 3250], ['2009-04-01', 2750]]),
      taxaDesconto: 0.09,
    });
    expect(Math.abs(iso.body.tirAnual / 0.37336253351883153 - 1)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(iso.body.vpl / 2086.6476020315367 - 1)).toBeLessThanOrEqual(1e-12);
    const br = await calc('tir-vpl', { fluxos: fl([['01/02/2026', -1000], ['01/08/2026', 500], ['01/02/2027', 600]]) });
    expect(br.status).toBe(200);
    expect(Math.abs(br.body.tirAnual - 0.1323257848747321)).toBeLessThanOrEqual(1e-9);
  });
});

describe('N02 — dataRef do snapshot na data civil de São Paulo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dataRefSnapshot: 21h35 BRT de 12/09/2026 (00h35 UTC de 13/09) → 2026-09-12', () => {
    expect(dataRefSnapshot(new Date('2026-09-13T00:35:00Z'))).toBe('2026-09-12');
    expect(dataRefSnapshot(new Date('2026-09-13T02:59:59Z'))).toBe('2026-09-12');
    expect(dataRefSnapshot(new Date('2026-09-13T03:00:00Z'))).toBe('2026-09-13');
  });

  it('GET /premissas após 21h BRT devolve dataRef do dia corrente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-13T00:35:00Z'));
    const res = await request(app).get('/api/tesouraria/premissas');
    expect(res.status).toBe(200);
    expect(res.body.dataRef).toBe('2026-09-12');
  });
});
