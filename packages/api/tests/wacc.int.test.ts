import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

const payloadValido = {
  setor: 'bancos',
  pais: 'BRA',
  moeda: 'BRL' as const,
  taxaLivreDeRisco: 0.045,
  premioRiscoMercado: 0.05,
  betaDesalavancado: 0.7,
  premioRiscoPais: 0.02,
  marketCap: 1000000,
  dividaBruta: 300000,
  aliquotaIR: 34,
  custoDividaPreTax: 0.09,
};

describe('GET /api/wacc/setores', () => {
  it('retorna 200 com um array não vazio de setores', async () => {
    const res = await request(app).get('/api/wacc/setores');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('GET /api/wacc/paises', () => {
  it('retorna 200 com um array não vazio de países', async () => {
    const res = await request(app).get('/api/wacc/paises');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('GET /api/wacc/parametros-mercado', () => {
  it('retorna 200 com rf e erp numéricos', async () => {
    const res = await request(app).get('/api/wacc/parametros-mercado');
    expect(res.status).toBe(200);
    expect(typeof res.body.rf).toBe('number');
    expect(typeof res.body.erp).toBe('number');
    expect(res.body.fonte).toBeDefined();
    expect(res.body.observacao).toBeDefined();
  });
});

describe('GET /api/wacc/setor/:id', () => {
  it('retorna 200 para um setor existente (bancos)', async () => {
    const res = await request(app).get('/api/wacc/setor/bancos');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('bancos');
    expect(typeof res.body.betaDesalavancado).toBe('number');
  });

  it('retorna 404 com mensagem para setor inexistente', async () => {
    const res = await request(app).get('/api/wacc/setor/id-que-nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Setor não encontrado');
  });
});

describe('GET /api/wacc/pais/:codigo', () => {
  it('retorna 200 para um país existente (BRA)', async () => {
    const res = await request(app).get('/api/wacc/pais/BRA');
    expect(res.status).toBe(200);
    expect(res.body.codigo).toBe('BRA');
    expect(typeof res.body.crp).toBe('number');
  });

  it('aceita código em minúsculo (normaliza para maiúsculo)', async () => {
    const res = await request(app).get('/api/wacc/pais/bra');
    expect(res.status).toBe(200);
    expect(res.body.codigo).toBe('BRA');
  });

  it('retorna 404 com mensagem para país inexistente', async () => {
    const res = await request(app).get('/api/wacc/pais/ZZZ');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('País não encontrado');
  });
});

describe('POST /api/wacc/calcular', () => {
  it('retorna 200 com wacc numérico e sem NaN para payload válido', async () => {
    const res = await request(app).post('/api/wacc/calcular').send(payloadValido);
    expect(res.status).toBe(200);
    expect(typeof res.body.wacc).toBe('number');
    expect(Number.isNaN(res.body.wacc)).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('NaN');
  });

  it('retorna 400 quando falta um campo obrigatório (betaDesalavancado)', async () => {
    const { betaDesalavancado, ...payloadIncompleto } = payloadValido;
    const res = await request(app).post('/api/wacc/calcular').send(payloadIncompleto);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('retorna 400 quando marketCap e dividaBruta são ambos zero', async () => {
    const res = await request(app)
      .post('/api/wacc/calcular')
      .send({ ...payloadValido, marketCap: 0, dividaBruta: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('retorna 400 quando aliquotaIR está fora do intervalo [0, 100]', async () => {
    const res = await request(app)
      .post('/api/wacc/calcular')
      .send({ ...payloadValido, aliquotaIR: 150 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('não retorna NaN serializado em nenhuma resposta 200', async () => {
    const resSetores = await request(app).get('/api/wacc/setores');
    const resPaises = await request(app).get('/api/wacc/paises');
    const resCalcular = await request(app).post('/api/wacc/calcular').send(payloadValido);

    expect(JSON.stringify(resSetores.body)).not.toContain('NaN');
    expect(JSON.stringify(resPaises.body)).not.toContain('NaN');
    expect(JSON.stringify(resCalcular.body)).not.toContain('NaN');
  });
});
