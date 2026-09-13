/**
 * Fluxo Completo (T4): parcelas não mensais, datas ancoradas no fim do mês (C15)
 * e comparação SAC × Price × Bullet. Cobre o que a antiga "Amortização (Price & SAC)"
 * da Tesouraria fazia: mesma tabela para a mesma taxa por período.
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculate } from '../src/services/CalculationEngine';
import { amortizacao } from '../src/treasury';
import {
  AmortizationSystem,
  CalculationInput,
  DayCountBasis,
  GracePeriodType,
  IndexType,
  PeriodicityType,
  ThesisType,
} from '../src/models/types';

const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

function pmt(rate: Decimal, n: number, pv: Decimal): Decimal {
  return pv.mul(rate).div(new Decimal(1).minus(rate.plus(1).pow(-n)));
}

function t4(sistema: AmortizationSystem, extra: Partial<CalculationInput> = {}): CalculationInput {
  return {
    initialAmount: 100000,
    startDate: new Date(2025, 0, 15),
    endDate: new Date(2025, 0, 15),
    indexType: IndexType.PREFIXADA,
    dayCountBasis: DayCountBasis.DC365,
    thesisType: ThesisType.FLUXO_COMPLETO,
    amortizationSystem: sistema,
    remunerationRate: 12,
    numberOfPeriods: 12,
    ...extra,
  };
}

describe('Fluxo Completo — periodicidade das parcelas', () => {
  it('trimestral Price: taxa 1,12^(3/12) − 1, parcela = pmt(i_t, 4, P), datas a cada 3 meses', () => {
    const r = calculate(t4(AmortizationSystem.PRICE, { numberOfPeriods: 4, installmentPeriodicity: PeriodicityType.QUARTERLY })).fullFlowResult!;
    const it = new Decimal('1.12').pow(new Decimal(3).div(12)).minus(1);
    expect(r.periodicity).toBe(PeriodicityType.QUARTERLY);
    expect(r.periodRate).toBeCloseTo(it.mul(100).toNumber(), 10);
    expect(r.rows[0].totalPayment).toBeCloseTo(pmt(it, 4, new Decimal(100000)).toNumber(), 6);
    expect(r.rows.map(x => iso(x.date))).toEqual(['2025-04-15', '2025-07-15', '2025-10-15', '2026-01-15']);
    expect(Math.abs(r.rows[3].closingBalance)).toBeLessThan(0.01);
  });

  it('semestral SAC com carência A de 1 semestre: amortiza P·(1 + i_s) em 3 semestres', () => {
    const r = calculate(t4(AmortizationSystem.SAC, {
      numberOfPeriods: 4,
      installmentPeriodicity: PeriodicityType.SEMIANNUAL,
      gracePeriod: { type: GracePeriodType.A, endDate: new Date(2025, 6, 15) },
    })).fullFlowResult!;
    const is = Math.pow(1.12, 0.5) - 1;
    expect(r.rows[0].isGracePeriod).toBe(true);
    expect(r.totalAmortized).toBeCloseTo(100000 * (1 + is), 6);
    expect(r.rows[1].amortization).toBeCloseTo(100000 * (1 + is) / 3, 6);
  });

  it('carência que não fecha em períodos (4 meses com parcela trimestral) é recusada', () => {
    expect(() => calculate(t4(AmortizationSystem.PRICE, {
      numberOfPeriods: 4,
      installmentPeriodicity: PeriodicityType.QUARTERLY,
      gracePeriod: { type: GracePeriodType.A, endDate: new Date(2025, 4, 15) },
    }))).toThrow(/Use um múltiplo de 3/);
  });

  it('C15 (V-T4-5a): início em 31/01 → 28/02, 31/03, 30/04', () => {
    const r = calculate(t4(AmortizationSystem.SAC, { startDate: new Date(2025, 0, 31), numberOfPeriods: 3 })).fullFlowResult!;
    expect(r.rows.map(x => iso(x.date))).toEqual(['2025-02-28', '2025-03-31', '2025-04-30']);
  });
});

describe('Fluxo Completo — comparação entre sistemas', () => {
  it('traz SAC, Price e Bullet; o sistema escolhido bate com os totais do cronograma', () => {
    const res = calculate(t4(AmortizationSystem.PRICE)).fullFlowResult!;
    const comp = res.comparison!;
    expect(comp.map(c => c.system)).toEqual([AmortizationSystem.SAC, AmortizationSystem.PRICE, AmortizationSystem.BULLET]);
    const price = comp.find(c => c.system === AmortizationSystem.PRICE)!;
    const sac = comp.find(c => c.system === AmortizationSystem.SAC)!;
    const bullet = comp.find(c => c.system === AmortizationSystem.BULLET)!;
    expect(price.totalInterest).toBe(res.totalInterest);
    expect(price.totalPayments).toBe(res.totalPayments);
    // Price paga mais juros que SAC e tem 1ª parcela menor; Bullet paga mais juros de todos
    expect(price.totalInterest).toBeGreaterThan(sac.totalInterest);
    expect(price.firstPayment).toBeLessThan(sac.firstPayment);
    expect(bullet.totalInterest).toBeGreaterThan(price.totalInterest);
    expect(bullet.lastPayment).toBeGreaterThan(100000);
  });

  it('cobre a antiga Amortização da Tesouraria: 1,2% a.m., 36 parcelas, 1 mi → mesma parcela e mesmos juros', () => {
    const tes = amortizacao({ principal: 1_000_000, i: 0.012, n: 36 });
    const taxaAa = (Math.pow(1.012, 12) - 1) * 100;
    const comp = calculate(t4(AmortizationSystem.SAC, { initialAmount: 1_000_000, remunerationRate: taxaAa, numberOfPeriods: 36 }))
      .fullFlowResult!.comparison!;
    const price = comp.find(c => c.system === AmortizationSystem.PRICE)!;
    const sac = comp.find(c => c.system === AmortizationSystem.SAC)!;
    expect(price.firstPayment).toBeCloseTo(tes.price.pmt!, 6);
    expect(price.totalInterest).toBeCloseTo(tes.price.totalJuros, 5);
    expect(sac.firstPayment).toBeCloseTo(tes.sac.parcelas[0].parcela, 6);
    expect(sac.totalInterest).toBeCloseTo(tes.sac.totalJuros, 5);
  });
});
