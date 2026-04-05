import React from 'react';
import { FullFlowResult } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface FullFlowTableProps {
  result: FullFlowResult;
}

export function FullFlowTable({ result }: FullFlowTableProps) {
  const SYSTEM_LABELS: Record<string, string> = {
    SAC: 'SAC — Amortização Constante',
    PRICE: 'Price — Parcela Fixa',
    BULLET: 'Bullet — Pagamento Final',
  };

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Pago', value: formatCurrency(result.totalPayments) },
          { label: 'Total Juros', value: formatCurrency(result.totalInterest) },
          { label: 'Total Amortizado', value: formatCurrency(result.totalAmortized) },
          { label: 'Sistema', value: SYSTEM_LABELS[result.amortizationSystem] ?? result.amortizationSystem },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border p-3 bg-card/50">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
            <div className="text-sm font-semibold font-mono truncate" title={value}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/60 text-muted-foreground uppercase tracking-wide text-[10px]">
              <th className="px-3 py-2 text-left font-semibold">#</th>
              <th className="px-3 py-2 text-left font-semibold">Data</th>
              <th className="px-3 py-2 text-right font-semibold">Saldo Devedor</th>
              <th className="px-3 py-2 text-right font-semibold">Juros</th>
              <th className="px-3 py-2 text-right font-semibold">Amortização</th>
              <th className="px-3 py-2 text-right font-semibold">Parcela</th>
              <th className="px-3 py-2 text-right font-semibold">Saldo Final</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, idx) => (
              <tr
                key={row.periodNumber}
                className={`border-t border-border/30 transition-colors hover:bg-muted/20 ${
                  row.isGracePeriod ? 'bg-projected/5 text-projected/80' : ''
                }`}
              >
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{row.periodNumber}</td>
                <td className="px-3 py-1.5 font-mono">
                  <div className="flex items-center gap-1.5">
                    {formatDate(new Date(row.date))}
                    {row.isGracePeriod && (
                      <Badge variant="projected" className="text-[9px] px-1 py-0">carência</Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(row.openingBalance)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-orange-400/80">{formatCurrency(row.interest)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-emerald-400/80">{formatCurrency(row.amortization)}</td>
                <td className="px-3 py-1.5 text-right font-mono font-semibold">{formatCurrency(row.totalPayment)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(row.closingBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
