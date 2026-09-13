/**
 * Testes P2 da aba Aposentadoria — auditoria de 12/09/2026.
 *
 * C09: benefício INSS sem idade mínima (EC 103/2019 art. 19).
 * E04: teto/salário mínimo da vigência 2026; ipcaMeta, tabelaPGBL e "Tábua IBGE 2024" sem efeito.
 * E05: Monte Carlo — tabela "P50" determinística, esgotamento condicional, renda do patrimônio = necessidade,
 *      sem semente.
 *
 * Oráculo: auditoria-completa-2026-09-12/ref/F3-E.py (valores em ref/F3-E.json).
 * Casos: casos/F3-E-core.cjs e casos/api-F3-E-wacc-apos.cjs (V-RET-2*, V-RET-3*, V-RET-4*).
 */

import { describe, it, expect } from 'vitest';
import {
  calcularBeneficioINSS,
  simularAposentadoria,
  obterParametrosRGPS,
  aliquotaRegressivaPrevidencia,
  irpfMensalProgressivo,
  RetirementInput,
  VERSAO_MODELO_APOSENTADORIA,
  SEMENTE_PADRAO_APOSENTADORIA,
} from '../src/engines/RetirementEngine';

const TOL = 0.01;

// Cenário base da auditoria (RBASE em casos/F3-E-core.cjs)
const RBASE: RetirementInput = {
  idadeAtual: 64,
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
  incluirINSS: false,
  salarioContribuicao: 0,
  tempoContribuicaoAnos: 0,
  gastoMensalDesejado: 0,
  incluirInflacaoMedica: false,
  gastoMensalSaude: 0,
  perfilRisco: 'moderado',
  ipcaMeta: 3.5,
  tabelaPGBL: 'regressiva',
  numeroSimulacoes: 5000,
};
const R = (o: Partial<RetirementInput> = {}): RetirementInput => ({ ...RBASE, ...o });

// ref/F3-E.json — mediana lognormal ano a ano (p_apos · exp(k·mu), k = 1..25) e tolerância MC IC99%
const MEDIANA_FINAL = 4419801.467369564;
const MEDIANA_POR_ANO = [
  1127383.6546870873, 1193421.5069066796, 1263327.6056700689, 1337328.538166582, 1415664.1642024235,
  1498588.3936601589, 1586370.0094988183, 1679293.5389622226, 1777660.1758193832, 1881788.756626241,
  1992016.7941731093, 2108701.571467545, 2232221.2997985776, 2362976.3446359443, 2501390.523337845,
  2647912.4788734894, 2803017.1340130884, 2967207.23069878, 3141014.959586049, 3325003.6850374965,
  3519769.7711601933, 3725944.514805363, 3944196.1917958464, 4175232.2230137964, 4419801.467369564,
];
const TOL_MC = 0.0255;

/** Saída sem o campo `ano` (depende da data corrente), como `semAno` dos casos da auditoria. */
const semAno = (r: ReturnType<typeof simularAposentadoria>) =>
  JSON.stringify({ ...r, projecaoAnualP50: r.projecaoAnualP50.map(({ ano, ...x }) => x) });

