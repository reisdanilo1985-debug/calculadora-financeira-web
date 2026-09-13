import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

/** Garante que nenhum campo numérico da resposta serializou como NaN. */
function expectNoNaN(body: unknown) {
  expect(JSON.stringify(body)).not.toContain('NaN');
}

describe('POST /api/calcular', () => {
  describe('CORRECAO_SIMPLES — PREFIXADA', () => {
    it('calcula corretamente com taxa pré-fixada (sem dados externos)', async () => {
      const res = await request(app)
        .post('/api/calcular')
        .send({
          thesisType: 'CORRECAO_SIMPLES',
          initialAmount: 10000,
          startDate: '2024-01-01',
          endDate: '2024-07-01',
          indexType: 'PREFIXADA',
          dayCountBasis: '365',
          prefixedRate: 0.1,
        });

      expect(res.status).toBe(200);
      expect(typeof res.body.finalAmount).toBe('number');
      expect(Number.isNaN(res.body.finalAmount)).toBe(false);
      expect(res.body.finalAmount).toBeGreaterThan(10000);
      expectNoNaN(res.body);
    });
  });

  describe('CORRECAO_SIMPLES — CDI', () => {
    it('calcula corretamente usando série CDI mockada (BCB SGS 12)', async () => {
      const res = await request(app)
        .post('/api/calcular')
        .send({
          thesisType: 'CORRECAO_SIMPLES',
          initialAmount: 10000,
          startDate: '2024-01-02',
          endDate: '2024-01-10',
          indexType: 'CDI',
          dayCountBasis: '252',
        });

      // Dentro do range coberto pelo mock (gera dinamicamente), não deve exigir premissas futuras.
      expect(res.status).toBe(200);
      expect(typeof res.body.finalAmount).toBe('number');
      expect(Number.isNaN(res.body.finalAmount)).toBe(false);
      expect(res.body.finalAmount).toBeGreaterThan(0);
      expectNoNaN(res.body);
    });
  });

  describe('validação de payload', () => {
    it('retorna 400 quando startDate está ausente', async () => {
      const res = await request(app)
        .post('/api/calcular')
        .send({
          initialAmount: 10000,
          endDate: '2024-07-01',
          indexType: 'PREFIXADA',
          prefixedRate: 0.1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error).toBe('string');
    });

    it('retorna 400 quando initialAmount é uma string não-numérica', async () => {
      const res = await request(app)
        .post('/api/calcular')
        .send({
          initialAmount: 'abc',
          startDate: '2024-01-01',
          endDate: '2024-07-01',
          indexType: 'PREFIXADA',
          prefixedRate: 0.1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('VALOR_PRESENTE', () => {
    it('retorna 400 quando cashFlows não é informado', async () => {
      const res = await request(app)
        .post('/api/calcular')
        .send({
          thesisType: 'VALOR_PRESENTE',
          startDate: '2024-01-01',
          // NOTA: apesar de VALOR_PRESENTE não exigir endDate na validação
          // inicial da rota (needsEndDate = false), o código sempre executa
          // `new Date(body.endDate)` e rejeita com "Datas inválidas." se
          // endDate estiver ausente (ver src/routes/calculate.ts linhas
          // 159-166) — então incluímos endDate aqui para isolar o teste na
          // validação de cashFlows especificamente.
          endDate: '2024-12-01',
          discountRate: 0.1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cashFlows');
    });

    it('calcula o valor presente com fluxos de caixa válidos', async () => {
      const res = await request(app)
        .post('/api/calcular')
        .send({
          thesisType: 'VALOR_PRESENTE',
          startDate: '2024-01-01',
          endDate: '2024-12-01',
          discountRate: 0.1,
          cashFlows: [
            { date: '2024-03-01', amount: 1000 },
            { date: '2024-06-01', amount: 1500 },
            { date: '2024-12-01', amount: 2000 },
          ],
        });

      expect(res.status).toBe(200);
      expectNoNaN(res.body);
      expect(res.body.dcfResult).toBeDefined();
      expect(typeof res.body.dcfResult.totalPV).toBe('number');
      expect(Number.isNaN(res.body.dcfResult.totalPV)).toBe(false);
    });

    const vp = (extra: Record<string, unknown>) => ({
      thesisType: 'VALOR_PRESENTE',
      startDate: '2025-01-01T12:00:00',
      referenceDate: '2025-01-01T12:00:00',
      dayCountBasis: 365,
      discountRate: 10,
      ...extra,
    });

    it('fluxos com sinal: devolve TIR e aceita fluxo na data de referência', async () => {
      const res = await request(app).post('/api/calcular').send(vp({
        cashFlows: [{ date: '2025-01-01T12:00:00', amount: -1000 }, { date: '2026-01-01T12:00:00', amount: 1100 }],
      }));
      expect(res.status).toBe(200);
      expectNoNaN(res.body);
      expect(res.body.dcfResult.irr).toBeCloseTo(10, 8);
      expect(res.body.dcfResult.totalPV).toBeCloseTo(0, 8);
      expect(res.body.dcfResult.macaulayDuration).toBeNull();
    });

    it('perpetuidade de Gordon: VP total = FC / (r − g) e data do valor terminal em ISO', async () => {
      const res = await request(app).post('/api/calcular').send(vp({
        cashFlows: [{ date: '2026-01-01T12:00:00', amount: 100 }],
        perpetuity: { growthRate: 2, periodicity: 'ANNUAL' },
      }));
      expect(res.status).toBe(200);
      expectNoNaN(res.body);
      expect(res.body.finalAmount).toBeCloseTo(1250, 8);
      expect(res.body.dcfResult.terminalValue.nominalValue).toBeCloseTo(1275, 8);
      expect(res.body.dcfResult.terminalValue.date).toMatch(/^2026-01-01T/);
    });

    it('perpetuidade com crescimento ≥ taxa → 400', async () => {
      const res = await request(app).post('/api/calcular').send(vp({
        cashFlows: [{ date: '2026-01-01T12:00:00', amount: 100 }],
        perpetuity: { growthRate: 10, periodicity: 'ANNUAL' },
      }));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/maior que o crescimento/);
    });

    it('periodicidade da perpetuidade fora do enum → 400', async () => {
      const res = await request(app).post('/api/calcular').send(vp({
        cashFlows: [{ date: '2026-01-01T12:00:00', amount: 100 }],
        perpetuity: { growthRate: 2, periodicity: 'WEEKLY' },
      }));
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('perpetuity.periodicity');
    });

    it('fluxo anterior à data de referência → 400', async () => {
      const res = await request(app).post('/api/calcular').send(vp({
        cashFlows: [{ date: '2024-12-31T12:00:00', amount: 100 }],
      }));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/anterior à data de referência/);
    });
  });

  describe('FLUXO_COMPLETO', () => {
    it('retorna 400 quando numberOfPeriods está ausente', async () => {
      const res = await request(app)
        .post('/api/calcular')
        .send({
          thesisType: 'FLUXO_COMPLETO',
          initialAmount: 100000,
          startDate: '2024-01-01',
          // Ver nota acima: endDate precisa ser enviado mesmo não sendo
          // exigido pela validação de negócio de FLUXO_COMPLETO, porque a
          // rota valida `new Date(body.endDate)` incondicionalmente.
          endDate: '2025-01-01',
          remunerationRate: 12,
          amortizationSystem: 'PRICE',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('numberOfPeriods');
    });

    it('calcula o cronograma completo com sistema PRICE', async () => {
      const res = await request(app)
        .post('/api/calcular')
        .send({
          thesisType: 'FLUXO_COMPLETO',
          initialAmount: 100000,
          startDate: '2024-01-01',
          endDate: '2025-01-01',
          numberOfPeriods: 12,
          remunerationRate: 12,
          amortizationSystem: 'PRICE',
        });

      expect(res.status).toBe(200);
      expectNoNaN(res.body);
      expect(res.body.fullFlowResult).toBeDefined();
      expect(Array.isArray(res.body.fullFlowResult.rows)).toBe(true);
      expect(res.body.fullFlowResult.rows.length).toBeGreaterThan(0);
    });

    const t4 = (extra: Record<string, unknown>) => ({
      thesisType: 'FLUXO_COMPLETO',
      initialAmount: 100000,
      startDate: '2025-01-15T12:00:00',
      numberOfPeriods: 4,
      remunerationRate: 12,
      amortizationSystem: 'PRICE',
      ...extra,
    });

    it('parcelas trimestrais e comparação SAC × Price × Bullet', async () => {
      const res = await request(app).post('/api/calcular').send(t4({ installmentPeriodicity: 'QUARTERLY' }));
      expect(res.status).toBe(200);
      expectNoNaN(res.body);
      const ff = res.body.fullFlowResult;
      expect(ff.periodicity).toBe('QUARTERLY');
      expect(ff.rows.map((r: any) => r.date.slice(0, 10))).toEqual(['2025-04-15', '2025-07-15', '2025-10-15', '2026-01-15']);
      expect(ff.comparison.map((c: any) => c.system)).toEqual(['SAC', 'PRICE', 'BULLET']);
    });

    it('periodicidade fora do enum → 400', async () => {
      const res = await request(app).post('/api/calcular').send(t4({ installmentPeriodicity: 'WEEKLY' }));
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('installmentPeriodicity');
    });

    it('carência maior ou igual ao prazo → 400 com a mensagem do motor', async () => {
      const res = await request(app).post('/api/calcular').send(t4({
        gracePeriod: { type: 'A', endDate: '2025-05-15T12:00:00' },
      }));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/não resta nenhum período de amortização/);
    });
  });

  describe('sanidade numérica geral', () => {
    it('nenhuma resposta 200 deste arquivo contém "NaN" serializado', async () => {
      const cenarios = [
        {
          thesisType: 'CORRECAO_SIMPLES',
          initialAmount: 10000,
          startDate: '2024-01-01',
          endDate: '2024-07-01',
          indexType: 'PREFIXADA',
          dayCountBasis: '365',
          prefixedRate: 0.1,
        },
        {
          thesisType: 'FLUXO_COMPLETO',
          initialAmount: 100000,
          startDate: '2024-01-01',
          endDate: '2024-07-01',
          numberOfPeriods: 6,
          remunerationRate: 10,
          amortizationSystem: 'SAC',
        },
      ];

      for (const payload of cenarios) {
        const res = await request(app).post('/api/calcular').send(payload);
        expect(res.status).toBe(200);
        expectNoNaN(res.body);
      }
    });
  });
});
