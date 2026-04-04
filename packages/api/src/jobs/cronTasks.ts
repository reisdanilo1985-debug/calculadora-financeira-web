import cron from 'node-cron';
import { forceRefreshIndex, BCB_SUPPORTED_INDEXES } from '../services/BCBService';
import { forceRefreshSOFR } from '../services/FREDService';
import logger from '../middleware/logger';

export function startCronJobs() {
  logger.info('Inicializando scheduler de background (Cron Jobs)...');

  // Atualizar todos os dias às 18:30 - Horário de Brasília
  const scheduleTime = '30 18 * * *';

  try {
    cron.schedule(scheduleTime, async () => {
      logger.info('[CRON] Iniciando rotina diária de atualização financeira (18:30 BRT)...');
      
      try {
        let totalInserted = 0;
        
        // 1. Atualizar SOFR (FRED)
        try {
          const sofrItems = await forceRefreshSOFR();
          logger.info(`[CRON] SOFR atualizado: +${sofrItems} registros.`);
          totalInserted += sofrItems;
        } catch (err: any) {
          logger.error(`[CRON] Falha ao atualizar SOFR: ${err.message}`);
        }
        
        // 2. Atualizar Índices BCB (CDI, Selic, IPCA, IGP-M, INCC)
        for (const indexType of BCB_SUPPORTED_INDEXES) {
          try {
            const inserted = await forceRefreshIndex(indexType);
            logger.info(`[CRON] ${indexType} atualizado: +${inserted} registros.`);
            totalInserted += inserted;
          } catch (err: any) {
            logger.error(`[CRON] Falha ao atualizar ${indexType}: ${err.message}`);
          }
        }
        
        logger.info(`[CRON] Rotina de 18:30 finalizada com sucesso! Novos registros hoje: ${totalInserted}`);
      } catch (error: any) {
        logger.error(`[CRON] Erro crítico inesperado na rotina de atualização: ${error.message}`);
      }
    }, {
      timezone: 'America/Sao_Paulo'
    });
    
    logger.info('[CRON] Agendado para as 18:30 (São Paulo).');
  } catch (error: any) {
    logger.error('Falha ao agendar utilizando timezone America/Sao_Paulo:', error.message);
    logger.warn('Tentando agendar sem timezone (fallback para o horário do servidor)...');
    
    // Tenta agendar sem timezone se falhar (fallback para o fuso do servidor)
    cron.schedule(scheduleTime, async () => {
      logger.info('[CRON] Iniciando rotina diária (Horário do Servidor)...');
      for (const indexType of BCB_SUPPORTED_INDEXES) {
        await forceRefreshIndex(indexType).catch(e => logger.error(`[CRON] Erro ${indexType}: ${e.message}`));
      }
    });
  }
}
