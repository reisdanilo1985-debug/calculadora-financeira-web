/**
 * Auditoria 2026-09-12 — correções P2 da Tesouraria (core).
 *
 *  C11 — % do CDI pela convenção B3 (percentual sobre a taxa DI diária).
 *  N18 — cross-currency no prazo (CDI base 252; cupom e spread lineares base 360).
 *  N05 — duration com convenção de cupom explícita e modo NTN-F.
 *  N14 — TIR múltipla: alerta e veredito pelo VPL ao custo de capital.
 *  N02 — datas civis (parseDataCivil / isoCivilNoFuso) independentes do fuso.
 *
 * Esperados: oráculos Python/decimal da auditoria (ref/F2-B-tesouraria.json,
 * F2-I-cruzada.json, F1-A-calendario.json). Rodar com TZ=UTC e
 * TZ=America/Sao_Paulo — os casos de data não podem depender do fuso.
 */

import { describe, it, expect } from 'vitest';
import {
  preParaCdi,
  cdiParaPre,
  cdiSpreadParaPct,
  pctParaCdiSpread,
  crossCcyToCdi,
  cdiToCrossCcy,
  ipcaMais,
  duration,
  puNtnf,
  tirVpl,
  xirr,
  xnpv,
  jurosConvencoes,
  trocasDeSinal,
  parseDataCivil,
  isoCivilNoFuso,
  FluxoDatado,
} from '../../src/treasury';
import { calculateCDI } from '../../src/engines/CDIEngine';
import { IndexType } from '../../src/models/types';

/** R12 da auditoria: |Δ| ≤ 1e-12 absoluto ou relativo. */
function r12(obtido: number, esperado: number) {
  const delta = Math.abs(obtido - esperado);
  const rel = esperado === 0 ? delta : delta / Math.abs(esperado);
  expect(Math.min(delta, rel), `obtido ${obtido}, esperado ${esperado}`).toBeLessThanOrEqual(1e-12);
}

/** Data local à meia-noite (sem parsing de string ISO, que é UTC). */
const d = (iso: string) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
};

/** TDI de referência (oráculo). */
const TDI_10 = 0.00037828653153424357;
const TDI_144 = 0.0005339952745723017;

// ───────────────────────────────── C11 ─────────────────────────────────

describe('C11 — pré ↔ % do CDI (B3)', () => {
  it('V-PCDI-1a: pré 11% / CDI 10% → 109,497…% do CDI', () => {
    r12(preParaCdi({ preAa: 0.11, cdiAa: 0.1 }).pctCdi, 1.09497106783219);
  });

  it('V-PCDI-1b: spread composto sobre o CDI inalterado', () => {
    r12(preParaCdi({ preAa: 0.11, cdiAa: 0.1 }).spreadCompSobreCdi, 0.00909090909090909);
  });

  it('V-PCDI-1c: contratar o % obtido reproduz o pré (Δ ≤ 0,01 bp)', () => {
    const p = preParaCdi({ preAa: 0.11, cdiAa: 0.1 }).pctCdi;
    expect(Math.abs(Math.pow(1 + p * TDI_10, 252) - 1 - 0.11)).toBeLessThanOrEqual(1e-6);
  });

  it('V-PCDI-2a: 110% do CDI 10% → pré (1 + 1,1·TDI)^252 − 1', () => {
    r12(cdiParaPre({ pctCdi: 1.1, cdiAa: 0.1 }).preAa, 0.11053203961611026);
  });

  it('V-PCDI-3a/3b/3e: CDI 0 e pré ≤ −100% rejeitados', () => {
    expect(() => preParaCdi({ preAa: 0.11, cdiAa: 0 })).toThrow(/cdiAa/);
    expect(() => cdiParaPre({ pctCdi: 1.1, cdiAa: 0 })).toThrow(/cdiAa/);
    expect(() => preParaCdi({ preAa: -1.5, cdiAa: 0.1 })).toThrow(/preAa/);
  });

  it('V-PCDI-3c/3d: % negativo e ida e volta', () => {
    r12(cdiParaPre({ pctCdi: -0.5, cdiAa: 0.1 }).preAa, -0.04655030273209198);
    r12(preParaCdi({ preAa: cdiParaPre({ pctCdi: 1.1, cdiAa: 0.1 }).preAa, cdiAa: 0.1 }).pctCdi, 1.1);
  });
});

