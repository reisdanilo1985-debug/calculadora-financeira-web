/**
 * Testes para engines de índices mensais (IPCA, IGP-M, INCC).
 */

import { describe, it, expect } from 'vitest';
import { calculate } from '../src/services/CalculationEngine';
import {
  CalculationInput,
  DayCountBasis,
  IndexType,
  IndexDataPoint,
} from '../src/models/types';

function generateMonthlyData(
  startYear: number,
  startMonth: number, // 0-indexed
  months: number,
  monthlyRatePercent: number
): IndexDataPoint[] {
  const data: IndexDataPoint[] = [];
  for (let i = 0; i < months; i++) {
    const month = (startMonth + i) % 12;
    const year = startYear + Math.floor((startMonth + i) / 12);
    data.push({
      date: new Date(year, month, 1),
      value: monthlyRatePercent,
    });
  }
  return data;
}

describe('IPCA Engine', () => {
  it('deve calcular IPCA para período exato de 12 meses com 0.5% a.m.', () => {
    const start = new Date(2024, 0, 1); // 01/01/2024
    const end = new Date(2025, 0, 1);   // 01/01/2025
    const indexData = generateMonthlyData(2024, 0, 12, 0.5);

    const input: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: end,
      indexType: IndexType.IPCA,
      dayCountBasis: DayCountBasis.DC365,
      indexData,
    };

    const result = calculate(input);

    // (1.005)^12 = ~1.0616778
    expect(result.accumulatedFactor).toBeGreaterThan(1.061);
    expect(result.accumulatedFactor).toBeLessThan(1.063);
    expect(result.finalAmount).toBeGreaterThan(106100);
    expect(result.finalAmount).toBeLessThan(106300);
  });

  it('deve aplicar pro-rata corretamente para período parcial', () => {
    // Período de 15 dias em um mês com 0.5%
    const start = new Date(2024, 0, 1);  // 01/01/2024
    const end = new Date(2024, 0, 16);   // 16/01/2024
    const indexData: IndexDataPoint[] = [
      { date: new Date(2024, 0, 1), value: 0.5 },
    ];

    const input: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: end,
      indexType: IndexType.IPCA,
      dayCountBasis: DayCountBasis.DC365,
      indexData,
    };

    const result = calculate(input);

    // Pro-rata: (1.005)^(15/31) ≈ 1.00241
    expect(result.accumulatedFactor).toBeGreaterThan(1.0020);
    expect(result.accumulatedFactor).toBeLessThan(1.0030);
  });

  it('deve calcular IPCA + spread aditivo', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2025, 0, 1);
    const indexData = generateMonthlyData(2024, 0, 12, 0.5); // 0.5% a.m.

    const inputSem: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: end,
      indexType: IndexType.IPCA,
      dayCountBasis: DayCountBasis.DC365,
      indexData,
    };

    const inputCom: CalculationInput = {
      ...inputSem,
      spread: { mode: 'additive', value: 6 }, // IPCA + 6% a.a.
    };

    const resultSem = calculate(inputSem);
    const resultCom = calculate(inputCom);

    // Com spread, o resultado deve ser maior
    expect(resultCom.finalAmount).toBeGreaterThan(resultSem.finalAmount);
  });

  it('deve tratar meses com premissas futuras', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 11, 1); // 12 meses
    // Dados apenas para os primeiros 6 meses
    const indexData = generateMonthlyData(2024, 0, 6, 0.4);

    const input: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: end,
      indexType: IndexType.IPCA,
      dayCountBasis: DayCountBasis.DC365,
      indexData,
      futurePremises: [
        {
          startDate: new Date(2024, 6, 1),
          endDate: end,
          rate: 0.35,
        },
      ],
    };

    const result = calculate(input);
    expect(result.hasProjections).toBe(true);
    const projectedRows = result.memoryRows.filter(r => r.isProjected);
    expect(projectedRows.length).toBeGreaterThan(0);
  });
});

describe('IGP-M Engine', () => {
  it('deve calcular IGP-M para 6 meses', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 6, 1);
    const indexData = generateMonthlyData(2024, 0, 6, 0.8); // 0.8% a.m.

    const input: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: end,
      indexType: IndexType.IGPM,
      dayCountBasis: DayCountBasis.DC360,
      indexData,
    };

    const result = calculate(input);

    // (1.008)^6 ≈ 1.04877
    expect(result.accumulatedFactor).toBeGreaterThan(1.048);
    expect(result.accumulatedFactor).toBeLessThan(1.050);
  });
});
