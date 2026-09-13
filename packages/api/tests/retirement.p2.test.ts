/**
 * Testes P2 da API de Aposentadoria — auditoria de 12/09/2026 (casos api-F3-E-wacc-apos.cjs).
 *
 * C09: INSS com idade mínima (EC 103/2019 art. 19) — /inss e simulação.
 * E04: teto/salário mínimo 2026; ipcaMeta e tabelaPGBL com efeito declarado; gênero sem tábua.
 * E05: Monte Carlo reprodutível (semente), mediana por ano, esgotamento sobre todas as simulações,
 *      renda sustentável separada da necessária.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

const RBASE = {
  idadeAtual: 64, idadeAposentadoria: 65, expectativaVida: 90, genero: 'M',
  patrimonioTributavel: 1000000, saldoPGBL: 0, saldoVGBL: 0, rendaAluguel: 0,
  aporteMensal: 0, aportePGBL: 0, aporteVGBL: 0, incluirINSS: false, salarioContribuicao: 0,
  tempoContribuicaoAnos: 0, gastoMensalDesejado: 0, incluirInflacaoMedica: false, gastoMensalSaude: 0,
  perfilRisco: 'moderado', ipcaMeta: 3.5, tabelaPGBL: 'regressiva', numeroSimulacoes: 5000,
};
const R = (o: Record<string, unknown> = {}) => ({ ...RBASE, ...o });
const calcular = (corpo: Record<string, unknown>) => request(app).post('/api/retirement/calcular').send(corpo);
const inss = (genero: string, idade: number, anos: number, media: number) =>
  request(app).post('/api/retirement/inss').send({ genero, idadeAposentadoria: idade, tempoContribuicaoAnos: anos, salarioContribuicao: media });

/** Saídas determinísticas, como `determ` do caso da auditoria. */
const determ = (b: any) => JSON.stringify({
  p: b.patrimonioAcumuladoAposentadoria, tr: b.taxaRetiradaInicial, inss: b.beneficioINSSMensal,
  renda: b.rendaPatrimonioMensal, tot: b.rendaTotalMensal,
  proj: b.projecaoAnualP50.map((x: any) => [x.idade, x.patrimonioInicio, x.retornoNominal, x.gastoAno, x.patrimonioFim]),
});

const MEDIANA_FINAL = 4419801.467369564; // ref/F3-E.json ret-mc-mediana-final
const TOL_MC = 0.0255;

describe('C09 — POST /api/retirement/inss e simulação', () => {
  it('V-RET-2a: H 40a / 20 anos → 0 (não elegível)', async () => {
    const res = await inss('M', 40, 20, 5000);
    expect(res.status).toBe(200);
    expect(res.body.beneficio).toBe(0);
    expect(res.body.elegivel).toBe(false);
  });

  it('V-RET-2b: 30→40a, INSS ligado, 10+10 anos → benefício 0 na linha dos 40 anos', async () => {
    const res = await calcular(R({
      idadeAtual: 30, idadeAposentadoria: 40, patrimonioTributavel: 500000, incluirINSS: true,
      salarioContribuicao: 5000, tempoContribuicaoAnos: 10, gastoMensalDesejado: 8000, numeroSimulacoes: 500,
    }));
    expect(res.status).toBe(200);
    expect({
      idade: res.body.projecaoAnualP50[0].idade,
      beneficioINSSAnual: res.body.projecaoAnualP50[0].beneficioINSS,
      beneficioINSSMensal: res.body.beneficioINSSMensal,
    }).toEqual({ idade: 40, beneficioINSSAnual: 0, beneficioINSSMensal: 0 });
    expect(res.body.idadeInicioINSS).toBe(65);
  });
});

describe('E04 — vigência 2026 e campos com efeito', () => {
  it('V-RET-3a: H 65a / 40 anos / média 20.000 → R$ 8.475,55', async () => {
    expect((await inss('M', 65, 40, 20000)).body.beneficio).toBeCloseTo(8475.55, 2);
  });

  it('V-RET-3b: H 65a / 20 anos / média 1.621 → R$ 1.621,00', async () => {
    const res = await inss('M', 65, 20, 1621);
    expect(res.body.beneficio).toBeCloseTo(1621, 2);
    expect(res.body.parametrosRGPS.fonte).toMatch(/Portaria Interministerial MPS\/MF nº 13/);
  });

  it('V-RET-3c: ipcaMeta 3,5 vs 10 — saídas reais iguais por construção; conversão nominal muda', async () => {
    const a = (await calcular(R({ gastoMensalDesejado: 6000, numeroSimulacoes: 500, ipcaMeta: 3.5, idadeAtual: 55 }))).body;
    const b = (await calcular(R({ gastoMensalDesejado: 6000, numeroSimulacoes: 500, ipcaMeta: 10, idadeAtual: 55 }))).body;
    expect(determ(a)).toBe(determ(b)); // modelo em termos reais (declarado)
    expect(a.patrimonioAcumuladoAposentadoriaNominal).not.toBe(b.patrimonioAcumuladoAposentadoriaNominal);
    expect(b.ipcaMeta).toBe(10);
  });

  it('V-RET-3d: tabelaPGBL regressiva vs progressiva (PGBL 500 mil) → saídas mudam', async () => {
    const base = { patrimonioTributavel: 500000, saldoPGBL: 500000, gastoMensalDesejado: 6000, numeroSimulacoes: 500 };
    const a = (await calcular(R({ ...base, tabelaPGBL: 'regressiva' }))).body;
    const b = (await calcular(R({ ...base, tabelaPGBL: 'progressiva' }))).body;
    expect(determ(a)).not.toBe(determ(b));
  });

  it('tabelaPGBL inválida → 400', async () => {
    expect((await calcular(R({ tabelaPGBL: 'flat', numeroSimulacoes: 50 }))).status).toBe(400);
  });
});

