import React from 'react';
import { TrendingUp, Calendar, DollarSign, Percent, AlertTriangle, WifiOff, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CalculationResult } from '@/lib/api';
import {
  formatCurrency, formatFactor, formatDate,
  INDEX_LABELS, BASIS_LABELS,
} from '@/lib/utils';

interface ResultsSummaryProps {
  result: CalculationResult;
}

const THESIS_LABELS: Record<string, string> = {
  CORRECAO_SIMPLES: 'Correção Simples',
  VALOR_PRESENTE: 'Valor Presente',
  CORRECAO_COM_CARENCIA: 'Correção c/ Carência',
  FLUXO_COMPLETO: 'Fluxo Completo',
  CORRECAO_COM_JUROS: 'Correção c/ Juros',
};

const THESIS_COLORS: Record<string, string> = {
  CORRECAO_SIMPLES: '',
  VALOR_PRESENTE: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  CORRECAO_COM_CARENCIA: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  FLUXO_COMPLETO: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  CORRECAO_COM_JUROS: '',
};

function StatCard({
  icon: Icon, label, value, sub, size = 'normal', valueColor,
}: {
  icon: React.ElementType; label: string; value: string;
  sub?: string; size?: 'normal' | 'large' | 'small'; valueColor?: string;
}) {
  const isLong = value.length > 14;
  const valueClass =
    size === 'large'
      ? `${isLong ? 'text-base' : 'text-2xl'} font-bold font-mono text-foreground`
      : size === 'small'
      ? `${isLong ? 'text-xs' : 'text-lg'} font-semibold font-mono text-foreground/70`
      : `${isLong ? 'text-sm' : 'text-xl'} font-bold font-mono ${valueColor || 'text-foreground'}`;

  return (
    <div className="rounded-lg p-4 animate-fade-in card-hover relative overflow-hidden flex flex-col justify-center glass-card border-primary/40 border-l-2 border-l-primary shadow-[0_8px_30px_rgba(16,185,129,0.15)]">
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 blur-[40px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="flex items-center gap-1.5 mb-2 relative z-10">
        <Icon className={`h-3.5 w-3.5 ${size === 'large' ? 'text-primary' : 'text-muted-foreground/60'}`} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <div className={`${valueClass} truncate relative z-10`} title={value}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/60 mt-1 font-mono truncate relative z-10">{sub}</div>}
    </div>
  );
}

function DCFSummary({ result }: { result: CalculationResult }) {
  const dcf = result.dcfResult!;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="Valor Nominal Total" value={formatCurrency(dcf.totalNominal)} size="small" />
        <StatCard icon={TrendingUp} label="Valor Presente Total" value={formatCurrency(dcf.totalPV)} size="large" />
        <StatCard
          icon={Percent}
          label="Desconto Total"
          value={`-${((1 - dcf.totalPV / dcf.totalNominal) * 100).toFixed(2)}%`}
          sub={`Taxa: ${dcf.discountRate}% a.a.`}
          valueColor="text-orange-400"
        />
        <StatCard
          icon={Clock}
          label="Duration (Macaulay)"
          value={`${dcf.macaulayDuration.toFixed(2)} anos`}
          sub={`${dcf.flows.length} fluxo${dcf.flows.length !== 1 ? 's' : ''}`}
        />
      </div>
      {/* DCF flows mini-table */}
      <div className="rounded-lg border border-white/5 overflow-hidden glass-panel mt-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/5 text-muted-foreground text-[10px] uppercase tracking-wide border-b border-white/5">
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-right">Nominal</th>
              <th className="px-3 py-2 text-right">Fator Desc.</th>
              <th className="px-3 py-2 text-right">Valor Presente</th>
              <th className="px-3 py-2 text-right">Contrib. %</th>
            </tr>
          </thead>
          <tbody>
            {dcf.flows.map((f, i) => (
              <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-3 py-1.5 font-mono">{formatDate(new Date(f.date))}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(f.nominalAmount)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{f.discountFactor.toFixed(6)}</td>
                <td className="px-3 py-1.5 text-right font-mono font-semibold text-primary">{formatCurrency(f.pv)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{f.contributionPercent.toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="border-t-2 border-white/10 bg-white/5 font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right font-mono">{formatCurrency(dcf.totalNominal)}</td>
              <td></td>
              <td className="px-3 py-2 text-right font-mono text-primary animate-pulse-glow rounded">{formatCurrency(dcf.totalPV)}</td>
              <td className="px-3 py-2 text-right font-mono">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function FluxoCompletoSummary({ result }: { result: CalculationResult }) {
  const ff = result.fullFlowResult!;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard icon={DollarSign} label="Principal" value={formatCurrency(ff.principal)} size="small" />
      <StatCard icon={TrendingUp} label="Total Pago" value={formatCurrency(ff.totalPayments)} size="large" />
      <StatCard
        icon={Percent}
        label="Total Juros"
        value={formatCurrency(ff.totalInterest)}
        sub={`${ff.annualRate}% a.a. | ${ff.amortizationSystem}`}
        valueColor="text-orange-400"
      />
      <StatCard
        icon={Calendar}
        label="Total Amortizado"
        value={formatCurrency(ff.totalAmortized)}
        sub={`${ff.rows.length} período${ff.rows.length !== 1 ? 's' : ''}`}
      />
    </div>
  );
}

export function ResultsSummary({ result }: ResultsSummaryProps) {
  const thesis = result.thesisType ?? 'CORRECAO_SIMPLES';
  const isT2 = thesis === 'VALOR_PRESENTE';
  const isT4 = thesis === 'FLUXO_COMPLETO';

  // Standard summary for T1/T3/T5
  const gain = result.finalAmount - result.initialAmount - result.totalAmortized;
  const isPositive = result.variationPercent >= 0;
  const variationColor = isPositive ? 'text-emerald-400' : 'text-red-400';
  const gainColor = gain >= 0 ? 'text-emerald-400' : 'text-red-400';

  const thesisColor = THESIS_COLORS[thesis] ?? '';

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {thesis !== 'CORRECAO_SIMPLES' && (
            <Badge className={`border ${thesisColor || 'bg-secondary text-secondary-foreground border-border'}`}>
              {THESIS_LABELS[thesis] ?? thesis}
            </Badge>
          )}
          {!isT2 && !isT4 && (
            <>
              <Badge variant="secondary">{INDEX_LABELS[result.indexType] || result.indexType}</Badge>
              <Badge variant="outline">{BASIS_LABELS[result.dayCountBasis]}</Badge>
            </>
          )}
          {result.hasProjections && (
            <Badge variant="projected" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Contém Premissas
            </Badge>
          )}
          {result.gracePeriodInfo && (
            <Badge className="bg-orange-500/15 text-orange-400 border border-orange-500/30 gap-1">
              <Clock className="h-3 w-3" />
              Carência Tipo {result.gracePeriodInfo.type}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(new Date(result.startDate))} → {formatDate(new Date(result.endDate))}
        </div>
      </div>

      {/* Thesis-specific summary */}
      {isT2 && result.dcfResult ? (
        <DCFSummary result={result} />
      ) : isT4 && result.fullFlowResult ? (
        <FluxoCompletoSummary result={result} />
      ) : (
        /* Standard T1/T3/T5 */
        <div className="space-y-4">
          {/* Hero impact block */}
          <div className="glass-card rounded-xl p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Valor Corrigido
              </p>
              <p
                className="font-display font-bold leading-none tabular-nums"
                style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', color: 'hsl(var(--primary))' }}
              >
                {formatCurrency(result.finalAmount)}
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-1">
              <span className={`text-2xl font-bold font-mono tabular-nums leading-none ${variationColor}`}>
                {isPositive ? '+' : ''}{result.variationPercent.toFixed(4)}%
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                Fator {formatFactor(result.accumulatedFactor)}
              </span>
            </div>
          </div>

          {/* Supporting stats */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard icon={DollarSign} label="Montante Inicial" value={formatCurrency(result.initialAmount)} size="small" />
            <StatCard
              icon={Calendar}
              label={result.totalAmortized > 0 ? 'Ganho / Amortizado' : 'Ganho Bruto'}
              value={formatCurrency(gain)}
              sub={result.totalAmortized > 0
                ? `Amortizado: ${formatCurrency(result.totalAmortized)}`
                : undefined}
              valueColor={gainColor}
            />
            <StatCard
              icon={TrendingUp}
              label="Indexador"
              value={INDEX_LABELS[result.indexType] || result.indexType}
              sub={BASIS_LABELS[result.dayCountBasis]}
              size="small"
            />
          </div>
        </div>
      )}

      {/* Grace period info */}
      {result.gracePeriodInfo && (
        <div className="flex flex-wrap gap-4 px-1 text-xs text-orange-400/70">
          {result.gracePeriodInfo.deferredInterest > 0 && (
            <span>Juros diferidos na carência: <strong>{formatCurrency(result.gracePeriodInfo.deferredInterest)}</strong></span>
          )}
          {result.gracePeriodInfo.interestPayments > 0 && (
            <span>Juros pagos na carência: <strong>{formatCurrency(result.gracePeriodInfo.interestPayments)}</strong></span>
          )}
        </div>
      )}

      {/* Status messages */}
      {(result.hasProjections || result.warning) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {result.hasProjections && result.projectionStartDate && (
            <span className="flex items-center gap-1 text-xs text-projected/70">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Dados reais até <strong>{formatDate(new Date(result.projectionStartDate))}</strong>
              &nbsp;— período seguinte usa premissas
            </span>
          )}
          {result.warning && (
            <span className="flex items-center gap-1 text-xs text-destructive/70">
              <WifiOff className="h-3 w-3 shrink-0" />
              {result.warning}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