describe('C11 — CDI + spread ↔ % do CDI (B3)', () => {
  const R = cdiSpreadParaPct({ cdiAa: 0.144, spreadAa: 0.02 });

  it('V-CSP-1a..1d', () => {
    r12(R.totalComp, 0.16688);
    r12(R.pctCdiComp, 1.1472426999196963);
    r12(R.totalLin, 0.164);
    r12(R.pctCdiLin, 1.12886764347233);
  });

  it('V-CSP-2a..2d: 110% do CDI 14,4%', () => {
    const r = pctParaCdiSpread({ pctCdi: 1.1, cdiAa: 0.144 });
    r12(r.spreadComp, 0.013539986552668274);
    r12(r.totalAa, 0.1594897446162525);
    r12(r.spreadLin, 0.015489744616252507);
    r12(cdiSpreadParaPct({ cdiAa: 0.144, spreadAa: r.spreadComp }).pctCdiComp, 1.1);
  });

  it('V-CSP-3a: contratar o % exibido reproduz 16,688% a.a. (Δ ≤ 0,01 bp)', () => {
    const total = Math.pow(1 + R.pctCdiComp * TDI_144, 252) - 1;
    expect(Math.abs(total - 0.16688)).toBeLessThanOrEqual(1e-6);
  });

  it('entradas fora do domínio são rejeitadas (sem NaN)', () => {
    expect(() => cdiSpreadParaPct({ cdiAa: 0.144, spreadAa: -1 })).toThrow(/spreadAa/);
    expect(() => pctParaCdiSpread({ pctCdi: 1.1, cdiAa: 0 })).toThrow(/cdiAa/);
  });
});

describe('C11 — cross-currency e IPCA+ trazem o % do CDI B3 e rotulam a razão anual', () => {
  const Y = { spreadEstrangeiroAa: 0.08, cdiAa: 0.144, cupomEstrangeiroAa: 0.05481 };

  it('V-XCCY-1e: pctCdiB3Comp pelo acúmulo diário; razão anual rotulada como aproximação', () => {
    const r = crossCcyToCdi(Y);
    r12(r.pctCdiB3Comp, 1.1754823019870997);
    // razão anual preservada (golden master da planilha) e declarada no resultado
    r12(r.pctCdiComp, r.preEquivComp / 0.144);
    expect(r.convencao).toMatch(/razão anual.*aproximação/);
    expect(r.convencao).toMatch(/B3/);
  });

  it('V-XCCY-1a..1d, 1f e 2a: paridade anual inalterada sem prazo', () => {
    const r = crossCcyToCdi(Y);
    r12(r.cambioFwdAa, 0.08455551236715617);
    r12(r.preEquivComp, 0.17131995335652866);
    r12(r.spreadSobreCdiComp, 0.023881078108853728);
    r12(r.preEquivLin, 0.16455551236715618);
    r12(r.spreadEquilibrio, 0.05481);
    expect(r.prazoDu).toBe(252);
    expect(r.prazoDc).toBe(360);
    const inv = cdiToCrossCcy({ cdiAa: 0.144, spreadLocalAa: r.spreadSobreCdiComp, cupomEstrangeiroAa: 0.05481 });
    r12(inv.spreadEstrangeiroComp, 0.08);
  });

  it('V-IPCA-1b: pctCdiB3 pelo acúmulo diário; razão anual rotulada', () => {
    const r = ipcaMais({ realAa: 0.07, ipcaAa: 0.045, cdiAa: 0.144 });
    r12(r.nominalAa, 0.11815);
    r12(r.pctCdiB3, 0.8300730552163241);
    expect(r.convencao).toMatch(/razão anual.*aproximação/);
  });

  it('coerência na aba: IPCA+ e cross-ccy dão o mesmo % do CDI que pré → % do CDI', () => {
    const ipca = ipcaMais({ realAa: 0.07, ipcaAa: 0.045, cdiAa: 0.144 });
    r12(ipca.pctCdiB3, preParaCdi({ preAa: ipca.nominalAa, cdiAa: 0.144 }).pctCdi);
    const x = crossCcyToCdi({ ...Y, du: 504, dc: 720 });
    r12(x.pctCdiB3Comp, preParaCdi({ preAa: x.preEquivComp, cdiAa: 0.144 }).pctCdi);
  });
});

