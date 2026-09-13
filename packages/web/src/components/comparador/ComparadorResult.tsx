import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { CompareResult, CompareScenarioResult } from '@/lib/api';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils';
import { SCENARIO_COLORS_EXPORT } from './ComparadorForm';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

const COLORS = SCENARIO_COLORS_EXPORT;

// ── Tooltip Customizado ────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[160px]">
      <p className="text-muted-foreground font-medium mb-1.5">
        {formatDate(new Date(label))}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted-foreground truncate max-w-[100px]">{entry.name}</span>
          </div>
          <span className="font-mono font-semibold" style={{ color: entry.color }}>
            {entry.value >= 0 ? '+' : ''}{(entry.value as number).toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Gráfico Multi-linha ────────────────────────────────────────────────────────

function ComparadorChart({ result }: { result: CompareResult }) {
  const successScenarios = result.scenarios.filter(s => !s.error && s.points?.length);

  // Mescla os pontos por data: { t (ms UTC da data civil), [sN]: variationPct }.
  // A API envia 0% na data inicial, o acumulado no dia 1 de cada mês e o valor final
  // do ranking na data final; o eixo é temporal para o espaçamento seguir as datas.
  const chartData = useMemo(() => {
    type ChartRow = { t: number; [key: string]: number };
    const porData = new Map<string, ChartRow>();
    const linha = (date: string) => {
      if (!porData.has(date)) porData.set(date, { t: Date.parse(`${date.slice(0, 10)}T00:00:00Z`) });
      return porData.get(date)!;
    };

    successScenarios.forEach((scenario, idx) => {
      const inicio = result.startDate.slice(0, 10);
      const primeiro = scenario.points?.[0]?.date;
      if (!primeiro || primeiro > inicio) linha(inicio)[`s${idx}`] = 0;
      scenario.points?.forEach(pt => {
        linha(pt.date)[`s${idx}`] = pt.variationPct;
      });
      // A linha termina no número do ranking, na data final (vale também para respostas antigas da API)
      if (scenario.variationPercent !== undefined) linha(result.endDate.slice(0, 10))[`s${idx}`] = scenario.variationPercent;
    });

    return Array.from(porData.values()).sort((a, b) => a.t - b.t);
  }, [result]);

  // Ticks no dia 1 de cada mês (até ~12 em períodos longos)
  const ticks = useMemo(() => {
    const inicioDeMes = chartData.map(d => d.t).filter(t => new Date(t).getUTCDate() === 1);
    if (inicioDeMes.length <= 13) return inicioDeMes;
    const step = Math.ceil(inicioDeMes.length / 12);
    return inicioDeMes.filter((_, i) => i % step === 0);
  }, [chartData]);

  if (!chartData.length) return null;

  const formatYAxis = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.15} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={ticks}
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
            width={64}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeOpacity={0.5} />

          {successScenarios.map((scenario, idx) => (
            <Line
              key={idx}
              type="monotone"
              dataKey={`s${idx}`}
              name={scenario.label}
              stroke={COLORS[idx]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: COLORS[idx] }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Tabela de Ranking ──────────────────────────────────────────────────────────

function RankingTable({ result }: { result: CompareResult }) {
  const sorted = useMemo(() => {
    return [...result.scenarios]
      .filter(s => !s.error && s.variationPercent !== undefined)
      .sort((a, b) => (b.variationPercent ?? 0) - (a.variationPercent ?? 0));
  }, [result.scenarios]);

  const errors = result.scenarios.filter(s => s.error);
  const best = sorted[0]?.variationPercent ?? 0;

  return (
    <div className="space-y-3">
      {/* Tabela de resultados */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/60 text-muted-foreground uppercase tracking-wide text-[10px]">
              <th className="px-3 py-2 text-left font-semibold">#</th>
              <th className="px-3 py-2 text-left font-semibold">Cenário</th>
              <th className="px-3 py-2 text-right font-semibold">Valor Final</th>
              <th className="px-3 py-2 text-right font-semibold">Variação</th>
              <th className="px-3 py-2 text-right font-semibold">Fator</th>
              <th className="px-3 py-2 text-right font-semibold">vs. Melhor</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((scenario, rank) => {
              const scenarioIdx = result.scenarios.findIndex(s => s.label === scenario.label);
              const color = COLORS[scenarioIdx] ?? COLORS[0];
              const varPct = scenario.variationPercent ?? 0;
              const diff = varPct - best;

              return (
                <tr key={scenario.label} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{rank + 1}º</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="font-medium">{scenario.label}</span>
                      {scenario.hasProjections && (
                        <span className="text-[9px] px-1 py-0 rounded border border-yellow-500/40 text-yellow-400/80">premissa</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {formatCurrency(scenario.finalAmount ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={varPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {varPct >= 0 ? '+' : ''}{varPct.toFixed(4)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                    {(scenario.accumulatedFactor ?? 1).toFixed(6)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {rank === 0 ? (
                      <span className="text-emerald-400 flex items-center justify-end gap-1">
                        <TrendingUp className="h-3 w-3" /> melhor
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {diff.toFixed(2)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cenários com erro */}
      {errors.map(s => (
        <div key={s.label} className="flex items-start gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span><strong>{s.label}</strong>: {s.error}</span>
        </div>
      ))}
    </div>
  );
}

// ── Cards de Destaque ──────────────────────────────────────────────────────────

function HighlightCards({ result }: { result: CompareResult }) {
  const success = result.scenarios.filter(s => !s.error && s.variationPercent !== undefined);
  if (!success.length) return null;

  const sorted = [...success].sort((a, b) => (b.variationPercent ?? 0) - (a.variationPercent ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spread = (best.variationPercent ?? 0) - (worst.variationPercent ?? 0);

  const bestIdx = result.scenarios.findIndex(s => s.label === best.label);
  const worstIdx = result.scenarios.findIndex(s => s.label === worst.label);

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        {
          label: 'Melhor Cenário',
          value: best.label,
          sub: `+${(best.variationPercent ?? 0).toFixed(2)}%`,
          color: COLORS[bestIdx] ?? COLORS[0],
          icon: TrendingUp,
          positive: true,
        },
        {
          label: 'Pior Cenário',
          value: worst.label,
          sub: `${(worst.variationPercent ?? 0) >= 0 ? '+' : ''}${(worst.variationPercent ?? 0).toFixed(2)}%`,
          color: COLORS[worstIdx] ?? COLORS[0],
          icon: sorted.length > 1 ? TrendingDown : Minus,
          positive: (worst.variationPercent ?? 0) >= 0,
        },
        {
          label: 'Spread Máx.',
          value: `${spread.toFixed(2)}%`,
          sub: `${formatCurrency(result.initialAmount * spread / 100)} de diferença`,
          color: '#94a3b8',
          icon: Minus,
          positive: true,
        },
      ].map(({ label, value, sub, color, icon: Icon, positive }) => (
        <div key={label} className="rounded-lg border border-border/50 p-3 bg-card/50">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
          <div className="font-semibold text-sm truncate" style={{ color }}>{value}</div>
          <div className={`text-[11px] font-mono mt-0.5 ${positive ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────────────────────

interface ComparadorResultProps {
  result: CompareResult;
}

export function ComparadorResult({ result }: ComparadorResultProps) {
  const hasSuccess = result.scenarios.some(s => !s.error);
  if (!hasSuccess) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Nenhum cenário retornou resultado. Verifique os parâmetros e tente novamente.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <HighlightCards result={result} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Variação Acumulada (%)
        </p>
        <ComparadorChart result={result} />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Ranking de Retorno
        </p>
        <RankingTable result={result} />
      </div>
    </div>
  );
}
