/**
 * Primitivas compartilhadas do motor de Tesouraria.
 *
 * Convenções (idênticas à planilha Tesouraria_Calculos.xlsx):
 *   - Taxas SEMPRE em fração decimal nesta camada (ex.: 0.144 para 14,40% a.a.).
 *     A conversão percentual → fração é responsabilidade da API/UI.
 *   - Base 252 (dias úteis BR): fator = (1 + i)^(du/252)
 *   - Base 360 linear (money market): fator = 1 + i·(dc/360)
 *   - Base 360 composto: fator = (1 + i)^(dc/360)
 *   - Sinais de fluxo de caixa: saídas negativas, entradas positivas.
 *
 * Toda aritmética usa decimal.js (regra crítica do projeto). As funções são
 * puras (sem I/O, sem rede) e retornam `number` apenas na fronteira.
 */

import Decimal from 'decimal.js';
import { countBusinessDays, countCalendarDays } from '../utils/businessDays';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/** Atalho para construir um Decimal. */
export const D = (x: Decimal.Value): Decimal => new Decimal(x);

// ───────────────────────────── Contagem de dias ─────────────────────────────

/** Dias úteis entre datas (calendário ANBIMA/feriados BR), padrão de mesa. */
export function diasUteis(d0: Date, d1: Date): number {
  return countBusinessDays(d0, d1);
}

/** Dias corridos entre datas (d1 - d0). */
export function diasCorridos(d0: Date, d1: Date): number {
  return countCalendarDays(d0, d1);
}

/**
 * Convenção 30/360 (método US/NASD), equivalente ao DAYS360 do Excel (método FALSE).
 * Regras: se D1 == 31 → 30; se D2 == 31 e D1 (ajustado) == 30 → 30.
 */
export function days360(d0: Date, d1: Date): number {
  let day1 = d0.getDate();
  let day2 = d1.getDate();
  const m1 = d0.getMonth() + 1;
  const m2 = d1.getMonth() + 1;
  const y1 = d0.getFullYear();
  const y2 = d1.getFullYear();

  if (day1 === 31) day1 = 30;
  if (day2 === 31 && day1 === 30) day2 = 30;

  return (y2 - y1) * 360 + (m2 - m1) * 30 + (day2 - day1);
}

// ──────────────────── Capitalização e equivalência de taxa ───────────────────

/** fator = (1 + i)^(du/252). */
export function fator252(iaa: number, du: number): number {
  return D(1).plus(iaa).pow(D(du).div(252)).toNumber();
}

/** fator linear = 1 + i·(dc/360). */
export function fator360Linear(iaa: number, dc: number): number {
  return D(1).plus(D(iaa).mul(D(dc).div(360))).toNumber();
}

/** fator composto = (1 + i)^(dc/360). */
export function fator360Comp(iaa: number, dc: number): number {
  return D(1).plus(iaa).pow(D(dc).div(360)).toNumber();
}

/** Taxa equivalente para uma fração de ano. Ex.: mensal → fracaoAno = 1/12. */
export function equivalente(iaa: number, fracaoAno: number): number {
  return D(1).plus(iaa).pow(fracaoAno).minus(1).toNumber();
}

/** Taxa nominal (linear, m capitalizações) → efetiva anual. */
export function nominalParaEfetiva(nominal: number, m: number): number {
  return D(1).plus(D(nominal).div(m)).pow(m).minus(1).toNumber();
}

/** Taxa efetiva anual → nominal (linear, m capitalizações). */
export function efetivaParaNominal(iaa: number, m: number): number {
  return D(1).plus(iaa).pow(D(1).div(m)).minus(1).mul(m).toNumber();
}

// ──────────── % do CDI — convenção B3 (percentual sobre a taxa DI DIÁRIA) ────────────
//
// Caderno de Fórmulas B3 (CDB/DI): Fator DI = Π (1 + TDI·p), com
// TDI = (1 + DI)^(1/252) − 1. É a mesma convenção do CDIEngine da Calculadora.
// Com CDI constante a conversão abaixo é exata (ida e volta perfeita); a razão
// anual "pré ÷ CDI" é só uma aproximação de mesa e não é usada aqui.

/** TDI = (1 + CDI)^(1/252) − 1 — taxa DI diária implícita na taxa anual base 252. */
export function taxaDiDiaria(cdiAa: Decimal.Value): Decimal {
  const base = D(1).plus(cdiAa);
  if (!base.gt(0)) throw new Error('taxaDiDiaria: CDI deve ser maior que −100%.');
  return base.pow(D(1).div(252)).minus(1);
}

