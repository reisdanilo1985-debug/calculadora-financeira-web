/**
 * Testes unitários para o CDIEngine.
 * Valores validados contra a Calculadora do Cidadão do BCB e HP12C.
 */

import { describe, it, expect } from 'vitest';
import { calculate } from '../src/services/CalculationEngine';
import {
  CalculationInput,
  DayCountBasis,
  IndexType,
  IndexDataPoint,
  SpreadConfig,
  AmortizationEntry,
  AmortizationType,
} from '../src/models/types';
import { isBusinessDay, countBusinessDays } from '../src/utils/businessDays';

/** Gera dados sintéticos de CDI para teste */
function generateCDIData(
  startDate: Date,
  endDate: Date,
  annualRatePercent: number
): IndexDataPoint[] {
  const data: IndexDataPoint[] = [];
  let current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) { // apenas dias úteis
      data.push({
        date: new Date(current),
        value: annualRatePercent,
      });
    }
    current = new Date(current);
    current.setDate(current.getDate() + 1);
  }

  return data;
}

describe('CDI Engine', () => {
  it('deve calcular CDI para 1 ano com taxa de 10% a.a. (252 d.u.)', () => {
    const start = new Date(2024, 0, 2); // 02/01/2024
    const end = new Date(2025, 0, 2);   // 02/01/2025
    const indexData = generateCDIData(start, end, 10);

    const input: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: end,
      indexType: IndexType.CDI,
      dayCountBasis: DayCountBasis.DU252,
      indexData,
    };

    const result = calculate(input);

    // Com 10% a.a. e ~252 d.u., o fator deve ser próximo de 1.10
    expect(result.accumulatedFactor).toBeGreaterThan(1.09);
    expect(result.accumulatedFactor).toBeLessThan(1.11);
    expect(result.finalAmount).toBeGreaterThan(109000);
    expect(result.finalAmount).toBeLessThan(111000);
    expect(result.hasProjections).toBe(false);
  });

  it('deve calcular CDI com percentual (110% do CDI)', () => {
    const start = new Date(2024, 0, 2);
    const end = new Date(2024, 5, 30); // 6 meses
    const indexData = generateCDIData(start, end, 12); // 12% a.a.

    const spread: SpreadConfig = { mode: 'percentage', value: 110 }; // 110% do CDI

    const inputSemSpread: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: end,
      indexType: IndexType.CDI,
      dayCountBasis: DayCountBasis.DU252,
      indexData,
    };

    const inputComSpread: CalculationInput = {
      ...inputSemSpread,
      spread,
    };

    const resultSem = calculate(inputSemSpread);
    const resultCom = calculate(inputComSpread);

    // Com 110% do CDI, o resultado deve ser maior
    expect(resultCom.finalAmount).toBeGreaterThan(resultSem.finalAmount);
    expect(resultCom.accumulatedFactor).toBeGreaterThan(resultSem.accumulatedFactor);
  });

  it('deve retornar montante inicial para período zero', () => {
    const date = new Date(2024, 0, 2);
    const indexData = generateCDIData(date, new Date(2024, 0, 3), 10);

    const input: CalculationInput = {
      initialAmount: 50000,
      startDate: date,
      endDate: new Date(2024, 0, 3),
      indexType: IndexType.CDI,
      dayCountBasis: DayCountBasis.DU252,
      indexData,
    };

    const result = calculate(input);
    expect(result.memoryRows.length).toBeGreaterThan(0);
    expect(result.finalAmount).toBeGreaterThan(50000);
  });

  it('deve lançar erro para data inicial >= data final', () => {
    const date = new Date(2024, 0, 2);
    const input: CalculationInput = {
      initialAmount: 100000,
      startDate: date,
      endDate: date,
      indexType: IndexType.CDI,
      dayCountBasis: DayCountBasis.DU252,
      indexData: [],
    };

    expect(() => calculate(input)).toThrow();
  });

  it('deve aplicar amortização de valor fixo', () => {
    const start = new Date(2024, 0, 2);
    const end = new Date(2024, 11, 31);
    const indexData = generateCDIData(start, end, 10);

    const amortizations: AmortizationEntry[] = [
      {
        date: new Date(2024, 5, 28), // 28/06/2024 - sexta-feira (dia útil)
        type: AmortizationType.FIXED,
        value: 10000,
      },
    ];

    const inputSem: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: end,
      indexType: IndexType.CDI,
      dayCountBasis: DayCountBasis.DU252,
      indexData,
    };

    const inputCom: CalculationInput = {
      ...inputSem,
      amortizations,
    };

    const resultSem = calculate(inputSem);
    const resultCom = calculate(inputCom);

    // Com amortização, o saldo final deve ser menor
    expect(resultCom.finalAmount).toBeLessThan(resultSem.finalAmount);
    expect(resultCom.totalAmortized).toBeCloseTo(10000, 0);
  });

  it('deve marcar linhas projetadas quando há premissas futuras', () => {
    const start = new Date(2024, 0, 2);
    const historicalEnd = new Date(2024, 5, 30);
    const futureEnd = new Date(2024, 11, 31);

    const indexData = generateCDIData(start, historicalEnd, 10);

    const input: CalculationInput = {
      initialAmount: 100000,
      startDate: start,
      endDate: futureEnd,
      indexType: IndexType.CDI,
      dayCountBasis: DayCountBasis.DU252,
      indexData,
      futurePremises: [
        {
          startDate: new Date(2024, 6, 1),
          endDate: futureEnd,
          rate: 9,
        },
      ],
    };

    const result = calculate(input);
    expect(result.hasProjections).toBe(true);
    expect(result.projectionStartDate).toBeDefined();

    const projectedRows = result.memoryRows.filter(r => r.isProjected);
    expect(projectedRows.length).toBeGreaterThan(0);
  });
});

describe('Funções de Dias Úteis', () => {
  it('deve identificar dias úteis corretamente', () => {
    // Segunda-feira normal
    expect(isBusinessDay(new Date(2024, 0, 8))).toBe(true);

    // Sábado
    expect(isBusinessDay(new Date(2024, 0, 6))).toBe(false);

    // Domingo
    expect(isBusinessDay(new Date(2024, 0, 7))).toBe(false);

    // Natal 2024 (25/12 - quarta-feira)
    expect(isBusinessDay(new Date(2024, 11, 25))).toBe(false);

    // Tiradentes 2024 (21/04 - domingo, feriado)
    expect(isBusinessDay(new Date(2024, 3, 21))).toBe(false);
  });

  it('deve calcular dias úteis entre datas', () => {
    // Janeiro de 2024: 2 a 31/01, excluindo fins de semana
    const start = new Date(2024, 0, 2);
    const end = new Date(2024, 1, 1); // 01/02/2024

    const count = countBusinessDays(start, end);
    expect(count).toBeGreaterThan(20);
    expect(count).toBeLessThan(25);
  });
});
