import { createApp } from './app';
import { startCronJobs } from './jobs/cronTasks';
import logger from './middleware/logger';

const app = createApp();
const PORT = process.env.PORT || 3001;

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
