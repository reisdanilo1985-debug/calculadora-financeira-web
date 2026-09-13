import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('Options API', () => {
  it('simula uma call comprada', async () => {
    const body = {
      market: { symbol: 'PETR4', spot: 40, valuationDate: '2026-09-13', riskFreeRate: .12, dividendYield: .05, currency: 'BRL' },
      legs: [{ id: '1', symbol: 'PETRA42', instrument: 'OPTION', side: 'LONG', optionType: 'CALL', quantity: 1, multiplier: 100, strike: 42, expiry: '2026-12-18', premium: 2, impliedVolatility: .3 }],
      costs: { entry: { fixedPerOrder: 0, perContract: 0, percentNotional: 0 }, exit: { fixedPerOrder: 0, perContract: 0, percentNotional: 0 }, exercisePerContract: 0, includeExitCosts: false },
      grid: { spotMin: 20, spotMax: 60, spotSteps: 21, dateSteps: 5, volatilityShift: 0 },
    };
    const response = await request(createApp()).post('/api/options/simulate').send(body);
    expect(response.status).toBe(200);
    expect(response.body.payoffCurve).toHaveLength(21);
    expect(response.body.summary.profitUnlimited).toBe(true);
  });

  it('rejeita opção incompleta', async () => {
    const response = await request(createApp()).post('/api/options/simulate').send({ legs: [] });
    expect(response.status).toBe(400);
  });
});
