/**
 * Testes do Fluxo Completo (Tese T4) — defeito C07 da auditoria de 12/09/2026.
 *
 * C07: PMT (Price) e amortização constante (SAC) eram calculados sobre o
 * principal ANTES da capitalização da carência, deixando saldo residual; e
 * carência ≥ prazo era aceita sem erro.
 *
 * Oráculo (auditoria-completa-2026-09-12/ref/F1-D-teses.py, seção T4):
 *   - i_m = (1 + i_a)^(1/12) − 1
 *   - PMT = P·i / (1 − (1+i)^−n)   (PMT do Excel, postecipado)
 *   - carência A capitaliza; parcelas calculadas sobre o saldo no fim da carência
 *   - saldo final = 0; conciliação Σpagamentos = Σjuros + principal
 * Casos: auditoria-completa-2026-09-12/casos/F1-D-teses.cjs (V-T4-*).
 * Os esperados são recalculados aqui em Decimal; os números publicados pelo
 * oráculo (ref/F1-D-teses.json) estão citados nos comentários.
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculate } from '../src/services/CalculationEngine';
import {
  AmortizationSystem,
  CalculationInput,
  DayCountBasis,
  GracePeriodType,
  IndexType,
  ThesisType,
} from '../src/models/types';

// ── Oráculo em Decimal ───────────────────────────────────────────────────────

const P = new Decimal(100000);
/** i_m = 1,12^(1/12) − 1  (ref "t4-i-mensal" = 0,009488792934582975) */
const iM = new Decimal('1.12').pow(new Decimal(1).div(12)).minus(1);

/** PMT = PV·i / (1 − (1+i)^−n) */
function pmt(rate: Decimal, n: number, pv: Decimal): Decimal {
  return pv.mul(rate).div(new Decimal(1).minus(rate.plus(1).pow(-n)));
}

/** Saldo capitalizado no fim de 3 meses de carência A (ref "t4-3-saldo-carencia-A" = 102873,73447220803) */
const Pc = P.mul(iM.plus(1).pow(3));

// ── Entrada (mesma dos casos V-T4 da auditoria) ─────────────────────────────

const INICIO = new Date(2025, 0, 15);  // 15/01/2025
const FIM_CARENCIA = new Date(2025, 3, 15); // 15/04/2025 → 3 meses

function t4(
  sistema: AmortizationSystem,
  extra: Partial<CalculationInput> = {}
): CalculationInput {
  return {
    initialAmount: 100000,
    startDate: INICIO,
    endDate: INICIO,
    indexType: IndexType.PREFIXADA,
    dayCountBasis: DayCountBasis.DC365,
    thesisType: ThesisType.FLUXO_COMPLETO,
    amortizationSystem: sistema,
    remunerationRate: 12,
    numberOfPeriods: 12,
    ...extra,
  };
}

function comCarencia(tipo: GracePeriodType, fim: Date = FIM_CARENCIA): Partial<CalculationInput> {
  return { gracePeriod: { type: tipo, endDate: fim } };
}

/** Σpagamentos − Σjuros − principal (deve ser 0) */
function conciliacao(input: CalculationInput): number {
  const r = calculate(input).fullFlowResult!;
  return r.totalPayments - r.totalInterest - 100000;
}

const TOL = 0.01;

// ── Sem carência (comportamento que NÃO pode mudar) ──────────────────────────

describe('FullFlowEngine — sem carência (regressão)', () => {
  it('V-T4-1-pmt: Price 100 mil, 12% a.a., 12 meses → parcela = pmt(i_m, 12, P) (ref 8.856,206738944109)', () => {
    const r = calculate(t4(AmortizationSystem.PRICE));
    const esperado = pmt(iM, 12, P).toNumber();
    expect(Math.abs(r.fullFlowResult!.rows[0].totalPayment - esperado)).toBeLessThan(1e-6);
    // Todas as parcelas iguais
    for (const row of r.fullFlowResult!.rows) {
      expect(Math.abs(row.totalPayment - esperado)).toBeLessThan(1e-6);
    }
  });

  it('V-T4-1-saldo: Price → saldo final 0', () => {
    expect(Math.abs(calculate(t4(AmortizationSystem.PRICE)).finalAmount)).toBeLessThan(TOL);
  });

  it('V-T4-2-amort: SAC → amortização constante = P/12 (ref 8.333,333333333334)', () => {
    const r = calculate(t4(AmortizationSystem.SAC));
    const esperado = P.div(12).toNumber();
    expect(Math.abs(r.fullFlowResult!.rows[5].amortization - esperado)).toBeLessThan(1e-6);
  });

  it('V-T4-2-parcela1: SAC → 1ª parcela = P/12 + P·i_m (ref 9.282,21262679163)', () => {
    const r = calculate(t4(AmortizationSystem.SAC));
    const esperado = P.div(12).plus(P.mul(iM)).toNumber();
    expect(Math.abs(r.fullFlowResult!.rows[0].totalPayment - esperado)).toBeLessThan(1e-6);
  });

  it('V-T4-2-saldo: SAC → saldo final 0', () => {
    expect(Math.abs(calculate(t4(AmortizationSystem.SAC)).finalAmount)).toBeLessThan(TOL);
  });

  it('sem carência: conciliação Price e SAC = 0', () => {
    expect(Math.abs(conciliacao(t4(AmortizationSystem.PRICE)))).toBeLessThan(TOL);
    expect(Math.abs(conciliacao(t4(AmortizationSystem.SAC)))).toBeLessThan(TOL);
  });
});

