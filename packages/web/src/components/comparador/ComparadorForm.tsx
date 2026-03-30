import React, { useState } from 'react';
import { Plus, Trash2, BarChart3, RefreshCw } from 'lucide-react';
import { CompareRequest, CompareScenarioInput, runComparison, CompareResult } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { FuturePremise } from '@/components/calculator/FuturePremisesModal';
import { ComparadorPremisesModal, ScenarioPremisesInfo } from './ComparadorPremisesModal';

// ── Constantes ───────────────────────────────────────────────────────────────

const INDEX_OPTIONS = [
  { value: 'CDI',        label: 'CDI',        basis: 252 },
  { value: 'SELIC_OVER', label: 'Selic Over',  basis: 252 },
  { value: 'SELIC_META', label: 'Selic Meta',  basis: 252 },
  { value: 'IPCA',       label: 'IPCA',        basis: 365 },
  { value: 'IGPM',       label: 'IGP-M',       basis: 365 },
  { value: 'INCC',       label: 'INCC',        basis: 365 },
  { value: 'SOFR',       label: 'SOFR',        basis: 360 },
  { value: 'PREFIXADA',  label: 'Pré-fixada',  basis: 365 },
];

const SCENARIO_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ef4444', // red
  '#06b6d4', // cyan
];

