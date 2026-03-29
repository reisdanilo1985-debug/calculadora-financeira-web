import React, { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender, ColumnDef,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { CalculationMemoryRow } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatFactor, cn } from '@/lib/utils';

interface MemoryTableProps {
  rows: CalculationMemoryRow[];
  indexType: string;
}

const isMonthly = (indexType: string) => ['IPCA', 'IGPM', 'INCC'].includes(indexType);

export function MemoryTable({ rows, indexType }: MemoryTableProps) {
  const [pageSize, setPageSize] = useState(25);
  const monthly = isMonthly(indexType);

  const columns = useMemo<ColumnDef<CalculationMemoryRow>[]>(() => [
    {
      accessorKey: 'date',
      header: 'Data',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs">
          {formatDate(new Date(getValue() as string))}
        </span>
      ),
      size: 90,
    },
    {
      accessorKey: 'indexRate',
      header: monthly ? 'Taxa Mensal (%)' : 'Taxa Anual (% a.a.)',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-right block">
          {(getValue() as number).toFixed(4)}%
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'dailyFactor',
      header: monthly ? 'Fator Mensal' : 'Fator Diário',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-right block">
          {formatFactor(getValue() as number)}
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'accumulatedFactor',
      header: 'Fator Acumulado',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-right block text-primary">
          {formatFactor(getValue() as number)}
        </span>
      ),
      size: 120,
    },
    {
      accessorKey: 'balance',
      header: 'Saldo (R$)',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-right block font-medium">
          {formatCurrency(getValue() as number)}
        </span>
      ),
      size: 130,
    },
    {
      accessorKey: 'amortizationAmount',
      header: 'Amortização',
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        if (!v) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="font-mono text-xs text-right block text-primary">
            {formatCurrency(v)}
          </span>
        );
      },
      size: 115,
    },
    {
      accessorKey: 'description',
      header: 'Obs.',
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        if (!v) return null;
        return <span className="text-xs text-muted-foreground">{v}</span>;
      },
      size: 160,
    },
  ], [monthly]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b bg-muted/50">
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    className="h-9 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => {
              const isProjected = row.original.isProjected;
              const hasAmort = !!row.original.amortizationAmount;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b transition-colors hover:bg-muted/30',
                    isProjected && 'projected-row',
                    hasAmort && !isProjected && 'amortization-row'
                  )}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-3 py-1.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {rows.length.toLocaleString('pt-BR')} registros no total
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="icon"
            className="h-7 w-7"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline" size="icon"
            className="h-7 w-7"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-2 text-xs">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button
            variant="outline" size="icon"
            className="h-7 w-7"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline" size="icon"
            className="h-7 w-7"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 text-xs text-muted-foreground pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'hsl(45 80% 50% / 0.2)', border: '1px solid hsl(45 80% 50% / 0.5)' }} />
          Premissa futura
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'hsl(217 91% 60% / 0.1)', border: '1px solid hsl(217 91% 60% / 0.4)' }} />
          Amortização
        </div>
      </div>
    </div>
  );
}
