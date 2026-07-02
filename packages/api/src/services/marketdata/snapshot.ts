/**
 * Montagem do snapshot de premissas de mercado para o motor de Tesouraria.
 *
 * Combina fontes JÁ existentes (BCB SGS, FRED, PTAX/Olinda) com premissas de
 * Fase 1 difíceis de automatizar (curvas DI/cupom/UST/real e cupons cambiais),
 * que entram como SEED editável pelo usuário na UI.
 *
 * Resiliência: cada premissa é resolvida de forma independente. Em falha, usa o
 * último valor válido (LKG) ou o SEED, marcando `flagDesatualizado=true`.
 * Todas as taxas no snapshot são FRAÇÃO decimal (0.144 = 14,40%).
 */

import axios from 'axios';
import { IndexType, PremissasSnapshot, Proveniencia, VerticeCurva } from '@correcao/core';
import { getIndexDataWithCache } from '../BCBService';
import { getSOFRWithCache } from '../FREDService';
import { PtaxService } from '../PtaxService';
import { getCurvasTesouro } from './TesouroDiretoService';
import { getCurvasAnbima } from './AnbimaEttjService';
import logger from '../../middleware/logger';

/** Fonte preferida das curvas pré/real. 'auto' = ANBIMA → Tesouro → LKG → seed. */
export type FonteCurva = 'auto' | 'tesouro';

// ──────────────────────────────── SEED (Fase 1) ──────────────────────────────
// Valores-semente coerentes com o golden master / aba Premissas da planilha.

const SEED_ESCALARES = {
  cdiAa: 0.144,
  selicMeta: 0.145,
  ipcaFocus12m: 0.045,
  usdbrl: 5.4,
  eurusd: 1.08,
  sofrAa: 0.043,
  cupomUsdAa: 0.05481,
  cupomEurAa: 0.0228,
};

// Unidades: diPre/real em DIAS ÚTEIS (du, base 252); cupomUsd/cupomEur/ust em
// DIAS CORRIDOS (dc, base 360). Coerente com o consumo por interpolação.
const SEED_CURVAS: PremissasSnapshot['curvas'] = {
  diPre: [
    { prazo: 21, taxa: 0.144 },
    { prazo: 63, taxa: 0.1438 },
    { prazo: 126, taxa: 0.1435 },
    { prazo: 252, taxa: 0.143 },
    { prazo: 504, taxa: 0.1395 },
    { prazo: 756, taxa: 0.138 },
  ],
  cupomUsd: [
    { prazo: 30, taxa: 0.052 },
    { prazo: 180, taxa: 0.0535 },
    { prazo: 360, taxa: 0.0559 },
    { prazo: 720, taxa: 0.0555 },
    { prazo: 1080, taxa: 0.05481 },
  ],
  cupomEur: [
    { prazo: 360, taxa: 0.021 },
    { prazo: 720, taxa: 0.0225 },
    { prazo: 1080, taxa: 0.0228 },
  ],
  ust: [
    { prazo: 30, taxa: 0.044 },
    { prazo: 90, taxa: 0.043 },
    { prazo: 360, taxa: 0.042 },
    { prazo: 720, taxa: 0.041 },
    { prazo: 1800, taxa: 0.041 },
    { prazo: 3600, taxa: 0.043 },
  ],
  real: [
    { prazo: 252, taxa: 0.068 },
    { prazo: 504, taxa: 0.07 },
    { prazo: 756, taxa: 0.072 },
  ],
};

// ─────────────────────────────── Cache / LKG ─────────────────────────────────

const TTL_MS = 30 * 60 * 1000; // 30 min
let lastSnapshot: PremissasSnapshot | null = null;
let lastBuiltAt = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function ok(fonte: string): Proveniencia {
  return { fonte, ts: nowIso(), flagDesatualizado: false };
}

function stale(fonte: string, motivo: 'LKG' | 'seed'): Proveniencia {
  return { fonte: `${fonte} (${motivo})`, ts: nowIso(), flagDesatualizado: true };
}