describe('C11 — V-XC-2b: cdiParaPre coerente com o CDIEngine (110% do CDI)', () => {
  it('(1 + pré)^(n/252) = fator do CDIEngine com 110% (R12)', () => {
    const dias: Date[] = [];
    for (let x = d('2026-03-02'); x < d('2026-03-30'); x.setDate(x.getDate() + 1)) {
      if (x.getDay() !== 0 && x.getDay() !== 6) dias.push(new Date(x));
    }
    const rows = calculateCDI({
      startDate: d('2026-03-02'),
      endDate: d('2026-03-30'),
      initialAmount: 1e6,
      indexType: IndexType.CDI,
      dayCountBasis: 252,
      indexData: dias.map(date => ({ date, value: 10 })),
      spread: { mode: 'percentage', value: 110 },
    } as any);
    const fator = rows[rows.length - 1].accumulatedFactor;
    r12(fator, 1.0083552848283925); // V-XC-2a
    const pre = cdiParaPre({ pctCdi: 1.1, cdiAa: 0.1 }).preAa;
    expect(Math.abs(Math.pow(1 + pre, rows.length / 252) - fator)).toBeLessThanOrEqual(1e-12);
  });
});

// ───────────────────────────────── N18 ─────────────────────────────────

describe('N18 — cross-currency no prazo (B3: cupom e spread lineares 360)', () => {
  const Y = { spreadEstrangeiroAa: 0.08, cdiAa: 0.144, cupomEstrangeiroAa: 0.05481 };

  it.each([
    ['V-XCCY-3a', 21, 30, 0.17301833225521557],
    ['V-XCCY-3b', 504, 720, 0.16968220040994073],
    ['V-XCCY-3c', 252, 365, 0.1716794210822918],
  ])('%s: %i du / %i dc → pré equivalente', (_id, du, dc, esperado) => {
    const r = crossCcyToCdi({ ...Y, du, dc });
    r12(r.preEquivComp, esperado);
    expect(r.prazoDu).toBe(du);
    expect(r.prazoDc).toBe(dc);
    expect(r.convencao).toContain(`Prazo ${du} du / ${dc} dc`);
  });

  it('prazo 252 du / 360 dc = paridade anual', () => {
    const a = crossCcyToCdi(Y);
    const b = crossCcyToCdi({ ...Y, du: 252, dc: 360 });
    r12(b.preEquivComp, a.preEquivComp);
    r12(b.cambioFwdAa, a.cambioFwdAa);
  });

  it('spread de equilíbrio (= cupom) dá exatamente 100% do CDI no prazo', () => {
    const r = crossCcyToCdi({ ...Y, spreadEstrangeiroAa: 0.05481, du: 504, dc: 720 });
    r12(r.preEquivComp, 0.144);
    r12(r.pctCdiB3Comp, 1);
  });

  it('inverso no prazo volta ao spread externo (ida e volta)', () => {
    const ida = crossCcyToCdi({ ...Y, du: 21, dc: 30 });
    const volta = cdiToCrossCcy({
      cdiAa: 0.144,
      spreadLocalAa: ida.spreadSobreCdiComp,
      cupomEstrangeiroAa: 0.05481,
      du: 21,
      dc: 30,
    });
    r12(volta.spreadEstrangeiroComp, 0.08);
    r12(volta.cambioFwdAa, ida.cambioFwdAa);
  });

  it('prazo incompleto ou inválido e cupom −100% são rejeitados', () => {
    expect(() => crossCcyToCdi({ ...Y, du: 504 })).toThrow(/du e dc/);
    expect(() => crossCcyToCdi({ ...Y, dc: 720 })).toThrow(/du e dc/);
    expect(() => crossCcyToCdi({ ...Y, du: 0, dc: 720 })).toThrow(/du/);
    expect(() => crossCcyToCdi({ ...Y, du: 504, dc: 10.5 })).toThrow(/dc/);
    expect(() => crossCcyToCdi({ ...Y, cupomEstrangeiroAa: -1 })).toThrow(/cupom/); // V-XCCY-4b
  });
});

// ───────────────────────────────── N05 ─────────────────────────────────

