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

/** Formata data como DD/MM/YYYY */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
