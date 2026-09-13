import Decimal from 'decimal.js';
import { blackScholes, impliedVolatility, intrinsicValue } from './blackScholes';
import {
  OptionGreeks, OptionLeg, OptionsCostSide, OptionsCurvePoint, OptionsSimulationInput,
  OptionsSimulationResult,
} from './types';

const D = (v: Decimal.Value) => new Decimal(v);
const sign = (leg: OptionLeg) => D(leg.side === 'LONG' ? 1 : -1);
const isoTime = (value: string) => {
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new Error(`Data inválida: ${value}.`);
  return ms;
};
const yearsBetween = (from: string, to: string) => Math.max(0, (isoTime(to) - isoTime(from)) / 86_400_000 / 365);
const round = (n: Decimal.Value, dp = 8) => D(n).toDecimalPlaces(dp).toNumber();

function addDays(iso: string, days: number): string {
  return new Date(isoTime(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

function linspace(min: number, max: number, steps: number): number[] {
  if (steps <= 1) return [min];
  return Array.from({ length: steps }, (_, i) => round(D(min).plus(D(max).minus(min).mul(i).div(steps - 1)), 6));
}

function datesBetween(start: string, end: string, steps: number): string[] {
  const days = Math.max(0, Math.round((isoTime(end) - isoTime(start)) / 86_400_000));
  return [...new Set(linspace(0, days, Math.max(2, steps)).map(n => addDays(start, Math.round(n))))];
}

function cost(side: OptionsCostSide, legs: OptionLeg[], notionals: Decimal[]): Decimal {
  const orders = legs.length;
  const contracts = legs.reduce((sum, leg) => sum.plus(D(leg.quantity).abs()), D(0));
  const notional = notionals.reduce((sum, value) => sum.plus(value.abs()), D(0));
  return D(side.fixedPerOrder).mul(orders).plus(D(side.perContract).mul(contracts)).plus(notional.mul(side.percentNotional));
}

function validate(input: OptionsSimulationInput): void {
  if (!input.legs.length) throw new Error('Adicione ao menos uma perna à estratégia.');
  if (!(input.market.spot > 0)) throw new Error('O preço do ativo deve ser positivo.');
  if (input.grid.spotSteps < 5 || input.grid.spotSteps > 201) throw new Error('A resolução de preços deve ficar entre 5 e 201.');
  if (input.grid.dateSteps < 2 || input.grid.dateSteps > 60) throw new Error('A resolução de datas deve ficar entre 2 e 60.');
  if (!(input.grid.spotMax > input.grid.spotMin) || input.grid.spotMin < 0) throw new Error('Faixa de preços inválida.');
  input.legs.forEach((leg, index) => {
    if (!(leg.quantity > 0) || !(leg.multiplier > 0) || leg.premium < 0) throw new Error(`Valores inválidos na perna ${index + 1}.`);
    if (leg.instrument === 'OPTION') {
      if (!leg.optionType || !leg.expiry || !(Number(leg.strike) > 0)) throw new Error(`Complete tipo, strike e vencimento da perna ${index + 1}.`);
      if (isoTime(leg.expiry) < isoTime(input.market.valuationDate)) throw new Error(`O vencimento da perna ${index + 1} é anterior à data-base.`);
    }
  });
}

function legVolatility(leg: OptionLeg, input: OptionsSimulationInput): number {
  if (leg.instrument === 'UNDERLYING') return 0;
  if (leg.impliedVolatility != null && leg.impliedVolatility > 0) return leg.impliedVolatility;
  return impliedVolatility({
    spot: input.market.spot,
    strike: leg.strike!,
    timeYears: yearsBetween(input.market.valuationDate, leg.expiry!),
    riskFreeRate: input.market.riskFreeRate,
    dividendYield: input.market.dividendYield,
    optionType: leg.optionType!,
  }, leg.premium);
}

function valueLeg(leg: OptionLeg, spot: number, date: string, volatility: number, input: OptionsSimulationInput) {
  if (leg.instrument === 'UNDERLYING') {
    return { price: spot, expired: false, greeks: { delta: 1, gamma: 0, theta: 0, vega: 0, rho: 0 } };
  }
  const expired = isoTime(date) >= isoTime(leg.expiry!);
  if (expired) {
    return { price: intrinsicValue(spot, leg.strike!, leg.optionType!).toNumber(), expired: true, greeks: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 } };
  }
  const valuation = blackScholes({
    spot, strike: leg.strike!, timeYears: yearsBetween(date, leg.expiry!),
    riskFreeRate: input.market.riskFreeRate, dividendYield: input.market.dividendYield,
    volatility: Math.max(0.000001, volatility + input.grid.volatilityShift), optionType: leg.optionType!,
  });
  return { price: valuation.price, expired: false, greeks: valuation };
}

export function simulateOptionsStrategy(input: OptionsSimulationInput): OptionsSimulationResult {
  validate(input);
  const vols = input.legs.map(leg => legVolatility(leg, input));
  const initialNotionals = input.legs.map(leg => D(leg.premium).mul(leg.quantity).mul(leg.multiplier));
  const initialValue = input.legs.reduce((sum, leg, i) => sum.plus(initialNotionals[i].mul(sign(leg))), D(0));
  const entryCosts = cost(input.costs.entry, input.legs, initialNotionals);
  const lastExpiry = input.legs.filter(l => l.expiry).map(l => l.expiry!).sort().at(-1) ?? input.market.valuationDate;
  const spots = linspace(input.grid.spotMin, input.grid.spotMax, input.grid.spotSteps);
  const dates = datesBetween(input.market.valuationDate, lastExpiry, input.grid.dateSteps);

  const evaluate = (spot: number, date: string) => {
    const valuations = input.legs.map((leg, i) => valueLeg(leg, spot, date, vols[i], input));
    const notionals = valuations.map((v, i) => D(v.price).mul(input.legs[i].quantity).mul(input.legs[i].multiplier));
    const positionValue = input.legs.reduce((sum, leg, i) => sum.plus(notionals[i].mul(sign(leg))), D(0));
    const exitCosts = input.costs.includeExitCosts ? cost(input.costs.exit, input.legs.filter((_, i) => !valuations[i].expired), notionals.filter((_, i) => !valuations[i].expired)) : D(0);
    const exerciseCosts = input.legs.reduce((sum, leg, i) => sum.plus(valuations[i].expired && leg.instrument === 'OPTION' ? D(input.costs.exercisePerContract).mul(leg.quantity) : 0), D(0));
    const pnl = positionValue.minus(initialValue).minus(entryCosts).minus(exitCosts).minus(exerciseCosts);
    return { valuations, notionals, positionValue, pnl };
  };

  const current = evaluate(input.market.spot, input.market.valuationDate);
  const legResults = input.legs.map((leg, i) => {
    const multiplier = D(leg.quantity).mul(leg.multiplier).mul(sign(leg));
    const g = current.valuations[i].greeks;
    const greeks = Object.fromEntries(['delta', 'gamma', 'theta', 'vega', 'rho'].map(k => [k, round(D((g as any)[k]).mul(multiplier))])) as unknown as OptionGreeks;
    return {
      id: leg.id, symbol: leg.symbol, theoreticalPrice: round(current.valuations[i].price), marketPrice: leg.premium,
      impliedVolatility: leg.instrument === 'OPTION' ? vols[i] : null,
      positionValue: round(current.notionals[i].mul(sign(leg))),
      pnl: round(current.notionals[i].mul(sign(leg)).minus(initialNotionals[i].mul(sign(leg)))),
      expired: current.valuations[i].expired, greeks,
    };
  });
  const aggregateGreeks = legResults.reduce((a, leg) => ({
    delta: a.delta + leg.greeks.delta, gamma: a.gamma + leg.greeks.gamma, theta: a.theta + leg.greeks.theta,
    vega: a.vega + leg.greeks.vega, rho: a.rho + leg.greeks.rho,
  }), { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 });

  const curveFor = (date: string): OptionsCurvePoint[] => spots.map(spot => {
    const r = evaluate(spot, date);
    return { spot, pnl: round(r.pnl), value: round(r.positionValue) };
  });
  const payoffCurve = curveFor(lastExpiry);
  const valuationDates = [...new Set([dates[0], dates[Math.floor((dates.length - 1) / 2)], dates.at(-1)!])];
  const valuationCurves = valuationDates.map(date => ({ date, points: curveFor(date) }));
  const heatmap = dates.map(date => ({ date, values: curveFor(date).map(point => point.pnl) }));

  const breakEvens: number[] = [];
  for (let i = 1; i < payoffCurve.length; i += 1) {
    const a = payoffCurve[i - 1]; const b = payoffCurve[i];
    if (a.pnl === 0) breakEvens.push(a.spot);
    else if ((a.pnl < 0 && b.pnl > 0) || (a.pnl > 0 && b.pnl < 0)) {
      breakEvens.push(round(D(a.spot).plus(D(b.spot - a.spot).mul(D(0).minus(a.pnl)).div(D(b.pnl).minus(a.pnl))), 4));
    }
  }
  const uniqueBreakEvens = [...new Set(breakEvens)];
  const rightSlope = D(payoffCurve.at(-1)!.pnl).minus(payoffCurve.at(-2)!.pnl).div(D(payoffCurve.at(-1)!.spot).minus(payoffCurve.at(-2)!.spot));
  const profitUnlimited = rightSlope.gt('0.000001');
  const lossUnlimited = rightSlope.lt('-0.000001');
  const strikes = input.legs.filter(l => l.instrument === 'OPTION').map(l => l.strike!);
  const tailSpot = Math.max(input.market.spot, ...strikes, input.grid.spotMax) * 20;
  const riskPnls = [...new Set([0, ...strikes, tailSpot])].map(spot => round(evaluate(spot, lastExpiry).pnl));

  return {
    summary: {
      initialPositionValue: round(initialValue), netPremium: round(initialValue.neg().minus(entryCosts)), entryCosts: round(entryCosts),
      currentValue: round(current.positionValue), currentPnl: round(current.pnl), breakEvens: uniqueBreakEvens,
      maxProfit: profitUnlimited ? null : Math.max(...riskPnls), maxLoss: lossUnlimited ? null : Math.min(...riskPnls),
      profitUnlimited, lossUnlimited, greeks: Object.fromEntries(Object.entries(aggregateGreeks).map(([k, v]) => [k, round(v)])) as unknown as OptionGreeks,
    },
    legs: legResults, spots, dates, payoffCurve, valuationCurves, heatmap,
    warnings: [
      'Modelo teórico Black-Scholes europeu (ACT/365). Não considera exercício antecipado.',
      'Liquidez, spread bid/ask, dividendos discretos e tributação não estão incluídos.',
    ],
  };
}