describe('C09 — elegibilidade do INSS separada do valor (EC 103/2019 art. 19)', () => {
  it('V-RET-2a: H 40a / 20 anos / média 5.000 → 0 (idade abaixo de 65)', () => {
    const r = calcularBeneficioINSS('M', 40, 20, 5000);
    expect(r.beneficio).toBe(0);
    expect(r.elegivel).toBe(false);
    expect(r.idadeMinima).toBe(65);
  });

  it('mulher: 61a → 0; 62a com 15 anos → 60% da média', () => {
    expect(calcularBeneficioINSS('F', 61, 30, 5000).beneficio).toBe(0);
    expect(Math.abs(calcularBeneficioINSS('F', 62, 15, 5000).beneficio - 3000)).toBeLessThan(TOL);
  });

  it('idade mínima atingida mas tempo abaixo do mínimo → 0', () => {
    expect(calcularBeneficioINSS('M', 70, 19, 5000).beneficio).toBe(0);
  });

  it('V-RET-2b: simulação 30→40a, INSS ligado, 10+10 anos → benefício 0 na linha dos 40 anos; entra aos 65', () => {
    const r = simularAposentadoria(R({
      idadeAtual: 30, idadeAposentadoria: 40, patrimonioTributavel: 500000, incluirINSS: true,
      salarioContribuicao: 5000, tempoContribuicaoAnos: 10, gastoMensalDesejado: 8000, numeroSimulacoes: 500,
    }));
    const linha40 = r.projecaoAnualP50[0];
    expect(linha40.idade).toBe(40);
    expect(linha40.beneficioINSS).toBe(0);
    expect(r.beneficioINSSMensal).toBe(0);
    expect(r.idadeInicioINSS).toBe(65);
    expect(Math.abs(r.beneficioINSSProjetadoMensal - 3000)).toBeLessThan(TOL); // 60% × 5.000 (20 anos)
    const linha64 = r.projecaoAnualP50.find(x => x.idade === 64)!;
    const linha65 = r.projecaoAnualP50.find(x => x.idade === 65)!;
    expect(linha64.beneficioINSS).toBe(0);
    expect(linha65.beneficioINSS).toBeCloseTo(36000, 6);
    expect(r.rendaTotalMensal).toBeCloseTo(r.rendaPatrimonioMensal, 9); // sem INSS/aluguel na aposentadoria
    expect(r.alertas.some(a => /só entra aos 65 anos/.test(a.mensagem))).toBe(true);
  });

  it('tempo insuficiente na aposentadoria → idadeInicioINSS null e benefício 0 em toda a projeção', () => {
    const r = simularAposentadoria(R({
      idadeAtual: 60, idadeAposentadoria: 65, incluirINSS: true, salarioContribuicao: 5000,
      tempoContribuicaoAnos: 5, gastoMensalDesejado: 3000, numeroSimulacoes: 200,
    }));
    expect(r.idadeInicioINSS).toBeNull();
    expect(r.projecaoAnualP50.every(x => x.beneficioINSS === 0)).toBe(true);
  });
});

describe('E04 — teto e salário mínimo por vigência (Portaria Interministerial MPS/MF nº 13/2026)', () => {
  it('V-RET-3a: H 65a / 40 anos / média 20.000 → teto 2026 R$ 8.475,55', () => {
    expect(Math.abs(calcularBeneficioINSS('M', 65, 40, 20000).beneficio - 8475.55)).toBeLessThan(TOL);
  });

  it('V-RET-3b: H 65a / 20 anos / média 1.621 → piso R$ 1.621,00', () => {
    expect(Math.abs(calcularBeneficioINSS('M', 65, 20, 1621).beneficio - 1621)).toBeLessThan(TOL);
  });

  it('vigência 2026 com fonte declarada; data posterior sem portaria nova gera alerta', () => {
    const v2026 = obterParametrosRGPS('2026-09-13');
    expect(v2026.parametros).toMatchObject({ vigenciaInicio: '2026-01-01', teto: 8475.55, salarioMinimo: 1621 });
    expect(v2026.parametros.fonte).toMatch(/Portaria Interministerial MPS\/MF nº 13, de 09\/01\/2026/);
    expect(v2026.alerta).toBeUndefined();
    expect(obterParametrosRGPS('2027-02-01').alerta).toMatch(/2027/);
    expect(obterParametrosRGPS('2025-06-30').alerta).toMatch(/Não há teto/);
  });

  it('simulação expõe os parâmetros do RGPS usados', () => {
    const r = simularAposentadoria(R({ numeroSimulacoes: 50, dataReferencia: '2026-09-13' }));
    expect(r.parametrosRGPS.teto).toBe(8475.55);
    expect(r.parametrosRGPS.salarioMinimo).toBe(1621);
  });
});

