import { z } from 'zod';
import { AmortizationEntry } from '@/components/calculator/AmortizationModal';
import {
  SHEET_LANCAMENTOS,
  OPERACAO_PARA_DIRECTION,
  TIPO_PARA_DOMINIO,
  PERIODICIDADE_PARA_DOMINIO,
  normalizar,
} from './scheduleShared';

export interface ParseError {
  /** Número da linha na planilha Excel (contando o cabeçalho). */  row: number;
  message: string;
}

export interface ParseResult {
  entries: AmortizationEntry[];
  errors: ParseError[];
  warnings: string[];
}

// ─────────────────────────────── Conversões tolerantes ──────────────────────

const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30); // época do Excel (serial 0)

function paraData(valor: unknown): Date | null {
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === 'number') {
    const d = new Date(SERIAL_EPOCH_MS + valor * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(valor ?? '').trim();
  if (!s) return null;
  // dd/mm/aaaa
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }
  // aaaa-mm-dd (ISO)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function paraDataISO(valor: unknown): string | null {
  const d = paraData(valor);
  return d ? d.toISOString().slice(0, 10) : null;
}

function paraNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return isFinite(valor) ? valor : null;
  const s = String(valor ?? '').trim();
  if (!s) return null;
  // BR: milhar com ponto, decimal com vírgula (ex.: 1.234,56)
  const normalizado = /,\d{1,2}$/.test(s) || s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s;
  const n = Number(normalizado);
  return isFinite(n) ? n : null;
}

// ─────────────────────────────── Schema (por tipo) ───────────────────────────

const base = { date: z.string(), direction: z.enum(['OUT', 'IN']) };

const entrySchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('FIXED'), value: z.number().positive('valor deve ser > 0') }),
  z.object({
    ...base,
    type: z.literal('PERCENTAGE'),
    value: z.number().positive('percentual deve ser > 0').max(100, 'percentual não pode exceder 100'),
  }),
  z.object({
    ...base,
    type: z.literal('PERIODIC'),
    value: z.number().positive('valor deve ser > 0'),
    periodicity: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
    periodicEndDate: z.string(),
    isPeriodicPercentage: z.boolean(),
  }),
]);

// ─────────────────────────────── Parser principal ────────────────────────────

/** Lê um arquivo .xlsx/.xls de cronograma e retorna as entradas válidas + erros por linha. */
export async function parseScheduleFile(file: File): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { cellDates: true });

  const sheetName = wb.SheetNames.find(n => normalizar(n) === normalizar(SHEET_LANCAMENTOS)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { entries: [], errors: [{ row: 0, message: `Aba "${SHEET_LANCAMENTOS}" não encontrada no arquivo.` }], warnings: [] };
  }

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const errors: ParseError[] = [];
  const warnings: string[] = [];
  const entries: AmortizationEntry[] = [];

  // Mapa de cabeçalho normalizado → chave original (tolerante a acentos/caixa).
  const primeiraLinha = rows[0] ?? {};
  const headerMap = new Map<string, string>();
  for (const key of Object.keys(primeiraLinha)) {
    headerMap.set(normalizar(key), key);
  }
  const campo = (row: Record<string, unknown>, nomeNormalizado: string): unknown => {
    const original = headerMap.get(nomeNormalizado);
    return original ? row[original] : undefined;
  };

  rows.forEach((row, idx) => {
    const excelRow = idx + 2; // linha 1 = cabeçalho
    const valoresVazios = Object.values(row).every(v => String(v ?? '').trim() === '');
    if (valoresVazios) return; // ignora linhas em branco

    const dataRaw = campo(row, 'DATA');
    const operacaoRaw = normalizar(campo(row, 'OPERACAO') ?? campo(row, 'OPERAÇÃO'));
    const tipoRaw = normalizar(campo(row, 'TIPO'));
    const valorRaw = campo(row, 'VALOR');
    const periodicidadeRaw = normalizar(campo(row, 'PERIODICIDADE'));
    const dataFinalRaw = campo(row, 'DATA FINAL');
    const percPeriodicoRaw = normalizar(campo(row, 'PERCENTUAL PERIODICO') ?? campo(row, 'PERCENTUAL PERIÓDICO'));

    const dataIso = paraDataISO(dataRaw);
    if (!dataIso) {
      errors.push({ row: excelRow, message: `"Data" inválida: "${dataRaw}".` });
      return;
    }

    const direction = OPERACAO_PARA_DIRECTION[operacaoRaw];
    if (!direction) {
      errors.push({ row: excelRow, message: `"Operação" deve ser AMORTIZACAO ou APORTE (veio "${operacaoRaw}").` });
      return;
    }

    const type = TIPO_PARA_DOMINIO[tipoRaw];
    if (!type) {
      errors.push({ row: excelRow, message: `"Tipo" deve ser FIXO, PERCENTUAL ou PERIODICO (veio "${tipoRaw}").` });
      return;
    }

    const value = paraNumero(valorRaw);
    if (value === null) {
      errors.push({ row: excelRow, message: `"Valor" inválido: "${valorRaw}".` });
      return;
    }

    let candidato: any = { date: dataIso, direction, type, value };

    if (type === 'PERIODIC') {
      const periodicity = PERIODICIDADE_PARA_DOMINIO[periodicidadeRaw];
      const periodicEndDate = paraDataISO(dataFinalRaw);
      if (!periodicity) {
        errors.push({ row: excelRow, message: `"Periodicidade" deve ser MENSAL, TRIMESTRAL, SEMESTRAL ou ANUAL (veio "${periodicidadeRaw}").` });
        return;
      }
      if (!periodicEndDate) {
        errors.push({ row: excelRow, message: `"Data Final" inválida ou ausente para lançamento periódico: "${dataFinalRaw}".` });
        return;
      }
      candidato = {
        ...candidato,
        periodicity,
        periodicEndDate,
        isPeriodicPercentage: percPeriodicoRaw === 'SIM',
      };
    }

    const parsed = entrySchema.safeParse(candidato);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      errors.push({ row: excelRow, message: first.message });
      return;
    }

    entries.push({ id: crypto.randomUUID(), ...parsed.data });
  });

  if (rows.length === 0) {
    warnings.push('A planilha não contém linhas de dados.');
  }

  return { entries, errors, warnings };
}
