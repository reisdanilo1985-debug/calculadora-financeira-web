/**
 * Testes das curvas do Tesouro Direto e da interpolação.
 *
 * (1) Builder: linhas cruas (pré/real/ruído) → vértices esperados em du, taxa fração.
 * (2) Interpolação: `interpolaTaxa` linear num prazo intermediário e flat nas pontas.
 * (3) Reconciliação leve: um prazo conhecido cai onde a interpolação manual manda.
 */

import { describe, it, expect } from 'vitest';
import { construirCurvasTesouro, interpolaTaxa, diasUteis, TesouroRow } from '../../src/treasury';

function near(actual: number, expected: number, tol: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

const d = (iso: string) => new Date(`${iso}T12:00:00`);

describe('Tesouro · construirCurvasTesouro', () => {
  const dataBase = d('2026-06-30');
  // Vencimentos com du conhecidos a partir de 30/06/2026.
  const rows: TesouroRow[] = [
    // PRÉ zero-cupom (LTN)
    { tipoTitulo: 'Tesouro Prefixado', dataVencimento: d('2027-01-01'), dataBase, taxaVendaManha: 14.20 },
    { tipoTitulo: 'Tesouro Prefixado', dataVencimento: d('2029-01-01'), dataBase, taxaVendaManha: 13.80 },
    // REAL zero-cupom (NTN-B Principal)
    { tipoTitulo: 'Tesouro IPCA+', dataVencimento: d('2029-05-15'), dataBase, taxaVendaManha: 7.10 },
    // Ruído: papéis com cupom e outros indexadores devem ser IGNORADOS
    { tipoTitulo: 'Tesouro Prefixado com Juros Semestrais', dataVencimento: d('2033-01-01'), dataBase, taxaVendaManha: 13.5 },
    { tipoTitulo: 'Tesouro IPCA+ com Juros Semestrais', dataVencimento: d('2045-05-15'), dataBase, taxaVendaManha: 6.5 },
    { tipoTitulo: 'Tesouro IGPM+ com Juros Semestrais', dataVencimento: d('2031-01-01'), dataBase, taxaVendaManha: 6.2 },
    { tipoTitulo: 'Tesouro Selic', dataVencimento: d('2031-03-01'), dataBase, taxaVendaManha: 0.04 },
    // Pregão ANTIGO — não deve entrar (só a data base mais recente conta)
    { tipoTitulo: 'Tesouro Prefixado', dataVencimento: d('2027-01-01'), dataBase: d('2020-01-02'), taxaVendaManha: 5.0 },
  ];

  const curvas = construirCurvasTesouro(rows);

  it('seleciona a data base mais recente', () => {
    expect(curvas.dataBase.getTime()).toBe(dataBase.getTime());
  });

  it('curva pré: só LTN, em du, taxa fração, ordenada', () => {
    expect(curvas.diPre).toHaveLength(2);
    const du1 = diasUteis(dataBase, d('2027-01-01'));
    expect(curvas.diPre[0].prazo).toBe(du1);
    expect(curvas.diPre[0].taxa).toBeCloseTo(0.142, 12);
    // ordenada por prazo crescente
    expect(curvas.diPre[0].prazo).toBeLessThan(curvas.diPre[1].prazo);
    expect(curvas.diPre[1].taxa).toBeCloseTo(0.138, 12);
  });

  it('curva real: só NTN-B Principal', () => {
    expect(curvas.real).toHaveLength(1);
    const du = diasUteis(dataBase, d('2029-05-15'));
    expect(curvas.real[0].prazo).toBe(du);
    expect(curvas.real[0].taxa).toBeCloseTo(0.071, 12);
  });

  it('ignora cupom semestral, IGP-M e Selic', () => {
    // nada com taxa 13.5/6.5/6.2/0.04 deveria aparecer
    const todas = [...curvas.diPre, ...curvas.real].map(v => v.taxa);
    expect(todas).not.toContain(0.135);
    expect(todas).not.toContain(0.065);
    expect(todas).not.toContain(0.062);
    expect(todas).not.toContain(0.0004);
  });

  it('lança quando não há linhas', () => {
    expect(() => construirCurvasTesouro([])).toThrow();
  });
});

describe('Tesouro · interpolaTaxa (ponte de decisão)', () => {
  // Curva pré em du (base 252).
  const vs = [21, 252, 756];
  const taxas = [0.144, 0.143, 0.138];

  it('interpola linearmente num prazo intermediário', () => {
    // meio do caminho entre 252 (0,143) e 756 (0,138) → 504 ≈ 0,1405
    near(interpolaTaxa(504, vs, taxas, 'linear'), 0.1405, 5e-6);
  });

  it('extrapola flat nas pontas', () => {
    near(interpolaTaxa(1, vs, taxas, 'linear'), 0.144, 5e-6); // antes do 1º vértice
    near(interpolaTaxa(2000, vs, taxas, 'linear'), 0.138, 5e-6); // após o último
  });
});
