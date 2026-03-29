import React, { useState } from 'react';
import {
  Calculator, CalendarRange, Plus, Loader2, Info, Clock, TrendingDown,
  BarChart3, Percent,
} from 'lucide-react';
import { NumericFormat } from 'react-number-format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AmortizationModal, AmortizationEntry } from './AmortizationModal';
import { FuturePremisesModal, FuturePremise } from './FuturePremisesModal';
import { DCFFlowsModal, DCFCashFlow } from './DCFFlowsModal';
import {
  runCalculation, CalculationResult, CalculationRequest,
  ThesisType, GracePeriodType, AmortizationSystem,
} from '@/lib/api';
import { INDEX_LABELS, BASIS_LABELS } from '@/lib/utils';
import axios from 'axios';

interface CalculatorFormProps {
  onResult: (result: CalculationResult) => void;
}

const THESIS_OPTIONS = [
  {
    value: 'CORRECAO_SIMPLES' as ThesisType,
    label: 'Correção Simples',
    icon: TrendingDown,
    desc: 'Atualiza um valor por indexador',
  },
  {
    value: 'VALOR_PRESENTE' as ThesisType,
    label: 'Valor Presente',
    icon: TrendingDown,
    desc: 'Desconto de fluxos futuros (DCF)',
  },
  {
    value: 'CORRECAO_COM_CARENCIA' as ThesisType,
    label: 'Com Carência',
    icon: Clock,
    desc: 'Correção com período de graça',
  },
  {
    value: 'FLUXO_COMPLETO' as ThesisType,
    label: 'Fluxo Completo',
    icon: BarChart3,
    desc: 'SAC / Price / Bullet',
  },
  {
    value: 'CORRECAO_COM_JUROS' as ThesisType,
    label: 'Com Juros',
    icon: Percent,
    desc: 'Correção + juros remuneratórios',
  },
];

const INDEX_OPTIONS = [
  { value: 'CDI', label: 'CDI', basis: [252, 360, 365] },
  { value: 'SELIC_META', label: 'Selic (Meta)', basis: [252, 360, 365] },
  { value: 'SELIC_OVER', label: 'Selic (Over)', basis: [252, 360, 365] },
  { value: 'IPCA', label: 'IPCA', basis: [360, 365] },
  { value: 'IGPM', label: 'IGP-M', basis: [360, 365] },
  { value: 'INCC', label: 'INCC', basis: [360, 365] },
  { value: 'SOFR', label: 'SOFR (USD)', basis: [360] },
  { value: 'PREFIXADA', label: 'Pré-fixada', basis: [252, 360, 365] },
];

const DEFAULT_BASIS: Record<string, number> = {
  CDI: 252, SELIC_META: 252, SELIC_OVER: 252,
  IPCA: 365, IGPM: 365, INCC: 365, SOFR: 360, PREFIXADA: 365,
};

