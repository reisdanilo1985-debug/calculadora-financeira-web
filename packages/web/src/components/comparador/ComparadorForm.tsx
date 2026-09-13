import React, { useState } from 'react';
import { Plus, Trash2, BarChart3, RefreshCw } from 'lucide-react';
import { NumericFormat } from 'react-number-format';
import { CompareRequest, CompareScenarioInput, runComparison, CompareResult } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { hojeISO, somarMesesISO } from '@/lib/datas';
import { toAnnual, RateMode } from '@/lib/rateConversion';
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

const DAILY_BR_INDICES = ['CDI', 'SELIC_OVER', 'SELIC_META'];
const MONTHLY_INDICES = ['IPCA', 'IGPM', 'INCC'];

/**
 * Cenário no formulário. Os campos de composição guardam o que o usuário digitou
 * (ex.: 1 % a.m.); o spread enviado à API é montado por toApiScenario.
 */
interface ScenarioState extends Omit<CompareScenarioInput, 'spread' | 'futurePremises'> {
  /** '% do índice' (padrão) ou 'Índice + spread' */
  composition: 'percentage' | 'additive';
  /** % do índice (ex.: 110) ou taxa do spread, na unidade de spreadRateMode */
  compositionValue?: number;
  spreadRateMode: RateMode;
  /** O nome segue os parâmetros até o usuário editá-lo */
  autoLabel: boolean;
}

const newScenario = (s: Partial<ScenarioState> & Pick<ScenarioState, 'label' | 'indexType' | 'dayCountBasis'>): ScenarioState => ({
  composition: 'percentage',
  spreadRateMode: 'aa',
  autoLabel: true,
  ...s,
});