// ── Carência A (capitaliza) — C07 ────────────────────────────────────────────

describe('FullFlowEngine — carência A de 3 meses (C07)', () => {
  for (const sis of [AmortizationSystem.PRICE, AmortizationSystem.SAC]) {
    it(`V-T4-3-${sis}-saldo: saldo final 0`, () => {
      const r = calculate(t4(sis, comCarencia(GracePeriodType.A)));
      expect(Math.abs(r.finalAmount)).toBeLessThan(TOL);
    });

    it(`V-T4-3-${sis}-amortizado: total amortizado = P·(1+i_m)^3 (ref 102.873,73447220803)`, () => {
      const r = calculate(t4(sis, comCarencia(GracePeriodType.A)));
      expect(Math.abs(r.fullFlowResult!.totalAmortized - Pc.toNumber())).toBeLessThan(TOL);
      expect(Math.abs(r.totalAmortized - Pc.toNumber())).toBeLessThan(TOL);
    });

    it(`V-T4-3-${sis}-A-concilia: Σpagamentos − Σjuros − principal = 0`, () => {
      expect(Math.abs(conciliacao(t4(sis, comCarencia(GracePeriodType.A))))).toBeLessThan(TOL);
    });
  }

  it('Price: parcela pós-carência = pmt(i_m, 9, saldo capitalizado) (ref "t4-3-pmt-pos-carencia-A" = 11.979,547047610948)', () => {
    const rows = calculate(t4(AmortizationSystem.PRICE, comCarencia(GracePeriodType.A))).fullFlowResult!.rows;
    const esperado = pmt(iM, 9, Pc).toNumber();
    // Carência: 3 linhas sem pagamento, saldo crescendo
    expect(rows.slice(0, 3).every(r => r.isGracePeriod && r.totalPayment === 0)).toBe(true);
    expect(Math.abs(rows[2].closingBalance - Pc.toNumber())).toBeLessThan(1e-6);
    // Amortização: 9 parcelas iguais sobre o saldo capitalizado
    for (const row of rows.slice(3)) {
      expect(Math.abs(row.totalPayment - esperado)).toBeLessThan(1e-6);
    }
  });

  it('SAC: amortização pós-carência = saldo capitalizado / 9', () => {
    const rows = calculate(t4(AmortizationSystem.SAC, comCarencia(GracePeriodType.A))).fullFlowResult!.rows;
    const esperado = Pc.div(9).toNumber();
    for (const row of rows.slice(3)) {
      expect(Math.abs(row.amortization - esperado)).toBeLessThan(1e-6);
    }
  });

  it('carência D (= A na Fase 1): saldo final 0 e total amortizado = P·(1+i_m)^3', () => {
    const r = calculate(t4(AmortizationSystem.PRICE, comCarencia(GracePeriodType.D)));
    expect(Math.abs(r.finalAmount)).toBeLessThan(TOL);
    expect(Math.abs(r.fullFlowResult!.totalAmortized - Pc.toNumber())).toBeLessThan(TOL);
  });
});

// ── Carências B e C — C07 ────────────────────────────────────────────────────

