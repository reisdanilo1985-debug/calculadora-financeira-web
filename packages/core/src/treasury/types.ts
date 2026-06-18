/**
 * Tipos compartilhados do módulo de Tesouraria.
 *
 * Convenção de unidades: nesta camada, TODAS as taxas são frações decimais
 * (0.144 = 14,40%). A API/UI converte de/para percentual na fronteira.
 */

/** Um vértice de curva: prazo (meses, du ou anos, conforme a curva) + taxa (fração). */
export interface VerticeCurva {
  /** Prazo do vértice (unidade documentada por curva — meses por padrão). */
  prazo: number;
  /** Taxa do vértice em fração decimal. */
  taxa: number;
}

/** Proveniência de uma premissa: de onde veio, quando, e se está velha. */
export interface Proveniencia {
  /** Fonte legível (ex.: "BCB SGS 12", "manual", "FMP Treasury"). */
  fonte: string;
  /** Timestamp ISO da coleta. */
  ts: string;
  /** True quando o dado está além da cadência esperada (usando LKG). */
  flagDesatualizado: boolean;
}

/**
 * Snapshot datado de premissas de mercado consumido pelos calculadores.
 * Escalares e curvas em fração decimal; cada chave tem proveniência associada.
 */
export interface PremissasSnapshot {
  /** Data de referência do snapshot (YYYY-MM-DD). */
  dataRef: string;
  /** Premissas escalares (fração decimal). */
  escalares: {
    cdiAa: number;
    selicMeta: number;
    ipcaFocus12m: number;
    usdbrl: number;
    eurusd: number;
    sofrAa: number;
    /** Cupom cambial USD no vértice de referência (manual na Fase 1). */
    cupomUsdAa?: number;
    /** Cupom cambial EUR no vértice de referência (manual na Fase 1). */
    cupomEurAa?: number;
  };
  /** Curvas como vetores de vértices (fração decimal). */
  curvas: {
    diPre?: VerticeCurva[];
    cupomUsd?: VerticeCurva[];
    cupomEur?: VerticeCurva[];
    ust?: VerticeCurva[];
    real?: VerticeCurva[];
  };
  /** Proveniência por chave de premissa (ex.: "cdiAa", "diPre"). */
  proveniencia: Record<string, Proveniencia>;
}

/** Nomes canônicos dos 13 calculadores (usados na rota /api/tesouraria/calc/:nome). */
export type CalculadorNome =
  | 'conversor'
  | 'cross-ccy'
  | 'pre-cdi'
  | 'cdi-spread'
  | 'ipca'
  | 'tir-vpl'
  | 'amortizacao'
  | 'duration'
  | 'pu-titulos'
  | 'swap'
  | 'forward-ndf'
  | 'us-money-market';
