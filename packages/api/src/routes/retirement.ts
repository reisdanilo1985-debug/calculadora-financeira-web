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

    // Defaults
    input.expectativaVida = input.expectativaVida || 90;
    input.ipcaMeta = input.ipcaMeta || 3.5;
    input.numeroSimulacoes = Math.min(input.numeroSimulacoes || 1000, 5000);
    input.tabelaPGBL = input.tabelaPGBL || 'regressiva';

    logger.info('retirement.calcular', { idadeAtual: input.idadeAtual, perfil: input.perfilRisco });

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
    const { genero, idadeAposentadoria, tempoContribuicaoAnos, salarioContribuicao } = req.body;

    if (!genero || !idadeAposentadoria || tempoContribuicaoAnos === undefined || !salarioContribuicao) {
      return res.status(400).json({ error: 'Campos obrigatórios: genero, idadeAposentadoria, tempoContribuicaoAnos, salarioContribuicao' });
    }

    const result = calcularBeneficioINSS(genero, idadeAposentadoria, tempoContribuicaoAnos, salarioContribuicao);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
