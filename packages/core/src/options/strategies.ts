import { OptionLeg, OptionType, PositionSide, StrategyTemplate } from './types';

const option = (id: string, spot: number, expiry: string, side: PositionSide, type: OptionType, strikeFactor: number, quantity = 1): OptionLeg => ({
  id, symbol: '', instrument: 'OPTION', side, optionType: type, quantity, multiplier: 100,
  strike: Number((spot * strikeFactor).toFixed(2)), expiry, premium: 0, impliedVolatility: 0.3,
});
const stock = (id: string, spot: number, side: PositionSide): OptionLeg => ({
  id, symbol: '', instrument: 'UNDERLYING', side, quantity: 1, multiplier: 100, premium: spot,
});
const t = (id: string, name: string, category: string, description: string, build: StrategyTemplate['build']): StrategyTemplate => ({ id, name, category, description, build });
const laterExpiry = (expiry: string, days: number) => new Date(Date.parse(`${expiry}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const OPTION_STRATEGIES: StrategyTemplate[] = [
  t('custom', 'Montagem livre', 'Livre', 'Comece sem pernas e monte qualquer combinação.', () => []),
  t('long-call', 'Compra de call', 'Simples', 'Alta com perda limitada ao prêmio.', (s, e) => [option('call', s, e, 'LONG', 'CALL', 1)]),
  t('short-call', 'Venda de call', 'Simples', 'Crédito com risco de alta ilimitado.', (s, e) => [option('call', s, e, 'SHORT', 'CALL', 1)]),
  t('long-put', 'Compra de put', 'Simples', 'Proteção ou aposta na queda.', (s, e) => [option('put', s, e, 'LONG', 'PUT', 1)]),
  t('short-put', 'Venda de put', 'Simples', 'Crédito condicionado à sustentação do ativo.', (s, e) => [option('put', s, e, 'SHORT', 'PUT', 1)]),
  t('covered-call', 'Venda coberta', 'Proteção', 'Ação comprada e call vendida.', (s, e) => [stock('stock', s, 'LONG'), option('call', s, e, 'SHORT', 'CALL', 1.05)]),
  t('protective-put', 'Put protetiva', 'Proteção', 'Ação comprada com piso de proteção.', (s, e) => [stock('stock', s, 'LONG'), option('put', s, e, 'LONG', 'PUT', .95)]),
  t('collar', 'Collar', 'Proteção', 'Ação, put comprada e call vendida.', (s, e) => [stock('stock', s, 'LONG'), option('put', s, e, 'LONG', 'PUT', .95), option('call', s, e, 'SHORT', 'CALL', 1.05)]),
  t('bull-call', 'Trava de alta com calls', 'Travas verticais', 'Call comprada e call superior vendida.', (s, e) => [option('long', s, e, 'LONG', 'CALL', .95), option('short', s, e, 'SHORT', 'CALL', 1.05)]),
  t('bear-call', 'Trava de baixa com calls', 'Travas verticais', 'Call vendida e call superior comprada.', (s, e) => [option('short', s, e, 'SHORT', 'CALL', .95), option('long', s, e, 'LONG', 'CALL', 1.05)]),
  t('bull-put', 'Trava de alta com puts', 'Travas verticais', 'Put superior vendida e put inferior comprada.', (s, e) => [option('long', s, e, 'LONG', 'PUT', .95), option('short', s, e, 'SHORT', 'PUT', 1.05)]),
  t('bear-put', 'Trava de baixa com puts', 'Travas verticais', 'Put superior comprada e put inferior vendida.', (s, e) => [option('short', s, e, 'SHORT', 'PUT', .95), option('long', s, e, 'LONG', 'PUT', 1.05)]),
  t('straddle', 'Straddle', 'Volatilidade', 'Call e put ATM compradas.', (s, e) => [option('call', s, e, 'LONG', 'CALL', 1), option('put', s, e, 'LONG', 'PUT', 1)]),
  t('strangle', 'Strangle', 'Volatilidade', 'Put OTM e call OTM compradas.', (s, e) => [option('put', s, e, 'LONG', 'PUT', .95), option('call', s, e, 'LONG', 'CALL', 1.05)]),
  t('call-ratio', 'Ratio spread com calls', 'Ratio e backspread', 'Compra uma call e vende duas calls superiores.', (s, e) => [option('long', s, e, 'LONG', 'CALL', .95), option('short', s, e, 'SHORT', 'CALL', 1.05, 2)]),
  t('call-backspread', 'Backspread com calls', 'Ratio e backspread', 'Vende uma call e compra duas calls superiores.', (s, e) => [option('short', s, e, 'SHORT', 'CALL', .95), option('long', s, e, 'LONG', 'CALL', 1.05, 2)]),
  t('butterfly', 'Borboleta com calls', 'Borboletas e condors', 'Estrutura 1:-2:1 com três strikes.', (s, e) => [option('low', s, e, 'LONG', 'CALL', .9), option('mid', s, e, 'SHORT', 'CALL', 1, 2), option('high', s, e, 'LONG', 'CALL', 1.1)]),
  t('condor', 'Condor com calls', 'Borboletas e condors', 'Quatro strikes e risco limitado.', (s, e) => [option('a', s, e, 'LONG', 'CALL', .9), option('b', s, e, 'SHORT', 'CALL', .97), option('c', s, e, 'SHORT', 'CALL', 1.03), option('d', s, e, 'LONG', 'CALL', 1.1)]),
  t('iron-butterfly', 'Iron butterfly', 'Estruturas de ferro', 'Venda do miolo com asas compradas.', (s, e) => [option('put-long', s, e, 'LONG', 'PUT', .9), option('put-short', s, e, 'SHORT', 'PUT', 1), option('call-short', s, e, 'SHORT', 'CALL', 1), option('call-long', s, e, 'LONG', 'CALL', 1.1)]),
  t('iron-condor', 'Iron condor', 'Estruturas de ferro', 'Venda de strangle protegida por asas.', (s, e) => [option('put-long', s, e, 'LONG', 'PUT', .9), option('put-short', s, e, 'SHORT', 'PUT', .95), option('call-short', s, e, 'SHORT', 'CALL', 1.05), option('call-long', s, e, 'LONG', 'CALL', 1.1)]),
  t('calendar', 'Calendar spread', 'Tempo', 'Mesmo strike com vencimentos separados por 30 dias.', (s, e) => [option('near', s, e, 'SHORT', 'CALL', 1), option('far', s, laterExpiry(e, 30), 'LONG', 'CALL', 1)]),
  t('diagonal', 'Diagonal spread', 'Tempo', 'Strikes diferentes e segunda opção 60 dias mais longa.', (s, e) => [option('near', s, e, 'SHORT', 'CALL', 1.05), option('far', s, laterExpiry(e, 60), 'LONG', 'CALL', 1)]),
  t('risk-reversal', 'Risk reversal', 'Sintéticas', 'Put vendida financia call comprada.', (s, e) => [option('put', s, e, 'SHORT', 'PUT', .95), option('call', s, e, 'LONG', 'CALL', 1.05)]),
  t('synthetic-long', 'Ação sintética comprada', 'Sintéticas', 'Call comprada e put vendida no mesmo strike.', (s, e) => [option('call', s, e, 'LONG', 'CALL', 1), option('put', s, e, 'SHORT', 'PUT', 1)]),
  t('synthetic-short', 'Ação sintética vendida', 'Sintéticas', 'Call vendida e put comprada no mesmo strike.', (s, e) => [option('call', s, e, 'SHORT', 'CALL', 1), option('put', s, e, 'LONG', 'PUT', 1)]),
  t('box', 'Box spread', 'Sintéticas', 'Combinação de trava de alta e trava de baixa.', (s, e) => [option('cl', s, e, 'LONG', 'CALL', .95), option('ch', s, e, 'SHORT', 'CALL', 1.05), option('pl', s, e, 'SHORT', 'PUT', .95), option('ph', s, e, 'LONG', 'PUT', 1.05)]),
];
