/**
 * Reforços de segurança (2026-10-25):
 *  - POST /api/tesouraria/premissas/refresh exige credencial administrativa
 *    (503 sem ADMIN_TOKEN no servidor; 401 sem header; 403 com token errado);
 *  - cabeçalhos do helmet nas respostas da API;
 *  - validação de corpo (zod) em comparador, WACC e aposentadoria: tipo errado,
 *    NaN e enum inválido respondem 400 em vez de 500.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import './setup';
import { createApp } from '../src/app';
import { closeDB } from '../src/services/DatabaseService';

const TOKEN = 'token-de-teste-com-mais-de-16-caracteres';
const HEADER = 'x-admin-token';
const adminOriginal = process.env.ADMIN_TOKEN;

beforeAll(() => {
  closeDB();
  process.env.DATABASE_PATH = ':memory:';
});
afterEach(() => {
  if (adminOriginal === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = adminOriginal;
});
afterAll(() => closeDB());

describe('refresh das premissas da Tesouraria é administrativo', () => {
  it('503 quando o servidor não tem ADMIN_TOKEN', async () => {
    delete process.env.ADMIN_TOKEN;
    const res = await request(createApp()).post('/api/tesouraria/premissas/refresh').send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('ADMIN_TOKEN');
  });

  it('401 sem o header e 403 com token errado', async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    const app = createApp();
    expect((await request(app).post('/api/tesouraria/premissas/refresh').send({})).status).toBe(401);
    expect((await request(app).post('/api/tesouraria/premissas/refresh').set(HEADER, 'errado').send({})).status).toBe(403);
  });

  it('GET /premissas continua público', async () => {
    delete process.env.ADMIN_TOKEN;
    const res = await request(createApp()).get('/api/tesouraria/premissas');
    expect([200, 500]).toContain(res.status); // 500 só se as fontes externas estiverem indisponíveis
    expect(res.status).not.toBe(503);
  });
});

describe('cabeçalhos de segurança (helmet)', () => {
  it('respostas trazem nosniff, frame-options e CSP', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('validação de corpo (zod) nas rotas sem esquema anterior', () => {
  const app = createApp();

  it('comparador: tipos errados respondem 400 com a mensagem padrão', async () => {
    const res = await request(app).post('/api/comparar/cenarios').send({
      initialAmount: 'abc',
      startDate: '2025-01-01',
      endDate: '2025-06-01',
      scenarios: [{ indexType: 'CDI' }, { indexType: 'IPCA' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Payload inválido — initialAmount/);

    const enumRuim = await request(app).post('/api/comparar/cenarios').send({
      initialAmount: 1000,
      startDate: '2025-01-01',
      endDate: '2025-06-01',
      scenarios: [{ indexType: 'BITCOIN' }, { indexType: 'IPCA' }],
    });
    expect(enumRuim.status).toBe(400);
    expect(enumRuim.body.error).toContain('scenarios.0.indexType');
  });

  it('comparador: mensagens antigas de contagem de cenários continuam', async () => {
    const res = await request(app).post('/api/comparar/cenarios').send({
      initialAmount: 1000,
      startDate: '2025-01-01',
      endDate: '2025-06-01',
      scenarios: [{ indexType: 'CDI' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Informe ao menos 2 cenários para comparar.');
  });

  it('WACC: campo não numérico e negativo respondem 400', async () => {
    const base = {
      setor: 'Energia', pais: 'Brasil', moeda: 'BRL',
      taxaLivreDeRisco: 4.5, premioRiscoMercado: 5, betaDesalavancado: 0.8, premioRiscoPais: 2.5,
      marketCap: 1000, dividaBruta: 500, aliquotaIR: 34, custoDividaPreTax: 10,
    };
    expect((await request(app).post('/api/wacc/calcular').send({ ...base, betaDesalavancado: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/wacc/calcular').send({ ...base, marketCap: -1 })).status).toBe(400);
    expect((await request(app).post('/api/wacc/calcular').send({ ...base, moeda: 'JPY' })).status).toBe(400);
    const ok = await request(app).post('/api/wacc/calcular').send({ ...base, marketCap: '1000' }); // string numérica aceita
    expect(ok.status).toBe(200);
    expect(ok.body.wacc).toBeTypeOf('number');
  });

  it('aposentadoria: gênero inválido, data malformada e INSS sem salário respondem 400', async () => {
    const base = { idadeAtual: 35, idadeAposentadoria: 65, perfilRisco: 'moderado', numeroSimulacoes: 50 };
    expect((await request(app).post('/api/retirement/calcular').send({ ...base, genero: 'X' })).status).toBe(400);
    expect((await request(app).post('/api/retirement/calcular').send({ ...base, dataReferencia: '01/02/2026' })).status).toBe(400);
    expect((await request(app).post('/api/retirement/calcular').send({ ...base, idadeAtual: 'trinta' })).status).toBe(400);
    expect((await request(app).post('/api/retirement/calcular').send(base)).status).toBe(200);

    expect((await request(app).post('/api/retirement/inss').send({ genero: 'M', idadeAposentadoria: 65, tempoContribuicaoAnos: 35 })).status).toBe(400);
    expect((await request(app).post('/api/retirement/inss').send({ genero: 'M', idadeAposentadoria: 65, tempoContribuicaoAnos: 35, salarioContribuicao: -5 })).status).toBe(400);
    const ok = await request(app).post('/api/retirement/inss').send({ genero: 'M', idadeAposentadoria: 65, tempoContribuicaoAnos: 35, salarioContribuicao: 5000 });
    expect(ok.status).toBe(200);
  });
});
