import { Router, Request, Response } from 'express';
import { calcularWACC, WaccInput } from '@correcao/core';
import {
  SETORES_DAMODARAN,
  PAISES_DAMODARAN,
  DAMODARAN_VERSAO,
  MOEDAS,
  REGIMES,
  Moeda,
  Regime,
  getBetaBySetor,
  getCRPByPais,
  getParametrosMercado,
  getTabelaParametrosMercado,
} from '../services/DamodaranService';
import logger from '../middleware/logger';

export const waccRouter = Router();

/**
 * GET /api/wacc/setores
 * Retorna a lista de setores com beta desalavancado (Damodaran), com data-base e fonte por item
 */
waccRouter.get('/setores', (_req: Request, res: Response) => {
  return res.json(SETORES_DAMODARAN);
});

/**
 * GET /api/wacc/paises
 * Retorna a lista de países com CRP (Damodaran), com moeda, data-base e fonte por item
 */
waccRouter.get('/paises', (_req: Request, res: Response) => {
  return res.json(PAISES_DAMODARAN);
});

/**
 * GET /api/wacc/parametros-mercado?moeda=BRL|USD|EUR&regime=nominal|real
 * Parâmetros de referência (Rf e ERP) coerentes com a moeda e o regime, com data-base.
 * Padrão: BRL nominal (moeda inicial do formulário). `porMoeda` traz a tabela completa.
 */
waccRouter.get('/parametros-mercado', (req: Request, res: Response) => {
  const moeda = String(req.query.moeda ?? 'BRL').toUpperCase() as Moeda;
  const regime = String(req.query.regime ?? 'nominal').toLowerCase() as Regime;

  if (!MOEDAS.includes(moeda)) {
    return res.status(400).json({ error: `moeda deve ser uma de: ${MOEDAS.join(', ')}` });
  }
  if (!REGIMES.includes(regime)) {
    return res.status(400).json({ error: `regime deve ser um de: ${REGIMES.join(', ')}` });
  }

  return res.json({
    ...getParametrosMercado(moeda, regime),
    versao: DAMODARAN_VERSAO,
    porMoeda: getTabelaParametrosMercado(),
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
 * Calcula o WACC dado os inputs (inclui a sensibilidade por premissa, em p.p.)
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
