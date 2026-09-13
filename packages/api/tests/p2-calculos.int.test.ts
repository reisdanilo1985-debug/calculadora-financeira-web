/**
 * Regressão das correções P2 da auditoria de set/2026 nas rotas de cálculo.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('POST /api/calcular — N02: datas lidas como data civil em qualquer fuso', () => {
  const pre = (ini: string, fim: string) => ({ thesisType: 'CORRECAO_SIMPLES', initialAmount: 1000, startDate: ini, endDate: fim, indexType: 'PREFIXADA', dayCountBasis: 252, prefixedRate: 12 });
  const casos: [string, string, number][] = [
    ['2025-01-03', '2025-01-06', 1],
    ['2025-01-03T12:00:00', '2025-01-06T12:00:00', 1],
    ['2025-01-03T00:00:00Z', '2025-01-06T00:00:00Z', 1],
    ['2025-01-03T02:00:00+10:00', '2025-01-06T02:00:00+10:00', 1],
    ['2025-01-03', '2025-02-03', 21],
    ['2025-01-03T12:00:00', '2025-02-03T12:00:00', 21],
  ];
  for (const [ini, fim, du] of casos) {
    it(`${ini} → ${fim}: ${du} dia(s) útil(eis)`, async () => {
      const res = await request(app).post('/api/calcular').send(pre(ini, fim));
      expect(res.status).toBe(200);
      expect(res.body.memoryRows).toHaveLength(du);
    });
  }

  it('data inexistente responde 400', async () => {
    const res = await request(app).post('/api/calcular').send(pre('2025-02-30', '2025-03-06'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/calcular — correções P2', () => {
  it('E09: periodicidade desconhecida responde 400 imediatamente', async () => {
    const t0 = Date.now();
    const res = await request(app).post('/api/calcular').send({
      thesisType: 'CORRECAO_SIMPLES', initialAmount: 10000, startDate: '2024-01-02T12:00:00', endDate: '2024-03-01T12:00:00',
      indexType: 'PREFIXADA', dayCountBasis: 365, prefixedRate: 10,
      amortizations: [{ date: '2024-01-10T12:00:00', type: 'PERIODIC', value: 100, periodicity: 'WEEKLY', periodicEndDate: '2024-02-28T12:00:00' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('periodicity');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('E09: direction e type fora do enum respondem 400', async () => {
    const base = { thesisType: 'CORRECAO_SIMPLES', initialAmount: 10000, startDate: '2024-01-02T12:00:00', endDate: '2024-03-01T12:00:00', indexType: 'PREFIXADA', dayCountBasis: 365, prefixedRate: 10 };
    expect((await request(app).post('/api/calcular').send({ ...base, amortizations: [{ date: '2024-01-10T12:00:00', type: 'FIXED', value: 100, direction: 'SIDEWAYS' }] })).status).toBe(400);
    expect((await request(app).post('/api/calcular').send({ ...base, amortizations: [{ date: '2024-01-10T12:00:00', type: 'ZZZ', value: 100 }] })).status).toBe(400);
  });
});
