import cron from 'node-cron';
import { forceRefreshIndex, BCB_SUPPORTED_INDEXES } from '../services/BCBService';
import { forceRefreshSOFR } from '../services/FREDService';
import logger from '../middleware/logger';

export function startCronJobs() {
  logger.info('Inicializando scheduler de background (Cron Jobs)...');

  // Atualizar todos os dias às 18:30 - Horário de Brasília
  const scheduleTime = '30 18 * * *';

  cron.schedule(scheduleTime, async () => {
    logger.info('[CRON] Iniciando rotina diária de atualização financeira (18:30 BRT)...');
    
    try {
      let totalInserted = 0;
      
      // 1. Atualizar SOFR (FRED)
      try {
        const sofrItems = await forceRefreshSOFR();
        logger.info(`[CRON] SOFR atualizado: +${sofrItems} registros.`);
        totalInserted += sofrItems;
      } catch (err) {
        logger.error('[CRON] Falha ao atualizar SOFR:', err);
      }
      
      // 2. Atualizar Índices BCB (CDI, Selic, IPCA, IGP-M, INCC)
      for (const indexType of BCB_SUPPORTED_INDEXES) {
        try {
          const inserted = await forceRefreshIndex(indexType);
          logger.info(`[CRON] ${indexType} atualizado: +${inserted} registros.`);
          totalInserted += inserted;
        } catch (err) {
          logger.error(`[CRON] Falha ao atualizar ${indexType}:`, err);
        }
      }
      
      logger.info(`[CRON] Rotina de 18:30 finalizada com sucesso! Novos registros hoje: ${totalInserted}`);
    } catch (error) {
      logger.error('[CRON] Erro crítico inexperado na rotina de atualização:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });
}
