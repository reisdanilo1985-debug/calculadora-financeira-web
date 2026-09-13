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

const PERIODICITY_LABELS: Record<string, string> = {
  ANNUAL: 'anual', SEMIANNUAL: 'semestral', QUARTERLY: 'trimestral', MONTHLY: 'mensal',
};


const fmtTaxa = (v: number, casas = 4) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

function DCFSummary({ result }: { result: CalculationResult }) {
  const dcf = result.dcfResult!;
  const tv = dcf.terminalValue;
  const temSaida = dcf.flows.some(f => f.nominalAmount < 0);
  const nFluxos = `${dcf.flows.length} fluxo${dcf.flows.length !== 1 ? 's' : ''}`;
  const duration = dcf.macaulayDuration != null ? `${dcf.macaulayDuration.toFixed(2)} anos` : null;
  const taxa = `${fmtTaxa(dcf.discountRate)}% a.a.`;
  // VPL abaixo de meio centavo e TIR a menos de 0,000001 p.p. da taxa: empate
  const vplZero = Math.abs(dcf.totalPV) < 0.005;
  const tirVsTaxa = dcf.irr == null ? 0 : Math.abs(dcf.irr - dcf.discountRate) < 1e-6 ? 0 : Math.sign(dcf.irr - dcf.discountRate);
  // Com saídas, a participação no VP (VPL) distorce: some da tabela
  const contrib = (pct: number) => (temSaida ? '—' : `${pct.toFixed(1)}%`);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="Valor Nominal Total" value={formatCurrency(dcf.totalNominal)} sub={nFluxos} size="small" />
        <StatCard
          icon={TrendingUp}
          label={temSaida ? 'VPL' : 'Valor Presente Total'}
          value={formatCurrency(dcf.totalPV)}
          sub={tv ? `Fluxos ${formatCurrency(dcf.explicitPV)} + perpetuidade` : `Taxa: ${taxa}`}
          size="large"
        />
        {dcf.irr != null ? (
          <StatCard
            icon={Percent}
            label="TIR"
            value={`${fmtTaxa(dcf.irr, 2)}% a.a.`}
            sub={`${fmtTaxa(dcf.irrMonthly ?? 0, 4)}% a.m. · taxa ${taxa}`}
            valueColor={tirVsTaxa > 0 ? 'text-emerald-400' : tirVsTaxa < 0 ? 'text-red-400' : undefined}
          />
        ) : temSaida ? (
          <StatCard icon={Percent} label="TIR" value="—" sub="sem TIR na faixa pesquisada" />
        ) : tv ? (
          <StatCard icon={Clock} label="Duration (Macaulay)" value={duration ?? '—'} sub="inclui a perpetuidade" />
        ) : (
          <StatCard
            icon={Percent}
            label="Desconto Total"
            value={`-${((1 - dcf.totalPV / dcf.totalNominal) * 100).toFixed(2)}%`}
            sub={`Taxa: ${taxa}`}
            valueColor="text-orange-400"
          />
        )}
        {tv ? (
          <StatCard
            icon={TrendingUp}
            label="Valor Terminal (VP)"
            value={formatCurrency(tv.pv)}
            sub={temSaida
              ? `base ${formatCurrency(tv.baseCashFlow)} · g ${fmtTaxa(tv.growthRate)}% a.a.`
              : `${tv.contributionPercent.toFixed(1)}% do VP · g ${fmtTaxa(tv.growthRate)}% a.a.`}
          />
        ) : (
          <StatCard
            icon={Clock}
            label="Duration (Macaulay)"
            value={duration ?? '—'}
            sub={duration ? nFluxos : 'não definida com VP negativo'}
          />
        )}
      </div>

      {(dcf.irrWarning || temSaida) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 mt-3">
          {temSaida && (
            <span className={`text-xs ${vplZero ? 'text-muted-foreground' : dcf.totalPV > 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
              {vplZero
                ? `VPL zero a ${taxa}: o fluxo rende exatamente a taxa de desconto.`
                : dcf.totalPV > 0
                ? `VPL positivo a ${taxa}: o fluxo cria valor.`
                : `VPL negativo a ${taxa}: o fluxo destrói valor.`}
            </span>
          )}
          {dcf.irrWarning && (
            <span className="flex items-center gap-1 text-xs text-projected/80">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {dcf.irrWarning}
              {dcf.irrs && dcf.irrs.length > 1 && ` (${dcf.irrs.map(x => `${fmtTaxa(x, 2)}%`).join(' · ')})`}
            </span>
          )}
        </div>
      )}
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
                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{contrib(f.contributionPercent)}</td>
              </tr>
            ))}
            {tv && (
              <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-3 py-1.5">
                  <span className="font-mono">{formatDate(new Date(tv.date))}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    Perpetuidade {PERIODICITY_LABELS[tv.periodicity] ?? ''} · base {formatCurrency(tv.baseCashFlow)} · g {fmtTaxa(tv.growthRate)}% a.a.
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(tv.nominalValue)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{tv.discountFactor.toFixed(6)}</td>
                <td className="px-3 py-1.5 text-right font-mono font-semibold text-primary">{formatCurrency(tv.pv)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{contrib(tv.contributionPercent)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-white/10 bg-white/5 font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right font-mono">{formatCurrency(dcf.totalNominal)}</td>
              <td></td>
              <td className="px-3 py-2 text-right font-mono text-primary animate-pulse-glow rounded">{formatCurrency(dcf.totalPV)}</td>
              <td className="px-3 py-2 text-right font-mono">{temSaida ? '—' : '100%'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

const SYSTEM_NAMES: Record<string, string> = { SAC: 'SAC', PRICE: 'Price', BULLET: 'Bullet' };

/** Leitura da comparação: o sistema escolhido frente aos outros dois (sem certo/errado) */
function leituraComparacao(ff: NonNullable<CalculationResult['fullFlowResult']>): string | null {
  const comp = ff.comparison;
  const sac = comp?.find(c => c.system === 'SAC');
  const price = comp?.find(c => c.system === 'PRICE');
  if (!sac || !price) return null;
  const jurosAMais = price.totalInterest - sac.totalInterest;
  const alivio = sac.firstPayment - price.firstPayment;
  return `Mesma taxa e prazo: Price paga ${formatCurrency(jurosAMais)} a mais de juros que SAC; em troca, a 1ª parcela é ${formatCurrency(alivio)} menor.`;
}

function FluxoCompletoSummary({ result }: { result: CalculationResult }) {
  const ff = result.fullFlowResult!;
  const periodo = ff.periodicity && ff.periodicity !== 'MONTHLY'
    ? ` · ${PERIODICITY_LABELS[ff.periodicity]} (${fmtTaxa(ff.periodRate ?? 0)}% ao período)`
    : '';
  const escolhido = ff.comparison?.find(c => c.system === ff.amortizationSystem);
  const leitura = leituraComparacao(ff);
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="Principal" value={formatCurrency(ff.principal)} size="small" />
        <StatCard icon={TrendingUp} label="Total Pago" value={formatCurrency(ff.totalPayments)} size="large" />
        <StatCard
          icon={Percent}
          label="Total Juros"
          value={formatCurrency(ff.totalInterest)}
          sub={`${ff.annualRate}% a.a. | ${ff.amortizationSystem}${periodo}`}
          valueColor="text-orange-400"
        />
        <StatCard
          icon={Calendar}
          label="Total Amortizado"
          value={formatCurrency(ff.totalAmortized)}
          sub={`${ff.rows.length} parcela${ff.rows.length !== 1 ? 's' : ''}`}
        />
      </div>

      {ff.comparison && escolhido && (
        <div className="rounded-lg border border-white/5 overflow-hidden glass-panel mt-4">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-b border-white/5">
            Comparação entre sistemas (mesmo principal, taxa, prazo e carência)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 text-muted-foreground text-[10px] uppercase tracking-wide border-b border-white/5">
                  <th className="px-3 py-2 text-left">Sistema</th>
                  <th className="px-3 py-2 text-right">1ª parcela</th>
                  <th className="px-3 py-2 text-right">Última parcela</th>
                  <th className="px-3 py-2 text-right">Total de juros</th>
                  <th className="px-3 py-2 text-right">Total pago</th>
                  <th className="px-3 py-2 text-right">Juros vs. {SYSTEM_NAMES[ff.amortizationSystem]}</th>
                </tr>
              </thead>
              <tbody>
                {ff.comparison.map(c => {
                  const atual = c.system === ff.amortizationSystem;
                  const dif = c.totalInterest - escolhido.totalInterest;
                  return (
                    <tr key={c.system} className={`border-t border-white/5 ${atual ? 'bg-primary/5 font-semibold' : 'hover:bg-white/5'} transition-colors`}>
                      <td className="px-3 py-1.5">
                        {SYSTEM_NAMES[c.system]}
                        {atual && <span className="ml-1.5 text-[10px] font-normal text-primary">escolhido</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(c.firstPayment)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(c.lastPayment)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-orange-400/80">{formatCurrency(c.totalInterest)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(c.totalPayments)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                        {atual ? '—' : `${dif >= 0 ? '+' : '−'}${formatCurrency(Math.abs(dif))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {leitura && <p className="px-3 py-2 text-xs text-muted-foreground border-t border-white/5">{leitura}</p>}
        </div>
      )}
    </>
  );
}

export function ResultsSummary({ result }: ResultsSummaryProps) {
  const thesis = result.thesisType ?? 'CORRECAO_SIMPLES';
  const isT2 = thesis === 'VALOR_PRESENTE';
  const isT4 = thesis === 'FLUXO_COMPLETO';

  // Standard summary for T1/T3/T5
  // Ganho = o que sobrou + o que já foi devolvido (amortizações) − o que entrou (montante + aportes)
  const totalContributed = result.totalContributed ?? 0;
  const gain = result.finalAmount + result.totalAmortized - result.initialAmount - totalContributed;
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
              sub={result.totalAmortized > 0 || totalContributed > 0
                ? [
                    result.totalAmortized > 0 ? `Amortizado: ${formatCurrency(result.totalAmortized)}` : '',
                    totalContributed > 0 ? `Aportado: ${formatCurrency(totalContributed)}` : '',
                  ].filter(Boolean).join(' · ')
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