describe('E04 — ipcaMeta: modelo em termos reais, conversão nominal declarada', () => {
  const a = simularAposentadoria(R({ gastoMensalDesejado: 6000, ipcaMeta: 3.5, idadeAtual: 55 }));
  const b = simularAposentadoria(R({ gastoMensalDesejado: 6000, ipcaMeta: 10, idadeAtual: 55 }));

  it('V-RET-3c: ipcaMeta 3,5 vs 10 → saída muda (afeta)', () => {
    expect(semAno(a)).not.toBe(semAno(b));
  });

  it('resultados reais (probabilidade, projeção) não dependem do IPCA; o nominal = real × (1+IPCA)^n', () => {
    expect(a.probabilidadeSucesso).toBe(b.probabilidadeSucesso);
    expect(a.saldoFinalP50).toBe(b.saldoFinalP50);
    expect(a.patrimonioAcumuladoAposentadoriaNominal / a.patrimonioAcumuladoAposentadoria).toBeCloseTo(Math.pow(1.035, 10), 9);
    expect(b.patrimonioAcumuladoAposentadoriaNominal / b.patrimonioAcumuladoAposentadoria).toBeCloseTo(Math.pow(1.10, 10), 9);
    expect(b.ipcaMeta).toBe(10);
  });
});

describe('E04 — tabelaPGBL: IR da previdência privada na retirada', () => {
  it('tabela regressiva — Lei 11.053/2004 art. 1º', () => {
    expect(aliquotaRegressivaPrevidencia(2)).toBe(0.35);
    expect(aliquotaRegressivaPrevidencia(2.5)).toBe(0.30);
    expect(aliquotaRegressivaPrevidencia(6)).toBe(0.25);
    expect(aliquotaRegressivaPrevidencia(8)).toBe(0.20);
    expect(aliquotaRegressivaPrevidencia(10)).toBe(0.15);
    expect(aliquotaRegressivaPrevidencia(10.01)).toBe(0.10);
  });

  it('IRPF mensal 2026 (Lei 15.191/2025 + redução Lei 15.270/2025, desconto simplificado R$ 607,20)', () => {
    expect(irpfMensalProgressivo(2000)).toBe(0);
    expect(irpfMensalProgressivo(5000)).toBe(0);              // redução zera até R$ 5.000
    expect(irpfMensalProgressivo(6000)).toBeCloseTo(394.54, 2); // 574,29 − (978,62 − 0,133145 × 6.000)
    expect(irpfMensalProgressivo(7350)).toBeCloseTo(945.54, 2); // sem redução a partir de R$ 7.350
    expect(irpfMensalProgressivo(10000)).toBeCloseTo(1674.29, 2); // (10.000 − 607,20) × 27,5% − 908,73
  });

  it('V-RET-3d: regressiva vs progressiva (PGBL 500 mil) → saída muda (afeta)', () => {
    const base = { patrimonioTributavel: 500000, saldoPGBL: 500000, gastoMensalDesejado: 6000 };
    const reg = simularAposentadoria(R({ ...base, tabelaPGBL: 'regressiva' }));
    const prog = simularAposentadoria(R({ ...base, tabelaPGBL: 'progressiva' }));
    expect(semAno(reg)).not.toBe(semAno(prog));
    expect(reg.taxaRetiradaInicial).not.toBe(prog.taxaRetiradaInicial);
  });

  // Aos 65 anos o gasto geral tem fator 0,90: necessidade = 6.000 × 0,9 = 5.400/mês (64.800/ano)
  it('PGBL integral, 1 ano de acumulação, regressiva: retirada = necessidade ÷ (1 − 35%)', () => {
    const r = simularAposentadoria(R({ patrimonioTributavel: 0, saldoPGBL: 1000000, gastoMensalDesejado: 6000, numeroSimulacoes: 100 }));
    expect(r.projecaoAnualP50[0].retiradaPatrimonio).toBeCloseTo(64800 / 0.65, 6);
    expect(r.rendaNecessariaPatrimonioMensal).toBeCloseTo(5400, 9);
  });

  it('PGBL integral, progressiva: retirada mensal bruta b resolve b − IR(b) = 5.400', () => {
    const r = simularAposentadoria(R({ patrimonioTributavel: 0, saldoPGBL: 1000000, gastoMensalDesejado: 6000, tabelaPGBL: 'progressiva', numeroSimulacoes: 100 }));
    const b = r.projecaoAnualP50[0].retiradaPatrimonio / 12;
    expect(b - irpfMensalProgressivo(b)).toBeCloseTo(5400, 6);
    expect(b).toBeGreaterThan(5400);
  });

  it('sem PGBL/VGBL o regime de IR não altera nada', () => {
    const reg = simularAposentadoria(R({ gastoMensalDesejado: 6000, tabelaPGBL: 'regressiva', numeroSimulacoes: 300 }));
    const prog = simularAposentadoria(R({ gastoMensalDesejado: 6000, tabelaPGBL: 'progressiva', numeroSimulacoes: 300 }));
    expect(semAno(reg)).toBe(semAno(prog));
  });
});

