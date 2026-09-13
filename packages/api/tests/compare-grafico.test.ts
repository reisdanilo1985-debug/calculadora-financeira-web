/**
 * Pontos do gráfico do Comparador: a linha começa em 0% na data inicial, passa pelo
 * acumulado no dia 1 de cada mês e termina exatamente no número do ranking.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { calculate, DayCountBasis, IndexType } from '@correcao/core';
import { createApp } from '../src/app';
import { pontosDoGrafico } from '../src/routes/compare';

const d = (iso: string) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
};

describe('pontosDoGrafico', () => {
  it('IPCA + 1% a.m. (13/09/2025 → 13/09/2026): intermediários incluem o spread e o último é o fator final', () => {
    const indexData = Array.from({ length: 13 }, (_, i) => ({ date: new Date(2025, 8 + i, 1), value: 0.3 }));
    const r = calculate({
      initialAmount: 100000,
      startDate: d('2025-09-13'),
      endDate: d('2026-09-13'),
      indexType: IndexType.IPCA,
      dayCountBasis: DayCountBasis.DC365,
      indexData,
      spread: { mode: 'additive', value: (Math.pow(1.01, 12) - 1) * 100, additiveBase: DayCountBasis.DC360 },
    });
    const pontos = pontosDoGrafico(r.memoryRows, d('2025-09-13'), d('2026-09-13'), r.accumulatedFactor, IndexType.IPCA);

    expect(pontos[0]).toEqual({ date: '2025-09-13', variationPct: 0, isProjected: false });
    expect(pontos.map(p => p.date).slice(1, -1)).toEqual([
      '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01',
      '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01',
    ]);
    const ultimo = pontos[pontos.length - 1];
    expect(ultimo.date).toBe('2026-09-13');
    expect(ultimo.variationPct).toBeCloseTo(r.variationPercent, 10);
    // Em 01/09/2026 já passou quase o ano todo: acumulado perto do final (IPCA + spread), não só IPCA
    const setembro = pontos[pontos.length - 2].variationPct;
    expect(setembro).toBeGreaterThan(r.variationPercent - 1);
    expect(setembro).toBeGreaterThan(12);
    // Crescimento monotônico com taxas positivas
    for (let i = 1; i < pontos.length; i++) expect(pontos[i].variationPct).toBeGreaterThanOrEqual(pontos[i - 1].variationPct);
  });

  it('linha datada no dia da taxa (CDI/Pré) só conta a partir do dia seguinte', () => {
    const rows = [
      { date: d('2025-01-30'), accumulatedFactor: 1.01, isProjected: false },
      { date: d('2025-01-31'), accumulatedFactor: 1.02, isProjected: false },
      { date: d('2025-02-01'), accumulatedFactor: 1.03, isProjected: true },
    ];
    const pontos = pontosDoGrafico(rows, d('2025-01-30'), d('2025-02-02'), 1.03, IndexType.CDI);
    expect(pontos).toEqual([
      { date: '2025-01-30', variationPct: 0, isProjected: false },
      { date: '2025-02-01', variationPct: expect.closeTo(2, 10), isProjected: false },
      { date: '2025-02-02', variationPct: expect.closeTo(3, 10), isProjected: true },
    ]);
  });

  it('linha datada no fim do período (IPCA) vale na própria data', () => {
    const rows = [
      { date: d('2025-02-01'), accumulatedFactor: 1.004, isProjected: false },
      { date: d('2025-03-01'), accumulatedFactor: 1.009, isProjected: false },
    ];
    const pontos = pontosDoGrafico(rows, d('2025-01-01'), d('2025-03-01'), 1.009, IndexType.IPCA);
    expect(pontos.map(p => [p.date, Number(p.variationPct.toFixed(6))])).toEqual([
      ['2025-01-01', 0], ['2025-02-01', 0.4], ['2025-03-01', 0.9],
    ]);
  });
});

describe('POST /api/comparar/cenarios — gráfico conversa com o ranking', () => {
  it('cada cenário termina no próprio variationPercent, na data final', async () => {
    const app = createApp();
    const res = await request(app).post('/api/comparar/cenarios').send({
      initialAmount: 100000,
      startDate: '2025-09-13T12:00:00',
      endDate: '2026-09-13T12:00:00',
      scenarios: [
        { label: 'Pré 10%', indexType: 'PREFIXADA', dayCountBasis: 365, prefixedRate: 10 },
        { label: 'Pré 14%', indexType: 'PREFIXADA', dayCountBasis: 252, prefixedRate: 14 },
      ],
    });
    expect(res.status).toBe(200);
    for (const s of res.body.scenarios) {
      expect(s.points[0]).toEqual({ date: '2025-09-13', variationPct: 0, isProjected: false });
      const ultimo = s.points[s.points.length - 1];
      expect(ultimo.date).toBe('2026-09-13');
      expect(ultimo.variationPct).toBeCloseTo(s.variationPercent, 10);
    }
  });
});
