/**
 * F2-04 (auditoria 2026-09-12, caso V-DUR-5a) — duration sem limite de n.
 *
 * Antes: n = 100.000 levava ~12 s e n = 1.000.000 passava de 10 s, bloqueando o
 * event loop. Agora o core rejeita, de imediato e com mensagem em pt-BR, n fora
 * de 1..1200 e m (pagamentos/ano) fora de 1..365 — inclusive valores não
 * inteiros/não finitos — sem alterar os casos normais.
 */

import { describe, it, expect } from 'vitest';
import { duration } from '../../src/treasury';

const BOND = { face: 1000, couponRateAnnual: 0.1, ytm: 0.13, m: 2, n: 10 };

describe('duration — limites de n e m (F2-04)', () => {
  it('V-DUR-5a: n = 1.000.000 lança erro imediato com mensagem sobre o limite', () => {
    const t0 = Date.now();
    expect(() => duration({ ...BOND, n: 1e6 })).toThrow(/n \(número de períodos\).*entre 1 e 1200/);
    expect(Date.now() - t0).toBeLessThan(100);
  });

  it('n = 100.000 (caso de ~12 s antes da correção) também é rejeitado', () => {
    expect(() => duration({ ...BOND, n: 100_000 })).toThrow(/entre 1 e 1200/);
  });

  it('fronteira: n = 1200 é aceito (e rápido); n = 1201 é rejeitado', () => {
    const t0 = Date.now();
    const r = duration({ ...BOND, n: 1200 });
    const ms = Date.now() - t0;
    expect(Number.isFinite(r.preco)).toBe(true);
    expect(r.preco).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000); // ~0,1 s medido; folga para máquinas lentas/CI
    expect(() => duration({ ...BOND, n: 1201 })).toThrow(/entre 1 e 1200/);
  });

  it.each([0, -1, 10.5, Number.NaN, Number.POSITIVE_INFINITY])('n inválido (%s) é rejeitado', n => {
    expect(() => duration({ ...BOND, n })).toThrow(/duration: n/);
  });

  it.each([0, -2, 0.5, 2.5, 366, 1e9, Number.NaN])('m inválido (%s) é rejeitado', m => {
    expect(() => duration({ ...BOND, m })).toThrow(/duration: m \(pagamentos por ano\).*entre 1 e 365/);
  });

  it('fronteiras de m: 1 e 365 são aceitos', () => {
    expect(Number.isFinite(duration({ ...BOND, m: 1 }).preco)).toBe(true);
    expect(Number.isFinite(duration({ ...BOND, m: 365 }).preco)).toBe(true);
  });

  it('caso normal inalterado (título 10% m2 n10 YTM 13%)', () => {
    const r = duration(BOND);
    // Mesmas âncoras do golden (treasury.golden.test.ts) — valores do regime efetivo anual.
    expect(Math.abs(r.macaulayDuration - 3.998)).toBeLessThanOrEqual(5e-3);
    expect(Math.abs(r.modifiedDuration - 3.5382)).toBeLessThanOrEqual(5e-4);
  });

  it('zero cupom, m = 1, n = 2 → Macaulay = 2 (caso de borda válido segue aceito)', () => {
    const r = duration({ face: 1000, couponRateAnnual: 0, ytm: 0.1, m: 1, n: 2 });
    expect(Math.abs(r.macaulayDuration - 2)).toBeLessThan(1e-12);
  });
});
