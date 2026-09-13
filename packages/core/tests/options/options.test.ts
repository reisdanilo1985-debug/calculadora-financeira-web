import { describe, expect, it } from 'vitest';
import { blackScholes, impliedVolatility, simulateOptionsStrategy, OptionsSimulationInput, OPTION_STRATEGIES } from '../../src/options';

describe('Black-Scholes', () => {
  it('reproduz o vetor clássico e a paridade put-call', () => {
    const base = { spot: 100, strike: 100, timeYears: 1, riskFreeRate: 0.05, dividendYield: 0, volatility: 0.2 };
    const call = blackScholes({ ...base, optionType: 'CALL' });
    const put = blackScholes({ ...base, optionType: 'PUT' });
    expect(call.price).toBeCloseTo(10.4506, 3);
    expect(put.price).toBeCloseTo(5.5735, 3);
    expect(call.price - put.price).toBeCloseTo(100 - 100 * Math.exp(-0.05), 3);
  });

  it('recupera a volatilidade implícita', () => {
    const base = { spot: 42, strike: 40, timeYears: 0.5, riskFreeRate: 0.1, dividendYield: 0.02, optionType: 'CALL' as const };
    const price = blackScholes({ ...base, volatility: 0.35 }).price;
    expect(impliedVolatility(base, price)).toBeCloseTo(0.35, 5);
  });

  it('calcula delta coerente com diferença finita', () => {
    const base = { spot: 100, strike: 105, timeYears: .75, riskFreeRate: .11, dividendYield: .03, volatility: .28, optionType: 'CALL' as const };
    const epsilon = .01;
    const numerical = (blackScholes({ ...base, spot: base.spot + epsilon }).price - blackScholes({ ...base, spot: base.spot - epsilon }).price) / (2 * epsilon);
    expect(blackScholes(base).delta).toBeCloseTo(numerical, 4);
  });

  it('usa valor intrínseco no vencimento', () => {
    expect(blackScholes({ spot: 55, strike: 50, timeYears: 0, riskFreeRate: .1, dividendYield: 0, volatility: .3, optionType: 'CALL' }).price).toBe(5);
  });
});

describe('simulador de estratégias', () => {
  const input: OptionsSimulationInput = {
    market: { symbol: 'PETR4', spot: 40, valuationDate: '2026-09-13', riskFreeRate: 0.12, dividendYield: 0.05, currency: 'BRL' },
    legs: [
      { id: 'stock', symbol: 'PETR4', instrument: 'UNDERLYING', side: 'LONG', quantity: 1, multiplier: 100, premium: 40 },
      { id: 'call', symbol: 'PETRA42', instrument: 'OPTION', side: 'SHORT', optionType: 'CALL', quantity: 1, multiplier: 100, strike: 42, expiry: '2026-12-18', premium: 2, impliedVolatility: 0.3 },
    ],
    costs: { entry: { fixedPerOrder: 0, perContract: 0, percentNotional: 0 }, exit: { fixedPerOrder: 0, perContract: 0, percentNotional: 0 }, exercisePerContract: 0, includeExitCosts: false },
    grid: { spotMin: 0, spotMax: 80, spotSteps: 81, dateSteps: 5, volatilityShift: 0 },
  };

  it('limita o lucro de uma venda coberta e mantém perda limitada', () => {
    const result = simulateOptionsStrategy(input);
    expect(result.summary.profitUnlimited).toBe(false);
    expect(result.summary.lossUnlimited).toBe(false);
    expect(result.summary.maxProfit).toBeCloseTo(400, 6);
    expect(result.summary.maxLoss).toBeCloseTo(-3800, 6);
  });

  it('gera heatmap reconciliável com a curva final', () => {
    const result = simulateOptionsStrategy(input);
    expect(result.heatmap.at(-1)!.values).toEqual(result.payoffCurve.map(p => p.pnl));
    expect(result.legs).toHaveLength(2);
  });

  it('classifica a perda ilimitada de uma call vendida', () => {
    const shortCall: OptionsSimulationInput = { ...input, legs: [{ ...input.legs[1], side: 'SHORT' }], grid: { ...input.grid, spotMin: 20 } };
    expect(simulateOptionsStrategy(shortCall).summary.lossUnlimited).toBe(true);
  });

  it('gera vencimentos distintos nos templates temporais', () => {
    for (const name of ['calendar', 'diagonal']) {
      const legs = OPTION_STRATEGIES.find(s => s.id === name)!.build(40, '2026-10-16');
      expect(legs[0].expiry).not.toBe(legs[1].expiry);
    }
  });
});