describe('E05 — Monte Carlo reprodutível e estatísticas coerentes', () => {
  it('V-RET-4a: duas chamadas idênticas → mesmo saldoFinalP50 e probabilidade', async () => {
    const a = (await calcular(R({ gastoMensalDesejado: 5000 }))).body;
    const b = (await calcular(R({ gastoMensalDesejado: 5000 }))).body;
    expect(a.saldoFinalP50).toBe(b.saldoFinalP50);
    expect(a.probabilidadeSucesso).toBe(b.probabilidadeSucesso);
    expect(typeof a.semente).toBe('number');
    expect(a.versaoModelo).toMatch(/aposentadoria-mc/);
  });

  it('semente informada é aplicada e validada', async () => {
    const a = (await calcular(R({ gastoMensalDesejado: 5000, numeroSimulacoes: 500, semente: 42 }))).body;
    const b = (await calcular(R({ gastoMensalDesejado: 5000, numeroSimulacoes: 500, semente: 42 }))).body;
    expect(a.semente).toBe(42);
    expect(a.saldoFinalP50).toBe(b.saldoFinalP50);
    expect((await calcular(R({ numeroSimulacoes: 50, semente: 'abc' }))).status).toBe(400);
    expect((await calcular(R({ numeroSimulacoes: 50, semente: 1.5 }))).status).toBe(400);
  });

  it('V-RET-4b: P5 ≤ P50 ≤ P95', async () => {
    const b = (await calcular(R({ gastoMensalDesejado: 5000 }))).body;
    expect(b.saldoFinalP5 <= b.saldoFinalP50 && b.saldoFinalP50 <= b.saldoFinalP95).toBe(true);
  });

  it('V-RET-4c/4d: tabela P50 final e saldoFinalP50 vs mediana lognormal (IC99%)', async () => {
    const b = (await calcular(R())).body;
    const fim = b.projecaoAnualP50[b.projecaoAnualP50.length - 1].patrimonioFim;
    expect(Math.abs(fim / MEDIANA_FINAL - 1)).toBeLessThanOrEqual(TOL_MC);
    expect(Math.abs(b.saldoFinalP50 / MEDIANA_FINAL - 1)).toBeLessThanOrEqual(TOL_MC);
  });

  it('V-RET-4e: gasto 4.000 com sucesso ≥ 50% → anoEsgotamentoP50 null', async () => {
    const b = (await calcular(R({ gastoMensalDesejado: 4000 }))).body;
    expect({ sucessoMaior50: b.probabilidadeSucesso >= 50, anoEsgotamentoP50: b.anoEsgotamentoP50 })
      .toEqual({ sucessoMaior50: true, anoEsgotamentoP50: null });
  });

  it('V-RET-4f: patrimônio 0 e gasto 8.000 → renda do patrimônio 0, renda total 0, sucesso 0', async () => {
    const b = (await calcular(R({ patrimonioTributavel: 0, gastoMensalDesejado: 8000, numeroSimulacoes: 500 }))).body;
    expect({ rendaPatrimonioMensal: b.rendaPatrimonioMensal, rendaTotalMensal: b.rendaTotalMensal, probabilidadeSucesso: b.probabilidadeSucesso })
      .toEqual({ rendaPatrimonioMensal: 0, rendaTotalMensal: 0, probabilidadeSucesso: 0 });
    expect(b.rendaNecessariaPatrimonioMensal).toBeGreaterThan(0);
  });

  it('numeroSimulacoes acima de 5.000 continua capado (memorial "÷ 5000 ×")', async () => {
    const b = (await calcular(R({ gastoMensalDesejado: 5000, numeroSimulacoes: 1e9 }))).body;
    expect(JSON.stringify(b.memorial)).toMatch(/÷ 5000 ×/);
    expect(JSON.stringify(b)).not.toContain('NaN');
  });
});
