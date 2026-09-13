/**
 * Testes do benefício INSS — defeito C08 da auditoria de 12/09/2026.
 *
 * C08: o benefício partia de 70% e limitava o coeficiente a 100%.
 * Regra correta (EC 103/2019 art. 26):
 *   - média limitada ao teto (§1º);
 *   - coeficiente = 60% + 2 p.p. por ano acima de 20 anos (H, §2º) / 15 anos (M, §5º),
 *     sem limite de 100%;
 *   - benefício limitado ao teto e com piso de 1 salário mínimo.
 *
 * Oráculo: auditoria-completa-2026-09-12/ref/F3-E.py (valores em ref/F3-E.json).
 * Casos: casos/F3-E-core.cjs (V-RET-1*-core) e casos/api-F3-E-wacc-apos.cjs (V-RET-1a..1f).
 *
 * Os testes de teto/piso são relacionais (não fixam R$ do teto/salário mínimo),
 * porque a atualização desses valores é outro achado (E04).
 */

import { describe, it, expect } from 'vitest';
import {
  calcularBeneficioINSS,
  simularAposentadoria,
  RetirementInput,
} from '../src/engines/RetirementEngine';

const TOL = 0.01;
const beneficio = (g: 'M' | 'F', idade: number, anos: number, media: number) =>
  calcularBeneficioINSS(g, idade, anos, media).beneficio;

describe('calcularBeneficioINSS — EC 103/2019 art. 26 (C08)', () => {
  const casos: Array<[string, 'M' | 'F', number, number, number, number]> = [
    ['V-RET-1a', 'M', 65, 20, 5000, 3000], // 60%
    ['V-RET-1b', 'M', 65, 30, 5000, 4000], // 80%
    ['V-RET-1c', 'F', 62, 15, 5000, 3000], // 60%
    ['V-RET-1d', 'F', 62, 25, 5000, 4000], // 80%
    ['V-RET-1e', 'M', 65, 40, 5000, 5000], // 100%
    ['V-RET-1f', 'M', 65, 45, 5000, 5500], // 110% — sem limite de 100%
  ];

  for (const [id, genero, idade, anos, media, esperado] of casos) {
    it(`${id}: ${genero === 'M' ? 'H' : 'M'} ${idade}a / ${anos} anos / média ${media} → ${esperado}`, () => {
      expect(Math.abs(beneficio(genero, idade, anos, media) - esperado)).toBeLessThan(TOL);
    });
  }

  it('sem o bloco 70/60/50%: H 65a / 20 anos / média 3.000 → 1.800 (60%)', () => {
    expect(Math.abs(beneficio('M', 65, 20, 3000) - 1800)).toBeLessThan(TOL);
  });

  it('mulher com 20 anos (5 acima de 15) → 70%; homem com 20 anos → 60%', () => {
    expect(Math.abs(beneficio('F', 62, 20, 4000) - 2800)).toBeLessThan(TOL);
    expect(Math.abs(beneficio('M', 65, 20, 4000) - 2400)).toBeLessThan(TOL);
  });

  it('média limitada ao teto ANTES do coeficiente (§1º): 80% × teto', () => {
    const teto = beneficio('M', 65, 40, 100000);       // 100% × teto
    const com30anos = beneficio('M', 65, 30, 100000);  // 80% × teto
    expect(teto).toBeLessThan(100000);
    expect(Math.abs(com30anos - 0.8 * teto)).toBeLessThan(TOL);
  });

  it('benefício limitado ao teto mesmo com coeficiente > 100%', () => {
    const teto = beneficio('M', 65, 40, 100000);
    expect(Math.abs(beneficio('M', 65, 45, 100000) - teto)).toBeLessThan(TOL);
  });

  it('piso de 1 salário mínimo', () => {
    const piso = beneficio('M', 65, 20, 500);  // 60% × 500 = 300 < SM
    expect(piso).toBeGreaterThan(300);
    expect(Math.abs(beneficio('M', 65, 20, 1000) - piso)).toBeLessThan(TOL);
  });

  it('tempo de contribuição abaixo do mínimo → 0 (regra de elegibilidade inalterada)', () => {
    expect(beneficio('M', 65, 19, 5000)).toBe(0);
    expect(beneficio('F', 62, 14, 5000)).toBe(0);
  });
});

describe('simularAposentadoria — benefício INSS usa a regra do art. 26', () => {
  it('H 65→65a, 30 anos de contribuição, média 5.000 → beneficioINSSMensal = 4.000', () => {
    const input: RetirementInput = {
      idadeAtual: 65,
      idadeAposentadoria: 65,
      expectativaVida: 90,
      genero: 'M',
      patrimonioTributavel: 1000000,
      saldoPGBL: 0,
      saldoVGBL: 0,
      rendaAluguel: 0,
      aporteMensal: 0,
      aportePGBL: 0,
      aporteVGBL: 0,
      incluirINSS: true,
      salarioContribuicao: 5000,
      tempoContribuicaoAnos: 30,
      gastoMensalDesejado: 0,
      incluirInflacaoMedica: false,
      gastoMensalSaude: 0,
      perfilRisco: 'moderado',
      ipcaMeta: 3.5,
      tabelaPGBL: 'regressiva',
      numeroSimulacoes: 20,
    };
    const r = simularAposentadoria(input);
    expect(Math.abs(r.beneficioINSSMensal - 4000)).toBeLessThan(TOL);
    expect(r.projecaoAnualP50[0].beneficioINSS).toBeCloseTo(48000, 6);
  });
});
