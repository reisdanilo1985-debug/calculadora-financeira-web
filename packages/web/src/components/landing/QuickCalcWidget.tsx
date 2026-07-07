import React, { useState } from 'react';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { runCalculation, CalculationResult } from '@/lib/api';

const INDEX_OPTIONS = [
  { value: 'CDI', label: 'CDI', basis: 252 },
  { value: 'IPCA', label: 'IPCA', basis: 365 },
  { value: 'SELIC_OVER', label: 'Selic', basis: 252 },
];

const PERIOD_OPTIONS = [
  { months: 12, label: '12 meses' },
  { months: 24, label: '24 meses' },
];

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface QuickCalcWidgetProps {
  onNavigate: (view: string) => void;
}

/**
 * Preview interativo real: chama POST /api/calcular com um cenário simples e
 * mostra o resultado na própria landing. Fallback gracioso se a API estiver
 * indisponível (ex.: backend Render "frio").
 */
export function QuickCalcWidget({ onNavigate }: QuickCalcWidgetProps) {
  const [amountText, setAmountText] = useState('100.000');
  const [indexType, setIndexType] = useState('CDI');
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseAmount = (): number => {
    const clean = amountText.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(clean);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const handleAmountChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      setAmountText('');
      return;
    }
    setAmountText(new Intl.NumberFormat('pt-BR').format(parseInt(digits, 10)));
  };

  const calculate = async () => {
    const amount = parseAmount();
    if (!amount) return;

    setLoading(true);
    setError(null);
    setResult(null);

    // Fim = ontem (última taxa publicada); início = N meses antes.
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setMonth(start.getMonth() - months);

    const option = INDEX_OPTIONS.find(o => o.value === indexType)!;

    try {
      const r = await runCalculation({
        initialAmount: amount,
        startDate: toISO(start),
        endDate: toISO(end),
        indexType,
        dayCountBasis: option.basis,
        thesisType: 'CORRECAO_SIMPLES',
      });
      setResult(r);
    } catch {
      setError('O motor de cálculo está aquecendo — tente novamente em alguns segundos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-xl p-6 w-full">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Experimente agora</span>
        <span className="text-[11px] text-muted-foreground">— cálculo real, dados oficiais</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1.5">Montante (R$)</label>
          <div className="flex items-center rounded-lg border border-border bg-input px-3 input-glow">
            <span className="text-sm text-muted-foreground mr-1.5">R$</span>
            <input
              inputMode="numeric"
              value={amountText}
              onChange={e => handleAmountChange(e.target.value)}
              className="w-full bg-transparent py-2.5 text-sm font-mono tabular-nums text-foreground outline-none"
              aria-label="Montante inicial em reais"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground block mb-1.5">Indexador</label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {INDEX_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setIndexType(o.value)}
                className={`px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  indexType === o.value
                    ? 'bg-primary/15 text-primary'
                    : 'bg-input text-muted-foreground hover:text-foreground'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground block mb-1.5">Período</label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.months}
                onClick={() => setMonths(p.months)}
                className={`px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  months === p.months
                    ? 'bg-primary/15 text-primary'
                    : 'bg-input text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={calculate}
          disabled={loading || !parseAmount()}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-6 py-2.5 rounded-lg transition-all"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calcular'}
        </button>
      </div>

      {/* Resultado / erro */}
      {result && (
        <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 animate-fade-in">
          <div>
            <p className="text-[11px] text-muted-foreground">
              {formatBRL(result.initialAmount)} corrigidos por {INDEX_OPTIONS.find(o => o.value === indexType)?.label} em {months} meses
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
              {formatBRL(result.finalAmount)}
              <span className="text-sm font-medium text-primary ml-2">
                +{result.variationPercent.toFixed(2).replace('.', ',')}%
              </span>
            </p>
          </div>
          <button
            onClick={() => onNavigate('calculadora')}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline shrink-0"
          >
            Ver memória de cálculo completa <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-200/80 animate-fade-in">
          {error}
        </div>
      )}
    </div>
  );
}
