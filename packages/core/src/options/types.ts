export type OptionInstrument = 'OPTION' | 'UNDERLYING';
export type PositionSide = 'LONG' | 'SHORT';
export type OptionType = 'CALL' | 'PUT';

export interface OptionLeg {
  id: string;
  symbol: string;
  instrument: OptionInstrument;
  side: PositionSide;
  optionType?: OptionType;
  quantity: number;
  multiplier: number;
  strike?: number;
  expiry?: string;
  premium: number;
  impliedVolatility?: number;
}

export interface OptionsMarketAssumptions {
  symbol: string;
  spot: number;
  valuationDate: string;
  riskFreeRate: number;
  dividendYield: number;
  currency: 'BRL';
}

export interface OptionsCostSide { fixedPerOrder: number; perContract: number; percentNotional: number; }
export interface OptionsCostModel { entry: OptionsCostSide; exit: OptionsCostSide; exercisePerContract: number; includeExitCosts: boolean; }
export interface OptionsScenarioGrid { spotMin: number; spotMax: number; spotSteps: number; dateSteps: number; volatilityShift: number; }
export interface OptionsSimulationInput { strategyName?: string; market: OptionsMarketAssumptions; legs: OptionLeg[]; costs: OptionsCostModel; grid: OptionsScenarioGrid; }
export interface OptionGreeks { delta: number; gamma: number; theta: number; vega: number; rho: number; }
export interface OptionValuation extends OptionGreeks { price: number; intrinsicValue: number; timeValue: number; }
export interface OptionsLegResult { id: string; symbol: string; theoreticalPrice: number; marketPrice: number; impliedVolatility: number | null; positionValue: number; pnl: number; expired: boolean; greeks: OptionGreeks; }
export interface OptionsSummary { initialPositionValue: number; netPremium: number; entryCosts: number; currentValue: number; currentPnl: number; breakEvens: number[]; maxProfit: number | null; maxLoss: number | null; profitUnlimited: boolean; lossUnlimited: boolean; greeks: OptionGreeks; }
export interface OptionsCurvePoint { spot: number; pnl: number; value: number; }
export interface OptionsScenarioRow { date: string; values: number[]; }
export interface OptionsSimulationResult { summary: OptionsSummary; legs: OptionsLegResult[]; spots: number[]; dates: string[]; payoffCurve: OptionsCurvePoint[]; valuationCurves: { date: string; points: OptionsCurvePoint[] }[]; heatmap: OptionsScenarioRow[]; warnings: string[]; }
export interface StrategyTemplate { id: string; name: string; category: string; description: string; build: (spot: number, expiry: string) => OptionLeg[]; }
