/**
 * Catálogo declarativo dos calculadores de Tesouraria (a landing conta por esta lista).
 * Cada definição descreve seus campos e como montar o corpo da requisição.
 * Mantém a UI compacta (um formulário genérico) cobrindo todos os cálculos.
 *
 * Unidades: campos `percent` são digitados em % e convertidos para fração no
 * buildBody. O core/API trabalha sempre em fração decimal.
 *
 * Entrada numérica: os campos são texto em pt-BR (vírgula decimal, ponto de
 * milhar) lidos por `@/lib/numeroPtBr`. NUNCA usar `Number(x)` em valor vindo
 * do formulário — "-10.000" viraria −10.
 */

import { PremissasSnapshot, VerticeCurva } from '@/lib/api';
import {
  LeituraNumero,
  lerNumeroPtBr,
  parseListaInteirosPtBr,
  parseNumeroPtBr,
} from '@/lib/numeroPtBr';

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
  grupo: (typeof GRUPOS)[number];
  descricao: string;
  fields: FieldDef[];
  buildBody: (v: Record<string, any>) => Record<string, any>;
}

// ── Leitura dos campos numéricos (pt-BR) ─────────────────────────────────────

const KINDS_NUMERICOS: ReadonlySet<FieldKind> = new Set<FieldKind>(['percent', 'money', 'number', 'int']);

/**
 * Lê o valor de um campo pelas regras pt-BR do seu tipo. É a MESMA regra usada
 * pela UI (mensagem no campo) e pelos helpers do buildBody (que lançam erro):
 * o que a tela aceita é exatamente o que vai para a API.
 *  - percent / number (taxas, fatores, preços): "1.048" é ambíguo → erro;
 *  - money (e valores dos fluxos): ponto de milhar aceito ("-10.000" = −10000);
 *  - int: exige inteiro ("1.260" = 1260; "252,5" → erro).
 */
export function lerCampoNumerico(kind: FieldKind, valor: unknown): LeituraNumero {
  return lerNumeroPtBr(valor, {
    inteiro: kind === 'int',
    rejeitarAmbiguo: kind === 'percent' || kind === 'number',
  });
}

/** Mensagem de erro de um campo (null = válido, vazio ou não numérico). */
export function erroCampo(f: FieldDef, valor: unknown): string | null {
  if (f.kind === 'numlist') {
    const r = parseListaInteirosPtBr(valor);
    return r.tipo === 'erro' ? r.mensagem : null;
  }
  if (!KINDS_NUMERICOS.has(f.kind)) return null; // select, date; flows → erroValorFluxo
  const r = lerCampoNumerico(f.kind, valor);
  return r.tipo === 'erro' ? r.mensagem : null;
}

/** Mensagem de erro do valor de uma linha de fluxo (TIR/VPL); null = válido ou vazio. */
export function erroValorFluxo(valor: unknown): string | null {
  const r = lerCampoNumerico('money', valor);
  return r.tipo === 'erro' ? r.mensagem : null;
}

// Helpers de conversão (form → corpo da requisição). Entrada inválida LANÇA —
// nunca vira um número errado no corpo. Vazio → undefined (nunca 0).
function ler(kind: FieldKind, x: unknown): number | undefined {
  const r = lerCampoNumerico(kind, x);
  if (r.tipo === 'erro') throw new Error(`Valor inválido "${String(x)}": ${r.mensagem}`);
  return r.tipo === 'ok' ? r.valor : undefined;
}
const pct = (x: any): number | undefined => {
  const n = ler('percent', x);
  return n === undefined ? undefined : n / 100;
};
const num = (x: any): number | undefined => ler('number', x);
const money = (x: any): number | undefined => ler('money', x);
const int = (x: any): number | undefined => ler('int', x);
const listaInt = (x: any): number[] => {
  const r = parseListaInteirosPtBr(x);
  if (r.tipo === 'erro') throw new Error(r.mensagem);
  return r.tipo === 'ok' ? r.valores : [];
};
/** Prazo usado para interpolar premissas: vazio/inválido → NaN (premissa não calculada). */
const prazo = (x: any): number => {
  const r = parseNumeroPtBr(x);
  return r.tipo === 'ok' ? r.valor : NaN;
};

