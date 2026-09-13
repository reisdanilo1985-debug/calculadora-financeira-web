/**
 * Regressão das correções P1 da auditoria de set/2026 nos motores de índice.
 * Valores esperados do oráculo independente da auditoria (Python decimal, precisão 50).
 */
import { describe, it, expect } from 'vitest';
import {
  calculate,
  calculateCDI,
  countBusinessDays,
  isBusinessDay,
  getBusinessDaysBetween,
  MissingIndexDataError,
  CalculationInput,
  IndexType,
  DayCountBasis,
  AmortizationType,
  FlowDirection,
  GracePeriodType,
  PeriodicityType,
  ThesisType,
} from '../src';

const d = (iso: string) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
};

/** Taxa constante em todos os dias corridos de [ini, fim) */
const diario = (ini: string, fim: string, taxa: number, excluir: string[] = []) => {
  const out: { date: Date; value: number }[] = [];
  for (let x = d(ini); x < d(fim); x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1)) {
    const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    if (!excluir.includes(iso)) out.push({ date: new Date(x), value: taxa });
  }
  return out;
};

// Janela sintética de 252 dias úteis sem 20/11 (02/01/2023 → 05/01/2024, 368 dias corridos)
const cdiBase = (extra: Partial<CalculationInput> = {}): CalculationInput => ({
  initialAmount: 1e6,
  startDate: d('2023-01-02'),
  endDate: d('2024-01-05'),
  indexType: IndexType.CDI,
  dayCountBasis: DayCountBasis.DU252,
  indexData: diario('2023-01-02', '2024-01-05', 10),
  ...extra,
});

describe('C03 — calendário com 20/11 (Lei 14.759/2023)', () => {
  it('20/11 é feriado a partir de 2024 e dia útil antes', () => {
    expect(isBusinessDay(d('2023-11-20'))).toBe(true);
    expect(isBusinessDay(d('2024-11-20'))).toBe(false);
    expect(isBusinessDay(d('2025-11-20'))).toBe(false);
    expect(isBusinessDay(d('2026-11-20'))).toBe(false);
  });

  it('dias úteis por ano: 2024 = 253, 2025 = 252, 2026 = 249', () => {
    expect(countBusinessDays(d('2024-01-01'), d('2025-01-01'))).toBe(253);
    expect(countBusinessDays(d('2025-01-01'), d('2026-01-01'))).toBe(252);
    expect(countBusinessDays(d('2026-01-01'), d('2027-01-01'))).toBe(249);
  });

  it('19/11→22/11/2025 tem só 19 e 21', () => {
    expect(getBusinessDaysBetween(d('2025-11-19'), d('2025-11-22')).map(x => x.getDate())).toEqual([19, 21]);
  });

  it('pré 12% base 252 em 02/01/2025→02/01/2026 (252 du) = 1.120,00', () => {
    const r = calculate({ initialAmount: 1000, startDate: d('2025-01-02'), endDate: d('2026-01-02'), indexType: IndexType.PREFIXADA, dayCountBasis: DayCountBasis.DU252, prefixedRate: 12 });
    expect(r.finalAmount).toBeCloseTo(1120, 5);
  });
});

describe('C01 — % do CDI incide sobre a taxa diária (B3)', () => {
  it('110% do CDI de 10% a.a. em 252 du = 1.110.532,04', () => {
    const r = calculate(cdiBase({ spread: { mode: 'percentage', value: 110 } }));
    expect(r.finalAmount).toBeCloseTo(1110532.0396161103, 2);
  });
});

describe('C02 — spread aditivo e composição', () => {
  it('CDI + 2% a.a. base 252 = 1.122.000,00', () => {
    const r = calculate(cdiBase({ spread: { mode: 'additive', value: 2, additiveBase: DayCountBasis.DU252 } }));
    expect(r.finalAmount).toBeCloseTo(1122000, 2);
  });

  it('CDI + 2% a.a. sem base (padrão 365 dias corridos) = 1.122.182,63', () => {
    const r = calculate(cdiBase({ spread: { mode: 'additive', value: 2 } }));
    expect(r.finalAmount).toBeCloseTo(1122182.6330637082, 2);
  });

  it('Selic Over + 2% a.a. base 252 = 1.122.000,00', () => {
    const r = calculate(cdiBase({ indexType: IndexType.SELIC_OVER, spread: { mode: 'additive', value: 2, additiveBase: 252 as DayCountBasis } }));
    expect(r.finalAmount).toBeCloseTo(1122000, 2);
  });

  it('SOFR 12% + 1% a.a., sexta→segunda = 1e6 × (1 + 0,13 × 3/360)', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2025-01-03'), endDate: d('2025-01-06'), indexType: IndexType.SOFR, dayCountBasis: DayCountBasis.DC360, indexData: [{ date: d('2025-01-03'), value: 12 }], spread: { mode: 'additive', value: 1 } });
    expect(r.finalAmount).toBeCloseTo(1001083.3333333334, 2);
  });

  it('SOFR 12% com 110%, sexta→segunda = 1.001.100,00', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2025-01-03'), endDate: d('2025-01-06'), indexType: IndexType.SOFR, dayCountBasis: DayCountBasis.DC360, indexData: [{ date: d('2025-01-03'), value: 12 }], spread: { mode: 'percentage', value: 110 } });
    expect(r.finalAmount).toBeCloseTo(1001100, 2);
  });

  it('IPCA 1% com 110% do índice = 1.011.000,00', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2025-01-01'), endDate: d('2025-02-01'), indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC365, indexData: [{ date: d('2025-01-01'), value: 1 }], spread: { mode: 'percentage', value: 110 } });
    expect(r.finalAmount).toBeCloseTo(1011000, 2);
  });
});

