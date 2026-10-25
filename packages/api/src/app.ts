import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { calculateRouter } from './routes/calculate';
import { indicesRouter } from './routes/indices';
import { compareRouter } from './routes/compare';
import { exchangeRouter } from './routes/exchange';
import { marketRouter } from './routes/market';
import { waccRouter } from './routes/wacc';
import { retirementRouter } from './routes/retirement';
import { tesourariaRouter } from './routes/tesouraria';
import { optionsRouter } from './routes/options';
import logger from './middleware/logger';

/** Erro de origem recusada pelo CORS (vira 403 no error handler). */
class CorsOrigemRecusada extends Error {
  constructor(readonly origem: string) {
    super(`CORS: origem não permitida — ${origem}`);
    this.name = 'CorsOrigemRecusada';
  }
}

/** Subdomínios HTTPS de Vercel/Render (deploys de produção e de preview). */
const SUBDOMINIO_PLATAFORMA = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(vercel\.app|onrender\.com)$/i;

export function createApp() {
  const app = express();

  // Atrás do proxy do Render (e de qualquer PaaS): req.ip passa a ser o IP do
  // cliente (X-Forwarded-For), senão o limite de requisições vale para o proxy
  // inteiro — todos os usuários dividiriam a mesma cota.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  // Cabeçalhos de segurança (API só devolve JSON: CSP restritiva, sem sniffing,
  // sem framing, HSTS quando servido em HTTPS).
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // o front está em outra origem (Vercel)
  }));

  // CORS — origens exatas em CORS_ORIGIN (separadas por vírgula; barra final ignorada).
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  // Sem CORS_STRICT=1 continua aceitando qualquer *.vercel.app / *.onrender.com
  // (padrão anterior — o domínio de produção do front não está versionado).
  // Com CORS_STRICT=1, apenas as origens listadas em CORS_ORIGIN.
  const permitirSubdominiosPlataforma = process.env.CORS_STRICT !== '1';

  app.use(cors({
    origin: (origin, callback) => {
      // Permite requests sem origin (curl, Render health check, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (permitirSubdominiosPlataforma && SUBDOMINIO_PLATAFORMA.test(origin)) return callback(null, true);
      callback(new CorsOrigemRecusada(origin));
    },
    // Sem `credentials`: o front não usa cookies nem autenticação HTTP (axios sem
    // withCredentials); a credencial administrativa vai no header x-admin-token.
  }));

  app.use(express.json({ limit: '1mb' }));

  // Rate limiting — desativável em testes via DISABLE_RATE_LIMIT=1
  if (process.env.DISABLE_RATE_LIMIT !== '1') {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
    });
    app.use('/api', limiter);
  }

  // Rotas
  app.use('/api/calcular', calculateRouter);
  app.use('/api/indices', indicesRouter);
  app.use('/api/comparar', compareRouter);
  app.use('/api/exchange', exchangeRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/wacc', waccRouter);
  app.use('/api/retirement', retirementRouter);
  app.use('/api/tesouraria', tesourariaRouter);
  app.use('/api/options', optionsRouter);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof CorsOrigemRecusada) {
      logger.warn(err.message);
      res.status(403).json({ error: 'Origem não permitida' });
      return;
    }
    logger.error('Erro não tratado:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  });

  return app;
}