// ── Ponte de interpolação: curva do snapshot → taxa no prazo (método linear,
// extrapolação flat — espelha `interpolaTaxa` do core). Prazo na unidade da
// curva (du para diPre/real; dc para cupomUsd/cupomEur/ust).
function interpLinear(prazo: number, vs: VerticeCurva[]): number | undefined {
  if (!vs || !vs.length || !isFinite(prazo)) return undefined;
  const p = [...vs].sort((a, b) => a.prazo - b.prazo);
  if (prazo <= p[0].prazo) return p[0].taxa;
  if (prazo >= p[p.length - 1].prazo) return p[p.length - 1].taxa;
  let i = 0;
  while (i < p.length - 1 && !(prazo >= p[i].prazo && prazo <= p[i + 1].prazo)) i++;
  const { prazo: x0, taxa: y0 } = p[i];
  const { prazo: x1, taxa: y1 } = p[i + 1];
  return y0 + (y1 - y0) * ((prazo - x0) / (x1 - x0));
}

/**
 * Constrói um `premise` que auto-preenche um campo `percent` interpolando uma
 * curva do snapshot no prazo dado. Retorna o valor em % (o buildBody reconverte).
 */
type CurvaKey = keyof PremissasSnapshot['curvas'];
const premiseFromCurve =
  (curva: CurvaKey | ((v: Record<string, any>) => CurvaKey), prazo: (v: Record<string, any>) => number) =>
  (s: PremissasSnapshot, v: Record<string, any>): number | undefined => {
    const key = typeof curva === 'function' ? curva(v) : curva;
    const taxa = interpLinear(prazo(v), (s.curvas?.[key] as VerticeCurva[]) || []);
    return taxa == null ? undefined : taxa * 100;
  };

/** Grupos do menu da Tesouraria, na ordem em que aparecem. */
export const GRUPOS = [
  'Conversão de taxas',
  'Captação externa',
  'Títulos públicos',
  'Derivativos',
  'EUA',
] as const;

