/**
 * Testes P2 da aba WACC — auditoria de 12/09/2026.
 *
 * UI-02: a sensibilidade exibia heurística fixa (β +10% → 5% do WACC) e erro de escala ×100
 *        (Rf +1 p.p. → "+60pp"). Agora o motor recalcula o WACC com cada choque (em p.p.).
 * E03:   conversão de taxa entre moedas/regimes por diferencial de inflação (Fisher), usada pela
 *        tabela de parâmetros de referência por moeda.
 *
 * Cenário de aceite UI-02: E 600, D 400, IR 34%, Rf 4,2, ERP 5,8, βU 0,87, CRP 3,97, Kd 12,5
 * → WACC 12,56%, βL 1,2528.
 */

import { describe, it, expect } from 'vitest';
import {
  calcularWACC,
  calcularSensibilidadeWACC,
  ajustarTaxaPorDiferencialInflacao,
  taxaRealDeNominal,
  WaccInput,
} from '../src/engines/WaccEngine';

const CENARIO_UI02: WaccInput = {
  setor: 'aeroespacial',
  pais: 'BRA',
  moeda: 'BRL',
  taxaLivreDeRisco: 4.2,
  premioRiscoMercado: 5.8,
  betaDesalavancado: 0.87,
  premioRiscoPais: 3.97,
  premioTamanho: 0,
  marketCap: 600,
  dividaBruta: 400,
  aliquotaIR: 34,
  custoDividaPreTax: 12.5,
};

const r2 = (v: number | null | undefined) => (v === null || v === undefined ? v : Math.round(v * 100) / 100);
const porId = (r: ReturnType<typeof calcularWACC>, id: string) => r.sensibilidade.find(s => s.id === id)!;

describe('UI-02 — sensibilidade do WACC calculada no motor, em p.p.', () => {
  const r = calcularWACC(CENARIO_UI02);

  it('cenário base: WACC 12,56% e β alavancado 1,2528', () => {
    expect(r2(r.wacc)).toBe(12.56);
    expect(r.betaAlavancado).toBeCloseTo(1.2528, 10);
  });

  it('Rf +1 p.p. → +0,60 p.p. (= We × 1 p.p., sem erro de escala ×100)', () => {
    const s = porId(r, 'rf');
    expect(r2(s.deltaWaccPP)).toBe(0.6);
    expect(s.deltaWaccPP!).toBeCloseTo(0.6, 10);
    expect(s.waccChocado!).toBeCloseTo(r.wacc + 0.6, 10);
  });

  it('β +10% → +0,44 p.p. (= We × 0,1 × βL × ERP)', () => {
    const s = porId(r, 'beta');
    expect(r2(s.deltaWaccPP)).toBe(0.44);
    expect(s.deltaWaccPP!).toBeCloseTo(0.6 * 0.1 * 1.2528 * 5.8, 10);
  });

  it('ERP +1 p.p. → +0,75 p.p.', () => {
    expect(r2(porId(r, 'erp').deltaWaccPP)).toBe(0.75);
  });

  it('Kd antes do IR +1 p.p. → +0,26 p.p. (= Wd × (1 − T))', () => {
    const s = porId(r, 'kd');
    expect(r2(s.deltaWaccPP)).toBe(0.26);
    expect(s.deltaWaccPP!).toBeCloseTo(0.4 * 0.66, 10);
  });

  it('IR +1 p.p. → −0,07 p.p., com realavancagem do β: −0,05 via Kd e −0,02 via β', () => {
    const s = porId(r, 'ir');
    expect(r2(s.deltaWaccPP)).toBe(-0.07);
    expect(r2(s.decomposicao!.viaCustoDivida)).toBe(-0.05);
    expect(r2(s.decomposicao!.viaBeta)).toBe(-0.02);
    expect(s.decomposicao!.viaCustoDivida + s.decomposicao!.viaBeta).toBeCloseTo(s.deltaWaccPP!, 12);
  });

  it('D/E +10% (V constante, Kd inalterado) → recalcula pesos e β', () => {
    const s = porId(r, 'de');
    const V = 1000;
    const de = (400 / 600) * 1.1;
    const E = V / (1 + de);
    const esperado = calcularWACC({ ...CENARIO_UI02, marketCap: E, dividaBruta: V - E }).wacc - r.wacc;
    expect(s.deltaWaccPP!).toBeCloseTo(esperado, 10);
    expect(r2(s.deltaWaccPP)).toBe(-0.04);
  });

  it('seis premissas, na ordem Rf, β, ERP, Kd, IR, D/E, com choque declarado', () => {
    expect(r.sensibilidade.map(s => s.id)).toEqual(['rf', 'beta', 'erp', 'kd', 'ir', 'de']);
    expect(r.sensibilidade.every(s => s.choque && s.descricao)).toBe(true);
  });

  it('sem dívida: Kd, IR e D/E não mexem no WACC; Rf +1 p.p. → +1 p.p.', () => {
    const semDivida = calcularWACC({ ...CENARIO_UI02, dividaBruta: 0 });
    expect(porId(semDivida, 'rf').deltaWaccPP!).toBeCloseTo(1, 12);
    expect(porId(semDivida, 'kd').deltaWaccPP!).toBeCloseTo(0, 12);
    expect(porId(semDivida, 'ir').deltaWaccPP!).toBeCloseTo(0, 12);
    expect(porId(semDivida, 'de').deltaWaccPP!).toBeCloseTo(0, 12);
  });

  it('equity zero (cenário base não finito) → deltas null, sem exceção', () => {
    const s = calcularSensibilidadeWACC({ ...CENARIO_UI02, marketCap: 0 });
    expect(s.every(x => x.deltaWaccPP === null && x.waccChocado === null)).toBe(true);
  });

  it('não altera o WACC dos casos V-WACC-1 (10,56) e V-WACC-3 (13)', () => {
    const W = { ...CENARIO_UI02, taxaLivreDeRisco: 4, premioRiscoMercado: 5, betaDesalavancado: 1, premioRiscoPais: 2, custoDividaPreTax: 10 };
    expect(calcularWACC(W).wacc).toBeCloseTo(10.56, 10);
    expect(calcularWACC({ ...W, betaDesalavancado: 1.2, premioTamanho: 1, marketCap: 1000, dividaBruta: 0 }).wacc).toBeCloseTo(13, 10);
  });
});

describe('E03 — conversão de taxas por diferencial de inflação (Fisher)', () => {
  it('Rf USD 3,95% (π 2%) → BRL (π 3%) = 1,0395 × 1,03 / 1,02 − 1', () => {
    expect(ajustarTaxaPorDiferencialInflacao(3.95, 2, 3)).toBeCloseTo((1.0395 * 1.03 / 1.02 - 1) * 100, 12);
    expect(r2(ajustarTaxaPorDiferencialInflacao(3.95, 2, 3))).toBe(4.97);
  });

  it('taxa real: (1 + nominal)/(1 + π) − 1; ida e volta preserva a taxa', () => {
    expect(taxaRealDeNominal(3.95, 2)).toBeCloseTo((1.0395 / 1.02 - 1) * 100, 12);
    const brl = ajustarTaxaPorDiferencialInflacao(3.95, 2, 3);
    expect(taxaRealDeNominal(brl, 3)).toBeCloseTo(taxaRealDeNominal(3.95, 2), 12);
    expect(ajustarTaxaPorDiferencialInflacao(brl, 3, 2)).toBeCloseTo(3.95, 12);
  });
});
