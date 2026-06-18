/**
 * Catálogo declarativo dos 13 calculadores de Tesouraria.
 * Cada definição descreve seus campos e como montar o corpo da requisição.
 * Mantém a UI compacta (um formulário genérico) cobrindo todos os cálculos.
 *
 * Unidades: campos `percent` são digitados em % e convertidos para fração no
 * buildBody. O core/API trabalha sempre em fração decimal.
 */

import { PremissasSnapshot } from '@/lib/api';

export type FieldKind =
  | 'percent'
  | 'money'
  | 'number'
  | 'int'
  | 'date'
  | 'select'
  | 'flows'
  | 'numlist';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  default?: any;
  options?: { label: string; value: string }[];
  optional?: boolean;
  help?: string;
  /** Auto-preenchível a partir do snapshot (retorna o valor na unidade do campo). */
  premise?: (snap: PremissasSnapshot, v: Record<string, any>) => number | undefined;
  /** Exibe o campo apenas quando a condição for verdadeira. */
  showIf?: (v: Record<string, any>) => boolean;
}

export interface CalcDef {
  nome: string;
  titulo: string;
  grupo: string;
  descricao: string;
  fields: FieldDef[];
  buildBody: (v: Record<string, any>) => Record<string, any>;
}

// Helpers de conversão (form → corpo da requisição)
const pct = (x: any): number | undefined =>
  x === '' || x === undefined || x === null ? undefined : Number(x) / 100;
const num = (x: any): number | undefined =>
  x === '' || x === undefined || x === null ? undefined : Number(x);
const int = (x: any): number | undefined =>
  x === '' || x === undefined || x === null ? undefined : Math.round(Number(x));

export const GRUPOS = [
  'Conversões',
  'Cross-currency & CDI',
  'Renda Fixa BR',
  'Derivativos',
  'EUA / Money Market',
] as const;