describe('C05/C06 — SOFR não capitaliza no fim de semana e herda a taxa vigente', () => {
  it('sexta→segunda com 12% = 1e6 × (1 + 0,12 × 3/360)', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2025-01-03'), endDate: d('2025-01-06'), indexType: IndexType.SOFR, dayCountBasis: DayCountBasis.DC360, indexData: [{ date: d('2025-01-03'), value: 12 }] });
    expect(r.finalAmount).toBeCloseTo(1001000, 4);
  });

  it('início no sábado usa a taxa de sexta = 1.000.666,67', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2025-01-04'), endDate: d('2025-01-06'), indexType: IndexType.SOFR, dayCountBasis: DayCountBasis.DC360, indexData: [{ date: d('2025-01-03'), value: 12 }] });
    expect(r.finalAmount).toBeCloseTo(1000666.6666666666, 4);
  });
});

describe('C13 — lacuna de dado não vira 0%', () => {
  it('CDI com um dia útil sem dado nem premissa lança MissingIndexDataError', () => {
    expect(() => calculate(cdiBase({ indexData: diario('2023-01-02', '2024-01-05', 10, ['2023-03-15']) })))
      .toThrow(MissingIndexDataError);
  });

  it('a mensagem cita o intervalo sem dado', () => {
    try {
      calculateCDI(cdiBase({ indexData: diario('2023-01-02', '2024-01-05', 10, ['2023-03-15']) }));
      expect.unreachable();
    } catch (e: any) {
      expect(e.message).toContain('15/03/2023');
      expect(e.intervalos).toHaveLength(1);
    }
  });

  it('premissa que cobre só parte da lacuna ainda lança erro', () => {
    expect(() => calculate({ initialAmount: 1e6, startDate: d('2023-06-01'), endDate: d('2023-07-31'), indexType: IndexType.CDI, dayCountBasis: DayCountBasis.DU252, indexData: diario('2023-06-01', '2023-07-01', 10), futurePremises: [{ startDate: d('2023-07-01'), endDate: d('2023-07-10'), rate: 10 }] }))
      .toThrow(MissingIndexDataError);
  });

  it('IPCA com mês sem dado lança erro; com premissa calcula', () => {
    const base = { initialAmount: 1000, startDate: d('2025-01-01'), endDate: d('2025-03-01'), indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC365, indexData: [{ date: d('2025-01-01'), value: 1 }] };
    expect(() => calculate(base)).toThrow(MissingIndexDataError);
    const r = calculate({ ...base, futurePremises: [{ startDate: d('2025-02-01'), endDate: d('2025-02-28'), rate: 1 }] });
    expect(r.finalAmount).toBeCloseTo(1020.1, 6);
    expect(r.hasProjections).toBe(true);
  });

  it('SOFR sem publicação por mais de 4 dias lança erro', () => {
    expect(() => calculate({ initialAmount: 1e6, startDate: d('2025-01-03'), endDate: d('2025-01-20'), indexType: IndexType.SOFR, dayCountBasis: DayCountBasis.DC360, indexData: [{ date: d('2025-01-03'), value: 12 }] }))
      .toThrow(MissingIndexDataError);
  });

  it('dados completos de 2024 não marcam projeção', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2024-01-02'), endDate: d('2025-01-02'), indexType: IndexType.CDI, dayCountBasis: DayCountBasis.DU252, indexData: getBusinessDaysBetween(d('2024-01-02'), d('2025-01-02')).map(x => ({ date: x, value: 11 })) });
    expect(r.hasProjections).toBe(false);
  });
});

