/**
 * Padrão brasileiro de datas na interface: dd/mm/aaaa.
 */
import { describe, it, expect } from 'vitest';
import { formatDate, exibirSeData, datasNoTextoBR } from '@/lib/utils';

describe('datasNoTextoBR', () => {
  it('troca datas ISO e mês/ano em inglês dentro do texto', () => {
    expect(datasNoTextoBR('ANBIMA ETTJ · 2026-10-23')).toBe('ANBIMA ETTJ · 23/10/2026');
    expect(datasNoTextoBR('January 2026')).toBe('01/01/2026');
    expect(datasNoTextoBR('Damodaran — data-base December 2025 (x)')).toBe('Damodaran — data-base 01/12/2025 (x)');
    expect(datasNoTextoBR('BCB SGS (LKG)')).toBe('BCB SGS (LKG)');
  });
});

describe('formatDate', () => {
  it('data civil AAAA-MM-DD vira dd/mm/aaaa sem deslocar o dia', () => {
    expect(formatDate('2026-03-01')).toBe('01/03/2026');
    expect(formatDate('2024-12-31')).toBe('31/12/2024');
  });

  it('instante ISO serializado pela API (meia-noite local em UTC ou em São Paulo)', () => {
    expect(formatDate('2026-03-01T00:00:00.000Z')).toBe('01/03/2026');
    expect(formatDate('2026-03-01T03:00:00.000Z')).toBe('01/03/2026');
  });

  it('Date e texto inválido', () => {
    expect(formatDate(new Date(Date.UTC(2025, 0, 2)))).toBe('02/01/2025');
    expect(formatDate('não é data')).toBe('não é data');
  });
});

describe('exibirSeData', () => {
  it('converte só o que é data ISO', () => {
    expect(exibirSeData('2026-10-25')).toBe('25/10/2026');
    expect(exibirSeData('2026-10-25 18:30:00.000')).toBe('25/10/2026');
    expect(exibirSeData('2026-10-25T03:00:00.000Z')).toBe('25/10/2026');
    expect(exibirSeData('ACT/360')).toBe('ACT/360');
    expect(exibirSeData('Bullet')).toBe('Bullet');
    expect(exibirSeData('2026')).toBe('2026');
  });
});
