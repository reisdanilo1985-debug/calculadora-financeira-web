/**
 * Auditoria 2026-09-12 — camada de decisão da aba Tesouraria (web) sobre o
 * resultado do motor (C11 e N14). Importa `decision.ts` do pacote web por
 * caminho relativo: o arquivo é TypeScript puro, sem imports (se passar a
 * importar '@/…', este teste precisa de alias no vitest).
 *
 * Esperados: ref/F2-G-web.json (oráculo Python/decimal da auditoria).
 */

import { describe, it, expect } from 'vitest';
import { decidir } from '../../../web/src/components/tesouraria/decision';
import {
  crossCcyToCdi,
  cdiToCrossCcy,
  preParaCdi,
  pctParaCdiSpread,
  ipcaMais,
  tirVpl,
  duration,
} from '../../src/treasury';

const d = (iso: string) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
};
const grupo1 = (re: RegExp, s?: string | null) => s?.match(re)?.[1];

describe('C11 — decisão usa a régua B3 do % do CDI', () => {
  it('V-WEB-3c/3c2: razão anual 115,5% (vermelho) é 114,4% B3 → sinal amarelo', () => {
    const body = { spreadEstrangeiroAa: 0.07538985944055944, cdiAa: 0.144, cupomEstrangeiroAa: 0.05481 };
    const r = crossCcyToCdi(body);
    expect(r.pctCdiComp).toBeGreaterThan(1.15); // a razão anual cairia no vermelho
    const v = decidir('cross-ccy', body, r)!;
    expect(v.sinal).toBe('amarelo');
    expect(grupo1(/sai por ([\d.,]+)% do CDI/, v.frase)).toBe('114,4');
    expect(v.criterio).toMatch(/convenção B3/);
  });

  it('cross-ccy cita o prazo usado pelo motor (N18)', () => {
    const body = { spreadEstrangeiroAa: 0.08, cdiAa: 0.144, cupomEstrangeiroAa: 0.05481, du: 504, dc: 720 };
    expect(decidir('cross-ccy', body, crossCcyToCdi(body))!.frase).toContain('no prazo de 504 du / 720 dc');
    const inv = { modo: 'cdiParaMoeda', cdiAa: 0.144, spreadLocalAa: 0.02, cupomEstrangeiroAa: 0.05481, du: 21, dc: 30 };
    expect(decidir('cross-ccy', inv, cdiToCrossCcy(inv))!.frase).toContain('no prazo de 21 du / 30 dc');
  });

  it('sem o % do CDI B3 no resultado (API antiga), não emite sinal pela razão anual', () => {
    const body = { spreadEstrangeiroAa: 0.08, cdiAa: 0.144, cupomEstrangeiroAa: 0.05481 };
    const { pctCdiB3Comp: _omitido, ...antigo } = crossCcyToCdi(body);
    expect(decidir('cross-ccy', body, antigo)).toBeNull();
  });

  it('V-WEB-3g/3k: pré → % do CDI citado', () => {
    const b1 = { preAa: 0.11, cdiAa: 0.1 };
    expect(grupo1(/= ([\d.,]+)% do CDI/, decidir('pre-cdi', b1, preParaCdi(b1))?.frase)).toBe('109,5');
    const b2 = { preAa: 0.144, cdiAa: 0.1389987480014514 };
    expect(grupo1(/= ([\d.,]+)% do CDI/, decidir('pre-cdi', b2, preParaCdi(b2))?.frase)).toBe('103,4');
  });

  it('V-WEB-3h: 110% do CDI 14,4% → CDI + 1,35% (composto)', () => {
    const b = { modo: 'pctParaSpread', pctCdi: 1.1, cdiAa: 0.144 };
    expect(grupo1(/CDI \+ ([\d.,]+)% \(composto\)/, decidir('cdi-spread', b, pctParaCdiSpread(b))?.frase)).toBe('1,35');
  });

  it('IPCA+ cita o % do CDI B3 (83,0%), não a razão anual (82,1%)', () => {
    const b = { realAa: 0.07, ipcaAa: 0.045, cdiAa: 0.144 };
    expect(decidir('ipca', b, ipcaMais(b))!.frase).toMatch(/— 83% do CDI\.$/);
  });
});

describe('N05 — decisão de duration declara a convenção do cupom', () => {
  it('critério traz a convenção aplicada; frase padrão inalterada (V-WEB-3i)', () => {
    const b = { face: 1000, couponRateAnnual: 0.1, ytm: 0.13, m: 2, n: 10 };
    const v = decidir('duration', b, duration(b))!;
    expect(grupo1(/\(([\d.,]+)% do valor\)/, v.frase)).toBe('3,5');
    expect(v.criterio).toMatch(/Convenção do cupom — Simples/);
    const n = { ...b, convencaoCupom: 'ntnf' as const };
    expect(decidir('duration', n, duration(n))!.criterio).toMatch(/Convenção do cupom — NTN-F/);
  });
});

describe('N14 — decisão com TIR múltipla', () => {
  const pares: [string, number][] = [['2026-01-01', -100], ['2027-01-01', 230], ['2028-01-01', -132]];
  const bodyFluxos = pares.map(([date, amount]) => ({ date, amount }));
  const fluxos = pares.map(([s, amount]) => ({ date: d(s), amount }));

  it('V-WEB-3f: −100/+230/−132, custo 15% (VPL > 0) → verde pelo VPL, sem "NÃO cobre"', () => {
    const body = { fluxos: bodyFluxos, custoCapital: 0.15, taxaDesconto: 0.15 };
    const v = decidir('tir-vpl', body, tirVpl({ fluxos, custoCapital: 0.15, taxaDesconto: 0.15 }))!;
    expect(v.sinal).toBe('verde');
    expect(v.frase).toMatch(/TIR múltipla/);
    expect(v.frase).toMatch(/VPL ao custo de capital/);
    expect(v.frase).not.toMatch(/NÃO cobre/);
  });

  it('sem custo de capital: alerta amarelo, sem veredito', () => {
    const v = decidir('tir-vpl', { fluxos: bodyFluxos }, tirVpl({ fluxos }))!;
    expect(v.sinal).toBe('amarelo');
    expect(v.frase).toMatch(/TIR múltipla/);
  });

  it('fluxo convencional segue a leitura pela TIR', () => {
    const conv = [
      { date: d('2026-01-01'), amount: -1000 },
      { date: d('2027-01-01'), amount: 1200 },
    ];
    const v = decidir('tir-vpl', { custoCapital: 0.15 }, tirVpl({ fluxos: conv, custoCapital: 0.15 }))!;
    expect(v.sinal).toBe('verde');
    expect(v.frase).toMatch(/SUPERA o custo de capital/);
  });
});
