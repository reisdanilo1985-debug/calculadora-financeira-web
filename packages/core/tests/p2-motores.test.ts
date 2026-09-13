/**
 * Regressão das correções P2 da auditoria de set/2026 nos motores da Calculadora.
 * Valores esperados do oráculo independente da auditoria (Python decimal, precisão 50).
 */
import { describe, it, expect } from 'vitest';
import {
  calculate,
  expandPeriodicAmortizations,
  getPremisesRequiredFrom,
  CalculationInput,
  IndexType,
  DayCountBasis,
  AmortizationType,
  GracePeriodType,
  InterestType,
  PeriodicityType,
  ThesisType,
} from '../src';

const d = (iso: string) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
};
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const diario = (ini: string, fim: string, taxa: number) => {
  const out: { date: Date; value: number }[] = [];
  for (let x = d(ini); x < d(fim); x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1)) out.push({ date: new Date(x), value: taxa });
  return out;
};

describe('C04 — base 360 dos índices mensais', () => {
  it('mês fechado usa o fator mensal integral: IPCA jan/2025 1% = 1.010.000', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2025-01-01'), endDate: d('2025-02-01'), indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC360, indexData: [{ date: d('2025-01-01'), value: 1 }] });
    expect(r.finalAmount).toBeCloseTo(1010000, 2);
  });

  it('fevereiro de 29 dias em base 360 = fator 1,01', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2024-02-01'), endDate: d('2024-03-01'), indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC360, indexData: [{ date: d('2024-02-01'), value: 1 }] });
    expect(r.accumulatedFactor).toBeCloseTo(1.01, 10);
  });

  it('mês parcial em 30/360: 15/01→01/02 = 1,01^(16/30)', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2025-01-15'), endDate: d('2025-02-01'), indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC360, indexData: [{ date: d('2025-01-01'), value: 1 }] });
    expect(r.accumulatedFactor).toBeCloseTo(Math.pow(1.01, 16 / 30), 10);
  });
});

describe('C14 — premissas por competência nos índices mensais', () => {
  it('observação de janeiro (datada 01/01) cobre o mês inteiro', () => {
    expect(getPremisesRequiredFrom(d('2025-02-01'), [{ date: d('2025-01-01') }], IndexType.IPCA)).toBeNull();
    expect(getPremisesRequiredFrom(d('2025-01-31'), [{ date: d('2025-01-01') }], IndexType.IPCA)).toBeNull();
  });

  it('sem indexType, série só com dia 1 é tratada como mensal', () => {
    expect(getPremisesRequiredFrom(d('2025-01-01'), [{ date: d('2024-11-01') }, { date: d('2024-12-01') }])).toBeNull();
  });

  it('mês seguinte sem observação exige premissa a partir do dia 1', () => {
    const r = getPremisesRequiredFrom(d('2025-03-15'), [{ date: d('2025-01-01') }], IndexType.IPCA);
    expect(r && iso(r)).toBe('2025-02-01');
  });

  it('CDI: fim de semana depois do último dado não exige premissa', () => {
    // dado até sexta 12/09/2025; fim na segunda 15/09 (exclusiva)
    expect(getPremisesRequiredFrom(d('2025-09-15'), [{ date: d('2025-09-12') }], IndexType.CDI)).toBeNull();
    const r = getPremisesRequiredFrom(d('2025-09-17'), [{ date: d('2025-09-12') }], IndexType.CDI);
    expect(r && iso(r)).toBe('2025-09-15');
  });
});