describe('N05 — duration com convenção de cupom explícita', () => {
  const BOND = { face: 1000, couponRateAnnual: 0.1, ytm: 0.13, m: 2, n: 10 };
  const DUS = [126, 252, 378, 504, 630, 756, 882, 1008, 1134, 1260];

  it('V-XC-3a: modo NTN-F → preço = PU NTN-F do mesmo título (|Δ| ≤ R$ 0,01)', () => {
    const dur = duration({ ...BOND, convencaoCupom: 'ntnf' });
    const pu = puNtnf({ face: 1000, iaa: 0.13, couponRateAnnual: 0.1, m: 2, cuponsDu: DUS });
    expect(Math.abs(dur.preco - pu.pu)).toBeLessThanOrEqual(0.01);
    r12(dur.cupomPeriodico, pu.cupomPeriodico);
    // V-DUR-4a (cupom oficial 48,80885, sem truncamentos intermediários)
    expect(Math.abs(dur.preco - 896.9218021386911)).toBeLessThanOrEqual(0.01);
    expect(dur.convencao).toMatch(/^NTN-F/);
  });

  it('modo simples (padrão) inalterado e rotulado explicitamente', () => {
    const r = duration(BOND);
    r12(r.preco, 905.5649049131216); // V-DUR-2a
    expect(r.cupomPeriodico).toBe(50);
    expect(r.convencao).toMatch(/^Simples: cupom = face × taxa ÷ m/);
    r12(duration({ ...BOND, convencaoCupom: 'simples' }).preco, r.preco);
  });

  it('convenção desconhecida é rejeitada; limites de n/m (P1) preservados', () => {
    expect(() => duration({ ...BOND, convencaoCupom: 'xyz' as any })).toThrow(/convencaoCupom/);
    expect(() => duration({ ...BOND, convencaoCupom: 'ntnf', n: 1201 })).toThrow(/entre 1 e 1200/);
    expect(() => duration({ ...BOND, convencaoCupom: 'ntnf', m: 366 })).toThrow(/entre 1 e 365/);
  });
});

// ───────────────────────────────── N14 ─────────────────────────────────

describe('N14 — TIR múltipla', () => {
  const fl = (pares: [string, number][]): FluxoDatado[] => pares.map(([s, a]) => ({ date: d(s), amount: a }));
  const FL2_2021 = fl([['2021-01-01', -100], ['2022-01-01', 230], ['2023-01-01', -132]]);
  const FL2 = fl([['2026-01-01', -100], ['2027-01-01', 230], ['2028-01-01', -132]]);
  const EXCEL = fl([
    ['2008-01-01', -10000],
    ['2008-03-01', 2750],
    ['2008-10-30', 4250],
    ['2009-02-15', 3250],
    ['2009-04-01', 2750],
  ]);

  it('V-XIRR-2a: o solver segue devolvendo uma raiz (10%) — por isso o alerta', () => {
    expect(Math.abs(xirr(FL2_2021) - 0.1)).toBeLessThanOrEqual(1e-9);
  });

  it('V-XIRR-2c: tirVpl sinaliza TIR múltipla (2 trocas de sinal)', () => {
    const r = tirVpl({ fluxos: FL2_2021, custoCapital: 0.15 });
    expect(Object.keys(r).some(k => /alert|aviso|multipl|warning/i.test(k))).toBe(true);
    expect(r.trocasDeSinal).toBe(2);
    expect(r.alertaTirMultipla).toMatch(/TIR múltipla/);
  });

  it('V-XIRR-2d: com custo 15% entre as raízes, o veredito NÃO vem da TIR (vem do VPL)', () => {
    const r = tirVpl({ fluxos: FL2_2021, custoCapital: 0.15, taxaDesconto: 0.15 });
    expect(r.criterioVeredito).toBe('VPL');
    expect(r.vplCustoCapital!).toBeGreaterThan(0);
    // a regra antiga (TIR 10% < 15%) diria "Rejeitar"; pelo VPL é "Aceitar"
    expect(r.veredito).toBe('Aceitar');
  });

  it('V-TIR-2a/2b/2c: −100/+230/−132 (2026–2028), custo 15% → Aceitar com alerta; VPL 0,189…', () => {
    const r = tirVpl({ fluxos: FL2, custoCapital: 0.15 });
    expect(r.veredito).toBe('Aceitar');
    expect(r.alertaTirMultipla).toBeDefined();
    const c = tirVpl({ fluxos: FL2, taxaDesconto: 0.15, custoCapital: 0.15 });
    r12(c.vpl!, 0.1890359168241966);
    r12(c.vplCustoCapital!, 0.1890359168241966);
  });

  it('fluxo convencional (exemplo Excel): sem alerta, veredito pela TIR', () => {
    const r = tirVpl({ fluxos: EXCEL, custoCapital: 0.2 });
    expect(r.trocasDeSinal).toBe(1);
    expect(r.alertaTirMultipla).toBeUndefined();
    expect(r.criterioVeredito).toBe('TIR');
    expect(r.veredito).toBe('Aceitar');
    expect(Math.abs(r.tirAnual - 0.37336253351883153)).toBeLessThanOrEqual(1e-9);
  });

  it('trocasDeSinal: ordem cronológica, fluxos do mesmo dia somados, zeros ignorados', () => {
    // fora de ordem: cronologicamente −, +, − → 2 trocas
    expect(trocasDeSinal([FL2[2], FL2[0], FL2[1]])).toBe(2);
    // −100 e +40 no mesmo dia viram −60: sequência −60, +100 → 1 troca
    expect(trocasDeSinal(fl([['2026-01-01', -100], ['2026-01-01', 40], ['2027-01-01', 100]]))).toBe(1);
    // total nulo num dia é ignorado
    expect(trocasDeSinal(fl([['2026-01-01', -100], ['2026-06-01', 0], ['2027-01-01', 120]]))).toBe(1);
    expect(trocasDeSinal([])).toBe(0);
  });

  it('V-XIRR-3c: sem troca de sinal segue rejeitado', () => {
    expect(() => tirVpl({ fluxos: fl([['2025-01-01', -100], ['2025-06-01', -50]]) })).toThrow();
  });

  it('XNPV na TIR devolvida continua zero (mecânica preservada)', () => {
    expect(Math.abs(xnpv(tirVpl({ fluxos: EXCEL }).tirAnual, EXCEL))).toBeLessThan(1e-6);
  });
});