describe('E04 — gênero e "Tábua IBGE 2024"', () => {
  it('V-RET-3e: sem INSS o gênero não altera o resultado — não há tábua de mortalidade (declarado)', () => {
    const m = simularAposentadoria(R({ gastoMensalDesejado: 6000, genero: 'M', numeroSimulacoes: 500 }));
    const f = simularAposentadoria(R({ gastoMensalDesejado: 6000, genero: 'F', numeroSimulacoes: 500 }));
    expect(semAno(m)).toBe(semAno(f));
    expect(JSON.stringify(m)).not.toMatch(/Tábua|IBGE 2024/);
  });

  it('com INSS o gênero afeta (idade mínima 62 M / 65 H)', () => {
    const base = { idadeAtual: 55, idadeAposentadoria: 62, incluirINSS: true, salarioContribuicao: 5000, tempoContribuicaoAnos: 25, gastoMensalDesejado: 6000, numeroSimulacoes: 300 };
    const m = simularAposentadoria(R({ ...base, genero: 'M' }));
    const f = simularAposentadoria(R({ ...base, genero: 'F' }));
    expect(m.idadeInicioINSS).toBe(65);
    expect(f.idadeInicioINSS).toBe(62);
    expect(f.beneficioINSSMensal).toBeGreaterThan(0);
    expect(m.beneficioINSSMensal).toBe(0);
  });
});

