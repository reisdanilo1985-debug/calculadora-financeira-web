import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { calculateRouter } from './routes/calculate';
import { indicesRouter } from './routes/indices';
import { compareRouter } from './routes/compare';
import { exchangeRouter } from './routes/exchange';
import { marketRouter } from './routes/market';
import { waccRouter } from './routes/wacc';
import { retirementRouter } from './routes/retirement';
import { startCronJobs } from './jobs/cronTasks';
import logger from './middleware/logger';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares — aceita múltiplas origens separadas por vírgula em CORS_ORIGIN
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Permite requests sem origin (curl, Render health check, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Permite qualquer subdomínio .vercel.app e .onrender.com
    if (/\.(vercel\.app|onrender\.com)$/.test(origin)) return callback(null, true);
    callback(new Error(`CORS: origem não permitida — ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
});

app.use('/api', limiter);

// Rotas
app.use('/api/calcular', calculateRouter);
app.use('/api/indices', indicesRouter);
app.use('/api/comparar', compareRouter);
app.use('/api/exchange', exchangeRouter);
app.use('/api/market', marketRouter);
app.use('/api/wacc', waccRouter);
app.use('/api/retirement', retirementRouter);

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
  logger.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  logger.info(`Servidor rodando em http://localhost:${PORT}`);
  logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  
  // Iniciar tarefas agendadas (Cron) com proteção contra falhas catastróficas
  try {
    startCronJobs();
  } catch (err) {
    logger.error('Falha crítica ao inicializar o agendador de tarefas (Cron):', err);
    logger.warn('O servidor continuará operando normalmente sem o agendamento automático.');
  }
});

export default app;
