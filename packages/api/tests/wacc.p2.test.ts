/**
 * Testes P2 da API de WACC — auditoria de 12/09/2026 (casos api-F3-E-wacc-apos.cjs).
 *
 * E03:   Rf/ERP de referência por moeda e regime, com data-base vigente (January 2026) e itens de
 *        /setores e /paises com moeda/data-base.
 * UI-02: /calcular devolve a sensibilidade calculada pelo motor, em p.p.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('E03 — GET /api/wacc/parametros-mercado', () => {
  it('V-WACC-5a: padrão BRL nominal — Rf em BRL (diferencial de inflação declarado), não US T-Bond puro', async () => {
    const res = await request(app).get('/api/wacc/parametros-mercado');
    expect(res.status).toBe(200);
    expect(res.body.moeda).toBe('BRL');
    expect(res.body.regime).toBe('nominal');
    expect(res.body.metodoRf).toBe('diferencial-inflacao');
    // Rf USD 3,95% × (1,03 / 1,02) → 4,97%
    expect(res.body.rf).toBe(4.97);
    expect(res.body.erp).toBe(4.23);
    expect(res.body.observacao).not.toMatch(/US T-Bond/);
    expect(res.body.observacao).toMatch(/Resolução CMN nº 5\.141\/2024/);
  });

  it('V-WACC-5b: data-base vigente declarada ("January 2026") e versão da tabela', async () => {
    const res = await request(app).get('/api/wacc/parametros-mercado');
    const m = String(res.body.fonte).match(/(Janeiro|January)\s+(\d{4})/);
    expect(m && `January ${m[2]}`).toBe('January 2026');
    expect(res.body.dataBase).toBe('January 2026');
    expect(res.body.versao.id).toBe('damodaran-2026-01');
  });

  it('USD nominal = Rf de Damodaran (T-Bond 4,18% − spread 0,23%); regime real pela inflação da moeda', async () => {
    const usd = await request(app).get('/api/wacc/parametros-mercado?moeda=USD');
    expect(usd.body.rf).toBe(3.95);
    expect(usd.body.metodoRf).toBe('rf-usd-damodaran');
    const real = await request(app).get('/api/wacc/parametros-mercado?moeda=usd&regime=real');
    expect(real.body.rf).toBe(1.91); // 1,0395 / 1,02 − 1
    const brlReal = await request(app).get('/api/wacc/parametros-mercado?moeda=BRL&regime=real');
    expect(brlReal.body.rf).toBe(1.91); // mesma taxa real por construção do diferencial de inflação
  });

  it('porMoeda traz BRL/USD/EUR × nominal/real com data-base', async () => {
    const res = await request(app).get('/api/wacc/parametros-mercado');
    for (const moeda of ['BRL', 'USD', 'EUR']) {
      for (const regime of ['nominal', 'real']) {
        const p = res.body.porMoeda[moeda][regime];
        expect(p.moeda).toBe(moeda);
        expect(p.regime).toBe(regime);
        expect(typeof p.rf).toBe('number');
        expect(p.dataBase).toBe('January 2026');
      }
    }
    expect(res.body.porMoeda.EUR.nominal.rf).toBe(3.95); // metas iguais (2% USD e 2% EUR)
  });

  it('moeda ou regime inválidos → 400', async () => {
    expect((await request(app).get('/api/wacc/parametros-mercado?moeda=JPY')).status).toBe(400);
    expect((await request(app).get('/api/wacc/parametros-mercado?regime=misto')).status).toBe(400);
  });
});

describe('E03 — itens de /paises e /setores com moeda e data-base', () => {
  it('V-WACC-5c: Brasil com CRP de January 2026 (3,24%), moeda e data-base', async () => {
    const res = await request(app).get('/api/wacc/paises');
    const bra = res.body.find((p: any) => p.codigo === 'BRA');
    expect(bra.crp).toBe(3.24);
    expect(bra.ratingMoody).toBe('Ba1');
    expect(bra.moeda).toBe('USD');
    expect(bra.dataBase).toBe('January 2026');
    expect(res.body.every((p: any) => 'moeda' in p && 'dataBase' in p && p.fonte)).toBe(true);
  });

  it('V-WACC-5d: 28 setores, todos com data-base e fonte', async () => {
    const res = await request(app).get('/api/wacc/setores');
    expect(res.body).toHaveLength(28);
    expect(res.body.every((s: any) => s.dataBase === 'January 2026' && s.fonte && s.regiao === 'Emerging Markets')).toBe(true);
  });
});

describe('UI-02 — POST /api/wacc/calcular devolve a sensibilidade em p.p.', () => {
  it('cenário E 600 / D 400 / IR 34 / Rf 4,2 / ERP 5,8 / βU 0,87 / CRP 3,97 / Kd 12,5', async () => {
    const res = await request(app).post('/api/wacc/calcular').send({
      setor: 'aeroespacial', pais: 'BRA', moeda: 'BRL',
      taxaLivreDeRisco: 4.2, premioRiscoMercado: 5.8, betaDesalavancado: 0.87, premioRiscoPais: 3.97,
      premioTamanho: 0, marketCap: 600, dividaBruta: 400, aliquotaIR: 34, custoDividaPreTax: 12.5,
    });
    expect(res.status).toBe(200);
    expect(Math.round(res.body.wacc * 100) / 100).toBe(12.56);
    const d = Object.fromEntries(res.body.sensibilidade.map((s: any) => [s.id, Math.round(s.deltaWaccPP * 100) / 100]));
    expect(d).toEqual({ rf: 0.6, beta: 0.44, erp: 0.75, kd: 0.26, ir: -0.07, de: -0.04 });
    const ir = res.body.sensibilidade.find((s: any) => s.id === 'ir');
    expect(Math.round(ir.decomposicao.viaCustoDivida * 100) / 100).toBe(-0.05);
    expect(Math.round(ir.decomposicao.viaBeta * 100) / 100).toBe(-0.02);
  });
});
