/**
 * Regressão das correções P1 da auditoria de set/2026 na camada HTTP.
 * Série CDI vem do mock do BCB (tests/mocks/handlers.ts).
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

const cdi = (extra: Record<string, unknown> = {}) => ({
  thesisType: 'CORRECAO_SIMPLES',
  initialAmount: 10000,
  startDate: '2024-01-02T12:00:00',
  endDate: '2024-03-01T12:00:00',
  indexType: 'CDI',
  dayCountBasis: 252,
  ...extra,
});

describe('POST /api/calcular — correções P1', () => {
  it('C02: CDI + taxa com additiveBase numérico (como a UI envia) aplica o spread', async () => {
    const semSpread = await request(app).post('/api/calcular').send(cdi());
    const comSpread = await request(app).post('/api/calcular').send(cdi({ spread: { mode: 'additive', value: 2, additiveBase: 252 } }));
    expect(semSpread.status).toBe(200);
    expect(comSpread.status).toBe(200);
    const du = comSpread.body.memoryRows.length;
    // Fator de Spread B3: (1,02)^(du/252) sobre o fator do CDI
    expect(comSpread.body.accumulatedFactor / semSpread.body.accumulatedFactor).toBeCloseTo(Math.pow(1.02, du / 252), 10);
  });

  it('C16: aporte (direction IN) aumenta o saldo e aparece em totalContributed', async () => {
    const data = '2024-02-01T12:00:00';
    const out = await request(app).post('/api/calcular').send(cdi({ amortizations: [{ date: data, type: 'FIXED', value: 1000, direction: 'OUT' }] }));
    const inn = await request(app).post('/api/calcular').send(cdi({ amortizations: [{ date: data, type: 'FIXED', value: 1000, direction: 'IN' }] }));
    const base = await request(app).post('/api/calcular').send(cdi());
    expect(inn.status).toBe(200);
    expect(inn.body.totalContributed).toBeCloseTo(1000, 6);
    expect(inn.body.totalAmortized).toBe(0);
    expect(inn.body.finalAmount).toBeGreaterThan(base.body.finalAmount + 1000);
    expect(out.body.finalAmount).toBeLessThan(base.body.finalAmount - 1000);
  });

  it('C13: premissa que cobre só parte do futuro responde 422 com os intervalos sem dado', async () => {
    const res = await request(app).post('/api/calcular').send(cdi({
      startDate: '2024-01-02T12:00:00',
      endDate: '2031-12-31T12:00:00',
      futurePremises: [{ startDate: '2029-01-01T12:00:00', endDate: '2029-01-31T12:00:00', rate: 10 }],
    }));
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Sem dado oficial nem premissa');
    expect(Array.isArray(res.body.missingRanges)).toBe(true);
    expect(res.body.missingRanges.length).toBeGreaterThan(0);
    expect(res.body.premisesRequiredFrom).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc — limites de n (F2-04)', () => {
  it('duration com n = 1.000.000 responde 400 imediatamente', async () => {
    const t0 = Date.now();
    const res = await request(app).post('/api/tesouraria/calc/duration').send({ face: 1000, couponRateAnnual: 0.1, ytm: 0.13, m: 2, n: 1e6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('1200');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('duration com n fracionário, n = 1201 ou m fora da faixa responde 400', async () => {
    for (const extra of [{ n: 10.5 }, { n: 1201 }, { m: 0, n: 6 }, { m: 366, n: 6 }]) {
      const res = await request(app).post('/api/tesouraria/calc/duration').send({ face: 1000, couponRateAnnual: 0.1, ytm: 0.13, m: 2, n: 6, ...extra });
      expect(res.status).toBe(400);
    }
  });

  it('amortização com n = 1201 responde 400; n = 1200 calcula', async () => {
    expect((await request(app).post('/api/tesouraria/calc/amortizacao').send({ principal: 100000, i: 0.01, n: 1201 })).status).toBe(400);
    expect((await request(app).post('/api/tesouraria/calc/amortizacao').send({ principal: 100000, i: 0.01, n: 1200 })).status).toBe(200);
  });
});
