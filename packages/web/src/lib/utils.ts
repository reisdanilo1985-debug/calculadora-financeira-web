import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata número como moeda BRL */
export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formata número como percentual */
export function formatPercent(value: number, decimals = 4): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/** Formata fator acumulado (ex: 1.123456) */
export function formatFactor(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

/** 'AAAA-MM-DD' puro ou seguido de hora ('AAAA-MM-DDTHH:mm…' / 'AAAA-MM-DD HH:mm…'). */
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;

/** Formata data como DD/MM/YYYY (padrão brasileiro em toda a aplicação) */
export function formatDate(date: Date | string): string {
  // Data civil 'AAAA-MM-DD' sem hora: só reordena (não passa por fuso horário)
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Valor vindo da API exibido como texto: se for data ISO ('AAAA-MM-DD…'),
 * devolve dd/mm/aaaa; qualquer outro texto passa inalterado.
 */
export function exibirSeData(valor: string): string {
  const m = DATA_ISO.exec(valor);
  if (!m) return valor;
  // Com hora e fuso (…Z / ±hh:mm) é um instante: converte; senão é data civil
  return /T.*(Z|[+-]\d{2}:?\d{2})$/.test(valor) ? formatDate(valor) : `${m[3]}/${m[2]}/${m[1]}`;
}

const MESES_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Datas dentro de textos vindos da API/fontes externas → dd/mm/aaaa:
 *  - 'AAAA-MM-DD' (ex.: "ANBIMA ETTJ · 2026-10-23");
 *  - mês/ano em inglês das tabelas do Damodaran ("January 2026" = atualização de 01/01/2026).
 */
export function datasNoTextoBR(texto: string): string {
  return texto
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => `${d}/${m}/${y}`)
    .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/gi,
      (_, mes: string, ano: string) => `01/${String(MESES_EN.indexOf(mes.toLowerCase()) + 1).padStart(2, '0')}/${ano}`);
}

/** Formata data como "04/2025" */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${month}/${year}`;
}

/** Label amigável para IndexType */
export const INDEX_LABELS: Record<string, string> = {
  CDI: 'CDI',
  SELIC_META: 'Selic (Meta)',
  SELIC_OVER: 'Selic (Over)',
  IPCA: 'IPCA',
  IGPM: 'IGP-M',
  INCC: 'INCC',
  SOFR: 'SOFR',
  PREFIXADA: 'Pré-fixada',
};

/** Label amigável para DayCountBasis */
export const BASIS_LABELS: Record<number, string> = {
  252: '252 dias úteis',
  360: '360 dias corridos',
  365: '365 dias corridos',
};