describe('C16 — aporte (direction IN) soma ao saldo', () => {
  const cdi0 = (amorts: CalculationInput['amortizations'], fim = '2025-01-10') => ({
    initialAmount: 1000, startDate: d('2025-01-02'), endDate: d(fim), indexType: IndexType.CDI, dayCountBasis: DayCountBasis.DU252,
    indexData: diario('2025-01-02', fim, 0), amortizations: amorts,
  });

  it('aporte de 100 sobre 1.000 = 1.100', () => {
    const r = calculate(cdi0([{ date: d('2025-01-06'), type: AmortizationType.FIXED, value: 100, direction: FlowDirection.IN }]));
    expect(r.finalAmount).toBeCloseTo(1100, 6);
    expect(r.totalContributed).toBeCloseTo(100, 6);
    expect(r.totalAmortized).toBe(0);
  });

  it('aporte de 100 e amortização de 50 na mesma data = 1.050', () => {
    const r = calculate(cdi0([
      { date: d('2025-01-06'), type: AmortizationType.FIXED, value: 100, direction: FlowDirection.IN },
      { date: d('2025-01-06'), type: AmortizationType.FIXED, value: 50, direction: FlowDirection.OUT },
    ]));
    expect(r.finalAmount).toBeCloseTo(1050, 6);
  });

  it('aporte periódico mensal de 100 × 3 = 1.300; percentual trimestral de 10% × 3 = 1.331', () => {
    expect(calculate(cdi0([{ date: d('2025-01-06'), type: AmortizationType.PERIODIC, value: 100, periodicity: PeriodicityType.MONTHLY, periodicEndDate: d('2025-03-06'), direction: FlowDirection.IN }], '2025-03-10')).finalAmount).toBeCloseTo(1300, 6);
    expect(calculate(cdi0([{ date: d('2025-04-02'), type: AmortizationType.PERIODIC, value: 10, periodicity: PeriodicityType.QUARTERLY, periodicEndDate: d('2025-10-02'), isPeriodicPercentage: true, direction: FlowDirection.IN }], '2025-10-10')).finalAmount).toBeCloseTo(1331, 6);
  });

  it('sem direction continua sendo amortização', () => {
    expect(calculate(cdi0([{ date: d('2025-01-06'), type: AmortizationType.FIXED, value: 100 }])).finalAmount).toBeCloseTo(900, 6);
  });
});

describe('C17/N07 — índice mensal + spread e amortizações', () => {
  it('amortização na data final aplicada uma vez (IPCA 0% + 10% a.a.) = 908,13', () => {
    const r = calculate({ initialAmount: 1000, startDate: d('2025-01-01'), endDate: d('2025-02-01'), indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC365, indexData: [{ date: d('2025-01-01'), value: 0 }], spread: { mode: 'additive', value: 10 }, amortizations: [{ date: d('2025-02-01'), type: AmortizationType.FIXED, value: 100 }] });
    expect(r.finalAmount).toBeCloseTo(908.127688966854, 5);
    expect(r.totalAmortized).toBeCloseTo(100, 6);
  });

  it('amortização intermediária deixa de render o spread a partir do evento = 575,39', () => {
    const r = calculate({ initialAmount: 1000, startDate: d('2025-01-01'), endDate: d('2026-01-01'), indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC365, indexData: Array.from({ length: 12 }, (_, i) => ({ date: new Date(2025, i, 1), value: 0 })), spread: { mode: 'additive', value: 10 }, amortizations: [{ date: d('2025-07-01'), type: AmortizationType.FIXED, value: 500 }] });
    expect(r.finalAmount).toBeCloseTo(575.3901339847971, 5);
  });
});

describe('F1-01/F1-02 — carência B', () => {
  const t3 = (extra: Partial<CalculationInput> = {}): CalculationInput => cdiBase({
    thesisType: ThesisType.CORRECAO_COM_CARENCIA,
    gracePeriod: { type: GracePeriodType.B, endDate: d('2023-07-03') },
    ...extra,
  });

  it('o dia do término da carência já rende (128 du após a carência)', () => {
    expect(calculate(t3()).finalAmount).toBeCloseTo(1049602.4987782652, 2);
  });

  it('amortização dentro da carência reduz o principal congelado = 944.642,25', () => {
    const r = calculate(t3({ amortizations: [{ date: d('2023-04-04'), type: AmortizationType.FIXED, value: 100000 }] }));
    expect(r.finalAmount).toBeCloseTo(944642.2489004388, 2);
    // Fator exibido é o do saldo: 1 na carência
    expect(r.memoryRows.find(x => x.date.getTime() === d('2023-06-30').getTime())!.accumulatedFactor).toBe(1);
  });

  it('IPCA com término no dia 1 mantém fevereiro na carência = 1.017.440,48', () => {
    const r = calculate({ initialAmount: 1e6, startDate: d('2025-01-01'), endDate: d('2025-06-15'), indexType: IndexType.IPCA, dayCountBasis: DayCountBasis.DC365, indexData: Array.from({ length: 6 }, (_, i) => ({ date: new Date(2025, i, 1), value: 0.5 })), thesisType: ThesisType.CORRECAO_COM_CARENCIA, gracePeriod: { type: GracePeriodType.B, endDate: d('2025-03-01') } });
    expect(r.finalAmount).toBeCloseTo(1017440.4836585073, 2);
  });
});
