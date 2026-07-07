import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../src/services/MarketDashboardService', () => ({
  getMarketPulse: vi.fn(),
}));

import { getMarketPulse, MarketAsset } from '../src/services/MarketDashboardService';
import { createApp } from '../src/app';
import request from 'supertest';

const app = createApp();

const mockAssets: MarketAsset[] = [
  {
    symbol: '^BVSP',
    name: 'Ibovespa',
    price: 128345.67,
    change: 512.34,
    changePercent: 0.4,
    currency: 'BRL',
    type: 'index',
  },
  {
    symbol: 'GC=F',
    name: 'Ouro',
    price: 2385.9,
    change: -12.1,
    changePercent: -0.5,
    currency: 'USD',
    type: 'price',
  },
  {
    symbol: '^TNX',
    name: 'US 10Y',
    price: 4.25,
    change: 0.03,
    changePercent: 0.71,
    currency: 'USD',
    type: 'yield',
  },
];

describe('GET /api/market/pulse', () => {
  beforeEach(() => {
    vi.mocked(getMarketPulse).mockReset();
  });

  it('retorna 200 com a lista de ativos quando o serviço responde com sucesso', async () => {
    vi.mocked(getMarketPulse).mockResolvedValue(mockAssets);

    const res = await request(app).get('/api/market/pulse');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockAssets);
  });

  it('não retorna NaN serializado no corpo da resposta de sucesso', async () => {
    vi.mocked(getMarketPulse).mockResolvedValue(mockAssets);

    const res = await request(app).get('/api/market/pulse');

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('NaN');
  });

  it('retorna 500 com mensagem de erro clara quando o serviço falha, sem vazar stack trace', async () => {
    vi.mocked(getMarketPulse).mockRejectedValue(new Error('Yahoo Finance indisponível'));

    const res = await request(app).get('/api/market/pulse');

    expect(res.status).toBe(500);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error).toBe('Yahoo Finance indisponível');
    expect(res.body.error).not.toContain('at ');
    expect(res.body.stack).toBeUndefined();
  });
});