/** Resolve um escalar: tenta a fonte; em falha usa LKG e por fim o SEED. */
async function resolverEscalar(
  fn: () => Promise<number | null>,
  fonte: string,
  prev: number | undefined,
  seed: number
): Promise<{ value: number; prov: Proveniencia }> {
  try {
    const v = await fn();
    if (v != null && isFinite(v)) return { value: v, prov: ok(fonte) };
  } catch (e: any) {
    logger.warn(`[snapshot] ${fonte} falhou: ${e.message}`);
  }
  if (prev != null) return { value: prev, prov: stale(fonte, 'LKG') };
  return { value: seed, prov: stale(fonte, 'seed') };
}

// ──────────────────────────────── Fetchers ───────────────────────────────────

function janela(diasAtras: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - diasAtras * 86400000);
  return { start, end };
}

/** Último valor de uma série BCB já normalizada para % a.a. → fração. */
async function ultimoBcbAa(indexType: IndexType): Promise<number | null> {
  const { start, end } = janela(20);
  const { data } = await getIndexDataWithCache(indexType, start, end);
  if (!data.length) return null;
  return data[data.length - 1].value / 100;
}

/** IPCA projetado 12 meses (mediana Focus) via Olinda Expectativas. */
async function focusIpca12m(): Promise<number | null> {
  const url =
    'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoInflacao12Meses' +
    "?$top=1&$orderby=Data desc&$format=json&$filter=Indicador eq 'IPCA'";
  const { data } = await axios.get(url, { timeout: 15000 });
  const mediana = data?.value?.[0]?.Mediana;
  return mediana != null ? Number(mediana) / 100 : null;
}

/** USD/BRL (venda PTAX) — última cotação. */
async function usdbrlPtax(): Promise<number | null> {
  const { start, end } = janela(10);
  const quotes = await PtaxService.getDolarPeriod(start, end);
  if (!quotes.length) return null;
  return quotes[quotes.length - 1].sellRate;
}

/** EUR/USD — paridade de venda da cotação PTAX do EUR. */
async function eurusdPtax(): Promise<number | null> {
  const { start, end } = janela(10);
  const quotes = await PtaxService.getCurrencyPeriod('EUR', start, end);
  if (!quotes.length) return null;
  const last = quotes[quotes.length - 1];
  return last.sellParity ?? null;
}

/** SOFR — último valor (% a.a. → fração). */
async function sofrAa(): Promise<number | null> {
  const { start, end } = janela(15);
  const { data } = await getSOFRWithCache(start, end);
  if (!data.length) return null;
  return data[data.length - 1].value / 100;
}

// ─────────────────────────────── Build snapshot ──────────────────────────────