/** % do CDI (B3) equivalente a uma taxa a.a. base 252: p = [(1 + taxa)^(1/252) − 1] / TDI. */
export function pctCdiB3(taxaAa: Decimal.Value, cdiAa: Decimal.Value): Decimal {
  const tdi = taxaDiDiaria(cdiAa);
  if (tdi.isZero()) throw new Error('pctCdiB3: CDI deve ser diferente de zero.');
  const base = D(1).plus(taxaAa);
  if (!base.gt(0)) throw new Error('pctCdiB3: a taxa deve ser maior que −100%.');
  return base.pow(D(1).div(252)).minus(1).div(tdi);
}

/** Taxa a.a. base 252 do acúmulo diário a p% do CDI (B3): (1 + p·TDI)^252 − 1. */
export function taxaDePctCdiB3(pct: Decimal.Value, cdiAa: Decimal.Value): Decimal {
  const fatorDiario = D(1).plus(taxaDiDiaria(cdiAa).mul(pct));
  if (!fatorDiario.gt(0)) {
    throw new Error('taxaDePctCdiB3: o fator diário 1 + p·TDI deve ser positivo.');
  }
  return fatorDiario.pow(252).minus(1);
}

// ───────────────────────── Datas civis (fronteira da API) ─────────────────────────
//
// `new Date('2026-03-01')` é meia-noite UTC: num servidor em São Paulo vira
// 28/02 21h e o 30/360 (que lê getDate/getMonth locais) conta um dia errado.
// Os calculadores trabalham com Date à meia-noite LOCAL; estas funções levam a
// entrada textual para essa forma sem depender do fuso do servidor.

/** Fuso de referência das datas civis da aplicação. */
export const FUSO_BR = 'America/Sao_Paulo';

/** Date à meia-noite local de uma data civil; null se a data não existe (ex.: 31/02). */
function dataCivilLocal(ano: number, mes: number, dia: number): Date | null {
  const dt = new Date(2000, 0, 1);
  dt.setFullYear(ano, mes - 1, dia);
  dt.setHours(0, 0, 0, 0);
  if (dt.getFullYear() !== ano || dt.getMonth() !== mes - 1 || dt.getDate() !== dia) return null;
  return dt;
}

/** Componentes (ano, mês, dia) da data civil de um instante no fuso dado. */
function componentesNoFuso(instante: Date, timeZone: string): { ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find(p => p.type === tipo)?.value);
  return { ano: valor('year'), mes: valor('month'), dia: valor('day') };
}

