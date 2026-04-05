import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CalculationResult } from '@/lib/api';
import { formatCurrency, formatDate, formatFactor, INDEX_LABELS, BASIS_LABELS } from '@/lib/utils';

interface ExportButtonsProps {
  result: CalculationResult;
}

async function exportToExcel(result: CalculationResult) {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // Aba Resumo
  const resumoData = [
    ['CALCULADORA DE CORREÇÃO FINANCEIRA'],
    [],
    ['Indexador', INDEX_LABELS[result.indexType] || result.indexType],
    ['Base de Cálculo', BASIS_LABELS[result.dayCountBasis]],
    ['Data Inicial', formatDate(new Date(result.startDate))],
    ['Data Final', formatDate(new Date(result.endDate))],
    [],
    ['Montante Inicial', result.initialAmount],
    ['Valor Corrigido', result.finalAmount],
    ['Variação (%)', `${result.variationPercent.toFixed(6)}%`],
    ['Fator Acumulado', result.accumulatedFactor],
    ['Total Amortizado', result.totalAmortized],
    [],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    ['Contém Premissas Futuras', result.hasProjections ? 'Sim' : 'Não'],
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
  wsResumo['!cols'] = [{ wch: 25 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  // Aba Memória de Cálculo
  const headers = [
    'Data', 'Taxa (%)', 'Fator Diário/Mensal', 'Fator Acumulado',
    'Saldo (R$)', 'Amortização (R$)', 'Premissa Futura', 'Observação',
  ];
  const memoriaData = [
    headers,
    ...result.memoryRows.map(r => [
      formatDate(new Date(r.date)),
      r.indexRate,
      r.dailyFactor,
      r.accumulatedFactor,
      r.balance,
      r.amortizationAmount ?? 0,
      r.isProjected ? 'Sim' : 'Não',
      r.description ?? '',
    ]),
  ];
  const wsMemoria = XLSX.utils.aoa_to_sheet(memoriaData);
  wsMemoria['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
    { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMemoria, 'Memória de Cálculo');

  XLSX.writeFile(wb, `correcao_${result.indexType}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function exportToPDF(result: CalculationResult) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Cabeçalho
  doc.setFillColor(29, 78, 216);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Calculadora de Correção Financeira', 14, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 20);

  // Resumo
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo do Cálculo', 14, 36);

  autoTable(doc, {
    startY: 40,
    body: [
      ['Indexador', INDEX_LABELS[result.indexType] || result.indexType],
      ['Base de Cálculo', BASIS_LABELS[result.dayCountBasis]],
      ['Período', `${formatDate(new Date(result.startDate))} → ${formatDate(new Date(result.endDate))}`],
      ['Montante Inicial', formatCurrency(result.initialAmount)],
      ['Valor Corrigido', formatCurrency(result.finalAmount)],
      ['Variação Total', `${result.variationPercent.toFixed(6)}%`],
      ['Fator Acumulado', formatFactor(result.accumulatedFactor)],
      ['Total Amortizado', formatCurrency(result.totalAmortized)],
      ['Contém Premissas', result.hasProjections ? 'Sim' : 'Não'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [29, 78, 216] },
    alternateRowStyles: { fillColor: [240, 245, 255] },
    styles: { fontSize: 9, font: 'helvetica' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });

  // Memória de cálculo (primeiros 500 registros)
  const endY = (doc as any).lastAutoTable?.finalY ?? 100;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Memória de Cálculo', 14, endY + 10);

  const sampleRows = result.memoryRows.slice(0, 500);

  autoTable(doc, {
    startY: endY + 14,
    head: [['Data', 'Taxa (%)', 'Fator Diário', 'Fator Acum.', 'Saldo (R$)', 'Amort. (R$)', 'Projetado']],
    body: sampleRows.map(r => [
      formatDate(new Date(r.date)),
      r.indexRate.toFixed(4),
      r.dailyFactor.toFixed(8),
      r.accumulatedFactor.toFixed(8),
      formatCurrency(r.balance),
      r.amortizationAmount ? formatCurrency(r.amortizationAmount) : '—',
      r.isProjected ? 'Sim' : 'Não',
    ]),
    theme: 'striped',
    headStyles: { fillColor: [29, 78, 216], fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    styles: { font: 'helvetica', cellPadding: 1.5 },
    didParseCell: (data) => {
      if (data.row.index < sampleRows.length) {
        const row = sampleRows[data.row.index];
        if (row.isProjected) {
          data.cell.styles.fillColor = [255, 248, 220];
        }
        if (row.amortizationAmount) {
          data.cell.styles.fillColor = [220, 235, 255];
        }
      }
    },
  });

  // Nota de rodapé
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Página ${i}/${pageCount} — Este documento é gerado automaticamente e não substitui análise profissional.`,
      14,
      doc.internal.pageSize.height - 6
    );
  }

  doc.save(`correcao_${result.indexType}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function ExportButtons({ result }: ExportButtonsProps) {
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [loadingXLS, setLoadingXLS] = useState(false);

  const handlePDF = async () => {
    setLoadingPDF(true);
    try { await exportToPDF(result); }
    finally { setLoadingPDF(false); }
  };

  const handleExcel = async () => {
    setLoadingXLS(true);
    try { await exportToExcel(result); }
    finally { setLoadingXLS(false); }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline" size="sm"
        onClick={handlePDF}
        disabled={loadingPDF}
        className="gap-1.5"
      >
        <FileText className="h-4 w-4" />
        {loadingPDF ? 'Gerando...' : 'Exportar PDF'}
      </Button>
      <Button
        variant="outline" size="sm"
        onClick={handleExcel}
        disabled={loadingXLS}
        className="gap-1.5"
      >
        <FileSpreadsheet className="h-4 w-4" />
        {loadingXLS ? 'Gerando...' : 'Exportar Excel'}
      </Button>
    </div>
  );
}
