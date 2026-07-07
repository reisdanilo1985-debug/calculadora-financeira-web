import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

/** Nenhum campo numérico da resposta deve conter NaN/undefined serializados. */
function semNaN(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toContain('NaN');
}

/** Payload completo e válido para POST /api/retirement/calcular. */
const payloadCalcularValido = {
  idadeAtual: 30,
  idadeAposentadoria: 65,
  expectativaVida: 90,
  genero: 'M',
  patrimonioTributavel: 50000,
  saldoPGBL: 10000,
  saldoVGBL: 0,
  rendaAluguel: 0,
  aporteMensal: 1000,
  aportePGBL: 0,
  aporteVGBL: 0,
  incluirINSS: true,
  salarioContribuicao: 5000,
  tempoContribuicaoAnos: 5,
  gastoMensalDesejado: 6000,
  incluirInflacaoMedica: false,
  gastoMensalSaude: 0,
  perfilRisco: 'moderado',
  ipcaMeta: 3.5,
  tabelaPGBL: 'regressiva',
  numeroSimulacoes: 100,
};

describe('GET /api/retirement/perfis', () => {
  it('retorna 200 com array contendo os perfis conservador, moderado e agressivo', async () => {
    const res = await request(app).get('/api/retirement/perfis');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const ids = res.body.map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['conservador', 'moderado', 'agressivo']));

    semNaN(res.body);
  });
});

describe('POST /api/retirement/calcular', () => {
  it('payload válido retorna 200 com resultado sem NaN', async () => {
    const res = await request(app)
      .post('/api/retirement/calcular')
      .send(payloadCalcularValido);

    expect(res.status).toBe(200);
    expect(typeof res.body.probabilidadeSucesso).toBe('number');
    expect(Array.isArray(res.body.projecaoAnualP50)).toBe(true);
    expect(Array.isArray(res.body.memorial)).toBe(true);
    semNaN(res.body);
  });

  it('sem idadeAtual retorna 400', async () => {
    const { idadeAtual, ...resto } = payloadCalcularValido;
    const res = await request(app).post('/api/retirement/calcular').send(resto);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('idadeAposentadoria menor ou igual a idadeAtual retorna 400', async () => {
    const res = await request(app)
      .post('/api/retirement/calcular')
      .send({ ...payloadCalcularValido, idadeAtual: 40, idadeAposentadoria: 30 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('perfilRisco inexistente retorna 400', async () => {
    const res = await request(app)
      .post('/api/retirement/calcular')
      .send({ ...payloadCalcularValido, perfilRisco: 'inexistente' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('numeroSimulacoes muito alto é capado internamente (5000) e responde dentro do timeout', async () => {
    const res = await request(app)
      .post('/api/retirement/calcular')
      .send({ ...payloadCalcularValido, numeroSimulacoes: 999999 });

    expect(res.status).toBe(200);
    semNaN(res.body);
  }, 15000);
});

describe('POST /api/retirement/inss', () => {
  it('payload válido retorna 200 com resultado sem NaN', async () => {
    const res = await request(app)
      .post('/api/retirement/inss')
      .send({
        genero: 'M',
        idadeAposentadoria: 65,
        tempoContribuicaoAnos: 35,
        salarioContribuicao: 5000,
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.beneficio).toBe('number');
    expect(typeof res.body.regra).toBe('string');
    semNaN(res.body);
  });

  it('faltando salarioContribuicao retorna 400', async () => {
    const res = await request(app)
      .post('/api/retirement/inss')
      .send({ genero: 'M', idadeAposentadoria: 65, tempoContribuicaoAnos: 35 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
