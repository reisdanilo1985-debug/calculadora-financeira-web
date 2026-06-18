/**
 * §2.8 Amortização — Price (parcela constante) & SAC (amortização constante).
 * Função pura. Taxa periódica em fração decimal. Retorna ambas as tabelas + totais.
 */

import Decimal from 'decimal.js';
import { D, pmt } from '../primitives';

export interface AmortizacaoInput {
  /** Principal (valor financiado). */
  principal: number;
  /** Taxa de juros por período (fração, ex.: 0.012 para 1,2% a.m.). */
  i: number;
  /** Número de parcelas. */
  n: number;
}

export interface ParcelaRow {
  periodo: number;
  juros: number;
  amortizacao: number;
  parcela: number;
  saldo: number;
}

export interface TabelaAmortizacao {
  parcelas: ParcelaRow[];
  totalJuros: number;
  totalParcelas: number;
  /** Valor da parcela (Price) — constante. */
  pmt?: number;
}

export interface AmortizacaoResult {
  price: TabelaAmortizacao;
  sac: TabelaAmortizacao;
}

function buildPrice(principal: number, i: number, n: number): TabelaAmortizacao {
  const parcelaValor = D(pmt(i, n, principal));
  const parcelas: ParcelaRow[] = [];
  let saldo = D(principal);
  let totalJuros = D(0);
  let totalParcelas = D(0);

  for (let k = 1; k <= n; k++) {
    const juros = saldo.mul(i);
    let amort = parcelaValor.minus(juros);
    let parcela = parcelaValor;
    // Última parcela: zera o saldo residual de arredondamento
    if (k === n) {
      amort = saldo;
      parcela = juros.plus(amort);
    }
    saldo = saldo.minus(amort);
    totalJuros = totalJuros.plus(juros);
    totalParcelas = totalParcelas.plus(parcela);
    parcelas.push({
      periodo: k,
      juros: juros.toNumber(),
      amortizacao: amort.toNumber(),
      parcela: parcela.toNumber(),
      saldo: saldo.toNumber(),
    });
  }

  return {
    parcelas,
    totalJuros: totalJuros.toNumber(),
    totalParcelas: totalParcelas.toNumber(),
    pmt: parcelaValor.toNumber(),
  };
}

function buildSac(principal: number, i: number, n: number): TabelaAmortizacao {
  const amort = D(principal).div(n);
  const parcelas: ParcelaRow[] = [];
  let saldo = D(principal);
  let totalJuros = D(0);
  let totalParcelas = D(0);

  for (let k = 1; k <= n; k++) {
    const juros = saldo.mul(i);
    const parcela = amort.plus(juros);
    saldo = saldo.minus(amort);
    if (k === n) saldo = new Decimal(0); // residual de arredondamento
    totalJuros = totalJuros.plus(juros);
    totalParcelas = totalParcelas.plus(parcela);
    parcelas.push({
      periodo: k,
      juros: juros.toNumber(),
      amortizacao: amort.toNumber(),
      parcela: parcela.toNumber(),
      saldo: saldo.toNumber(),
    });
  }

  return {
    parcelas,
    totalJuros: totalJuros.toNumber(),
    totalParcelas: totalParcelas.toNumber(),
  };
}

export function amortizacao(input: AmortizacaoInput): AmortizacaoResult {
  const { principal, i, n } = input;
  if (principal <= 0 || n <= 0) throw new Error('amortizacao: principal e n devem ser > 0.');
  return {
    price: buildPrice(principal, i, n),
    sac: buildSac(principal, i, n),
  };
}