const DEFAULT_SCENARIOS: ScenarioState[] = [
  newScenario({ label: 'CDI 100%',       indexType: 'CDI',       dayCountBasis: 252 }),
  newScenario({ label: 'IPCA',           indexType: 'IPCA',      dayCountBasis: 365 }),
  newScenario({ label: 'Pré-fixada 10%', indexType: 'PREFIXADA', dayCountBasis: 365, prefixedRate: 10 }),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtTaxa = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

const COMPOSITION_OPTIONS: { value: ScenarioState['composition']; label: string }[] = [
  { value: 'percentage', label: '% do índice' },
  { value: 'additive',   label: 'Índice + spread' },
];

/** SOFR: spread somado à taxa ACT/360, só em % a.a. */
const spreadAllowsMonthly = (indexType: string) => indexType !== 'SOFR';

const spreadUnit = (s: ScenarioState) =>
  s.spreadRateMode === 'am' && spreadAllowsMonthly(s.indexType) ? '% a.m.' : '% a.a.';

function spreadTooltip(indexType: string): string {
  if (DAILY_BR_INDICES.includes(indexType)) {
    return 'Taxa somada ao índice pelo Fator de Spread B3: capitalizada por dia útil (base 252). Taxa ao mês é convertida na equivalente ao ano, composta.';
  }
  if (MONTHLY_INDICES.includes(indexType)) {
    return 'Taxa somada ao índice e composta em cada mês. Ao mês: cada mês cheio rende a taxa mensal exata (30/360). Ao ano: proporcional aos dias corridos (365).';
  }
  return 'Taxa somada à SOFR, em % a.a. (ACT/360).';
}

function defaultLabel(s: ScenarioState): string {
  if (s.indexType === 'PREFIXADA') return `Pré-fixada ${s.prefixedRate ?? 10}%`;
  const v = s.compositionValue;
  if (v === undefined || !Number.isFinite(v)) return s.indexType;
  if (s.composition === 'percentage') return v === 100 ? s.indexType : `${s.indexType} ${fmtTaxa(v)}%`;
  if (v === 0) return s.indexType;
  const unidade = s.spreadRateMode === 'am' && spreadAllowsMonthly(s.indexType) ? 'a.m.' : 'a.a.';
  return `${s.indexType} ${v < 0 ? '−' : '+'} ${fmtTaxa(Math.abs(v))}% ${unidade}`;
}

/**
 * Spread no formato da API (sempre % a.a.):
 * - CDI/Selic: taxa a.m. convertida em a.a. composta; Fator de Spread B3 por dia útil (252).
 * - IPCA/IGP-M/INCC: a.m. vai como a.a. equivalente em 30E/360 (mês fechado = taxa mensal exata);
 *   a.a. segue dias corridos/365.
 * - SOFR: taxa a.a. somada à SOFR (ACT/360).
 */
function toApiSpread(s: ScenarioState): CompareScenarioInput['spread'] {
  const v = s.compositionValue;
  if (s.indexType === 'PREFIXADA' || v === undefined || !Number.isFinite(v)) return undefined;
  if (s.composition === 'percentage') return v === 100 ? undefined : { mode: 'percentage', value: v };
  if (v === 0) return undefined;
  const mode: RateMode = spreadAllowsMonthly(s.indexType) ? s.spreadRateMode : 'aa';
  const value = toAnnual(v, mode);
  if (DAILY_BR_INDICES.includes(s.indexType)) return { mode: 'additive', value, additiveBase: 252 };
  if (MONTHLY_INDICES.includes(s.indexType)) {
    return { mode: 'additive', value, additiveBase: mode === 'am' ? 360 : undefined };
  }
  return { mode: 'additive', value };
}

function toApiScenario(s: ScenarioState): CompareScenarioInput {
  return {
    label: s.label,
    indexType: s.indexType,
    dayCountBasis: s.dayCountBasis,
    prefixedRate: s.prefixedRate,
    spread: toApiSpread(s),
  };
}

// ── Componente Principal ──────────────────────────────────────────────────────

interface ComparadorFormProps {
  onResult: (result: CompareResult) => void;
}

export const SCENARIO_COLORS_EXPORT = SCENARIO_COLORS;

export function ComparadorForm({ onResult }: ComparadorFormProps) {
  // Datas pelo relógio local (toISOString daria a data UTC: "amanhã" à noite no Brasil)
  const today = hojeISO();
  const oneYearAgo = somarMesesISO(today, -12);

  const [initialAmount, setInitialAmount] = useState<number>(100000);
  const [startDate, setStartDate] = useState(oneYearAgo);
  const [endDate, setEndDate] = useState(today);
  const [scenarios, setScenarios] = useState<ScenarioState[]>(DEFAULT_SCENARIOS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premisesModal, setPremisesModal] = useState(false);
  const [pendingPremises, setPendingPremises] = useState<ScenarioPremisesInfo[]>([]);

  const scenarioColorMap = Object.fromEntries(scenarios.map((s, idx) => [s.label, SCENARIO_COLORS[idx]]));

  const addScenario = () => {
    if (scenarios.length >= 6) return;
    setScenarios(prev => [...prev, newScenario({ label: 'CDI', indexType: 'CDI', dayCountBasis: 252 })]);
  };

  const removeScenario = (idx: number) => {
    setScenarios(prev => prev.filter((_, i) => i !== idx));
  };

  const updateScenario = (idx: number, patch: Partial<ScenarioState>) => {
    setScenarios(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, ...patch };
      // Nome gerado automaticamente acompanha os parâmetros até o usuário editá-lo
      if (!('label' in patch) && (updated.autoLabel || !updated.label)) {
        updated.label = defaultLabel(updated);
        updated.autoLabel = true;
      }
      return updated;
    }));
  };

  const handleIndexChange = (idx: number, indexType: string) => {
    const opt = INDEX_OPTIONS.find(o => o.value === indexType);
    const basis = opt?.basis ?? 365;
    updateScenario(idx, { indexType, dayCountBasis: basis, prefixedRate: undefined, compositionValue: undefined });
  };

  const validate = (): string | null => {
    if (!initialAmount || initialAmount <= 0) return 'Informe o montante inicial.';
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
    initialAmount,
    startDate: startDate + 'T12:00:00',
    endDate: endDate + 'T12:00:00',
    scenarios: scenariosToUse,
  });

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    setError(null);

    try {
      const result = await runComparison(buildRequest(scenarios.map(toApiScenario)));

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

    const scenariosWithPremises = scenarios.map(toApiScenario).map(s => {
      const pending = pendingPremises.find(p => p.label === s.label);
      if (!pending) return s;
      return {
        ...s,
        futurePremises: pending.premises.map(p => ({
          startDate: p.startDate + 'T12:00:00',
          endDate: p.endDate + 'T12:00:00',
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
            <NumericFormat
              customInput={Input}
              thousandSeparator="."
              decimalSeparator=","
              prefix="R$ "
              decimalScale={2}
              fixedDecimalScale
              allowNegative={false}
              placeholder="R$ 100.000,00"
              value={initialAmount || ''}
              onValueChange={v => setInitialAmount(v.floatValue || 0)}
              className="font-mono"
            />
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
              { label: 'YTD', start: `${today.slice(0, 4)}-01-01`, end: today },
              { label: '12M', start: somarMesesISO(today, -12), end: today },
              { label: '24M', start: somarMesesISO(today, -24), end: today },
              { label: '36M', start: somarMesesISO(today, -36), end: today },
              { label: '60M', start: somarMesesISO(today, -60), end: today },
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
                  onChange={e => updateScenario(idx, { label: e.target.value, autoLabel: false })}
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
                    {scenario.composition === 'percentage' ? (
                      <Label className="text-[10px]" title="Percentual aplicado sobre o índice ANTES da capitalização diária (ex.: 110 = 110% do CDI). Diferente de somar um spread: 110% do CDI fica mais caro quando o CDI sobe.">% do índice ⓘ</Label>
                    ) : (
                      <Label className="text-[10px]" title={spreadTooltip(scenario.indexType)}>
                        Spread ({spreadUnit(scenario)}) ⓘ
                      </Label>
                    )}
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      placeholder={scenario.composition === 'percentage' ? '100' : spreadUnit(scenario) === '% a.m.' ? 'ex: 1' : 'ex: 6'}
                      value={scenario.compositionValue ?? ''}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        updateScenario(idx, { compositionValue: Number.isFinite(v) ? v : undefined });
                      }}
                    />
                  </div>
                )}
              </div>

              {scenario.indexType !== 'PREFIXADA' && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex gap-1.5">
                    {COMPOSITION_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={scenario.composition === opt.value}
                        onClick={() => {
                          if (scenario.composition !== opt.value) {
                            updateScenario(idx, { composition: opt.value, compositionValue: undefined });
                          }
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          scenario.composition === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {scenario.composition === 'additive' && spreadAllowsMonthly(scenario.indexType) && (
                    <div className="inline-flex rounded border border-border/50 overflow-hidden" role="group" aria-label="Unidade da taxa do spread">
                      {(['aa', 'am'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={scenario.spreadRateMode === m}
                          onClick={() => updateScenario(idx, { spreadRateMode: m })}
                          className={`text-[10px] px-2 py-0.5 transition-colors ${
                            scenario.spreadRateMode === m
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {m === 'aa' ? 'a.a.' : 'a.m.'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