describe('E05 — Monte Carlo com semente, mediana por ano e esgotamento sobre todas as simulações', () => {
  it('V-RET-4a: duas chamadas idênticas → mesmo resultado (semente padrão); semente e versão expostas', () => {
    const a = simularAposentadoria(R({ gastoMensalDesejado: 5000 }));
    const b = simularAposentadoria(R({ gastoMensalDesejado: 5000 }));
    expect(a.saldoFinalP50).toBe(b.saldoFinalP50);
    expect(a.probabilidadeSucesso).toBe(b.probabilidadeSucesso);
    expect(semAno(a)).toBe(semAno(b));
    expect(a.semente).toBe(SEMENTE_PADRAO_APOSENTADORIA);
    expect(a.versaoModelo).toBe(VERSAO_MODELO_APOSENTADORIA);
  });

  it('semente informada reproduz; semente diferente muda a amostra', () => {
    const a = simularAposentadoria(R({ gastoMensalDesejado: 5000, semente: 12345 }));
    const b = simularAposentadoria(R({ gastoMensalDesejado: 5000, semente: 12345 }));
    const c = simularAposentadoria(R({ gastoMensalDesejado: 5000, semente: 999 }));
    expect(semAno(a)).toBe(semAno(b));
    expect(a.semente).toBe(12345);
    expect(c.saldoFinalP50).not.toBe(a.saldoFinalP50);
  });

  it('não usa Math.random', () => {
    const original = Math.random;
    Math.random = () => { throw new Error('Math.random não deveria ser chamado'); };
    try {
      expect(() => simularAposentadoria(R({ numeroSimulacoes: 50 }))).not.toThrow();
    } finally {
      Math.random = original;
    }
  });

  it('V-RET-4c/4i: patrimônio final da tabela P50 vs mediana lognormal (tolerância MC IC99%)', () => {
    const r = simularAposentadoria(R());
    const fim = r.projecaoAnualP50[r.projecaoAnualP50.length - 1].patrimonioFim;
    expect(Math.abs(fim / MEDIANA_FINAL - 1)).toBeLessThanOrEqual(TOL_MC);
    expect(fim).toBe(r.saldoFinalP50); // a tabela publica a mesma mediana do MC
  });

  it('V-RET-4d/4j: saldoFinalP50 vs mediana lognormal', () => {
    const r = simularAposentadoria(R());
    expect(Math.abs(r.saldoFinalP50 / MEDIANA_FINAL - 1)).toBeLessThanOrEqual(TOL_MC);
  });

  it('V-RET-4k: tabela ano a ano — máx |tabela_k / mediana_k − 1| ≤ tolerância, 25 linhas', () => {
    const r = simularAposentadoria(R());
    expect(r.projecaoAnualP50).toHaveLength(25);
    const desvio = Math.max(...r.projecaoAnualP50.map((x, k) => Math.abs(x.patrimonioFim / MEDIANA_POR_ANO[k] - 1)));
    expect(desvio).toBeLessThanOrEqual(TOL_MC);
  });

  it('a tabela não é a trajetória determinística (+16,3%): patrimônio final < 1.065.000 × 1,065^25 − 10%', () => {
    const r = simularAposentadoria(R());
    const deterministico = 1065000 * Math.pow(1.065, 25);
    expect(r.saldoFinalP50).toBeLessThan(deterministico * 0.9);
  });

  it('V-RET-4e/4l: gasto 4.000, sucesso ≥ 50% → anoEsgotamentoP50 null', () => {
    const r = simularAposentadoria(R({ gastoMensalDesejado: 4000 }));
    expect(r.probabilidadeSucesso).toBeGreaterThanOrEqual(50);
    expect(r.anoEsgotamentoP50).toBeNull();
  });

  it('esgotamento P50 sobre todas as simulações coincide com a primeira linha "esgotado" da mediana', () => {
    const r = simularAposentadoria(R({ gastoMensalDesejado: 12000, numeroSimulacoes: 2000 }));
    expect(r.probabilidadeSucesso).toBeLessThan(50);
    expect(r.anoEsgotamentoP50).not.toBeNull();
    const primeira = r.projecaoAnualP50.find(x => x.esgotado)!;
    expect(primeira.idade).toBe(r.anoEsgotamentoP50);
    expect(primeira.patrimonioFim).toBe(0);
    expect(r.anoEsgotamentoP5!).toBeLessThanOrEqual(r.anoEsgotamentoP50!);
  });

  it('V-RET-4f: patrimônio 0 e gasto 8.000 → renda do patrimônio 0, renda total 0, sucesso 0; necessidade separada', () => {
    const r = simularAposentadoria(R({ patrimonioTributavel: 0, gastoMensalDesejado: 8000, numeroSimulacoes: 500 }));
    expect(r.rendaPatrimonioMensal).toBe(0);
    expect(r.rendaTotalMensal).toBe(0);
    expect(r.probabilidadeSucesso).toBe(0);
    expect(r.rendaNecessariaPatrimonioMensal).toBeCloseTo(7200, 9); // 8.000 × 0,90 (fator de gasto aos 65)
  });

  it('renda sustentável = retirada constante sustentada em 90% das simulações (mesma semente)', () => {
    // 41→64 anos: sem redução de gastos por idade, sem saúde, sem INSS — retirada constante
    const base = { idadeAtual: 40, idadeAposentadoria: 41, expectativaVida: 64 };
    const r1 = simularAposentadoria(R(base));
    expect(r1.rendaPatrimonioMensal).toBeGreaterThan(0);
    const r2 = simularAposentadoria(R({ ...base, gastoMensalDesejado: r1.rendaPatrimonioMensal }));
    expect(Math.abs(r2.probabilidadeSucesso - 90)).toBeLessThanOrEqual(0.1);
  });

  it('linhas da tabela reconciliam: fim = início + rendimento − retirada (enquanto a mediana não esgota)', () => {
    const r = simularAposentadoria(R({ gastoMensalDesejado: 6000, numeroSimulacoes: 1000 }));
    for (const x of r.projecaoAnualP50.filter(l => l.patrimonioFim > 0)) {
      expect(x.patrimonioInicio + x.retornoNominal - x.retiradaPatrimonio).toBeCloseTo(x.patrimonioFim, 4);
    }
  });

  it('numeroSimulacoes inválido é normalizado (≥ 1; não numérico → 1000) e a probabilidade fica em [0, 100]', () => {
    const meio = simularAposentadoria(R({ gastoMensalDesejado: 5000, numeroSimulacoes: 0.5 }));
    expect(meio.numeroSimulacoes).toBe(1);
    expect(meio.probabilidadeSucesso).toBeLessThanOrEqual(100);
    const nan = simularAposentadoria(R({ gastoMensalDesejado: 5000, numeroSimulacoes: Number.NaN }));
    expect(nan.numeroSimulacoes).toBe(1000);
  });
});
