/**
 * Definições compartilhadas entre template, parser e export do cronograma de
 * amortizações/aportes em Excel. Mantém o layout idêntico nos três módulos
 * (permite o ciclo exportar → editar → reimportar).
 */
import { AmortizationEntry } from '@/components/calculator/AmortizationModal';

export const SHEET_LANCAMENTOS = 'Lançamentos';
export const SHEET_INSTRUCOES = 'Instruções';

export const COLUNAS = [
  'Data',
  'Operação',
  'Tipo',
  'Valor',
  'Periodicidade',
  'Data Final',
  'Percentual Periódico',
] as const;

export const OPERACAO_PARA_DIRECTION: Record<string, AmortizationEntry['direction']> = {
  AMORTIZACAO: 'OUT',
  APORTE: 'IN',
};
export const DIRECTION_PARA_OPERACAO: Record<NonNullable<AmortizationEntry['direction']>, string> = {
  OUT: 'AMORTIZACAO',
  IN: 'APORTE',
};

export const TIPO_PARA_DOMINIO: Record<string, AmortizationEntry['type']> = {
  FIXO: 'FIXED',
  PERCENTUAL: 'PERCENTAGE',
  PERIODICO: 'PERIODIC',
};
export const DOMINIO_PARA_TIPO: Record<AmortizationEntry['type'], string> = {
  FIXED: 'FIXO',
  PERCENTAGE: 'PERCENTUAL',
  PERIODIC: 'PERIODICO',
};

export const PERIODICIDADE_PARA_DOMINIO: Record<string, string> = {
  MENSAL: 'MONTHLY',
  TRIMESTRAL: 'QUARTERLY',
  SEMESTRAL: 'SEMIANNUAL',
  ANUAL: 'ANNUAL',
};
export const DOMINIO_PARA_PERIODICIDADE: Record<string, string> = {
  MONTHLY: 'MENSAL',
  QUARTERLY: 'TRIMESTRAL',
  SEMIANNUAL: 'SEMESTRAL',
  ANNUAL: 'ANUAL',
};

/** Remove acentos e normaliza para comparação tolerante de cabeçalhos/valores. */
export function normalizar(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

/** dd/mm/aaaa a partir de uma Date (para exibição na planilha). */
export function paraDataBR(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
