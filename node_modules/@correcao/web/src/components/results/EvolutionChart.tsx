import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { CalculationResult, CalculationMemoryRow } from '@/lib/api';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils';

interface EvolutionChartProps {
  result: CalculationResult;
}

function CustomTooltip({ active, payload, label, result }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  const value = payload[0]?.value as number;
  const initial = result?.initialAmount ?? 0;
  const variation = initial > 0 ? ((value - initial) / initial) * 100 : 0;
  const isPositive = variation >= 0;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="text-muted-foreground font-medium">{formatDate(new Date(label))}</p>
      <p className="text-primary font-mono text-sm font-bold">{formatCurrency(value)}</p>
      <p className={`font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPositive ? '+' : ''}{variation.toFixed(4)}%
      </p>
      {data?.amortizationAmount > 0 && (
        <p className="text-destructive border-t border-border/40 pt-1 mt-1">
          Amortização: {formatCurrency(data.amortizationAmount)}
        </p>
      )}
      {data?.isProjected && (
        <p className="text-projected border-t border-border/40 pt-1 mt-1">⚠ Premissa futura</p>
      )}
    </div>
  );
}

export function EvolutionChart({ result }: EvolutionChartProps) {
  // Amostra os dados para não renderizar milhares de pontos
  const chartData = useMemo(() => {
    const rows = result.memoryRows;
    const maxPoints = 200;

    if (rows.length <= maxPoints) return rows;

    const step = Math.ceil(rows.length / maxPoints);
    const sampled: CalculationMemoryRow[] = [];

    for (let i = 0; i < rows.length; i += step) {
      sampled.push(rows[i]);
    }
    // Garante que o último ponto seja incluído
    if (sampled[sampled.length - 1] !== rows[rows.length - 1]) {
      sampled.push(rows[rows.length - 1]);
    }

    return sampled;
  }, [result.memoryRows]);

  const projectionStart = result.projectionStartDate;

  const formatYAxis = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return value.toFixed(0);
  };

  const uniqueMonthTicks = useMemo(() => {
    const ticks: string[] = [];
    const seenMonths = new Set<string>();

    for (const row of chartData) {
      const date = new Date(row.date);
      const monthKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      if (!seenMonths.has(monthKey)) {
        seenMonths.add(monthKey);
        ticks.push(row.date);
      }
    }
    return ticks;
  }, [chartData]);

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 25, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="projectedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(45, 80%, 50%)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="hsl(45, 80%, 50%)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.15}
          />
          <XAxis
            dataKey="date"
            ticks={uniqueMonthTicks}
            tickFormatter={v => formatDateShort(new Date(v))}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip result={result} />} />

          {projectionStart && (
            <ReferenceLine
              x={projectionStart}
              stroke="hsl(45, 80%, 50%)"
              strokeDasharray="4 4"
              label={{
                value: 'Premissas',
                fill: 'hsl(45, 80%, 50%)',
                fontSize: 11,
                position: 'top',
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="balance"
            stroke="hsl(217, 91%, 60%)"
            strokeWidth={2}
            fill="url(#balanceGrad)"
            dot={false}
            activeDot={{ r: 4, fill: 'hsl(217, 91%, 60%)' }}
            name="Saldo"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
