/**
 * Testes do parser da ETTJ ANBIMA.
 * Fixture: trecho REAL da resposta de CZ-down.asp capturada em 01/07/2026,
 * incluindo acentos corrompidos (latin-1 lido como texto) e milhar com ponto.
 */

import { describe, it, expect } from 'vitest';
import { parseEttjAnbima } from '../../src/treasury';

function near(actual: number, expected: number, tol: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

const FIXTURE = `01/07/2026;Beta 1;Beta 2;Beta 3;Beta 4;Lambda 1;Lambda 2
PREFIXADOS;0,14244785469011;-4,17963085616872E-03;-1,76338937692003E-02;2,21665799663186E-02;1,25307136472059;0,504334569312079
IPCA;7,01110754708797E-02;5,89431389506583E-02;-2,19914145293608E-02;4,60229716669306E-02;4,20925675129582;0,495706741732079

ETTJ Inflação Implicita (IPCA)
Vertices;ETTJ IPCA;ETTJ PREF;Inflação Implícita
126;9,3052;13,8029;4,1148
252;8,7340;13,9071;4,7575
378;8,6581;14,0453;4,9579
504;8,6624;14,1769;5,0748
1.008;8,5984;14,4820;5,4177
2.520;7,9884;14,4930;6,0234
2.646;7,9488;;
8.442;7,3144;;

PREFIXADOS (CIRCULAR 3.361)
Vertices;Taxa (%a.a.)
21;13,8072
42;13,7952
63;13,78
252;13,9071
2.520;14,4930
`;

// Variante com acentos corrompidos exatamente como o latin-1 mal decodificado aparece.
const FIXTURE_MOJIBAKE = FIXTURE
  .replace(/Inflação/g, 'Infla��o')
  .replace(/Implícita/g, 'Impl�cita');

describe('ANBIMA · parseEttjAnbima', () => {
  const r = parseEttjAnbima(FIXTURE);

  it('extrai a data de referência da 1ª linha', () => {
    expect(r.dataBase.getFullYear()).toBe(2026);
    expect(r.dataBase.getMonth()).toBe(6); // julho
    expect(r.dataBase.getDate()).toBe(1);
  });

  it('curva pré vem da tabela Circular 3.361 (granular, de 21 du)', () => {
    expect(r.diPre[0].prazo).toBe(21);
    near(r.diPre[0].taxa, 0.138072, 5e-9);
    expect(r.diPre.map(v => v.prazo)).toEqual([21, 42, 63, 252, 2520]);
  });

  it('milhar com ponto: "1.008" → 1008 e "2.520" → 2520', () => {
    expect(r.real.some(v => v.prazo === 1008)).toBe(true);
    expect(r.diPre.some(v => v.prazo === 2520)).toBe(true);
  });

  it('curva real vem da coluna ETTJ IPCA, inclusive vértices longos (>2520)', () => {
    near(r.real.find(v => v.prazo === 126)!.taxa, 0.093052, 5e-9);
    expect(r.real.some(v => v.prazo === 8442)).toBe(true);
    // vértices > 2520 NÃO existem na pré desta fixture
    expect(r.diPre.some(v => v.prazo > 2520)).toBe(false);
  });

  it('cross-check: pré@252 da Circular bate com ETTJ PREF@252 da outra tabela', () => {
    // Ambas publicam o mesmo vértice — devem coincidir na fonte (13,9071%).
    near(r.diPre.find(v => v.prazo === 252)!.taxa, 0.139071, 5e-9);
  });

  it('tolera acentos corrompidos (latin-1 mal decodificado)', () => {
    const m = parseEttjAnbima(FIXTURE_MOJIBAKE);
    expect(m.diPre.length).toBe(r.diPre.length);
    expect(m.real.length).toBe(r.real.length);
  });

  it('lança com CSV vazio ou sem curva pré', () => {
    expect(() => parseEttjAnbima('')).toThrow();
    expect(() => parseEttjAnbima('01/07/2026;Beta 1\nPREFIXADOS;0,1\n')).toThrow();
  });
});