async function buildSnapshot(
  prev: PremissasSnapshot | null,
  force = false,
  fonteCurva: FonteCurva = 'auto'
): Promise<PremissasSnapshot> {
  const p = prev?.escalares;

  const [cdi, selic, ipca, usd, eur, sofr] = await Promise.all([
    resolverEscalar(() => ultimoBcbAa(IndexType.CDI), 'BCB SGS 12', p?.cdiAa, SEED_ESCALARES.cdiAa),
    resolverEscalar(() => ultimoBcbAa(IndexType.SELIC_META), 'BCB SGS 432', p?.selicMeta, SEED_ESCALARES.selicMeta),
    resolverEscalar(focusIpca12m, 'BCB Olinda Focus IPCA 12m', p?.ipcaFocus12m, SEED_ESCALARES.ipcaFocus12m),
    resolverEscalar(usdbrlPtax, 'BCB PTAX USD', p?.usdbrl, SEED_ESCALARES.usdbrl),
    resolverEscalar(eurusdPtax, 'BCB PTAX EUR (paridade)', p?.eurusd, SEED_ESCALARES.eurusd),
    resolverEscalar(sofrAa, 'FRED SOFR', p?.sofrAa, SEED_ESCALARES.sofrAa),
  ]);

  // ── Curvas pré/real ao vivo: ANBIMA ETTJ → Tesouro → LKG → seed. ──
  const curvas = cloneCurvas(SEED_CURVAS);
  let provDiPre = stale('manual', 'seed');
  let provReal = stale('manual', 'seed');

  const aplicar = (
    fonte: 'ANBIMA ETTJ' | 'Tesouro Transparente',
    r: { curvas: { diPre: typeof curvas.diPre; real: typeof curvas.real; dataBase: Date }; live: boolean }
  ) => {
    const base = r.curvas.dataBase.toISOString().slice(0, 10);
    const rotulo = `${fonte} · ${base}`;
    curvas.diPre = r.curvas.diPre;
    provDiPre = r.live ? ok(rotulo) : stale(fonte, 'LKG');
    if (r.curvas.real?.length) {
      curvas.real = r.curvas.real;
      provReal = r.live ? ok(rotulo) : stale(fonte, 'LKG');
    }
  };

  // ANBIMA primeiro (curva institucional); Tesouro só se a ANBIMA não vier ao vivo.
  const anbima = fonteCurva === 'tesouro' ? null : await getCurvasAnbima(force);
  if (anbima?.live && anbima.curvas.diPre.length) {
    aplicar('ANBIMA ETTJ', anbima);
  } else {
    const tesouro = await getCurvasTesouro(force);
    if (tesouro?.live && tesouro.curvas.diPre.length) {
      aplicar('Tesouro Transparente', tesouro);
    } else if (anbima && anbima.curvas.diPre.length) {
      aplicar('ANBIMA ETTJ', anbima); // LKG da ANBIMA
    } else if (tesouro && tesouro.curvas.diPre.length) {
      aplicar('Tesouro Transparente', tesouro); // LKG do Tesouro
    }
  }

  // Cupons cambiais e curvas 360 (cupomUsd/cupomEur/ust): manual/seed na Fase B.
  const proveniencia: Record<string, Proveniencia> = {
    cdiAa: cdi.prov,
    selicMeta: selic.prov,
    ipcaFocus12m: ipca.prov,
    usdbrl: usd.prov,
    eurusd: eur.prov,
    sofrAa: sofr.prov,
    cupomUsdAa: stale('manual', 'seed'),
    cupomEurAa: stale('manual', 'seed'),
    diPre: provDiPre,
    cupomUsd: stale('manual', 'seed'),
    cupomEur: stale('manual', 'seed'),
    ust: stale('manual', 'seed'),
    real: provReal,
  };

  return {
    dataRef: new Date().toISOString().slice(0, 10),
    escalares: {
      cdiAa: cdi.value,
      selicMeta: selic.value,
      ipcaFocus12m: ipca.value,
      usdbrl: usd.value,
      eurusd: eur.value,
      sofrAa: sofr.value,
      cupomUsdAa: SEED_ESCALARES.cupomUsdAa,
      cupomEurAa: SEED_ESCALARES.cupomEurAa,
    },
    curvas,
    proveniencia,
  };
}

function cloneCurvas(c: PremissasSnapshot['curvas']): PremissasSnapshot['curvas'] {
  const cp = (v?: VerticeCurva[]) => (v ? v.map(x => ({ ...x })) : undefined);
  return {
    diPre: cp(c.diPre),
    cupomUsd: cp(c.cupomUsd),
    cupomEur: cp(c.cupomEur),
    ust: cp(c.ust),
    real: cp(c.real),
  };
}

/**
 * Retorna o snapshot atual de premissas (com cache de 30 min + LKG).
 * @param force      ignora o TTL e reconstrói imediatamente.
 * @param fonteCurva 'auto' (ANBIMA→Tesouro) ou 'tesouro' (pula a ANBIMA).
 */
export async function getPremissasSnapshot(
  force = false,
  fonteCurva: FonteCurva = 'auto'
): Promise<PremissasSnapshot> {
  if (!force && lastSnapshot && Date.now() - lastBuiltAt < TTL_MS) {
    return lastSnapshot;
  }
  const snap = await buildSnapshot(lastSnapshot, force, fonteCurva);
  lastSnapshot = snap;
  lastBuiltAt = Date.now();
  return snap;
}
