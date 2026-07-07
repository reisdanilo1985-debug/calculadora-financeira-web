import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

/** Nenhum campo numérico da resposta deve conter NaN/undefined serializados. */
function semNanOuUndefined(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toContain('NaN');
  expect(json).not.toContain('undefined');
}

describe('GET /api/tesouraria/premissas', () => {
  it('retorna snapshot 200 com escalares, curvas e proveniência (fallback resiliente)', async () => {
    const res = await request(app).get('/api/tesouraria/premissas');

    expect(res.status).toBe(200);
    expect(res.body.escalares).toBeDefined();
    expect(res.body.curvas).toBeDefined();
    expect(res.body.proveniencia).toBeDefined();
    expect(typeof res.body.dataRef).toBe('string');

    // Escalares essenciais presentes e numéricos (ANBIMA/Tesouro caem em seed, mas
    // o snapshot inteiro nunca falha).
    expect(typeof res.body.escalares.cdiAa).toBe('number');
    expect(typeof res.body.escalares.usdbrl).toBe('number');

    semNanOuUndefined(res.body);
  });
});

describe('POST /api/tesouraria/calc/:nome — calculador desconhecido', () => {
  it('retorna 404 com mensagem de erro', async () => {
    const res = await request(app).post('/api/tesouraria/calc/nao-existe').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/conversor', () => {
  it('happy path: retorna equivalências sem NaN', async () => {
    const res = await request(app)
      .post('/api/tesouraria/calc/conversor')
      .send({ iaa: 0.144, du: 252, dc: 365, m: 12 });

    expect(res.status).toBe(200);
    expect(typeof res.body.aoAno).toBe('number');
    expect(typeof res.body.aoMes).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (iaa ausente) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/conversor').send({ du: 252 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/cross-ccy', () => {
  it('happy path (moedaParaCdi): retorna % do CDI sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/cross-ccy').send({
      modo: 'moedaParaCdi',
      spreadEstrangeiroAa: 0.02,
      cdiAa: 0.144,
      cupomEstrangeiroAa: 0.055,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.pctCdiComp).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (cdiAa como string não-numérica) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/cross-ccy').send({
      spreadEstrangeiroAa: 0.02,
      cdiAa: 'abc',
      cupomEstrangeiroAa: 0.055,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/pre-cdi', () => {
  it('happy path (preParaCdi): retorna pctCdi sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/pre-cdi').send({
      modo: 'preParaCdi',
      preAa: 0.15,
      cdiAa: 0.144,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.pctCdi).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (cdiAa ausente) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/pre-cdi').send({
      modo: 'preParaCdi',
      preAa: 0.15,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/cdi-spread', () => {
  it('happy path (spreadParaPct): retorna totalComp/pctCdiComp sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/cdi-spread').send({
      modo: 'spreadParaPct',
      cdiAa: 0.144,
      spreadAa: 0.02,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.totalComp).toBe('number');
    expect(typeof res.body.pctCdiComp).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (cdiAa string não-numérica) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/cdi-spread').send({
      modo: 'spreadParaPct',
      cdiAa: 'abc',
      spreadAa: 0.02,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/ipca', () => {
  it('happy path: retorna nominalAa/pctCdi/veredito sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/ipca').send({
      realAa: 0.07,
      ipcaAa: 0.045,
      cdiAa: 0.144,
      preMercadoAa: 0.13,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.nominalAa).toBe('number');
    expect(typeof res.body.pctCdi).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (ipcaAa ausente) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/ipca').send({
      realAa: 0.07,
      cdiAa: 0.144,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/tir-vpl', () => {
  it('happy path: retorna tirAnual/tirMensal sem NaN', async () => {
    // Nota: BODY_SCHEMAS['tir-vpl'] só valida/repassa `fluxos` — taxaDesconto e
    // custoCapital não fazem parte do schema da rota, então vpl/veredito não
    // aparecem na resposta (mesmo que enviados no payload).
    const res = await request(app)
      .post('/api/tesouraria/calc/tir-vpl')
      .send({
        fluxos: [
          { date: '2024-01-01', amount: -1000 },
          { date: '2024-07-01', amount: 200 },
          { date: '2025-01-01', amount: 1000 },
        ],
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.tirAnual).toBe('number');
    expect(typeof res.body.tirMensal).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (amount como string não-numérica) retorna 400', async () => {
    const res = await request(app)
      .post('/api/tesouraria/calc/tir-vpl')
      .send({
        fluxos: [
          { date: '2024-01-01', amount: 'abc' },
          { date: '2025-01-01', amount: 1000 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/amortizacao', () => {
  it('happy path: retorna tabelas price/sac sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/amortizacao').send({
      principal: 100000,
      i: 0.012,
      n: 12,
    });

    expect(res.status).toBe(200);
    expect(res.body.price).toBeDefined();
    expect(res.body.sac).toBeDefined();
    expect(res.body.price.parcelas).toHaveLength(12);
    semNanOuUndefined(res.body);
  });

  it('payload inválido (n como string não-numérica) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/amortizacao').send({
      principal: 100000,
      i: 0.012,
      n: 'abc',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/duration', () => {
  it('happy path: retorna preco/duration/dv01/convexidade sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/duration').send({
      face: 1000,
      couponRateAnnual: 0.1,
      ytm: 0.13,
      m: 2,
      n: 6,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.preco).toBe('number');
    expect(typeof res.body.macaulayDuration).toBe('number');
    expect(typeof res.body.dv01).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (ytm ausente) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/duration').send({
      face: 1000,
      couponRateAnnual: 0.1,
      m: 2,
      n: 6,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/pu-titulos', () => {
  it('happy path (LTN): retorna pu sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/pu-titulos').send({
      tipo: 'LTN',
      vn: 1000,
      iaa: 0.12,
      du: 252,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.pu).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('happy path (NTNF): retorna pu/cupomPeriodico/fluxos sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/pu-titulos').send({
      tipo: 'NTNF',
      face: 1000,
      iaa: 0.12,
      couponRateAnnual: 0.1,
      m: 2,
      cuponsDu: [126, 252, 378, 504],
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.pu).toBe('number');
    expect(res.body.fluxos).toBeDefined();
    semNanOuUndefined(res.body);
  });

  it('payload inválido (iaa string não-numérica) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/pu-titulos').send({
      tipo: 'LTN',
      vn: 1000,
      iaa: 'abc',
      du: 252,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/swap', () => {
  it('happy path: retorna mtm/pvPre/pvCdi sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/swap').send({
      notional: 1000000,
      preContratada: 0.14,
      preMercadoAa: 0.135,
      duTotal: 252,
      duDecorridos: 126,
      fatorCdiAcumulado: 1.07,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.mtm).toBe('number');
    expect(typeof res.body.pvPre).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (notional ausente) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/swap').send({
      preContratada: 0.14,
      preMercadoAa: 0.135,
      duTotal: 252,
      duDecorridos: 126,
      fatorCdiAcumulado: 1.07,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/forward-ndf', () => {
  it('happy path (forward): retorna forward/pontos sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/forward-ndf').send({
      modo: 'forward',
      spot: 5.4,
      iBrAa: 0.144,
      du: 126,
      cupomUsdAa: 0.055,
      dc: 180,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.forward).toBe('number');
    expect(typeof res.body.pontos).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('happy path (ndf): retorna ajusteBrl sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/forward-ndf').send({
      modo: 'ndf',
      ptaxVencimento: 5.5,
      kContratado: 5.4,
      notionalUsd: 100000,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.ajusteBrl).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (spot string não-numérica no modo forward) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/forward-ndf').send({
      modo: 'forward',
      spot: 'abc',
      iBrAa: 0.144,
      du: 126,
      cupomUsdAa: 0.055,
      dc: 180,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/tesouraria/calc/us-money-market', () => {
  it('happy path (tbill): retorna discountYield/mmy/bey/eay sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/us-money-market').send({
      modo: 'tbill',
      face: 1000,
      preco: 980,
      dias: 90,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.discountYield).toBe('number');
    expect(typeof res.body.eay).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('happy path (sofr): retorna allInAa/eay sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/us-money-market').send({
      modo: 'sofr',
      sofrAa: 0.043,
      spreadAa: 0.015,
      dias: 90,
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.allInAa).toBe('number');
    expect(typeof res.body.eay).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('happy path (juros): retorna jurosAct360/jurosAct365 sem NaN', async () => {
    const res = await request(app).post('/api/tesouraria/calc/us-money-market').send({
      modo: 'juros',
      notional: 100000,
      taxa: 0.05,
      d0: '2024-01-01',
      d1: '2024-07-01',
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.jurosAct360).toBe('number');
    expect(typeof res.body.jurosAct365).toBe('number');
    semNanOuUndefined(res.body);
  });

  it('payload inválido (dias string não-numérica no modo tbill) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/us-money-market').send({
      modo: 'tbill',
      face: 1000,
      preco: 980,
      dias: 'abc',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('payload inválido (modo juros sem d0/d1) retorna 400', async () => {
    const res = await request(app).post('/api/tesouraria/calc/us-money-market').send({
      modo: 'juros',
      notional: 100000,
      taxa: 0.05,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