export const CALCULADORES: CalcDef[] = [
  // ─────────────────────────── Conversão de taxas ───────────────────────────
  {
    nome: 'conversor',
    titulo: 'Equivalência de taxas',
    grupo: 'Conversão de taxas',
    descricao: 'Taxa efetiva equivalente por dia, mês, trimestre, semestre e ano, e ponte 252↔360.',
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
    grupo: 'Conversão de taxas',
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
      // Digitado em % (110 = 110% do CDI); o corpo segue em fração (1,10)
      { key: 'pctCdi', label: '% do CDI (ex.: 110)', kind: 'percent', default: 110, showIf: v => v.modo === 'cdiParaPre' },
    ],
    buildBody: v =>
      v.modo === 'cdiParaPre'
        ? { modo: 'cdiParaPre', cdiAa: pct(v.cdiAa), pctCdi: pct(v.pctCdi) }
        : { cdiAa: pct(v.cdiAa), preAa: pct(v.preAa) },
  },
  {
    nome: 'cdi-spread',
    titulo: 'CDI + spread ↔ % do CDI',
    grupo: 'Conversão de taxas',
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
      { key: 'pctCdi', label: '% do CDI (ex.: 110)', kind: 'percent', default: 110, showIf: v => v.modo === 'pctParaSpread' },
    ],
    buildBody: v =>
      v.modo === 'pctParaSpread'
        ? { modo: 'pctParaSpread', cdiAa: pct(v.cdiAa), pctCdi: pct(v.pctCdi) }
        : { cdiAa: pct(v.cdiAa), spreadAa: pct(v.spreadAa) },
  },
  {
    nome: 'ipca',
    titulo: 'IPCA+ em pré, % do CDI e breakeven',
    grupo: 'Conversão de taxas',
    descricao: 'Fisher: taxa real + IPCA → taxa nominal (pré), % do CDI e breakeven de inflação.',
    fields: [
      { key: 'prazoDu', label: 'Prazo (dias úteis)', kind: 'int', default: 252, help: 'Vértice para interpolar a curva real (NTN-B).' },
      { key: 'realAa', label: 'Taxa real a.a. (%)', kind: 'percent', default: 7, premise: premiseFromCurve('real', v => prazo(v.prazoDu)) },
      { key: 'ipcaAa', label: 'IPCA projetado a.a. (%)', kind: 'percent', default: 4.5, premise: s => s.escalares.ipcaFocus12m * 100 },
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

  // ──────────────────────────── Captação externa ────────────────────────────
  {
    nome: 'cross-ccy',
    titulo: 'Dívida em USD/EUR ↔ CDI',
    grupo: 'Captação externa',
    descricao: 'Paridade coberta no prazo (B3): converte dívida em moeda estrangeira + spread em % do CDI / CDI + spread — e o inverso.',
    fields: [
      {
        key: 'modo', label: 'Direção', kind: 'select', default: 'moedaParaCdi',
        options: [
          { label: 'USD/EUR + spread → CDI + spread', value: 'moedaParaCdi' },
          { label: 'CDI + spread → USD/EUR + spread', value: 'cdiParaMoeda' },
        ],
      },
      {
        key: 'moeda', label: 'Moeda', kind: 'select', default: 'USD',
        options: [
          { label: 'USD', value: 'USD' },
          { label: 'EUR', value: 'EUR' },
        ],
      },
      { key: 'spreadEstrangeiroAa', label: 'Spread externo a.a. (%)', kind: 'percent', default: 8, showIf: v => v.modo !== 'cdiParaMoeda' },
      { key: 'spreadLocalAa', label: 'Spread sobre o CDI a.a. (%)', kind: 'percent', default: 2, showIf: v => v.modo === 'cdiParaMoeda', help: 'A perna local "CDI + X%" a converter em moeda.' },
      { key: 'cdiAa', label: 'CDI a.a. (%)', kind: 'percent', default: 14.4, premise: s => s.escalares.cdiAa * 100 },
      // Prazo da paridade (B3): CDI capitaliza em du/252; cupom e spread são lineares em dc/360.
      { key: 'prazoDu', label: 'Prazo (dias úteis)', kind: 'int', default: 504, help: 'Dias úteis do prazo: capitaliza o CDI em base 252.' },
      { key: 'prazoDc', label: 'Prazo (dias corridos)', kind: 'int', default: 720, help: 'Vértice da vida média do papel: interpola o cupom cambial e entra linear (base 360) no cupom e no spread.' },
      {
        key: 'cupomEstrangeiroAa', label: 'Cupom cambial a.a. (%)', kind: 'percent', default: 5.481,
        premise: premiseFromCurve(v => (v.moeda === 'EUR' ? 'cupomEur' : 'cupomUsd'), v => prazo(v.prazoDc)),
        help: 'Interpolado da curva de cupom cambial no prazo (seed na Fase B).',
      },
    ],
    buildBody: v =>
      v.modo === 'cdiParaMoeda'
        ? {
            modo: 'cdiParaMoeda',
            cdiAa: pct(v.cdiAa),
            spreadLocalAa: pct(v.spreadLocalAa),
            cupomEstrangeiroAa: pct(v.cupomEstrangeiroAa),
            du: int(v.prazoDu),
            dc: int(v.prazoDc),
          }
        : {
            spreadEstrangeiroAa: pct(v.spreadEstrangeiroAa),
            cdiAa: pct(v.cdiAa),
            cupomEstrangeiroAa: pct(v.cupomEstrangeiroAa),
            du: int(v.prazoDu),
            dc: int(v.prazoDc),
          },
  },

  // ──────────────────────────── Títulos públicos ────────────────────────────
  {
    nome: 'pu-titulos',
    titulo: 'Preço de LTN e NTN-F (PU)',
    grupo: 'Títulos públicos',
    descricao: 'Preço unitário base 252: LTN (prefixado sem cupom) e NTN-F (cupom semestral).',
    fields: [
      {
        key: 'tipo', label: 'Título', kind: 'select', default: 'LTN',
        options: [
          { label: 'LTN / Prefixado', value: 'LTN' },
          { label: 'NTN-F', value: 'NTNF' },
        ],
      },
      { key: 'vn', label: 'Valor de face', kind: 'number', default: 1000, showIf: v => v.tipo !== 'NTNF' },
      { key: 'face', label: 'Valor de face', kind: 'number', default: 1000, showIf: v => v.tipo === 'NTNF' },
      { key: 'iaa', label: 'Taxa (YTM) a.a. (%)', kind: 'percent', default: 13.8 },
      { key: 'du', label: 'Dias úteis até o vencimento', kind: 'int', default: 504, showIf: v => v.tipo !== 'NTNF' },
      { key: 'couponRateAnnual', label: 'Cupom anual (%)', kind: 'percent', default: 10, showIf: v => v.tipo === 'NTNF' },
      { key: 'm', label: 'Pagamentos por ano', kind: 'int', default: 2, showIf: v => v.tipo === 'NTNF' },
      { key: 'cuponsDu', label: 'Dias úteis de cada cupom (lista)', kind: 'numlist', default: '126,252,378,504,630,756', showIf: v => v.tipo === 'NTNF' },
    ],
    buildBody: v =>
      v.tipo === 'NTNF'
        ? {
            tipo: 'NTNF',
            face: num(v.face),
            iaa: pct(v.iaa),
            couponRateAnnual: pct(v.couponRateAnnual),
            m: int(v.m),
            cuponsDu: listaInt(v.cuponsDu),
          }
        : { tipo: 'LTN', vn: num(v.vn), iaa: pct(v.iaa), du: int(v.du) },
  },
  {
    nome: 'duration',
    titulo: 'Duration, DV01 e convexidade',
    grupo: 'Títulos públicos',
    descricao: 'Macaulay, modificada, DV01 e convexidade (regime efetivo anual), com a convenção de cupom explícita.',
    fields: [
      {
        key: 'convencaoCupom', label: 'Convenção do cupom', kind: 'select', default: 'simples',
        options: [
          { label: 'Simples — face × taxa ÷ m', value: 'simples' },
          { label: 'NTN-F — (1 + taxa)^(1/m) − 1', value: 'ntnf' },
        ],
        help: 'NTN-F dá o mesmo preço de "Preço de LTN e NTN-F (PU)" (10% a.a. semestral: cupom 48,81 × 50,00 por 1.000).',
      },
      { key: 'face', label: 'Valor de face', kind: 'number', default: 1000 },
      { key: 'couponRateAnnual', label: 'Cupom anual (%)', kind: 'percent', default: 10 },
      { key: 'ytm', label: 'Taxa (YTM) a.a. (%)', kind: 'percent', default: 13 },
      { key: 'm', label: 'Pagamentos por ano', kind: 'int', default: 2 },
      { key: 'n', label: 'Nº de períodos', kind: 'int', default: 10 },
    ],
    buildBody: v => ({
      convencaoCupom: v.convencaoCupom === 'ntnf' ? 'ntnf' : 'simples',
      face: num(v.face),
      couponRateAnnual: pct(v.couponRateAnnual),
      ytm: pct(v.ytm),
      m: int(v.m),
      n: int(v.n),
    }),
  },
  // Amortização Price × SAC: fica na Calculadora (tese Fluxo Completo, com comparação entre sistemas).

  // ───────────────────────────── Derivativos ────────────────────────────
  {
    nome: 'swap',
    titulo: 'Swap pré × CDI: marcação a mercado',
    grupo: 'Derivativos',
    descricao: 'Marcação a mercado para quem recebe pré e paga CDI. Modelo simplificado.',
    fields: [
      { key: 'notional', label: 'Notional (R$)', kind: 'money', default: 1000000 },
      { key: 'preContratada', label: 'Pré contratada a.a. (%)', kind: 'percent', default: 14.5 },
      { key: 'duTotal', label: 'Dias úteis totais', kind: 'int', default: 252 },
      { key: 'duDecorridos', label: 'Dias úteis decorridos', kind: 'int', default: 126 },
      {
        key: 'preMercadoAa', label: 'Pré de mercado a.a. (%)', kind: 'percent', default: 13.14,
        premise: premiseFromCurve('diPre', v => prazo(v.duTotal) - prazo(v.duDecorridos)),
        help: 'Interpolado da curva pré no prazo remanescente (dias úteis totais − decorridos).',
      },
      { key: 'fatorCdiAcumulado', label: 'Fator CDI acumulado', kind: 'number', default: 1.048 },
    ],
    buildBody: v => ({
      notional: money(v.notional),
      preContratada: pct(v.preContratada),
      preMercadoAa: pct(v.preMercadoAa),
      duTotal: int(v.duTotal),
      duDecorridos: int(v.duDecorridos),
      fatorCdiAcumulado: num(v.fatorCdiAcumulado),
    }),
  },
  {
    nome: 'forward-ndf',
    titulo: 'Dólar a termo (forward e NDF)',
    grupo: 'Derivativos',
    descricao: 'Dólar a termo por paridade coberta e ajuste de liquidação da NDF.',
    fields: [
      {
        key: 'modo', label: 'Cálculo', kind: 'select', default: 'forward',
        options: [
          { label: 'Forward (paridade)', value: 'forward' },
          { label: 'NDF (ajuste)', value: 'ndf' },
        ],
      },
      { key: 'spot', label: 'Spot (R$/US$)', kind: 'number', default: 5.4, premise: s => s.escalares.usdbrl, showIf: v => v.modo !== 'ndf' },
      { key: 'du', label: 'Dias úteis', kind: 'int', default: 252, showIf: v => v.modo !== 'ndf' },
      { key: 'iBrAa', label: 'DI pré a.a. (%)', kind: 'percent', default: 14.4, premise: premiseFromCurve('diPre', v => prazo(v.du)), showIf: v => v.modo !== 'ndf' },
      { key: 'dc', label: 'Dias corridos', kind: 'int', default: 360, showIf: v => v.modo !== 'ndf' },
      { key: 'cupomUsdAa', label: 'Cupom USD a.a. (%)', kind: 'percent', default: 5.5909, premise: premiseFromCurve('cupomUsd', v => prazo(v.dc)), showIf: v => v.modo !== 'ndf' },
      { key: 'ptaxVencimento', label: 'PTAX no vencimento', kind: 'number', default: 5.7, showIf: v => v.modo === 'ndf' },
      { key: 'kContratado', label: 'Strike contratado', kind: 'number', default: 5.55, showIf: v => v.modo === 'ndf' },
      { key: 'notionalUsd', label: 'Notional (US$)', kind: 'money', default: 1000000, showIf: v => v.modo === 'ndf' },
    ],
    buildBody: v =>
      v.modo === 'ndf'
        ? { modo: 'ndf', ptaxVencimento: num(v.ptaxVencimento), kContratado: num(v.kContratado), notionalUsd: money(v.notionalUsd) }
        : { modo: 'forward', spot: num(v.spot), iBrAa: pct(v.iBrAa), du: int(v.du), cupomUsdAa: pct(v.cupomUsdAa), dc: int(v.dc) },
  },
  // TIR / VPL de fluxos datados: fica na Calculadora (tese Valor Presente).

  // ─────────────────────────────────── EUA ───────────────────────────────────
  {
    nome: 'us-money-market',
    titulo: 'Mercado monetário EUA (T-bill e SOFR)',
    grupo: 'EUA',
    descricao: 'Yields de T-bill, SOFR + spread em taxa efetiva anual (EAY) e juros em 30/360, ACT/360 e ACT/365.',
    fields: [
      {
        key: 'modo', label: 'Cálculo', kind: 'select', default: 'tbill',
        options: [
          { label: 'T-bill (yields)', value: 'tbill' },
          { label: 'SOFR + spread (taxa efetiva anual)', value: 'sofr' },
          { label: 'Juros por convenção de dias', value: 'juros' },
        ],
      },
      { key: 'face', label: 'Valor de face', kind: 'number', default: 100, showIf: v => v.modo === 'tbill' },
      { key: 'preco', label: 'Preço', kind: 'number', default: 98.5, showIf: v => v.modo === 'tbill' },
      { key: 'diasTbill', label: 'Dias até o vencimento', kind: 'int', default: 90, showIf: v => v.modo === 'tbill' },
      { key: 'sofrAa', label: 'SOFR a.a. (%)', kind: 'percent', default: 4.3, premise: s => s.escalares.sofrAa * 100, showIf: v => v.modo === 'sofr' },
      { key: 'spreadAa', label: 'Spread a.a. (%)', kind: 'percent', default: 1.5, showIf: v => v.modo === 'sofr' },
      { key: 'diasSofr', label: 'Dias do período', kind: 'int', default: 90, showIf: v => v.modo === 'sofr' },
      { key: 'notional', label: 'Notional (US$)', kind: 'money', default: 1000000, showIf: v => v.modo === 'juros' },
      { key: 'taxa', label: 'Taxa a.a. (%)', kind: 'percent', default: 5, showIf: v => v.modo === 'juros' },
      { key: 'd0', label: 'Data inicial', kind: 'date', default: '2026-01-15', showIf: v => v.modo === 'juros' },
      { key: 'd1', label: 'Data final', kind: 'date', default: '2026-07-15', showIf: v => v.modo === 'juros' },
    ],
    buildBody: v => {
      if (v.modo === 'sofr') {
        return { modo: 'sofr', sofrAa: pct(v.sofrAa), spreadAa: pct(v.spreadAa), dias: int(v.diasSofr) };
      }
      if (v.modo === 'juros') {
        return { modo: 'juros', notional: money(v.notional), taxa: pct(v.taxa), d0: v.d0, d1: v.d1 };
      }
      return { modo: 'tbill', face: num(v.face), preco: num(v.preco), dias: int(v.diasTbill) };
    },
  },
];

export function getCalcByNome(nome: string): CalcDef | undefined {
  return CALCULADORES.find(c => c.nome === nome);
}
