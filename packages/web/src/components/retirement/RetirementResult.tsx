import React, { useState } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Info,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { RetirementResultData, RetirementYearRow } from '@/lib/api';
import { RetirementMemory } from './RetirementMemory';

interface RetirementResultProps {
  result: RetirementResultData;
}

function ProbabilidadeGauge({ value }: { value: number }) {
  const color = value >= 85 ? 'text-green-400' : value >= 70 ? 'text-yellow-400' : 'text-red-400';
  const bgColor = value >= 85 ? 'bg-green-400' : value >= 70 ? 'bg-yellow-400' : 'bg-red-400';
  const label = value >= 85 ? 'Excelente' : value >= 70 ? 'Moderado' : 'Crítico';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`text-4xl font-black tabular-nums ${color}`}>{value.toFixed(0)}%</div>
      <div className="w-full bg-white/10 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${bgColor}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</span>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/5 rounded-lg p-4 space-y-1 border border-white/5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function RetirementResult({ result }: RetirementResultProps) {
  const [showTable, setShowTable] = useState(false);
  const [showMemorial, setShowMemorial] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Alertas ── */}
      {result.alertas.length > 0 && (
        <div className="space-y-2">
          {result.alertas.map((alerta, idx) => {
            const Icon = alerta.tipo === 'danger' ? AlertCircle
              : alerta.tipo === 'warning' ? AlertTriangle
              : Info;
            const style = alerta.tipo === 'danger'
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : alerta.tipo === 'warning'
              ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-400';
            return (
              <div key={idx} className={`flex items-start gap-2 p-3 rounded-lg border text-[11px] ${style}`}>
                <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{alerta.mensagem}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Probabilidade de Sucesso ── */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center">Probabilidade de Sucesso (Monte Carlo)</p>
        <ProbabilidadeGauge value={result.probabilidadeSucesso} />
        <p className="text-[10px] text-center text-muted-foreground">
          O plano sustenta os gastos até os {result.projecaoAnualP50[result.projecaoAnualP50.length - 1]?.idade || '?'} anos em{' '}
          <strong className="text-foreground">{result.probabilidadeSucesso.toFixed(0)}%</strong> das simulações
        </p>
      </div>

      {/* ── Métricas principais ── */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Patrimônio na Aposentadoria"
          value={formatBRL(result.patrimonioAcumuladoAposentadoria)}
          sub="Estimativa com retorno real médio"
        />
        <MetricCard
          label="Taxa de Retirada Inicial"
          value={`${result.taxaRetiradaInicial.toFixed(1)}%`}
          sub="Ref: ≤ 3,5% conservador, ≤ 4% moderado"
        />
        <MetricCard
          label="Benefício INSS Estimado"
          value={formatBRL(result.beneficioINSSMensal)}
          sub="R$/mês"
        />
        <MetricCard
          label="Renda Total Mensal"
          value={formatBRL(result.rendaTotalMensal)}
          sub="INSS + Aluguel + Patrimônio"
        />
      </div>

      {/* ── Distribuição de saldos finais ── */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Saldo Final (distribuição)</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Pessimista (P5)</p>
            <p className="text-base font-bold text-red-400 tabular-nums">{formatBRL(result.saldoFinalP5)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Mediano (P50)</p>
            <p className="text-base font-bold text-primary tabular-nums">{formatBRL(result.saldoFinalP50)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Otimista (P95)</p>
            <p className="text-base font-bold text-green-400 tabular-nums">{formatBRL(result.saldoFinalP95)}</p>
          </div>
        </div>
      </div>

      {/* ── Resumo acumulação ── */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total Aportado" value={formatBRL(result.totalAportado)} />
        <MetricCard label="Total Rendimento" value={formatBRL(result.totalRendimento)} />
        <MetricCard
          label="Esgotamento P50"
          value={result.anoEsgotamentoP50 ? `Aos ${result.anoEsgotamentoP50} anos` : 'Não esgota'}
          sub="Cenário mediano"
        />
      </div>

      {/* ── Projeção anual ── */}
      <div>
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg border border-white/10 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-white/10 transition-colors"
          onClick={() => setShowTable(!showTable)}
        >
          <span className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" />
            Projeção Anual (Cenário P50)
          </span>
          {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showTable && (
          <div className="mt-2 rounded-lg border border-white/5 overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="bg-white/5 sticky top-0">
                <tr className="border-b border-white/10">
                  <th className="text-left px-3 py-2 text-[10px] uppercase font-bold text-muted-foreground">Ano</th>
                  <th className="text-center px-3 py-2 text-[10px] uppercase font-bold text-muted-foreground">Idade</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase font-bold text-muted-foreground">Patrimônio Início</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase font-bold text-muted-foreground">Rendimento</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase font-bold text-muted-foreground">Gasto Total</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase font-bold text-muted-foreground">Patrimônio Fim</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase font-bold text-muted-foreground">Taxa Ret.</th>
                </tr>
              </thead>
              <tbody>
                {result.projecaoAnualP50.map((row: RetirementYearRow, idx: number) => (
                  <tr
                    key={idx}
                    className={`border-b border-white/5 hover:bg-white/5 transition-colors ${row.esgotado ? 'text-red-400' : ''}`}
                  >
                    <td className="px-3 py-2 tabular-nums">{row.ano}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{row.idade}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(row.patrimonioInicio)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-green-400">{formatBRL(row.retornoNominal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400">{formatBRL(row.gastoAno)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${row.esgotado ? 'text-red-500' : 'text-foreground'}`}>
                      {formatBRL(row.patrimonioFim)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.taxaRetirada.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Memorial ── */}
      <div>
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg border border-white/10 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-white/10 transition-colors"
          onClick={() => setShowMemorial(!showMemorial)}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Memorial de Cálculo
          </span>
          {showMemorial ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showMemorial && (
          <div className="mt-2">
            <RetirementMemory steps={result.memorial} />
          </div>
        )}
      </div>
    </div>
  );
}