// ───────────────────────────────── N02 ─────────────────────────────────

describe(`N02 — datas civis independentes do fuso (TZ=${process.env.TZ ?? 'padrão'})`, () => {
  const civil = (x: Date | null) =>
    x && `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

  it("'AAAA-MM-DD' e 'DD/MM/AAAA' viram a própria data, à meia-noite local", () => {
    const x = parseDataCivil('2026-03-01')!;
    expect(civil(x)).toBe('2026-03-01');
    expect(x.getHours()).toBe(0);
    expect(civil(parseDataCivil('31/03/2026'))).toBe('2026-03-31');
    expect(civil(parseDataCivil('01/02/2026'))).toBe('2026-02-01'); // dia/mês, nunca mês/dia
  });

  it('datetime sem fuso → data escrita; com Z/deslocamento → data civil em America/Sao_Paulo', () => {
    expect(civil(parseDataCivil('2025-01-03T12:00:00'))).toBe('2025-01-03');
    expect(civil(parseDataCivil('2025-01-03T15:00:00.000Z'))).toBe('2025-01-03'); // formato da UI
    expect(civil(parseDataCivil('2026-03-01T00:30:00Z'))).toBe('2026-02-28'); // 21h30 de 28/02 em SP
    expect(civil(parseDataCivil('2025-01-03T02:00:00+10:00'))).toBe('2025-01-02');
    expect(civil(parseDataCivil('2025-01-03T12:00:00-03:00'))).toBe('2025-01-03');
    // regra "data escrita" (timeZone = null): ignora Z/deslocamento
    expect(civil(parseDataCivil('2025-01-03T00:00:00Z', null))).toBe('2025-01-03');
    expect(civil(parseDataCivil('2025-01-03T02:00:00+10:00', null))).toBe('2025-01-03');
    expect(civil(parseDataCivil('2025-01-03', null))).toBe('2025-01-03');
  });

  it('formato desconhecido ou data inexistente → null', () => {
    expect(parseDataCivil('2026-02-30')).toBeNull();
    expect(parseDataCivil('31/04/2026')).toBeNull();
    expect(parseDataCivil('03/01/2025 10h')).toBeNull();
    expect(parseDataCivil('abc')).toBeNull();
    expect(parseDataCivil('')).toBeNull();
  });

  it('isoCivilNoFuso: 21h35 BRT de 12/09 ainda é 12/09 (UTC já é 13/09)', () => {
    expect(isoCivilNoFuso(new Date('2026-09-13T00:35:00Z'))).toBe('2026-09-12');
    expect(isoCivilNoFuso(new Date('2026-09-13T03:00:00Z'))).toBe('2026-09-13');
    expect(isoCivilNoFuso(new Date('2026-09-13T00:35:00Z'), 'UTC')).toBe('2026-09-13');
  });

  it('V-USMM-6a..6e: 30/360 e ACT com datas lidas por parseDataCivil', () => {
    const juros = (a: string, b: string) =>
      jurosConvencoes({ notional: 1e6, taxa: 0.05, d0: parseDataCivil(a)!, d1: parseDataCivil(b)! });
    const r6a = juros('2026-03-01', '2026-03-31');
    expect(r6a.dias30360).toBe(30);
    r12(r6a.juros30360, 4166.666666666667);
    expect(r6a.diasAct).toBe(30);
    expect(juros('2026-03-31', '2026-04-30').dias30360).toBe(30);
    expect(juros('2026-01-15', '2026-07-15').dias30360).toBe(180);
  });
});
