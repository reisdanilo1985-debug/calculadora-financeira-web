import Decimal from 'decimal.js';
import { OptionGreeks, OptionType, OptionValuation } from './types';

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
const D = (value: Decimal.Value) => new Decimal(value);
const ZERO_GREEKS: OptionGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

function normalPdf(x: Decimal): Decimal {
  return x.pow(2).div(-2).exp().div(D(2).mul(Decimal.acos(-1)).sqrt());
}

/** Abramowitz-Stegun 7.1.26, calculada com Decimal. */
export function normalCdf(value: Decimal.Value): Decimal {
  const x = D(value);
  const ax = x.abs();
  const t = D(1).div(D(1).plus(D('0.2316419').mul(ax)));
  const polynomial = D('0.319381530')
    .plus(t.mul(D('-0.356563782').plus(t.mul(D('1.781477937').plus(t.mul(D('-1.821255978').plus(t.mul('1.330274429'))))))))
    .mul(t);
  const cdfPositive = D(1).minus(normalPdf(ax).mul(polynomial));
  return x.isNegative() ? D(1).minus(cdfPositive) : cdfPositive;
}

export interface BlackScholesInput { spot: number; strike: number; timeYears: number; riskFreeRate: number; dividendYield: number; volatility: number; optionType: OptionType; }

export function intrinsicValue(spot: number, strike: number, optionType: OptionType): Decimal {
  return Decimal.max(0, optionType === 'CALL' ? D(spot).minus(strike) : D(strike).minus(spot));
}

export function blackScholes(input: BlackScholesInput): OptionValuation {
  const { optionType } = input;
  const S = D(input.spot); const K = D(input.strike); const T = D(input.timeYears);
  const r = D(input.riskFreeRate); const q = D(input.dividendYield); const sigma = D(input.volatility);
  const intrinsic = intrinsicValue(input.spot, input.strike, optionType);
  if (K.lte(0) || S.lt(0)) throw new Error('Spot não pode ser negativo e strike deve ser positivo.');
  if (S.eq(0)) {
    const putPrice = K.mul(r.neg().mul(T).exp());
    return optionType === 'CALL'
      ? { price: 0, intrinsicValue: 0, timeValue: 0, ...ZERO_GREEKS }
      : { price: putPrice.toNumber(), intrinsicValue: K.toNumber(), timeValue: Math.max(0, putPrice.minus(K).toNumber()), ...ZERO_GREEKS, delta: q.neg().mul(T).exp().neg().toNumber() };
  }
  if (T.lte(0) || sigma.lte(0)) {
    const delta = optionType === 'CALL' ? (S.gt(K) ? 1 : 0) : (S.lt(K) ? -1 : 0);
    return { price: intrinsic.toNumber(), intrinsicValue: intrinsic.toNumber(), timeValue: 0, ...ZERO_GREEKS, delta };
  }
  const sqrtT = T.sqrt();
  const d1 = S.div(K).ln().plus(r.minus(q).plus(sigma.pow(2).div(2)).mul(T)).div(sigma.mul(sqrtT));
  const d2 = d1.minus(sigma.mul(sqrtT));
  const discountR = r.neg().mul(T).exp(); const discountQ = q.neg().mul(T).exp();
  const nd1 = normalCdf(d1); const nd2 = normalCdf(d2); const pdf = normalPdf(d1);
  let price: Decimal; let delta: Decimal; let theta: Decimal; let rho: Decimal;
  if (optionType === 'CALL') {
    price = S.mul(discountQ).mul(nd1).minus(K.mul(discountR).mul(nd2));
    delta = discountQ.mul(nd1);
    theta = S.mul(discountQ).mul(pdf).mul(sigma).div(sqrtT).div(-2).minus(r.mul(K).mul(discountR).mul(nd2)).plus(q.mul(S).mul(discountQ).mul(nd1));
    rho = K.mul(T).mul(discountR).mul(nd2);
  } else {
    price = K.mul(discountR).mul(normalCdf(d2.neg())).minus(S.mul(discountQ).mul(normalCdf(d1.neg())));
    delta = discountQ.mul(nd1.minus(1));
    theta = S.mul(discountQ).mul(pdf).mul(sigma).div(sqrtT).div(-2).plus(r.mul(K).mul(discountR).mul(normalCdf(d2.neg()))).minus(q.mul(S).mul(discountQ).mul(normalCdf(d1.neg())));
    rho = K.mul(T).mul(discountR).mul(normalCdf(d2.neg())).neg();
  }
  const gamma = discountQ.mul(pdf).div(S.mul(sigma).mul(sqrtT));
  const vega = S.mul(discountQ).mul(pdf).mul(sqrtT);
  return { price: price.toNumber(), intrinsicValue: intrinsic.toNumber(), timeValue: Decimal.max(0, price.minus(intrinsic)).toNumber(), delta: delta.toNumber(), gamma: gamma.toNumber(), theta: theta.div(365).toNumber(), vega: vega.div(100).toNumber(), rho: rho.div(100).toNumber() };
}

export function impliedVolatility(input: Omit<BlackScholesInput, 'volatility'>, marketPrice: number): number {
  const target = D(marketPrice);
  if (target.lt(intrinsicValue(input.spot, input.strike, input.optionType)) || target.lte(0)) throw new Error('Prêmio incompatível com o valor intrínseco.');
  let low = D('0.000001'); let high = D(5);
  for (let i = 0; i < 120; i += 1) {
    const mid = low.plus(high).div(2);
    const price = D(blackScholes({ ...input, volatility: mid.toNumber() }).price);
    if (price.minus(target).abs().lt('0.00000001')) return mid.toNumber();
    if (price.gt(target)) high = mid; else low = mid;
  }
  const result = low.plus(high).div(2);
  if (D(blackScholes({ ...input, volatility: result.toNumber() }).price).minus(target).abs().gt('0.0001')) throw new Error('Não foi possível convergir a volatilidade implícita.');
  return result.toNumber();
}
