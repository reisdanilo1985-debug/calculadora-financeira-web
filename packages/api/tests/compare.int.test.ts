import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { IndexType, DayCountBasis } from '@correcao/core';

const app = createApp();

describe('POST /api/comparar/cenarios', () => {
  it('calcula cada cenário de forma independente em um payload válido', async () => {
    const res = await request(app)
      .post('/api/comparar/cenarios')
      .send({
        initialAmount: 1000,
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        scenarios: [
          {
            label: 'Pré-fixada 10%',
            indexType: IndexType.PREFIXADA,
            dayCountBasis: DayCountBasis.DC365,
            prefixedRate: 0.1,
          },
          {
            label: 'CDI',
            indexType: IndexType.CDI,
            dayCountBasis: DayCountBasis.DU252,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.scenarios).toHaveLength(2);

    for (const scenario of res.body.scenarios) {
      expect(scenario.error).toBeUndefined();
      expect(typeof scenario.finalAmount).toBe('number');
      expect(Number.isNaN(scenario.finalAmount)).toBe(false);
    }
  });

  it('retorna 400 quando initialAmount está ausente', async () => {
    const res = await request(app)
      .post('/api/comparar/cenarios')
      .send({
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        scenarios: [
          { label: 'A', indexType: IndexType.PREFIXADA, dayCountBasis: DayCountBasis.DC365, prefixedRate: 0.1 },
          { label: 'B', indexType: IndexType.CDI, dayCountBasis: DayCountBasis.DU252 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('retorna 400 quando menos de 2 cenários são informados', async () => {
    const res = await request(app)
      .post('/api/comparar/cenarios')
      .send({
        initialAmount: 1000,
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        scenarios: [
          { label: 'A', indexType: IndexType.PREFIXADA, dayCountBasis: DayCountBasis.DC365, prefixedRate: 0.1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Informe ao menos 2 cenários para comparar.');
  });

  it('retorna 400 quando mais de 6 cenários são informados', async () => {
    const scenarios = Array.from({ length: 7 }, (_, i) => ({
      label: `Cenário ${i + 1}`,
      indexType: IndexType.PREFIXADA,
      dayCountBasis: DayCountBasis.DC365,
      prefixedRate: 0.1,
    }));

    const res = await request(app)
      .post('/api/comparar/cenarios')
      .send({
        initialAmount: 1000,
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        scenarios,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Máximo de 6 cenários por comparação.');
  });

  it('retorna 400 quando startDate é posterior a endDate', async () => {
    const res = await request(app)
      .post('/api/comparar/cenarios')
      .send({
        initialAmount: 1000,
        startDate: '2024-06-01',
        endDate: '2024-01-01',
        scenarios: [
          { label: 'A', indexType: IndexType.PREFIXADA, dayCountBasis: DayCountBasis.DC365, prefixedRate: 0.1 },
          { label: 'B', indexType: IndexType.CDI, dayCountBasis: DayCountBasis.DU252 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('startDate deve ser anterior a endDate.');
  });

  it('retorna erro por cenário quando premissas futuras são necessárias, sem derrubar a resposta geral', async () => {
    const res = await request(app)
      .post('/api/comparar/cenarios')
      .send({
        initialAmount: 1000,
        startDate: '2024-01-01',
        endDate: '2030-01-01',
        scenarios: [
          {
            label: 'Pré-fixada 10%',
            indexType: IndexType.PREFIXADA,
            dayCountBasis: DayCountBasis.DC365,
            prefixedRate: 0.1,
          },
          {
            label: 'CDI sem premissas futuras',
            indexType: IndexType.CDI,
            dayCountBasis: DayCountBasis.DU252,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.scenarios).toHaveLength(2);

    const prefixada = res.body.scenarios.find((s: any) => s.indexType === IndexType.PREFIXADA);
    expect(prefixada.error).toBeUndefined();
    expect(typeof prefixada.finalAmount).toBe('number');

    const cdi = res.body.scenarios.find((s: any) => s.indexType === IndexType.CDI);
    expect(cdi.error).toBe('Premissas futuras necessárias');
    expect(cdi.finalAmount).toBeUndefined();
  });

  it('nunca retorna "NaN" no JSON serializado de uma resposta 200', async () => {
    const res = await request(app)
      .post('/api/comparar/cenarios')
      .send({
        initialAmount: 1000,
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        scenarios: [
          {
            label: 'Pré-fixada 10%',
            indexType: IndexType.PREFIXADA,
            dayCountBasis: DayCountBasis.DC365,
            prefixedRate: 0.1,
          },
          {
            label: 'CDI',
            indexType: IndexType.CDI,
            dayCountBasis: DayCountBasis.DU252,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('NaN');
  });
});
