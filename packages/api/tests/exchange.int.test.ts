import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { http, HttpResponse } from 'msw';
import { createApp } from '../src/app';
import { server } from './setup';

const app = createApp();

/** Verifica que o JSON serializado da resposta não contém "NaN" em nenhum lugar. */
function semNaN(body: unknown) {
  expect(JSON.stringify(body)).not.toContain('NaN');
}

describe('GET /api/exchange/rates', () => {
  it('retorna 200 com dados de USD e EUR sem NaN', async () => {
    const res = await request(app).get('/api/exchange/rates').query({
      currencies: 'USD,EUR',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    const currencies = res.body.map((entry: any) => entry.currency);
    expect(currencies).toEqual(['USD', 'EUR']);

    for (const entry of res.body) {
      expect(Array.isArray(entry.data)).toBe(true);
    }

    semNaN(res.body);
  });

  it('retorna 400 quando faltam parâmetros obrigatórios', async () => {
    const res = await request(app).get('/api/exchange/rates');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('retorna 400 para datas inválidas', async () => {
    const res = await request(app).get('/api/exchange/rates').query({
      currencies: 'USD',
      startDate: 'data-invalida',
      endDate: '2024-01-31',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/exchange/latest', () => {
  it('retorna 200 com array de cotações recentes, sem rate NaN', async () => {
    const res = await request(app).get('/api/exchange/latest');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(6);

    for (const entry of res.body) {
      expect(typeof entry.rate).toBe('number');
      expect(Number.isNaN(entry.rate)).toBe(false);
    }

    semNaN(res.body);
  });
});

describe('GET /api/exchange/summary', () => {
  it('retorna 200 com resumo de USD', async () => {
    const res = await request(app).get('/api/exchange/summary').query({
      currencies: 'USD',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    semNaN(res.body);
  });

  it('retorna 400 quando faltam parâmetros obrigatórios', async () => {
    const res = await request(app).get('/api/exchange/summary');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/exchange/ptax/moedas', () => {
  it('retorna 200 com lista de moedas', async () => {
    const res = await request(app).get('/api/exchange/ptax/moedas');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    semNaN(res.body);
  });
});

describe('GET /api/exchange/ptax/cotacao', () => {
  it('retorna 200 com objeto de resumo PTAX para USD', async () => {
    const res = await request(app).get('/api/exchange/ptax/cotacao').query({
      currency: 'USD',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('USD');
    expect(typeof res.body.averageSellRate).toBe('number');
    expect(Number.isNaN(res.body.averageSellRate)).toBe(false);
    semNaN(res.body);
  });

  it('retorna 400 quando faltam parâmetros obrigatórios', async () => {
    const res = await request(app).get('/api/exchange/ptax/cotacao');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('retorna 404 quando não há cotação no período', async () => {
    // A rota PTAX filtra por boletim "Todos" só se pedido; forçamos ausência de
    // cotações simulando um período sem dados (mock retorna array vazio).
    server.use(
      http.get(
        /https:\/\/olinda\.bcb\.gov\.br\/olinda\/servico\/PTAX\/versao\/v1\/odata\/CotacaoDolarPeriodo.*/,
        () => HttpResponse.json({ value: [] })
      )
    );

    const res = await request(app).get('/api/exchange/ptax/cotacao').query({
      currency: 'USD',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('Resiliência quando a fonte externa (BCB) está fora do ar', () => {
  it('não derruba o processo e não retorna NaN ao buscar /rates', async () => {
    server.use(
      http.get(/https:\/\/api\.bcb\.gov\.br.*/, () => HttpResponse.error())
    );

    const res = await request(app).get('/api/exchange/rates').query({
      currencies: 'USD',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    // getExchangeRates captura o erro internamente e retorna [] — a rota
    // responde 200 com count 0 e data vazio, sem propagar exceção.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ currency: 'USD', count: 0, data: [] });
    semNaN(res.body);
  });
});