export const CALCULADORES: CalcDef[] = [
  // ───────────────────────────── Conversões ─────────────────────────────
  {
    nome: 'conversor',
    titulo: 'Conversor de taxas',
    grupo: 'Conversões',
    descricao: 'Equivalência de taxa efetiva (dia/mês/tri/sem/ano) e ponte 252↔360.',
    fields: [
      { key: 'iaa', label: 'Taxa a.a. (%)', kind: 'percent', default: 14.4, premise: s => s.escalares.cdiAa * 100 },
      { key: 'du', label: 'Dias úteis (ponte)', kind: 'int', default: 252, optional: true },
      { key: 'dc', label: 'Dias corridos (ponte)', kind: 'int', default: 365, optional: true },
      { key: 'm', label: 'Capitalizações (nominal↔efetiva)', kind: 'int', optional: true },
    ],
    buildBody: v => ({ iaa: pct(v.iaa), du: int(v.du), dc: int(v.dc), m: int(v.m) }),
  },
  {
    nome: 'pre-cdi',
    titulo: 'Pré ↔ % do CDI',
    grupo: 'Conversões',
    descricao: 'Converte taxa pré em % do CDI e vice-versa.',
    fields: [
      {
        key: 'modo', label: 'Direção', kind: 'select', default: 'preParaCdi',
        options: [
          { label: 'Pré → % do CDI', value: 'preParaCdi' },
          { label: '% do CDI → Pré', value: 'cdiParaPre' },
        ],
      },
      { key: 'cdiAa', label: 'CDI a.a. (%)', kind: 'percent', default: 14.4, premise: s => s.escalares.cdiAa * 100 },
      { key: 'preAa', label: 'Pré a.a. (%)', kind: 'percent', default: 15, showIf: v => v.modo !== 'cdiParaPre' },
      { key: 'pctCdi', label: '% do CDI (ex.: 1.10)', kind: 'number', default: 1.1, showIf: v => v.modo === 'cdiParaPre' },
    ],
    buildBody: v =>
      v.modo === 'cdiParaPre'
        ? { modo: 'cdiParaPre', cdiAa: pct(v.cdiAa), pctCdi: num(v.pctCdi) }
        : { cdiAa: pct(v.cdiAa), preAa: pct(v.preAa) },
  },
  {
    nome: 'cdi-spread',
    titulo: 'CDI + spread ↔ % do CDI',
    grupo: 'Conversões',
    descricao: 'Converte CDI + spread em % do CDI (composto e linear) e o inverso.',
    fields: [
      {
        key: 'modo', label: 'Direção', kind: 'select', default: 'spreadParaPct',
        options: [
          { label: 'CDI + spread → % do CDI', value: 'spreadParaPct' },
          { label: '% do CDI → CDI + spread', value: 'pctParaSpread' },
        ],
      },
      { key: 'cdiAa', label: 'CDI a.a. (%)', kind: 'percent', default: 14.4, premise: s => s.escalares.cdiAa * 100 },
      { key: 'spreadAa', label: 'Spread a.a. (%)', kind: 'percent', default: 2, showIf: v => v.modo !== 'pctParaSpread' },
      { key: 'pctCdi', label: '% do CDI (ex.: 1.10)', kind: 'number', default: 1.1, showIf: v => v.modo === 'pctParaSpread' },
    ],
    buildBody: v =>
      v.modo === 'pctParaSpread'
        ? { modo: 'pctParaSpread', cdiAa: pct(v.cdiAa), pctCdi: num(v.pctCdi) }
        : { cdiAa: pct(v.cdiAa), spreadAa: pct(v.spreadAa) },
  },

  // ──────────────────────── Cross-currency & CDI ────────────────────────
  {
    nome: 'cross-ccy',
    titulo: 'USD/EUR + spread → % do CDI',
    grupo: 'Cross-currency & CDI',
    descricao: 'Paridade coberta: equivalente travável em % do CDI a partir de spread externo.',
    fields: [
      {
        key: 'moeda', label: 'Moeda', kind: 'select', default: 'USD',
        options: [
          { label: 'USD', value: 'USD' },
          { label: 'EUR', value: 'EUR' },
        ],
      },
      { key: 'spreadEstrangeiroAa', label: 'Spread externo a.a. (%)', kind: 'percent', default: 8 },
      { key: 'cdiAa', label: 'CDI a.a. (%)', kind: 'percent', default: 14.4, premise: s => s.escalares.cdiAa * 100 },
      {
        key: 'cupomEstrangeiroAa', label: 'Cupom cambial a.a. (%)', kind: 'percent', default: 5.481,
        premise: (s, v) => (v.moeda === 'EUR' ? s.escalares.cupomEurAa : s.escalares.cupomUsdAa)! * 100,
        help: 'Cupom no vértice da vida média do papel.',
      },
    ],
    buildBody: v => ({
      spreadEstrangeiroAa: pct(v.spreadEstrangeiroAa),
      cdiAa: pct(v.cdiAa),
      cupomEstrangeiroAa: pct(v.cupomEstrangeiroAa),
    }),
  },
  {
    nome: 'ipca',
    titulo: 'IPCA+ (NTN-B) → Pré / % CDI',
    grupo: 'Cross-currency & CDI',
    descricao: 'Fisher: taxa real + IPCA → nominal, % do CDI e breakeven de inflação.',
    fields: [
      { key: 'realAa', label: 'Taxa real a.a. (%)', kind: 'percent', default: 7 },
      { key: 'ipcaAa', label: 'IPCA proj. a.a. (%)', kind: 'percent', default: 4.5, premise: s => s.escalares.ipcaFocus12m * 100 },
      { key: 'cdiAa', label: 'CDI a.a. (%)', kind: 'percent', default: 14.4, premise: s => s.escalares.cdiAa * 100 },
      { key: 'preMercadoAa', label: 'Pré de mercado a.a. (%)', kind: 'percent', optional: true, help: 'Para breakeven e veredito.' },
    ],
    buildBody: v => ({
      realAa: pct(v.realAa),
      ipcaAa: pct(v.ipcaAa),
      cdiAa: pct(v.cdiAa),
      preMercadoAa: pct(v.preMercadoAa),
    }),
  },

  // ───────────────────────────── Renda Fixa BR ──────────────────────────
  {
    nome: 'pu-titulos',
    titulo: 'PU de títulos (LTN / NTN-F)',
    grupo: 'Renda Fixa BR',
    descricao: 'Preço unitário base 252: LTN (zero-cupom) e NTN-F (cupom semestral).',
    fields: [
      {
        key: 'tipo', label: 'Título', kind: 'select', default: 'LTN',
        options: [
          { label: 'LTN / Prefixado', value: 'LTN' },
          { label: 'NTN-F', value: 'NTNF' },
        ],
      },
      { key: 'vn', label: 'Valor nominal', kind: 'number', default: 1000, showIf: v => v.tipo !== 'NTNF' },
      { key: 'face', label: 'Face', kind: 'number', default: 1000, showIf: v => v.tipo === 'NTNF' },
      { key: 'iaa', label: 'Taxa (YTM) a.a. (%)', kind: 'percent', default: 13.8 },
      { key: 'du', label: 'Dias úteis até venc.', kind: 'int', default: 504, showIf: v => v.tipo !== 'NTNF' },
      { key: 'couponRateAnnual', label: 'Cupom anual (%)', kind: 'percent', default: 10, showIf: v => v.tipo === 'NTNF' },
      { key: 'm', label: 'Pagamentos/ano', kind: 'int', default: 2, showIf: v => v.tipo === 'NTNF' },
      { key: 'cuponsDu', label: 'du dos cupons (lista)', kind: 'numlist', default: '126,252,378,504,630,756', showIf: v => v.tipo === 'NTNF' },
    ],
    buildBody: v =>
      v.tipo === 'NTNF'
        ? {
            tipo: 'NTNF',
            face: num(v.face),
            iaa: pct(v.iaa),
            couponRateAnnual: pct(v.couponRateAnnual),
            m: int(v.m),
            cuponsDu: String(v.cuponsDu).split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n)),
          }
        : { tipo: 'LTN', vn: num(v.vn), iaa: pct(v.iaa), du: int(v.du) },
  },
  {
    nome: 'duration',
    titulo: 'Duration / DV01 / Convexidade',
    grupo: 'Renda Fixa BR',
    descricao: 'Macaulay, modificada, DV01 e convexidade (regime efetivo anual).',
    fields: [
      { key: 'face', label: 'Face', kind: 'number', default: 1000 },
      { key: 'couponRateAnnual', label: 'Cupom anual (%)', kind: 'percent', default: 10 },
      { key: 'ytm', label: 'YTM a.a. (%)', kind: 'percent', default: 13 },
      { key: 'm', label: 'Pagamentos/ano', kind: 'int', default: 2 },
      { key: 'n', label: 'Nº de períodos', kind: 'int', default: 10 },
    ],
    buildBody: v => ({
      face: num(v.face),
      couponRateAnnual: pct(v.couponRateAnnual),
      ytm: pct(v.ytm),
      m: int(v.m),
      n: int(v.n),
    }),
  },
  {
    nome: 'amortizacao',
    titulo: 'Amortização (Price & SAC)',
    grupo: 'Renda Fixa BR',
    descricao: 'Gera as duas tabelas e totais. Taxa por período.',
    fields: [
      { key: 'principal', label: 'Principal', kind: 'money', default: 1000000 },
      { key: 'i', label: 'Taxa por período (%)', kind: 'percent', default: 1.2 },
      { key: 'n', label: 'Nº de parcelas', kind: 'int', default: 36 },
    ],
    buildBody: v => ({ principal: num(v.principal), i: pct(v.i), n: int(v.n) }),
  },

  // ───────────────────────────── Derivativos ────────────────────────────
  {
    nome: 'swap',
    titulo: 'Swap CDI × Pré (MtM)',
    grupo: 'Derivativos',
    descricao: 'Marcação a mercado (recebe pré / paga CDI). Modelo simplificado.',
    fields: [
      { key: 'notional', label: 'Notional', kind: 'money', default: 1000000 },
      { key: 'preContratada', label: 'Pré contratada a.a. (%)', kind: 'percent', default: 14.5 },
      { key: 'preMercadoAa', label: 'Pré de mercado a.a. (%)', kind: 'percent', default: 13.14 },
      { key: 'duTotal', label: 'du total', kind: 'int', default: 252 },
      { key: 'duDecorridos', label: 'du decorridos', kind: 'int', default: 126 },
      { key: 'fatorCdiAcumulado', label: 'Fator CDI acumulado', kind: 'number', default: 1.048 },
    ],
    buildBody: v => ({
      notional: num(v.notional),
      preContratada: pct(v.preContratada),
      preMercadoAa: pct(v.preMercadoAa),
      duTotal: int(v.duTotal),
      duDecorridos: int(v.duDecorridos),
      fatorCdiAcumulado: num(v.fatorCdiAcumulado),
    }),
  },
  {
    nome: 'forward-ndf',
    titulo: 'Forward / NDF USD-BRL',
    grupo: 'Derivativos',
    descricao: 'Câmbio a termo por paridade coberta e ajuste de liquidação NDF.',
    fields: [
      {
        key: 'modo', label: 'Cálculo', kind: 'select', default: 'forward',
        options: [
          { label: 'Forward (paridade)', value: 'forward' },
          { label: 'NDF (ajuste)', value: 'ndf' },
        ],
      },
      { key: 'spot', label: 'Spot (R$/US$)', kind: 'number', default: 5.4, premise: s => s.escalares.usdbrl, showIf: v => v.modo !== 'ndf' },
      { key: 'iBrAa', label: 'DI pré a.a. (%)', kind: 'percent', default: 14.4, showIf: v => v.modo !== 'ndf' },
      { key: 'du', label: 'Dias úteis', kind: 'int', default: 252, showIf: v => v.modo !== 'ndf' },
      { key: 'cupomUsdAa', label: 'Cupom USD a.a. (%)', kind: 'percent', default: 5.5909, premise: s => (s.escalares.cupomUsdAa ?? 0) * 100, showIf: v => v.modo !== 'ndf' },
      { key: 'dc', label: 'Dias corridos', kind: 'int', default: 360, showIf: v => v.modo !== 'ndf' },
      { key: 'ptaxVencimento', label: 'PTAX no vencimento', kind: 'number', default: 5.7, showIf: v => v.modo === 'ndf' },
      { key: 'kContratado', label: 'Strike contratado', kind: 'number', default: 5.55, showIf: v => v.modo === 'ndf' },
      { key: 'notionalUsd', label: 'Notional (US$)', kind: 'money', default: 1000000, showIf: v => v.modo === 'ndf' },
    ],
    buildBody: v =>
      v.modo === 'ndf'
        ? { modo: 'ndf', ptaxVencimento: num(v.ptaxVencimento), kContratado: num(v.kContratado), notionalUsd: num(v.notionalUsd) }
        : { modo: 'forward', spot: num(v.spot), iBrAa: pct(v.iBrAa), du: int(v.du), cupomUsdAa: pct(v.cupomUsdAa), dc: int(v.dc) },
  },
  {
    nome: 'tir-vpl',
    titulo: 'TIR / VPL (fluxos datados)',
    grupo: 'Derivativos',
    descricao: 'XIRR/XNPV de fluxos irregulares (saídas negativas, entradas positivas).',
    fields: [
      { key: 'fluxos', label: 'Fluxos de caixa', kind: 'flows', default: [] },
      { key: 'taxaDesconto', label: 'Taxa de desconto a.a. (%)', kind: 'percent', default: 14.4, optional: true },
      { key: 'custoCapital', label: 'Custo de capital a.a. (%)', kind: 'percent', optional: true },
    ],
    buildBody: v => ({
      fluxos: (v.fluxos || []).filter((f: any) => f.date && f.amount !== '' && f.amount != null)
        .map((f: any) => ({ date: f.date, amount: Number(f.amount) })),
      taxaDesconto: pct(v.taxaDesconto),
      custoCapital: pct(v.custoCapital),
    }),
  },

  // ─────────────────────────── EUA / Money Market ───────────────────────
  {
    nome: 'us-money-market',
    titulo: 'EUA — Money Market / SOFR / Day counts',
    grupo: 'EUA / Money Market',
    descricao: 'T-bill (yields), SOFR + spread (EAY) e juros por convenção de dias.',
    fields: [
      {
        key: 'modo', label: 'Cálculo', kind: 'select', default: 'tbill',
        options: [
          { label: 'T-bill (yields)', value: 'tbill' },
          { label: 'SOFR + spread (EAY)', value: 'sofr' },
          { label: 'Juros por convenção', value: 'juros' },
        ],
      },
      { key: 'face', label: 'Face', kind: 'number', default: 100, showIf: v => v.modo === 'tbill' },
      { key: 'preco', label: 'Preço', kind: 'number', default: 98.5, showIf: v => v.modo === 'tbill' },
      { key: 'diasTbill', label: 'Dias até venc.', kind: 'int', default: 90, showIf: v => v.modo === 'tbill' },
      { key: 'sofrAa', label: 'SOFR a.a. (%)', kind: 'percent', default: 4.3, premise: s => s.escalares.sofrAa * 100, showIf: v => v.modo === 'sofr' },
      { key: 'spreadAa', label: 'Spread a.a. (%)', kind: 'percent', default: 1.5, showIf: v => v.modo === 'sofr' },
      { key: 'diasSofr', label: 'Dias do período', kind: 'int', default: 90, showIf: v => v.modo === 'sofr' },
      { key: 'notional', label: 'Notional', kind: 'money', default: 1000000, showIf: v => v.modo === 'juros' },
      { key: 'taxa', label: 'Taxa a.a. (%)', kind: 'percent', default: 5, showIf: v => v.modo === 'juros' },
      { key: 'd0', label: 'Data inicial', kind: 'date', default: '2026-01-15', showIf: v => v.modo === 'juros' },
      { key: 'd1', label: 'Data final', kind: 'date', default: '2026-07-15', showIf: v => v.modo === 'juros' },
    ],
    buildBody: v => {
      if (v.modo === 'sofr') {
        return { modo: 'sofr', sofrAa: pct(v.sofrAa), spreadAa: pct(v.spreadAa), dias: int(v.diasSofr) };
      }
      if (v.modo === 'juros') {
        return { modo: 'juros', notional: num(v.notional), taxa: pct(v.taxa), d0: v.d0, d1: v.d1 };
      }
      return { modo: 'tbill', face: num(v.face), preco: num(v.preco), dias: int(v.diasTbill) };
    },
  },
];

export function getCalcByNome(nome: string): CalcDef | undefined {
  return CALCULADORES.find(c => c.nome === nome);
}
