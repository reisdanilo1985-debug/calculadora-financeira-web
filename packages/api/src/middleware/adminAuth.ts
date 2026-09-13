/**
 * Autorização e limites das operações administrativas (E10).
 *
 * requireAdmin
 *   Exige o header `x-admin-token` igual a `process.env.ADMIN_TOKEN`
 *   (comparação em tempo constante).
 *     - ADMIN_TOKEN ausente/vazio no servidor → 503 (operação administrativa
 *       desabilitada). As atualizações internas (cron diário, carga sob demanda
 *       do cache) não passam por aqui e continuam funcionando.
 *     - header ausente → 401; header com valor errado → 403.
 *
 * limitarOperacaoAdmin
 *   Limite por OPERAÇÃO (ex.: "refresh de CDI"), não por IP: protege as fontes
 *   externas de recargas completas em sequência mesmo com credencial válida.
 *   Deve vir DEPOIS de requireAdmin, para que chamadas sem credencial não
 *   consumam a cota do administrador. Desligado com DISABLE_RATE_LIMIT=1
 *   (mesma chave do limitador global).
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from './logger';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

const TAMANHO_MINIMO_RECOMENDADO = 16;
let avisoTokenCurto = false;

function digest(valor: string): Buffer {
  return crypto.createHash('sha256').update(valor, 'utf8').digest();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const esperado = (process.env.ADMIN_TOKEN ?? '').trim();

  if (!esperado) {
    res.status(503).json({
      error:
        'Refresh administrativo desabilitado: o servidor não tem ADMIN_TOKEN configurado. ' +
        'A atualização automática dos dados (rotina diária e cache sob demanda) continua ativa.',
    });
    return;
  }

  if (esperado.length < TAMANHO_MINIMO_RECOMENDADO && !avisoTokenCurto) {
    avisoTokenCurto = true;
    logger.warn(`[admin] ADMIN_TOKEN tem menos de ${TAMANHO_MINIMO_RECOMENDADO} caracteres; use um valor aleatório longo.`);
  }

  const recebido = req.get(ADMIN_TOKEN_HEADER);
  if (!recebido) {
    res.status(401).json({ error: `Credencial administrativa ausente (header ${ADMIN_TOKEN_HEADER}).` });
    return;
  }

  if (!crypto.timingSafeEqual(digest(recebido.trim()), digest(esperado))) {
    logger.warn(`[admin] credencial inválida para ${req.method} ${req.originalUrl} (ip ${req.ip})`);
    res.status(403).json({ error: 'Credencial administrativa inválida.' });
    return;
  }

  next();
}

export interface OpcoesLimiteOperacao {
  /** Identificador da operação (ex.: req => `indices:refresh:${req.params.tipo}`). */
  operacao: (req: Request) => string;
  /** Máximo de execuções por janela. */
  limite: number;
  /** Tamanho da janela deslizante, em ms. */
  janelaMs: number;
}

export function limitarOperacaoAdmin({ operacao, limite, janelaMs }: OpcoesLimiteOperacao): RequestHandler {
  const historico = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.DISABLE_RATE_LIMIT === '1') return next();

    const chave = operacao(req);
    const agora = Date.now();
    const recentes = (historico.get(chave) ?? []).filter(t => agora - t < janelaMs);

    if (recentes.length >= limite) {
      const retrySeg = Math.max(1, Math.ceil((recentes[0] + janelaMs - agora) / 1000));
      historico.set(chave, recentes);
      res.setHeader('Retry-After', String(retrySeg));
      res.status(429).json({
        error: `Limite de ${limite} execuções a cada ${Math.round(janelaMs / 60000)} min atingido para esta operação. Tente novamente em ${retrySeg} s.`,
      });
      return;
    }

    recentes.push(agora);
    historico.set(chave, recentes);
    next();
  };
}
