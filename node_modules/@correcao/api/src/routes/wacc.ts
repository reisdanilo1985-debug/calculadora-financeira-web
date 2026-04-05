import { Router, Request, Response } from 'express';
import { calcularWACC, WaccInput } from '@correcao/core';
import {
  SETORES_DAMODARAN,
  PAISES_DAMODARAN,
  getBetaBySetor,
  getCRPByPais,
  getParametrosMercadoPadrao,
} from '../services/DamodaranService';
import logger from '../middleware/logger';

export const waccRouter = Router();

/**
 * GET /api/wacc/setores
 * Retorna a lista de setores com beta desalavancado (Damodaran)
 */
waccRouter.get('/setores', (_req: Request, res: Response) => {
  return res.json(SETORES_DAMODARAN);
});

/**
 * GET /api/wacc/paises
 * Retorna a lista de países com CRP (Damodaran)
 */
waccRouter.get('/paises', (_req: Request, res: Response) => {
  return res.json(PAISES_DAMODARAN);
});

/**
 * GET /api/wacc/parametros-mercado
 * Retorna os parâmetros de mercado padrão (Rf e ERP global Damodaran)
 */
waccRouter.get('/parametros-mercado', (_req: Request, res: Response) => {
  const params = getParametrosMercadoPadrao();
  return res.json({
    rf: params.rf,
    erp: params.erp,
    fonte: 'Damodaran (NYU Stern) — Janeiro 2025',
    observacao: 'Rf: US T-Bond 10Y | ERP: Prêmio implícito de risco de mercado global',
  });
});

/**
 * GET /api/wacc/setor/:id
 * Retorna dados de um setor específico
 */
waccRouter.get('/setor/:id', (req: Request, res: Response) => {
  const setor = getBetaBySetor(req.params.id);
  if (!setor) return res.status(404).json({ error: 'Setor não encontrado' });
  return res.json(setor);
});

/**
 * GET /api/wacc/pais/:codigo
 * Retorna dados de um país específico
 */
waccRouter.get('/pais/:codigo', (req: Request, res: Response) => {
  const pais = getCRPByPais(req.params.codigo.toUpperCase());
  if (!pais) return res.status(404).json({ error: 'País não encontrado' });
  return res.json(pais);
});

/**
 * POST /api/wacc/calcular
 * Calcula o WACC dado os inputs
 */
waccRouter.post('/calcular', (req: Request, res: Response) => {
  const body = req.body as WaccInput;

  // Validação básica
  const requiredFields: (keyof WaccInput)[] = [
    'taxaLivreDeRisco', 'premioRiscoMercado', 'betaDesalavancado',
    'premioRiscoPais', 'marketCap', 'dividaBruta', 'aliquotaIR', 'custoDividaPreTax',
  ];

  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      return res.status(400).json({ error: `Campo obrigatório ausente: ${String(field)}` });
    }
  }

  if ((body.marketCap + body.dividaBruta) <= 0) {
    return res.status(400).json({ error: 'Market Cap e Dívida Bruta não podem ser ambos zero.' });
  }

  if (body.aliquotaIR < 0 || body.aliquotaIR > 100) {
    return res.status(400).json({ error: 'Alíquota de IR deve estar entre 0% e 100%.' });
  }

  try {
    const result = calcularWACC(body);

    logger.info(`[WACC] Cálculo concluído — WACC: ${result.wacc.toFixed(2)}% | Setor: ${body.setor} | País: ${body.pais}`);

    return res.json(result);
  } catch (error: any) {
    logger.error('[WACC] Erro no cálculo:', error.message);
    return res.status(500).json({ error: error.message || 'Erro interno no cálculo WACC.' });
  }
});