describe('C12/N08 — juros T5 até a data final', () => {
  const t5 = (fim: string, taxa: number, tipo: InterestType, basis: DayCountBasis, extra: Partial<CalculationInput> = {}): CalculationInput => ({
    initialAmount: 1e6, startDate: d('2025-01-02'), endDate: d(fim), indexType: IndexType.CDI, dayCountBasis: basis,
    indexData: diario('2025-01-02', fim, 0), thesisType: ThesisType.CORRECAO_COM_JUROS, interestRate: taxa, interestType: tipo, ...extra,
  });

  it('1 dia útil com juros compostos 10% base 252 = 1e6 × 1,1^(1/252)', () => {
    expect(calculate(t5('2025-01-03', 10, InterestType.COMPOSTA, DayCountBasis.DU252)).finalAmount).toBeCloseTo(1e6 * Math.pow(1.1, 1 / 252), 2);
  });

  it('juros simples 10% base 365 até sexta 02/01/2026 = 1.100.000,00', () => {
    expect(calculate(t5('2026-01-02', 10, InterestType.SIMPLES, DayCountBasis.DC365)).finalAmount).toBeCloseTo(1100000, 2);
  });

  it('juros simples até segunda 05/01/2026 contam os 368 dias', () => {
    expect(calculate(t5('2026-01-05', 10, InterestType.SIMPLES, DayCountBasis.DC365)).finalAmount).toBeCloseTo(1e6 + 1e5 * 368 / 365, 2);
  });

  it('com amortização de 50%, juros simples seguem sobre o principal remanescente', () => {
    const r = calculate(t5('2026-01-02', 10, InterestType.SIMPLES, DayCountBasis.DC365, { amortizations: [{ date: d('2025-07-02'), type: AmortizationType.PERCENTAGE, value: 50 }] }));
    const d1 = 181; // 02/01/2025 → 02/07/2025
    const d2 = 184; // 02/07/2025 → 02/01/2026
    const b1 = 1e6 + 1e5 * d1 / 365;
    expect(r.finalAmount).toBeCloseTo(b1 / 2 + 5e5 * 0.1 * d2 / 365, 2);
  });
});

describe('N21 — amortização em D deixa de render a partir de D (B3)', () => {
  const tdi = Math.pow(1.1, 1 / 252) - 1;
  const cdi10 = (extra: Partial<CalculationInput>): CalculationInput => ({
    initialAmount: 1e6, startDate: d('2023-01-02'), endDate: d('2024-01-05'), indexType: IndexType.CDI, dayCountBasis: DayCountBasis.DU252,
    indexData: diario('2023-01-02', '2024-01-05', 10), ...extra,
  });

  it('amortização na terça 04/04/2023 = 992.630,67', () => {
    const r = calculate(cdi10({ amortizations: [{ date: d('2023-04-04'), type: AmortizationType.FIXED, value: 100000 }] }));
    expect(r.finalAmount).toBeCloseTo(992630.6665083655, 2);
  });

  it('amortização no sábado 01/04/2023 vale na segunda 03/04, sem acúmulo extra = 992.590,05', () => {
    const r = calculate(cdi10({ amortizations: [{ date: d('2023-04-01'), type: AmortizationType.FIXED, value: 100000 }] }));
    expect(r.finalAmount).toBeCloseTo(992590.0501356059, 2);
  });

  it('carência A com amortização na carência segue a mesma regra', () => {
    const r = calculate(cdi10({ thesisType: ThesisType.CORRECAO_COM_CARENCIA, gracePeriod: { type: GracePeriodType.A, endDate: d('2023-07-03') }, amortizations: [{ date: d('2023-04-04'), type: AmortizationType.FIXED, value: 100000 }] }));
    expect(r.finalAmount).toBeCloseTo(992630.6665083655, 2);
    expect(tdi).toBeGreaterThan(0);
  });
});

describe('E09 / C15 — expansão de amortizações periódicas', () => {
  it('periodicidade desconhecida lança erro em vez de travar', () => {
    const t0 = Date.now();
    expect(() => expandPeriodicAmortizations([{ date: d('2025-01-06'), type: AmortizationType.PERIODIC, value: 1, periodicity: 'WEEKLY' as PeriodicityType, periodicEndDate: d('2025-03-06') }])).toThrow('Periodicidade inválida');
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it('âncora no dia original com ajuste ao fim do mês: 31/01 → 28/02 → 31/03 → 30/04', () => {
    const datas = expandPeriodicAmortizations([{ date: d('2025-01-31'), type: AmortizationType.PERIODIC, value: 1, periodicity: PeriodicityType.MONTHLY, periodicEndDate: d('2025-04-30') }]).map(a => iso(a.date));
    expect(datas).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
  });

  it('29/02 anual cai em 28/02 nos anos não bissextos', () => {
    const datas = expandPeriodicAmortizations([{ date: d('2024-02-29'), type: AmortizationType.PERIODIC, value: 1, periodicity: PeriodicityType.ANNUAL, periodicEndDate: d('2026-03-01') }]).map(a => iso(a.date));
    expect(datas).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });
});
