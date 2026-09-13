/**
 * Índice mensal + spread (Comparador: "IPCA + 1% a.m.", "INCC + 10% a.a.").
 * A taxa ao mês chega como a.a. equivalente composta com additiveBase 360 (30E/360);
 * a base do spread não altera o pro-rata do índice.
 */
import { describe, it, expect } from 'vitest';
import { calculate, IndexType, DayCountBasis } from '../src';

const d = (iso: string) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
};
const mensal = (ini: string, meses: number, taxa: number) =>
  Array.from({ length: meses }, (_, i) => ({ date: new Date(d(ini).getFullYear(), d(ini).getMonth() + i, 1), value: taxa }));

const umPorCentoAoMesEmAa = (Math.pow(1.01, 12) - 1) * 100;

describe('Índice mensal + spread ao mês (additiveBase 360)', () => {
  it('mês fechado de 31 dias rende a taxa mensal exata: IPCA 0,5% + 1% a.m. = 1,005 × 1,01', () => {
    const r = calculate({
      initialAmount: 1e6, startDate: d('2025-01-01'), endDate: d('2025-02-01'),
      indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC365,
      indexData: mensal('2025-01-01', 1, 0.5),
      spread: { mode: 'additive', value: umPorCentoAoMesEmAa, additiveBase: DayCountBasis.DC360 },
    });
    expect(r.accumulatedFactor).toBeCloseTo(1.005 * 1.01, 12);
  });

  it('12 meses: (1,005 × 1,01)^12', () => {
    const r = calculate({
      initialAmount: 1e6, startDate: d('2025-01-01'), endDate: d('2026-01-01'),
      indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC365,
      indexData: mensal('2025-01-01', 12, 0.5),
      spread: { mode: 'additive', value: umPorCentoAoMesEmAa, additiveBase: DayCountBasis.DC360 },
    });
    expect(r.accumulatedFactor).toBeCloseTo(Math.pow(1.005 * 1.01, 12), 12);
  });

  it('mês parcial: índice em dias corridos (17/31), spread em 30E/360 (16/30)', () => {
    const r = calculate({
      initialAmount: 1e6, startDate: d('2025-01-15'), endDate: d('2025-02-01'),
      indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC365,
      indexData: mensal('2025-01-01', 1, 0.5),
      spread: { mode: 'additive', value: umPorCentoAoMesEmAa, additiveBase: DayCountBasis.DC360 },
    });
    expect(r.accumulatedFactor).toBeCloseTo(Math.pow(1.005, 17 / 31) * Math.pow(1.01, 16 / 30), 12);
  });
});

describe('Índice mensal + spread ao ano (base do cálculo)', () => {
  it('INCC 0,4% + 10% a.a. em 2025 (365 dias) = 1,004^12 × 1,10', () => {
    const r = calculate({
      initialAmount: 1e6, startDate: d('2025-01-01'), endDate: d('2026-01-01'),
      indexType: IndexType.INCC, dayCountBasis: DayCountBasis.DC365,
      indexData: mensal('2025-01-01', 12, 0.4),
      spread: { mode: 'additive', value: 10 },
    });
    expect(r.accumulatedFactor).toBeCloseTo(Math.pow(1.004, 12) * 1.1, 12);
  });

  it('additiveBase 252 não se aplica a índice mensal: segue a base do cálculo', () => {
    const base = {
      initialAmount: 1e6, startDate: d('2025-01-15'), endDate: d('2025-04-10'),
      indexType: IndexType.IGPM, dayCountBasis: DayCountBasis.DC365,
      indexData: mensal('2025-01-01', 4, 0.3),
    };
    const semBase = calculate({ ...base, spread: { mode: 'additive', value: 6 } });
    const com252 = calculate({ ...base, spread: { mode: 'additive', value: 6, additiveBase: DayCountBasis.DU252 } });
    expect(com252.accumulatedFactor).toBe(semBase.accumulatedFactor);
  });
});
