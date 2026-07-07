import { AmortizationEntry } from '@/components/calculator/AmortizationModal';
import {
  COLUNAS,
  SHEET_LANCAMENTOS,
  DIRECTION_PARA_OPERACAO,
  DOMINIO_PARA_TIPO,
  DOMINIO_PARA_PERIODICIDADE,
  paraDataBR,
} from './scheduleShared';

/** Exporta o cronograma atual no mesmo layout do modelo (permite reimportar após editar). */
export async function exportSchedule(entries: AmortizationEntry[], filename?: string) {
  const XLSX = await import('xlsx');

  const linhas = entries.map(e => [
    paraDataBR(e.date),
    DIRECTION_PARA_OPERACAO[e.direction ?? 'OUT'],
    DOMINIO_PARA_TIPO[e.type],
    e.value,
    e.type === 'PERIODIC' ? DOMINIO_PARA_PERIODICIDADE[e.periodicity ?? 'MONTHLY'] : '',
    e.type === 'PERIODIC' ? paraDataBR(e.periodicEndDate ?? '') : '',
    e.type === 'PERIODIC' ? (e.isPeriodicPercentage ? 'SIM' : 'NAO') : '',
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...COLUNAS], ...linhas]);
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, SHEET_LANCAMENTOS);

  XLSX.writeFile(wb, filename ?? `cronograma_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
