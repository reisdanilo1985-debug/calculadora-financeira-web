/**
 * Valor Presente (T2): fluxos com sinal, TIR e perpetuidade (Gordon).
 * Referências fechadas: Gordon (PV = FC / (r − g)), XIRR do exemplo da documentação do Excel.
 */
import { describe, it, expect } from 'vitest';
import { calculate, CalculationInput, DayCountBasis, IndexType, PeriodicityType, ThesisType } from '../src';

const d = (iso: string) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
};

const t2 = (
  ref: string,
  fluxos: [string, number][],
  taxa: number,
  basis: DayCountBasis = DayCountBasis.DC365,
  extra: Partial<CalculationInput> = {}
): CalculationInput => ({
  initialAmount: 0,
  startDate: d(ref),
  endDate: d(ref),
  indexType: IndexType.PREFIXADA,
  dayCountBasis: basis,
  thesisType: ThesisType.VALOR_PRESENTE,
  cashFlows: fluxos.map(([data, valor]) => ({ date: d(data), amount: valor })),
  discountRate: taxa,
  referenceDate: d(ref),
  ...extra,
});

describe('Valor Presente — fluxos com sinal', () => {
  it('fluxo na data de referência entra com t = 0', () => {
    const r = calculate(t2('2025-01-01', [['2025-01-01', 1000], ['2026-01-01', 1000]], 10));
    expect(r.finalAmount).toBeCloseTo(1000 + 1000 / 1.1, 8);
  });

  it('fluxo anterior à data de referência é recusado', () => {
    expect(() => calculate(t2('2025-01-02', [['2025-01-01', 1000]], 10))).toThrow(/anterior à data de referência/);
  });

  it('investimento e retorno: VPL a 10% = 0 e TIR = 10% a.a.', () => {
    const r = calculate(t2('2025-01-01', [['2025-01-01', -1000], ['2026-01-01', 1100]], 10));
    const dcf = r.dcfResult!;
    expect(dcf.totalPV).toBeCloseTo(0, 8);
    expect(dcf.irr).toBeCloseTo(10, 8);
    expect(dcf.irrMonthly).toBeCloseTo((Math.pow(1.1, 1 / 12) - 1) * 100, 8);
    expect(dcf.irrWarning).toBeUndefined();
    expect(dcf.macaulayDuration).toBeNull();
  });

  it('XIRR do exemplo do Excel = 37,3362535% (base 365)', () => {
    const r = calculate(t2('2008-01-01', [
      ['2008-01-01', -10000], ['2008-03-01', 2750], ['2008-10-30', 4250], ['2009-02-15', 3250], ['2009-04-01', 2750],
    ], 9));
    expect(r.dcfResult!.irr).toBeCloseTo(37.3362535, 6);
    // XNPV do mesmo exemplo a 9%
    expect(r.finalAmount).toBeCloseTo(2086.647602, 5);
  });

  it('TIR múltipla (−100, +230, −132): 10% e 20%, com aviso', () => {
    const r = calculate(t2('2025-01-01', [['2025-01-01', -100], ['2026-01-01', 230], ['2027-01-01', -132]], 12));
    const dcf = r.dcfResult!;
    expect(dcf.irrs).toHaveLength(2);
    expect(dcf.irrs![0]).toBeCloseTo(10, 8);
    expect(dcf.irrs![1]).toBeCloseTo(20, 8);
    expect(dcf.irr).toBeCloseTo(10, 8);
    expect(dcf.signChanges).toBe(2);
    expect(dcf.irrWarning).toMatch(/TIR múltipla/);
  });

  it('só entradas: sem TIR e sem aviso; duration de fluxo único em 730 dias = 2', () => {
    const r = calculate(t2('2025-01-01', [['2027-01-01', 1000]], 10));
    expect(r.dcfResult!.irr).toBeUndefined();
    expect(r.dcfResult!.irrWarning).toBeUndefined();
    expect(r.dcfResult!.macaulayDuration).toBeCloseTo(2, 12);
  });

  it('fluxos fora de ordem saem ordenados por data', () => {
    const r = calculate(t2('2025-01-01', [['2027-01-01', 1000], ['2026-01-01', 500]], 10));
    expect(r.dcfResult!.flows.map(f => f.nominalAmount)).toEqual([500, 1000]);
  });
});

describe('Valor Presente — perpetuidade (Gordon)', () => {
  const perp = (growthRate: number, periodicity = PeriodicityType.ANNUAL, baseCashFlow?: number) =>
    ({ perpetuity: { growthRate, periodicity, baseCashFlow } });

  it('anual: FC 100 em 1 ano, r 10%, g 2% → VP total = 100 / (0,10 − 0,02) = 1.250', () => {
    const r = calculate(t2('2025-01-01', [['2026-01-01', 100]], 10, DayCountBasis.DC365, perp(2)));
    const dcf = r.dcfResult!;
    expect(dcf.terminalValue!.nominalValue).toBeCloseTo(100 * 1.02 / 0.08, 8);
    expect(dcf.terminalValue!.pv).toBeCloseTo(1275 / 1.1, 8);
    expect(dcf.explicitPV).toBeCloseTo(100 / 1.1, 8);
    expect(dcf.totalPV).toBeCloseTo(1250, 8);
    expect(r.finalAmount).toBeCloseTo(1250, 8);
    expect(dcf.terminalValue!.contributionPercent).toBeCloseTo((1275 / 1.1) / 1250 * 100, 8);
    // Duration de perpetuidade crescente a partir de t0: (1 + r) / (r − g) = 13,75 anos
    expect(dcf.macaulayDuration).toBeCloseTo(1.1 / 0.08, 8);
  });

  it('mensal em base 360: FC 10 em 30 dias, r 12% a.a., g 0 → VP = 10 / r_mensal', () => {
    const r = calculate(t2('2025-01-01', [['2025-01-31', 10]], 12, DayCountBasis.DC360, perp(0, PeriodicityType.MONTHLY)));
    const rm = Math.pow(1.12, 1 / 12) - 1;
    expect(r.dcfResult!.terminalValue!.periodDiscountRate).toBeCloseTo(rm * 100, 10);
    expect(r.finalAmount).toBeCloseTo(10 / rm, 6);
  });

  it('fluxo base informado substitui o último fluxo', () => {
    const r = calculate(t2('2025-01-01', [['2026-01-01', 100]], 10, DayCountBasis.DC365, perp(2, PeriodicityType.ANNUAL, 200)));
    expect(r.dcfResult!.terminalValue!.nominalValue).toBeCloseTo(200 * 1.02 / 0.08, 8);
  });

  it('crescimento maior ou igual à taxa de desconto é recusado', () => {
    expect(() => calculate(t2('2025-01-01', [['2026-01-01', 100]], 5, DayCountBasis.DC365, perp(5)))).toThrow(/maior que o crescimento/);
  });

  it('TIR com perpetuidade: pagar 1.250 por FC 100 crescendo 2% a.a. rende 10% a.a.', () => {
    const r = calculate(t2('2025-01-01', [['2025-01-01', -1250], ['2026-01-01', 100]], 14, DayCountBasis.DC365, perp(2)));
    const dcf = r.dcfResult!;
    expect(dcf.irr).toBeCloseTo(10, 7);
    expect(dcf.irrs).toHaveLength(1);
    expect(dcf.totalPV).toBeLessThan(0); // a 14% a.a. o preço pago destrói valor
  });
});