const DEFAULT_SCENARIOS: CompareScenarioInput[] = [
  { label: 'CDI 100%',      indexType: 'CDI',       dayCountBasis: 252 },
  { label: 'IPCA',          indexType: 'IPCA',      dayCountBasis: 365 },
  { label: 'Pré-fixada 10%', indexType: 'PREFIXADA', dayCountBasis: 365, prefixedRate: 10 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultLabel(indexType: string, prefixedRate?: number, spread?: CompareScenarioInput['spread']): string {
  if (indexType === 'PREFIXADA') return `Pré-fixada ${prefixedRate ?? 10}%`;
  if (spread?.mode === 'percentage') return `${indexType} ${spread.value}%`;
  if (spread?.mode === 'additive') return `${indexType} + ${spread.value}%`;
  return indexType;
}

// ── Componente Principal ──────────────────────────────────────────────────────

interface ComparadorFormProps {
  onResult: (result: CompareResult) => void;
}

export const SCENARIO_COLORS_EXPORT = SCENARIO_COLORS;

export function ComparadorForm({ onResult }: ComparadorFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [initialAmount, setInitialAmount] = useState('100000');
  const [startDate, setStartDate] = useState(oneYearAgo);
  const [endDate, setEndDate] = useState(today);
  const [scenarios, setScenarios] = useState<CompareScenarioInput[]>(DEFAULT_SCENARIOS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premisesModal, setPremisesModal] = useState(false);
  const [pendingPremises, setPendingPremises] = useState<ScenarioPremisesInfo[]>([]);

  const scenarioColorMap = Object.fromEntries(scenarios.map((s, idx) => [s.label, SCENARIO_COLORS[idx]]));

  const addScenario = () => {
    if (scenarios.length >= 6) return;
    setScenarios(prev => [...prev, { label: 'CDI', indexType: 'CDI', dayCountBasis: 252 }]);
  };

  const removeScenario = (idx: number) => {
    setScenarios(prev => prev.filter((_, i) => i !== idx));
  };

  const updateScenario = (idx: number, patch: Partial<CompareScenarioInput>) => {
    setScenarios(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, ...patch };
      // Auto-update label if it was auto-generated
      const autoLabel = defaultLabel(s.indexType, s.prefixedRate, s.spread);
      if (s.label === autoLabel || !s.label) {
        updated.label = defaultLabel(
          updated.indexType ?? s.indexType,
          updated.prefixedRate ?? s.prefixedRate,
          updated.spread ?? s.spread
        );
      }
      return updated;
    }));
  };

  const handleIndexChange = (idx: number, indexType: string) => {
    const opt = INDEX_OPTIONS.find(o => o.value === indexType);
    const basis = opt?.basis ?? 365;
    updateScenario(idx, { indexType, dayCountBasis: basis, prefixedRate: undefined, spread: undefined });
  };

  const parseAmount = (v: string) => parseFloat(v.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

  const validate = (): string | null => {
    const amount = parseAmount(initialAmount);
    if (!amount || amount <= 0) return 'Informe o montante inicial.';
    if (!startDate || !endDate) return 'Informe o período.';
    if (startDate >= endDate) return 'A data inicial deve ser anterior à final.';
    if (scenarios.length < 2) return 'Adicione ao menos 2 cenários.';
    for (const s of scenarios) {
      if (s.indexType === 'PREFIXADA' && (!s.prefixedRate || s.prefixedRate <= 0)) {
        return `Informe a taxa pré-fixada para o cenário "${s.label}".`;
      }
    }
    return null;
  };

  const buildRequest = (scenariosToUse: CompareScenarioInput[]): CompareRequest => ({
    initialAmount: parseAmount(initialAmount),
    startDate: new Date(startDate + 'T12:00:00').toISOString(),
    endDate: new Date(endDate + 'T12:00:00').toISOString(),
    scenarios: scenariosToUse,
  });

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    setError(null);

    try {
      const result = await runComparison(buildRequest(scenarios));

      const needPremises = result.scenarios.filter(
        s => s.error === 'Premissas futuras necessárias' && s.premisesRequiredFrom
      );

      if (needPremises.length > 0) {
        setPendingPremises(needPremises.map(s => ({
          label: s.label,
          indexType: s.indexType,
          premisesRequiredFrom: s.premisesRequiredFrom!,
          lastAvailableDate: s.lastAvailableDate,
          lastAvailableRate: s.lastAvailableRate,
          premises: [],
        })));
        setPremisesModal(true);
        setLoading(false);
        return;
      }

      onResult(result);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Erro na comparação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePremises = (label: string, premises: FuturePremise[]) => {
    setPendingPremises(prev => prev.map(s => s.label === label ? { ...s, premises } : s));
  };

  const handleConfirmPremises = async () => {
    setLoading(true);
    setError(null);

    const scenariosWithPremises = scenarios.map(s => {
      const pending = pendingPremises.find(p => p.label === s.label);
      if (!pending) return s;
      return {
        ...s,
        futurePremises: pending.premises.map(p => ({
          startDate: new Date(p.startDate + 'T12:00:00').toISOString(),
          endDate: new Date(p.endDate + 'T12:00:00').toISOString(),
          rate: p.rate,
        })),
      };
    });

    try {
      const result = await runComparison(buildRequest(scenariosWithPremises));
      setPremisesModal(false);
      onResult(result);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Erro na comparação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl">
          <BarChart3 className="h-5 w-5 text-primary" />
          Comparador de Cenários
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Parâmetros base */}
        <div className="space-y-3 pb-4 border-b border-white/5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Parâmetros Base
          </p>

          <div className="space-y-1.5">
            <Label>Montante Inicial</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                className="pl-9 font-mono"
                placeholder="100.000,00"
                value={initialAmount}
                onChange={e => setInitialAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data Inicial</Label>
              <Input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data Final</Label>
              <Input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Atalhos de período */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: 'YTD', start: `${new Date().getFullYear()}-01-01`, end: today },
              { label: '12M', start: new Date(Date.now() - 365*24*60*60*1000).toISOString().slice(0,10), end: today },
              { label: '24M', start: new Date(Date.now() - 2*365*24*60*60*1000).toISOString().slice(0,10), end: today },
              { label: '36M', start: new Date(Date.now() - 3*365*24*60*60*1000).toISOString().slice(0,10), end: today },
              { label: '60M', start: new Date(Date.now() - 5*365*24*60*60*1000).toISOString().slice(0,10), end: today },
            ].map(({ label, start, end }) => (
              <button
                key={label}
                type="button"
                onClick={() => { setStartDate(start); setEndDate(end); }}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  startDate === start && endDate === end
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Cenários */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Cenários ({scenarios.length}/6)
            </p>
            {scenarios.length < 6 && (
              <button
                type="button"
                onClick={addScenario}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            )}
          </div>

          {scenarios.map((scenario, idx) => (
            <div
              key={idx}
              className="rounded-lg border p-3 space-y-2.5"
              style={{ borderColor: SCENARIO_COLORS[idx] + '40', background: SCENARIO_COLORS[idx] + '08' }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: SCENARIO_COLORS[idx] }}
                />
                <Input
                  className="h-7 text-xs font-medium flex-1 bg-transparent border-0 border-b border-white/10 rounded-none px-0 focus-visible:ring-0"
                  value={scenario.label}
                  onChange={e => updateScenario(idx, { label: e.target.value })}
                  placeholder="Nome do cenário"
                />
                {scenarios.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeScenario(idx)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Indexador</Label>
                  <Select value={scenario.indexType} onValueChange={v => handleIndexChange(idx, v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDEX_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {scenario.indexType === 'PREFIXADA' ? (
                  <div className="space-y-1">
                    <Label className="text-[10px]">Taxa (% a.a.)</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder="ex: 10.5"
                      value={scenario.prefixedRate ?? ''}
                      onChange={e => updateScenario(idx, { prefixedRate: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[10px]">% do índice</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder="100"
                      value={scenario.spread?.mode === 'percentage' ? scenario.spread.value : ''}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        updateScenario(idx, {
                          spread: isNaN(v) || v === 100
                            ? undefined
                            : { mode: 'percentage', value: v },
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Erro */}
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
        )}

        {/* Botão */}
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Calculando...</>
            : <><BarChart3 className="h-4 w-4 mr-2" />Comparar Cenários</>
          }
        </Button>

      </CardContent>

      <ComparadorPremisesModal
        open={premisesModal}
        onOpenChange={open => { if (!loading) setPremisesModal(open); }}
        calcEndDate={endDate}
        scenarios={pendingPremises}
        scenarioColors={scenarioColorMap}
        onUpdate={handleUpdatePremises}
        onConfirm={handleConfirmPremises}
        loading={loading}
      />
    </Card>
  );
}