const QUICK_RANGES = [
  {
    label: 'YTD',
    tooltip: 'Início do ano até hoje',
    getDates: () => {
      const today = new Date();
      return { start: `${today.getFullYear()}-01-01`, end: today.toISOString().slice(0, 10) };
    },
  },
  {
    label: '12M',
    tooltip: 'Últimos 12 meses',
    getDates: () => {
      const end = new Date();
      const start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
  {
    label: '24M',
    tooltip: 'Últimos 24 meses',
    getDates: () => {
      const end = new Date();
      const start = new Date(end);
      start.setFullYear(start.getFullYear() - 2);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
  {
    label: 'Max',
    tooltip: 'Desde 2000',
    getDates: () => ({ start: '2000-01-01', end: new Date().toISOString().slice(0, 10) }),
  },
];

const GRACE_TYPE_LABELS: Record<GracePeriodType, string> = {
  A: 'A — Capitalização Total (juros ao saldo)',
  B: 'B — Sem Capitalização (saldo congelado)',
  C: 'C — Juros Pagos (principal preservado)',
  D: 'D — Personalizado',
};

const AMORT_SYSTEM_LABELS: Record<AmortizationSystem, string> = {
  SAC: 'SAC — Amortização Constante',
  PRICE: 'Price — Parcela Fixa',
  BULLET: 'Bullet — Pagamento no Vencimento',
};

export function CalculatorForm({ onResult }: CalculatorFormProps) {
  // Thesis
  const [thesis, setThesis] = useState<ThesisType>('CORRECAO_SIMPLES');

  // Common fields
  const [indexType, setIndexType] = useState('CDI');
  const [amount, setAmount] = useState<number>(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [basis, setBasis] = useState<number>(252);
  const [spreadMode, setSpreadMode] = useState<'none' | 'percentage' | 'additive'>('none');
  const [spreadValue, setSpreadValue] = useState<number>(0);
  const [prefixedRate, setPrefixedRate] = useState<number>(0);
  const [amortizations, setAmortizations] = useState<AmortizationEntry[]>([]);
  const [showAmortModal, setShowAmortModal] = useState(false);
  const [premises, setPremises] = useState<FuturePremise[]>([]);
  const [premisesModal, setPremisesModal] = useState<{
    open: boolean; requiredFrom: string;
    lastAvailableRate: number | null; lastAvailableDate: string | null;
  }>({ open: false, requiredFrom: '', lastAvailableRate: null, lastAvailableDate: null });

  // T2 – DCF fields
  const [dcfFlows, setDcfFlows] = useState<DCFCashFlow[]>([]);
  const [showDcfModal, setShowDcfModal] = useState(false);
  const [discountRate, setDiscountRate] = useState<number>(0);
  const [referenceDate, setReferenceDate] = useState('');

  // T3 – Grace period
  const [gracePeriodType, setGracePeriodType] = useState<GracePeriodType>('A');
  const [gracePeriodEndDate, setGracePeriodEndDate] = useState('');

  // T5 – Correção com Juros
  const [interestRate, setInterestRate] = useState<number>(0);
  const [interestType, setInterestType] = useState<'SIMPLES' | 'COMPOSTA'>('COMPOSTA');

  // T4 – Full flow
  const [amortizationSystem, setAmortizationSystem] = useState<AmortizationSystem>('SAC');
  const [remunerationRate, setRemunerationRate] = useState<number>(0);
  const [numberOfPeriods, setNumberOfPeriods] = useState<number>(12);
  const [hasGracePeriod, setHasGracePeriod] = useState(false);
  const [ffGracePeriodType, setFfGracePeriodType] = useState<GracePeriodType>('A');
  const [ffGracePeriodMonths, setFfGracePeriodMonths] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIndex = INDEX_OPTIONS.find(o => o.value === indexType)!;
  const isMonthly = ['IPCA', 'IGPM', 'INCC'].includes(indexType);

  const handleIndexChange = (val: string) => {
    setIndexType(val);
    setBasis(DEFAULT_BASIS[val] || 365);
    setSpreadMode('none');
    setSpreadValue(0);
  };

  const handleThesisChange = (t: ThesisType) => {
    setThesis(t);
    setError(null);
  };

  // Calculate grace period end date for T4
  const calcT4GraceEndDate = (): string => {
    if (!startDate || ffGracePeriodMonths <= 0) return '';
    const d = new Date(startDate + 'T12:00:00');
    d.setMonth(d.getMonth() + ffGracePeriodMonths);
    return d.toISOString().slice(0, 10);
  };

  const buildRequest = (withPremises: FuturePremise[] = premises): CalculationRequest => {
    const base: CalculationRequest = {
      thesisType: thesis,
      startDate: new Date(startDate + 'T12:00:00').toISOString(),
      endDate: endDate ? new Date(endDate + 'T12:00:00').toISOString() : new Date(startDate + 'T12:00:00').toISOString(),
      indexType: indexType as any,
      dayCountBasis: basis,
      currency: indexType === 'SOFR' ? 'USD' : 'BRL',
      initialAmount: 0,
    };

    if (thesis === 'VALOR_PRESENTE') {
      return {
        ...base,
        initialAmount: dcfFlows.reduce((s, f) => s + f.amount, 0),
        cashFlows: dcfFlows.map(f => ({
          id: f.id,
          date: new Date(f.date + 'T12:00:00').toISOString(),
          amount: f.amount,
          label: f.label,
        })),
        discountRate,
        referenceDate: referenceDate
          ? new Date(referenceDate + 'T12:00:00').toISOString()
          : base.startDate,
        dayCountBasis: basis,
      };
    }

    if (thesis === 'FLUXO_COMPLETO') {
      const graceEnd = hasGracePeriod ? calcT4GraceEndDate() : undefined;
      return {
        ...base,
        initialAmount: amount,
        amortizationSystem,
        remunerationRate,
        numberOfPeriods,
        gracePeriod: hasGracePeriod && graceEnd
          ? { type: ffGracePeriodType, endDate: new Date(graceEnd + 'T12:00:00').toISOString() }
          : undefined,
      };
    }

    // T1, T3, T5
    const req: CalculationRequest = {
      ...base,
      initialAmount: amount,
      prefixedRate: indexType === 'PREFIXADA' ? prefixedRate : undefined,
      spread: spreadMode !== 'none' ? { mode: spreadMode, value: spreadValue } : undefined,
      amortizations: amortizations.map(a => ({
        date: new Date(a.date + 'T12:00:00').toISOString(),
        type: a.type,
        value: a.value,
        periodicity: a.periodicity,
        periodicEndDate: a.periodicEndDate
          ? new Date(a.periodicEndDate + 'T12:00:00').toISOString()
          : undefined,
        isPeriodicPercentage: a.isPeriodicPercentage,
      })),
      futurePremises: withPremises.map(p => ({
        startDate: new Date(p.startDate + 'T12:00:00').toISOString(),
        endDate: new Date(p.endDate + 'T12:00:00').toISOString(),
        rate: p.rate,
      })),
    };

    if (thesis === 'CORRECAO_COM_CARENCIA' && gracePeriodEndDate) {
      req.gracePeriod = {
        type: gracePeriodType,
        endDate: new Date(gracePeriodEndDate + 'T12:00:00').toISOString(),
      };
    }

    if (thesis === 'CORRECAO_COM_JUROS') {
      req.interestRate = interestRate;
      req.interestType = interestType;
    }

    return req;
  };

  const validate = (): string | null => {
    if (thesis === 'VALOR_PRESENTE') {
      if (!dcfFlows.length) return 'Adicione ao menos um fluxo de caixa.';
      if (!discountRate || discountRate <= 0) return 'Informe a taxa de desconto.';
      if (!startDate) return 'Informe a data de referência.';
      return null;
    }
    if (thesis === 'FLUXO_COMPLETO') {
      if (!amount || amount <= 0) return 'Informe o valor do principal.';
      if (!remunerationRate || remunerationRate <= 0) return 'Informe a taxa de remuneração.';
      if (!numberOfPeriods || numberOfPeriods <= 0) return 'Informe o número de períodos.';
      if (!startDate) return 'Informe a data de início.';
      return null;
    }
    if (thesis === 'CORRECAO_COM_JUROS') {
      if (!amount || !startDate || !endDate) return 'Preencha todos os campos obrigatórios.';
      if (!interestRate || interestRate <= 0) return 'Informe a taxa de juros.';
      return null;
    }
    if (!amount || !startDate || !endDate) return 'Preencha todos os campos obrigatórios.';
    return null;
  };

  const submit = async (withPremises: FuturePremise[] = premises) => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError(null);

    try {
      const result = await runCalculation(buildRequest(withPremises));
      onResult(result);
    } catch (err: any) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const data = err.response.data;
        setPremisesModal({
          open: true,
          requiredFrom: data.premisesRequiredFrom,
          lastAvailableRate: data.lastAvailableRate ?? null,
          lastAvailableDate: data.lastAvailableDate ?? null,
        });
      } else {
        setError(err.response?.data?.error || err.message || 'Erro ao calcular.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPremises = async () => {
    setPremisesModal(m => ({ ...m, open: false }));
    await submit(premises);
  };

  const isT2 = thesis === 'VALOR_PRESENTE';
  const isT3 = thesis === 'CORRECAO_COM_CARENCIA';
  const isT4 = thesis === 'FLUXO_COMPLETO';
  const isT5 = thesis === 'CORRECAO_COM_JUROS';
  const isStandardCorrection = !isT2 && !isT4;

  return (
    <>
      <Card className="animate-fade-in bg-transparent border-0 shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Calculator className="h-5 w-5 text-primary" />
            Parâmetros do Cálculo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* ── Seletor de Tese ── */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tese de Cálculo</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {THESIS_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isActive = thesis === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleThesisChange(opt.value)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
                      isActive
                        ? 'bg-primary/20 border-primary/50 text-primary shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                        : 'border-white/5 hover:bg-white/5 hover:border-white/10 text-muted-foreground'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/50'}`} />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium leading-tight ${isActive ? 'text-foreground' : ''}`}>
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground/60 truncate">{opt.desc}</div>
                    </div>
                    {isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border/50" />

          {/* ── T2: Valor Presente (DCF) ── */}
          {isT2 && (
            <div className="space-y-4">
              {/* Reference date */}
              <div className="space-y-1.5">
                <Label>Data de Referência</Label>
                <Input
                  type="date"
                  value={referenceDate || startDate}
                  onChange={e => { setReferenceDate(e.target.value); setStartDate(e.target.value); }}
                />
                <p className="text-xs text-muted-foreground">Data base para o desconto (geralmente hoje).</p>
              </div>

              {/* Discount rate */}
              <div className="space-y-1.5">
                <Label>Taxa de Desconto (% a.a.)</Label>
                <Input
                  type="number"
                  step={0.01}
                  min={0}
                  value={discountRate || ''}
                  onChange={e => setDiscountRate(parseFloat(e.target.value) || 0)}
                  placeholder="ex: 12.5"
                  className="font-mono"
                />
              </div>

              {/* Day count basis */}
              <div className="space-y-2">
                <Label>Base de Cálculo</Label>
                <div className="flex gap-2 flex-wrap">
                  {[252, 360, 365].map(b => (
                    <button
                      key={b}
                      onClick={() => setBasis(b)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        basis === b ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-white/10 hover:bg-white/5 text-muted-foreground'
                      }`}
                    >
                      {BASIS_LABELS[b]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash flows */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Fluxos de Caixa</Label>
                  {dcfFlows.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{dcfFlows.length}</Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowDcfModal(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Gerenciar
                </Button>
              </div>
              {dcfFlows.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Total nominal: R$ {dcfFlows.reduce((s, f) => s + f.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          )}

          {/* ── T4: Fluxo Completo ── */}
          {isT4 && (
            <div className="space-y-4">
              {/* Principal */}
              <div className="space-y-1.5">
                <Label>Principal</Label>
                <NumericFormat
                  customInput={Input}
                  thousandSeparator="."
                  decimalSeparator=","
                  prefix="R$ "
                  decimalScale={2}
                  fixedDecimalScale
                  allowNegative={false}
                  placeholder="R$ 100.000,00"
                  value={amount || ''}
                  onValueChange={v => setAmount(v.floatValue || 0)}
                  className="text-base font-mono"
                />
              </div>

              {/* Start date */}
              <div className="space-y-1.5">
                <Label>Data Inicial (Emissão)</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>

              {/* Remuneration rate */}
              <div className="space-y-1.5">
                <Label>Taxa de Remuneração (% a.a.)</Label>
                <Input
                  type="number"
                  step={0.01}
                  min={0}
                  value={remunerationRate || ''}
                  onChange={e => setRemunerationRate(parseFloat(e.target.value) || 0)}
                  placeholder="ex: 12.5"
                  className="font-mono"
                />
              </div>

              {/* Number of periods */}
              <div className="space-y-1.5">
                <Label>Prazo (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={numberOfPeriods}
                  onChange={e => setNumberOfPeriods(parseInt(e.target.value) || 12)}
                  className="font-mono"
                />
              </div>

              {/* Amortization system */}
              <div className="space-y-2">
                <Label>Sistema de Amortização</Label>
                <div className="grid grid-cols-1 gap-1.5">
                  {(['SAC', 'PRICE', 'BULLET'] as AmortizationSystem[]).map(sys => (
                    <button
                      key={sys}
                      onClick={() => setAmortizationSystem(sys)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors text-left ${
                        amortizationSystem === sys
                          ? 'bg-primary/20 border-primary/50 text-primary font-medium shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                          : 'border-white/10 hover:bg-white/5 text-muted-foreground'
                      }`}
                    >
                      {amortizationSystem === sys && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      {AMORT_SYSTEM_LABELS[sys]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grace period for T4 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ff-grace"
                    checked={hasGracePeriod}
                    onChange={e => setHasGracePeriod(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="ff-grace" className="cursor-pointer">Período de Carência</Label>
                </div>
                {hasGracePeriod && (
                  <div className="pl-6 space-y-3 border-l-2 border-orange-500/30">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Duração da Carência (meses)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={numberOfPeriods - 1}
                        value={ffGracePeriodMonths}
                        onChange={e => setFfGracePeriodMonths(parseInt(e.target.value) || 0)}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Tipo de Carência</Label>
                      <Select value={ffGracePeriodType} onValueChange={v => setFfGracePeriodType(v as GracePeriodType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(GRACE_TYPE_LABELS) as GracePeriodType[]).map(t => (
                            <SelectItem key={t} value={t}>{GRACE_TYPE_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── T1/T3/T5: Standard Correction Form ── */}
          {isStandardCorrection && (
            <>
              {/* Indexador */}
              <div className="space-y-1.5">
                <Label>Indexador</Label>
                <Select value={indexType} onValueChange={handleIndexChange}>
                  <SelectTrigger className="text-base font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INDEX_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Montante */}
              <div className="space-y-1.5">
                <Label>Montante Inicial</Label>
                <NumericFormat
                  customInput={Input}
                  thousandSeparator="."
                  decimalSeparator=","
                  prefix={indexType === 'SOFR' ? 'USD ' : 'R$ '}
                  decimalScale={2}
                  fixedDecimalScale
                  allowNegative={false}
                  placeholder={indexType === 'SOFR' ? 'USD 1.000.000,00' : 'R$ 100.000,00'}
                  value={amount || ''}
                  onValueChange={v => setAmount(v.floatValue || 0)}
                  className="text-base font-mono"
                />
              </div>

              {/* Período */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1">
                    <CalendarRange className="h-3.5 w-3.5" />
                    Período
                  </Label>
                  <div className="flex gap-1">
                    {QUICK_RANGES.map(r => (
                      <button
                        key={r.label}
                        title={r.tooltip}
                        onClick={() => {
                          const { start, end } = r.getDates();
                          setStartDate(start);
                          setEndDate(end);
                        }}
                        className="px-2 py-0.5 text-[11px] font-medium rounded border border-white/10 bg-white/5 hover:border-primary/60 hover:text-primary transition-colors"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Data Inicial</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Data Final</Label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Base de Cálculo */}
              <div className="space-y-2">
                <Label>Base de Cálculo</Label>
                <div className="flex gap-2 flex-wrap">
                  {selectedIndex.basis.map(b => (
                    <button
                      key={b}
                      onClick={() => setBasis(b)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        basis === b ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-white/10 hover:bg-white/5 text-muted-foreground'
                      }`}
                    >
                      {BASIS_LABELS[b]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Taxa Pré-fixada */}
              {indexType === 'PREFIXADA' && (
                <div className="space-y-1.5">
                  <Label>Taxa Pré-fixada (% a.a.)</Label>
                  <Input
                    type="number" step={0.01} min={0}
                    value={prefixedRate || ''}
                    onChange={e => setPrefixedRate(parseFloat(e.target.value) || 0)}
                    placeholder="ex: 12.5"
                    className="font-mono"
                  />
                </div>
              )}

              {/* Spread */}
              {indexType !== 'PREFIXADA' && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Composição / Spread
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {[
                      { value: 'none', label: 'Nenhum' },
                      { value: 'percentage', label: '% do Índice' },
                      { value: 'additive', label: 'Índice + taxa' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setSpreadMode(opt.value as any)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                          spreadMode === opt.value
                            ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                            : 'border-white/10 hover:bg-white/5'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {spreadMode !== 'none' && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" step={0.01} min={0}
                        value={spreadValue || ''}
                        onChange={e => setSpreadValue(parseFloat(e.target.value) || 0)}
                        placeholder={spreadMode === 'percentage' ? 'ex: 110' : 'ex: 6'}
                        className="font-mono max-w-32"
                      />
                      <span className="text-sm text-muted-foreground">
                        {spreadMode === 'percentage'
                          ? `% do ${INDEX_LABELS[indexType]}`
                          : `% a.a. sobre ${INDEX_LABELS[indexType]}`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* T3: Grace period section */}
              {isT3 && (
                <div className="space-y-3 border border-orange-500/30 rounded-lg p-3 bg-orange-500/5">
                  <Label className="flex items-center gap-1.5 text-orange-400">
                    <Clock className="h-4 w-4" />
                    Período de Carência
                  </Label>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Data de Término da Carência</Label>
                    <Input
                      type="date"
                      value={gracePeriodEndDate}
                      min={startDate}
                      max={endDate}
                      onChange={e => setGracePeriodEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Tipo de Carência</Label>
                    <Select value={gracePeriodType} onValueChange={v => setGracePeriodType(v as GracePeriodType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(GRACE_TYPE_LABELS) as GracePeriodType[]).map(t => (
                          <SelectItem key={t} value={t}>{GRACE_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* T5 – Juros Remuneratórios */}
              {isT5 && (
                <div className="space-y-3 border border-emerald-500/30 rounded-lg p-3 bg-emerald-500/5">
                  <Label className="flex items-center gap-1.5 text-emerald-400">
                    <span className="text-base font-bold">%</span>
                    Juros Remuneratórios
                  </Label>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Taxa de Juros (% a.a.)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="ex: 6"
                      value={interestRate || ''}
                      onChange={e => setInterestRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Tipo de Capitalização</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['COMPOSTA', 'SIMPLES'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setInterestType(t)}
                          className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                            interestType === t
                              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                              : 'border-white/10 text-muted-foreground hover:bg-white/5'
                          }`}
                        >
                          {t === 'COMPOSTA' ? 'Juros Compostos' : 'Juros Simples'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Amortizações */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <Label>Amortizações</Label>
                  {amortizations.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{amortizations.length}</Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAmortModal(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Gerenciar
                </Button>
              </div>
            </>
          )}

          {/* Erro */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Botão calcular */}
          <Button
            className="w-full h-12 text-base font-semibold gap-2"
            onClick={() => submit()}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Calculando...</>
            ) : (
              <><Calculator className="h-4 w-4" /> Calcular</>
            )}
          </Button>
        </CardContent>
      </Card>

      <AmortizationModal
        open={showAmortModal}
        onOpenChange={setShowAmortModal}
        amortizations={amortizations}
        onChange={setAmortizations}
      />

      <FuturePremisesModal
        open={premisesModal.open}
        onOpenChange={open => setPremisesModal(m => ({ ...m, open }))}
        premisesRequiredFrom={premisesModal.requiredFrom}
        calcEndDate={endDate}
        indexType={indexType}
        premises={premises}
        onChange={setPremises}
        onConfirm={handleConfirmPremises}
        lastAvailableRate={premisesModal.lastAvailableRate}
        lastAvailableDate={premisesModal.lastAvailableDate}
      />

      <DCFFlowsModal
        open={showDcfModal}
        onOpenChange={setShowDcfModal}
        flows={dcfFlows}
        onChange={setDcfFlows}
      />
    </>
  );
}