describe('FullFlowEngine — carências B e C de 3 meses (C07)', () => {
  for (const sis of [AmortizationSystem.PRICE, AmortizationSystem.SAC]) {
    for (const tipo of [GracePeriodType.B, GracePeriodType.C]) {
      it(`V-T4-4-${sis}-${tipo}-saldo: saldo final 0`, () => {
        const r = calculate(t4(sis, comCarencia(tipo)));
        expect(Math.abs(r.finalAmount)).toBeLessThan(TOL);
      });

      it(`V-T4-4-${sis}-${tipo}-concilia: Σpagamentos − Σjuros − principal = 0`, () => {
        // Se os juros da carência B fossem perdidos, daria −3·P·i_m = −2.846,64
        expect(Math.abs(conciliacao(t4(sis, comCarencia(tipo))))).toBeLessThan(TOL);
      });

      it(`${sis}-${tipo}: total amortizado = principal (saldo não capitaliza na carência)`, () => {
        const r = calculate(t4(sis, comCarencia(tipo)));
        expect(Math.abs(r.fullFlowResult!.totalAmortized - 100000)).toBeLessThan(TOL);
      });
    }
  }

  it('carência C: juros pagos em cada mês da carência = P·i_m; Price pós-carência = pmt(i_m, 9, P)', () => {
    const rows = calculate(t4(AmortizationSystem.PRICE, comCarencia(GracePeriodType.C))).fullFlowResult!.rows;
    const jurosCarencia = P.mul(iM).toNumber();
    for (const row of rows.slice(0, 3)) {
      expect(Math.abs(row.totalPayment - jurosCarencia)).toBeLessThan(1e-6);
      expect(row.closingBalance).toBe(100000);
    }
    const esperado = pmt(iM, 9, P).toNumber();
    for (const row of rows.slice(3)) {
      expect(Math.abs(row.totalPayment - esperado)).toBeLessThan(1e-6);
    }
  });

  it('carência B: saldo congelado; juros diferidos (3·P·i_m, ref 2.846,637880374892) pagos na 1ª parcela pós-carência', () => {
    const rows = calculate(t4(AmortizationSystem.PRICE, comCarencia(GracePeriodType.B))).fullFlowResult!.rows;
    for (const row of rows.slice(0, 3)) {
      expect(row.totalPayment).toBe(0);
      expect(row.closingBalance).toBe(100000);
    }
    const diferidos = P.mul(iM).mul(3).toNumber();
    const primeira = rows[3];
    const extra = primeira.totalPayment - primeira.interest - primeira.amortization;
    expect(Math.abs(extra - diferidos)).toBeLessThan(1e-6);
    expect(primeira.description).toMatch(/juros diferidos/);
    // Demais parcelas: Price puro sobre P em 9 meses
    const esperado = pmt(iM, 9, P).toNumber();
    expect(Math.abs(primeira.interest + primeira.amortization - esperado)).toBeLessThan(1e-6);
    for (const row of rows.slice(4)) {
      expect(Math.abs(row.totalPayment - esperado)).toBeLessThan(1e-6);
    }
  });

  it('Bullet com carências A, B e C: saldo final 0 e conciliação 0', () => {
    for (const tipo of [GracePeriodType.A, GracePeriodType.B, GracePeriodType.C]) {
      const input = t4(AmortizationSystem.BULLET, comCarencia(tipo));
      expect(Math.abs(calculate(input).finalAmount)).toBeLessThan(TOL);
      expect(Math.abs(conciliacao(input))).toBeLessThan(TOL);
    }
  });
});

// ── Validação e robustez ────────────────────────────────────────────────────

describe('FullFlowEngine — carência ≥ prazo e prazo longo', () => {
  it('V-T4-6e: carência A até 15/01/2026 (12 meses) com prazo 12 → rejeita', () => {
    const input = t4(AmortizationSystem.PRICE, comCarencia(GracePeriodType.A, new Date(2026, 0, 15)));
    expect(() => calculate(input)).toThrow(/não resta nenhum período de amortização/);
  });

  it('carência maior que o prazo (SAC, carência 12 meses, prazo 6) → rejeita', () => {
    const input = t4(AmortizationSystem.SAC, {
      numberOfPeriods: 6,
      ...comCarencia(GracePeriodType.B, new Date(2026, 0, 15)),
    });
    expect(() => calculate(input)).toThrow(/maior ou igual ao prazo/);
  });

  it('carência de 11 meses com prazo 12 (1 período de amortização) → liquida', () => {
    const input = t4(AmortizationSystem.PRICE, comCarencia(GracePeriodType.A, new Date(2025, 11, 15)));
    const r = calculate(input);
    expect(Math.abs(r.finalAmount)).toBeLessThan(TOL);
    expect(Math.abs(conciliacao(input))).toBeLessThan(TOL);
  });

  it('V-T4-6c: Price n = 1200 → saldo final 0 em menos de 5 s', () => {
    const t0 = Date.now();
    const r = calculate(t4(AmortizationSystem.PRICE, { numberOfPeriods: 1200 }));
    const ms = Date.now() - t0;
    expect(Math.abs(r.finalAmount)).toBeLessThan(TOL);
    expect(ms).toBeLessThan(5000);
  });
});
