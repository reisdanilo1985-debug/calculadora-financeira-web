import { Router, Request, Response } from 'express';
import {
  simularAposentadoria,
  calcularBeneficioINSS,
  PERFIS_RISCO,
  RetirementInput,
} from '@correcao/core';
import logger from '../middleware/logger';

export const retirementRouter = Router();

/**
 * GET /api/retirement/perfis
 * Retorna perfis de risco calibrados para o mercado brasileiro
 */
retirementRouter.get('/perfis', (_req: Request, res: Response) => {
  const perfis = Object.entries(PERFIS_RISCO).map(([id, p]) => ({
    id,
    ...p,
  }));
  return res.json(perfis);
});

/**
 * POST /api/retirement/calcular
 * Executa simulação Monte Carlo de aposentadoria
 */
retirementRouter.post('/calcular', (req: Request, res: Response) => {
  try {
    const input: RetirementInput = req.body;

    // Validações básicas
    if (!input.idadeAtual || !input.idadeAposentadoria) {
      return res.status(400).json({ error: 'Campos idadeAtual e idadeAposentadoria são obrigatórios' });
    }
    if (input.idadeAposentadoria <= input.idadeAtual) {
      return res.status(400).json({ error: 'idadeAposentadoria deve ser maior que idadeAtual' });
    }
    if (!input.perfilRisco || !['conservador', 'moderado', 'agressivo'].includes(input.perfilRisco)) {
      return res.status(400).json({ error: 'perfilRisco deve ser: conservador, moderado ou agressivo' });
    }
    // Semente do Monte Carlo (opcional): inteiro; ausente → semente padrão do motor (resultado reprodutível)
    if (input.semente !== undefined && input.semente !== null) {
      const semente = Number(input.semente);
      if (!Number.isInteger(semente) || semente < 0 || semente > 4294967295) {
        return res.status(400).json({ error: 'semente deve ser um inteiro entre 0 e 4294967295' });
      }
      input.semente = semente;
    }
    if (input.tabelaPGBL && !['regressiva', 'progressiva'].includes(input.tabelaPGBL)) {
      return res.status(400).json({ error: 'tabelaPGBL deve ser: regressiva ou progressiva' });
    }

    // Defaults — campos numéricos ausentes viram 0 (não NaN); booleanos, false.
    input.expectativaVida = input.expectativaVida || 90;
    input.ipcaMeta = input.ipcaMeta || 3.5;
    input.numeroSimulacoes = Math.min(input.numeroSimulacoes || 1000, 5000);
    input.tabelaPGBL = input.tabelaPGBL || 'regressiva';
    input.patrimonioTributavel = input.patrimonioTributavel || 0;
    input.saldoPGBL = input.saldoPGBL || 0;
    input.saldoVGBL = input.saldoVGBL || 0;
    input.rendaAluguel = input.rendaAluguel || 0;
    input.aporteMensal = input.aporteMensal || 0;
    input.aportePGBL = input.aportePGBL || 0;
    input.aporteVGBL = input.aporteVGBL || 0;
    input.incluirINSS = input.incluirINSS ?? false;
    input.salarioContribuicao = input.salarioContribuicao || 0;
    input.tempoContribuicaoAnos = input.tempoContribuicaoAnos || 0;
    input.gastoMensalDesejado = input.gastoMensalDesejado || 0;
    input.incluirInflacaoMedica = input.incluirInflacaoMedica ?? false;
    input.gastoMensalSaude = input.gastoMensalSaude || 0;
    input.genero = input.genero || 'M';

    logger.info('retirement.calcular', { idadeAtual: input.idadeAtual, perfil: input.perfilRisco, semente: input.semente ?? 'padrão' });

    const result = simularAposentadoria(input);
    return res.json(result);
  } catch (err: any) {
    logger.error('retirement.calcular error', { error: err.message });
    return res.status(500).json({ error: 'Erro ao processar simulação', detail: err.message });
  }
});

/**
 * POST /api/retirement/inss
 * Estima apenas o benefício INSS, sem simulação Monte Carlo
 */
retirementRouter.post('/inss', (req: Request, res: Response) => {
  try {
    const { genero, idadeAposentadoria, tempoContribuicaoAnos, salarioContribuicao, dataReferencia } = req.body;

    if (!genero || !idadeAposentadoria || tempoContribuicaoAnos === undefined || !salarioContribuicao) {
      return res.status(400).json({ error: 'Campos obrigatórios: genero, idadeAposentadoria, tempoContribuicaoAnos, salarioContribuicao' });
    }

    // Elegibilidade (EC 103/2019 art. 19) + valor (art. 26); teto/salário mínimo pela vigência de `dataReferencia` (padrão: hoje)
    const result = calcularBeneficioINSS(genero, idadeAposentadoria, tempoContribuicaoAnos, salarioContribuicao, dataReferencia);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