/** Data civil 'AAAA-MM-DD' de um instante no fuso dado (padrão America/Sao_Paulo). */
export function isoCivilNoFuso(instante: Date, timeZone: string = FUSO_BR): string {
  const { ano, mes, dia } = componentesNoFuso(instante, timeZone);
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const RE_DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const RE_DATAHORA_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Lê uma data textual como DATA CIVIL (Date à meia-noite local), igual em
 * qualquer fuso de servidor:
 *  - 'AAAA-MM-DD' ou 'DD/MM/AAAA'                → a própria data;
 *  - 'AAAA-MM-DDThh:mm[:ss[.fff]]' sem fuso        → a data escrita (hora de parede);
 *  - com 'Z' ou deslocamento (ex.: '-03:00')       → a data civil do instante em
 *    America/Sao_Paulo (ou no fuso informado); com `timeZone = null`, ignora o
 *    fuso e vale a data escrita (regra "prefixo AAAA-MM-DD").
 * Formato não reconhecido ou data inexistente → null.
 */
export function parseDataCivil(valor: string, timeZone: string | null = FUSO_BR): Date | null {
  const s = String(valor).trim();
  let m = RE_DATA_ISO.exec(s);
  if (m) return dataCivilLocal(Number(m[1]), Number(m[2]), Number(m[3]));
  m = RE_DATA_BR.exec(s);
  if (m) return dataCivilLocal(Number(m[3]), Number(m[2]), Number(m[1]));
  m = RE_DATAHORA_ISO.exec(s);
  if (!m) return null;
  const escrita = dataCivilLocal(Number(m[1]), Number(m[2]), Number(m[3]));
  if (!escrita) return null;
  if (!m[7] || timeZone === null) return escrita; // sem fuso (ou regra "data escrita")
  const instante = new Date(s.replace(' ', 'T'));
  if (isNaN(instante.getTime())) return null;
  const { ano, mes, dia } = componentesNoFuso(instante, timeZone);
  return dataCivilLocal(ano, mes, dia);
}

// ─────────────────────────── Interpolação de curva ───────────────────────────

export type MetodoInterpolacao = 'linear' | 'loglinear_df';

/**
 * Interpola a taxa de uma curva num prazo arbitrário.
 *
 * @param prazo     prazo desejado (mesma unidade dos vértices: meses, du, anos…).
 * @param vertices  prazos dos vértices conhecidos.
 * @param taxas     taxas (fração decimal) correspondentes aos vértices.
 * @param metodo    'linear' (na taxa — o que a planilha faz via FORECAST) ou
 *                  'loglinear_df' (log-linear no fator de desconto, no-arbitrage).
 *
 * Extrapolação: FLAT nas pontas (mais seguro que extrapolar linearmente).
 */
export function interpolaTaxa(
  prazo: number,
  vertices: number[],
  taxas: number[],
  metodo: MetodoInterpolacao = 'linear'
): number {
  if (vertices.length === 0 || vertices.length !== taxas.length) {
    throw new Error('interpolaTaxa: vetores de vértices e taxas devem ter o mesmo tamanho (>0).');
  }

  const pairs = vertices
    .map((x, i) => ({ x, y: taxas[i] }))
    .sort((a, b) => a.x - b.x);

  // Extrapolação flat
  if (prazo <= pairs[0].x) return pairs[0].y;
  if (prazo >= pairs[pairs.length - 1].x) return pairs[pairs.length - 1].y;

  // Localiza o segmento [xi, xj]
  let i = 0;
  while (i < pairs.length - 1 && !(prazo >= pairs[i].x && prazo <= pairs[i + 1].x)) i++;
  const { x: xi, y: yi } = pairs[i];
  const { x: xj, y: yj } = pairs[i + 1];
  const w = D(prazo - xi).div(xj - xi); // peso ∈ [0,1]

  if (metodo === 'linear') {
    return D(yi).plus(D(yj).minus(yi).mul(w)).toNumber();
  }

  // log-linear no fator de desconto: df = (1+y)^(-x); interpola ln(df); volta a taxa
  const lnDfi = D(1).plus(yi).pow(-xi).ln();
  const lnDfj = D(1).plus(yj).pow(-xj).ln();
  const lnDf = lnDfi.plus(lnDfj.minus(lnDfi).mul(w));
  const df = lnDf.exp();
  // taxa = df^(-1/prazo) - 1
  return df.pow(D(-1).div(prazo)).minus(1).toNumber();
}

// ───────────────────────────── Solvers financeiros ───────────────────────────

export interface FluxoDatado {
  date: Date;
  amount: number;
}

/** Σ CF_k / (1+taxa)^((data_k - data_0)/365). Datas relativas ao primeiro fluxo. */
export function xnpv(taxa: number, fluxos: FluxoDatado[]): number {
  if (!fluxos.length) throw new Error('xnpv: ao menos um fluxo é necessário.');
  const d0 = fluxos[0].date;
  let soma = D(0);
  for (const f of fluxos) {
    const t = D(countCalendarDays(d0, f.date)).div(365);
    soma = soma.plus(D(f.amount).div(D(1).plus(taxa).pow(t)));
  }
  return soma.toNumber();
}

/** Derivada de xnpv em relação à taxa (para Newton-Raphson). */
function dXnpv(taxa: number, fluxos: FluxoDatado[]): number {
  const d0 = fluxos[0].date;
  let soma = D(0);
  for (const f of fluxos) {
    const t = D(countCalendarDays(d0, f.date)).div(365);
    // d/dr CF*(1+r)^(-t) = CF * (-t) * (1+r)^(-t-1)
    soma = soma.plus(
      D(f.amount).mul(t.neg()).mul(D(1).plus(taxa).pow(t.neg().minus(1)))
    );
  }
  return soma.toNumber();
}

/**
 * Número de trocas de sinal do fluxo em ordem cronológica. Fluxos no mesmo dia
 * são somados antes (entram com o mesmo expoente no XNPV); totais nulos são
 * ignorados.
 *
 * Regra de sinais de Descartes: há no máximo tantas TIRs quanto trocas de sinal.
 * Com MAIS DE UMA troca a TIR pode não ser única — a raiz devolvida por `xirr`
 * depende do chute — e a TIR não serve como critério de decisão (use o VPL).
 */
export function trocasDeSinal(fluxos: FluxoDatado[]): number {
  if (!fluxos.length) return 0;
  const inicio = fluxos.reduce((min, f) => (f.date.getTime() < min.getTime() ? f.date : min), fluxos[0].date);
  const porDia = new Map<number, Decimal>();
  for (const f of fluxos) {
    const t = countCalendarDays(inicio, f.date);
    porDia.set(t, (porDia.get(t) ?? D(0)).plus(f.amount));
  }
  let trocas = 0;
  let sinalAnterior = 0;
  for (const t of [...porDia.keys()].sort((a, b) => a - b)) {
    const sinal = porDia.get(t)!.cmp(0);
    if (sinal === 0) continue;
    if (sinalAnterior !== 0 && sinal !== sinalAnterior) trocas++;
    sinalAnterior = sinal;
  }
  return trocas;
}

/**
 * Taxa interna de retorno de fluxos datados (equivalente a XIRR do Excel).
 * Newton-Raphson com fallback para bissecção. Retorna taxa efetiva anual (fração).
 *
 * Atenção: com mais de uma troca de sinal (ver `trocasDeSinal`) pode haver mais
 * de uma TIR; esta função devolve UMA delas (a que o chute alcança).
 */
export function xirr(fluxos: FluxoDatado[], guess = 0.1): number {
  if (fluxos.length < 2) throw new Error('xirr: ao menos dois fluxos são necessários.');
  const temPositivo = fluxos.some(f => f.amount > 0);
  const temNegativo = fluxos.some(f => f.amount < 0);
  if (!temPositivo || !temNegativo) {
    throw new Error('xirr: é necessário ao menos um fluxo positivo e um negativo.');
  }

  // Newton-Raphson
  let rate = guess;
  for (let it = 0; it < 100; it++) {
    const f = xnpv(rate, fluxos);
    const df = dXnpv(rate, fluxos);
    if (!isFinite(f) || !isFinite(df) || Math.abs(df) < 1e-14) break;
    const next = rate - f / df;
    if (!isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < 1e-12) return next;
    rate = next;
  }

  // Fallback: bissecção procurando troca de sinal em [-0.9999, 100]
  let lo = -0.9999;
  let hi = 100;
  let flo = xnpv(lo, fluxos);
  let fhi = xnpv(hi, fluxos);
  if (flo * fhi > 0) {
    // varredura grosseira para localizar o intervalo
    let prev = lo;
    let fprev = flo;
    const steps = 2000;
    for (let s = 1; s <= steps; s++) {
      const r = lo + ((hi - lo) * s) / steps;
      const fr = xnpv(r, fluxos);
      if (isFinite(fr) && fprev * fr <= 0) {
        lo = prev;
        hi = r;
        flo = fprev;
        fhi = fr;
        break;
      }
      prev = r;
      fprev = fr;
    }
    if (flo * fhi > 0) throw new Error('xirr: não foi possível localizar a raiz.');
  }
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    const fmid = xnpv(mid, fluxos);
    if (Math.abs(fmid) < 1e-10 || (hi - lo) / 2 < 1e-12) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

/** Parcela constante (PMT do Excel): pv·i / (1 − (1+i)^(−n)). */
export function pmt(i: number, n: number, pv: number): number {
  if (i === 0) return D(pv).div(n).toNumber();
  return D(pv).mul(i).div(D(1).minus(D(1).plus(i).pow(-n))).toNumber();
}

/** Componente de juros da parcela `per` (1-indexado) de um financiamento Price. */
export function ipmt(i: number, per: number, n: number, pv: number): number {
  const parcela = D(pmt(i, n, pv));
  let saldo = D(pv);
  let juros = D(0);
  for (let k = 1; k <= per; k++) {
    juros = saldo.mul(i);
    const principal = parcela.minus(juros);
    saldo = saldo.minus(principal);
  }
  return juros.toNumber();
}

/** Componente de amortização da parcela `per` (1-indexado) de um financiamento Price. */
export function ppmt(i: number, per: number, n: number, pv: number): number {
  return D(pmt(i, n, pv)).minus(ipmt(i, per, n, pv)).toNumber();
}
