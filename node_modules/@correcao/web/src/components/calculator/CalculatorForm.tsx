import React, { useState } from 'react';
import {
  Calculator, CalendarRange, Plus, Loader2, Info, Clock, TrendingDown,
  BarChart3, Percent, DollarSign, Sliders, RotateCcw,
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
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { DateInputBR } from '@/components/ui/date-input-br';
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

/* ── Thesis groups ── */
const CORRECTIONS_GROUP = [
  { value: 'CORRECAO_SIMPLES' as ThesisType, label: 'Simples', icon: TrendingDown, desc: 'Indexador' },
  { value: 'CORRECAO_COM_CARENCIA' as ThesisType, label: 'Carência', icon: Clock, desc: 'Período de graça' },
  { value: 'CORRECAO_COM_JUROS' as ThesisType, label: 'Juros', icon: Percent, desc: 'Remuneratórios' },
];

const ADVANCED_GROUP = [
  { value: 'VALOR_PRESENTE' as ThesisType, label: 'Valor Presente', icon: TrendingDown, desc: 'DCF' },
  { value: 'FLUXO_COMPLETO' as ThesisType, label: 'Fluxo Completo', icon: BarChart3, desc: 'SAC/Price/Bullet' },
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
    label: 'YTD', tooltip: 'Início do ano até hoje',
    getDates: () => {
      const today = new Date();
      return { start: `${today.getFullYear()}-01-01`, end: today.toISOString().slice(0, 10) };
    },
  },
  {
    label: '12M', tooltip: 'Últimos 12 meses',
    getDates: () => {
      const end = new Date(); const start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
  {
    label: '24M', tooltip: 'Últimos 24 meses',
    getDates: () => {
      const end = new Date(); const start = new Date(end);
      start.setFullYear(start.getFullYear() - 2);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
  {
    label: 'Max', tooltip: 'Desde 2000',
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

const BASIS_TOOLTIPS: Record<number, string> = {
  252: 'Dias úteis (exclui sábados, domingos e feriados). Padrão para CDI e Selic.',
  360: 'Dias corridos com ano de 360 dias (convenção bancária). Padrão SOFR.',
  365: 'Dias corridos com ano de 365 dias (calendário real). Padrão para índices de preço.',
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

  const resetForm = () => {
    setThesis('CORRECAO_SIMPLES');
    setIndexType('CDI');
    setAmount(0);
    setStartDate('');
    setEndDate('');
    setBasis(252);
    setSpreadMode('none');
    setSpreadValue(0);
    setPrefixedRate(0);
    setAmortizations([]);
    setPremises([]);
    setDcfFlows([]);
    setDiscountRate(0);
    setReferenceDate('');
    setGracePeriodType('A');
    setGracePeriodEndDate('');
    setInterestRate(0);
    setInterestType('COMPOSTA');
    setAmortizationSystem('SAC');
    setRemunerationRate(0);
    setNumberOfPeriods(12);
    setHasGracePeriod(false);
    setFfGracePeriodType('A');
    setFfGracePeriodMonths(0);
    setError(null);
  };

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

  // Figure out which accordion sections to default-open
  const defaultAccordion = ['tese', 'params'];

  return (
    <>
      <Card className="animate-fade-in bg-transparent border-0 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Calculator className="h-5 w-5 text-primary" />
            Parâmetros do Cálculo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <Accordion defaultOpen={defaultAccordion} className="space-y-1">

            {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO 1: TESE DE CÁLCULO
            ═══════════════════════════════════════════════════════════════ */}
            <AccordionItem id="tese" className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
              <div className="px-3 py-2.5 border-l-2 border-primary/40">
                <AccordionTrigger id="tese">
                  Tese de Cálculo
                </AccordionTrigger>
              </div>
              <AccordionContent id="tese" className="px-3 pb-3 space-y-3">
                {/* Grupo: Correções */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-primary/60">Correções</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CORRECTIONS_GROUP.map(opt => {
                      const Icon = opt.icon;
                      const active = thesis === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => handleThesisChange(opt.value)}
                          className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-center transition-all ${
                            active
                              ? 'bg-primary/15 border-primary/50 text-primary shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                              : 'border-white/5 hover:bg-white/5 hover:border-white/10 text-muted-foreground'
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground/40'}`} />
                          <span className={`text-xs font-medium leading-tight ${active ? 'text-foreground' : ''}`}>{opt.label}</span>
                          <span className="text-[9px] text-muted-foreground/50 leading-tight">{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grupo: Análise Avançada */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400/60">Análise Avançada</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ADVANCED_GROUP.map(opt => {
                      const Icon = opt.icon;
                      const active = thesis === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => handleThesisChange(opt.value)}
                          className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-center transition-all ${
                            active
                              ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                              : 'border-white/5 hover:bg-white/5 hover:border-white/10 text-muted-foreground'
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${active ? 'text-cyan-400' : 'text-muted-foreground/40'}`} />
                          <span className={`text-xs font-medium leading-tight ${active ? 'text-foreground' : ''}`}>{opt.label}</span>
                          <span className="text-[9px] text-muted-foreground/50 leading-tight">{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO 2: PARÂMETROS PRINCIPAIS (campos dinâmicos por tese)
            ═══════════════════════════════════════════════════════════════ */}
            <AccordionItem id="params" className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
              <div className="px-3 py-2.5 border-l-2 border-primary/40">
                <AccordionTrigger id="params" subtitle={isT4 ? 'Principal · Taxa · Sistema' : isT2 ? 'Data · Taxa · Fluxos' : 'Indexador · Montante · Período'}>
                  {isT4 ? 'Fluxo Completo' : isT2 ? 'Valor Presente (DCF)' : 'Indexador e Período'}
                </AccordionTrigger>
              </div>
              <AccordionContent id="params" className="px-3 pb-3 space-y-4">

                {/* ── T2: Valor Presente (DCF) ── */}
                {isT2 && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Data de Referência</Label>
                      <DateInputBR
                        value={referenceDate || startDate}
                        onChange={(iso) => { setReferenceDate(iso); setStartDate(iso); }}
                      />
                      <p className="text-xs text-muted-foreground">Data base para o desconto (geralmente hoje).</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Taxa de Desconto (% a.a.)</Label>
                      <Input
                        type="number" step={0.01} min={0}
                        value={discountRate || ''}
                        onChange={e => setDiscountRate(parseFloat(e.target.value) || 0)}
                        placeholder="ex: 12.5"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Base de Cálculo
                        <span className="inline-flex" title="Define como os dias do período são contados para cálculo de juros.">
                          <Info className="h-3 w-3 text-muted-foreground/40" />
                        </span>
                      </Label>
                      <div className="flex gap-2 flex-wrap">
                        {[252, 360, 365].map(b => (
                          <button
                            key={b}
                            title={BASIS_TOOLTIPS[b]}
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
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Fluxos de Caixa</Label>
                        {dcfFlows.length > 0 && <Badge variant="secondary" className="ml-2">{dcfFlows.length}</Badge>}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowDcfModal(true)} className="gap-1.5">
                        <Plus className="h-4 w-4" /> Gerenciar
                      </Button>
                    </div>
                    {dcfFlows.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Total nominal: R$ {dcfFlows.reduce((s, f) => s + f.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    )}
                  </>
                )}

                {/* ── T4: Fluxo Completo ── */}
                {isT4 && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Principal</Label>
                      <NumericFormat
                        customInput={Input}
                        thousandSeparator="." decimalSeparator="," prefix="R$ "
                        decimalScale={2} fixedDecimalScale allowNegative={false}
                        placeholder="R$ 100.000,00"
                        value={amount || ''}
                        onValueChange={v => setAmount(v.floatValue || 0)}
                        className="text-base font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Data Inicial (Emissão)</Label>
                      <DateInputBR value={startDate} onChange={setStartDate} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Taxa de Remuneração (% a.a.)</Label>
                      <Input
                        type="number" step={0.01} min={0}
                        value={remunerationRate || ''}
                        onChange={e => setRemunerationRate(parseFloat(e.target.value) || 0)}
                        placeholder="ex: 12.5" className="font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Prazo (meses)</Label>
                      <Input
                        type="number" min={1} max={600}
                        value={numberOfPeriods}
                        onChange={e => setNumberOfPeriods(parseInt(e.target.value) || 12)}
                        className="font-mono"
                      />
                    </div>
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
                            {amortizationSystem === sys && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                            {AMORT_SYSTEM_LABELS[sys]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox" id="ff-grace"
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
                              type="number" min={0} max={numberOfPeriods - 1}
                              value={ffGracePeriodMonths}
                              onChange={e => setFfGracePeriodMonths(parseInt(e.target.value) || 0)}
                              className="font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm">Tipo de Carência</Label>
                            <Select value={ffGracePeriodType} onValueChange={v => setFfGracePeriodType(v as GracePeriodType)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
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
                  </>
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

                    {/* Base de Cálculo */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Base de Cálculo
                        <span className="inline-flex" title="Define como os dias do período são contados para cálculo de juros.">
                          <Info className="h-3 w-3 text-muted-foreground/40" />
                        </span>
                      </Label>
                      <div className="flex gap-2 flex-wrap">
                        {selectedIndex.basis.map(b => (
                          <button
                            key={b}
                            title={BASIS_TOOLTIPS[b]}
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
                          <DateInputBR value={startDate} onChange={setStartDate} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Data Final</Label>
                          <DateInputBR value={endDate} onChange={setEndDate} />
                        </div>
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
                          placeholder="ex: 12.5" className="font-mono"
                        />
                      </div>
                    )}
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO 3: MONTANTE E SPREAD (só para T1/T3/T5)
            ═══════════════════════════════════════════════════════════════ */}
            {isStandardCorrection && (
              <AccordionItem id="montante" className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
                <div className="px-3 py-2.5 border-l-2 border-primary/40">
                  <AccordionTrigger id="montante" subtitle={amount > 0 ? `${indexType === 'SOFR' ? 'USD' : 'R$'} ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Valor · Composição'}>
                    Montante e Spread
                  </AccordionTrigger>
                </div>
                <AccordionContent id="montante" className="px-3 pb-3 space-y-4">
                  {/* Montante */}
                  <div className="space-y-1.5">
                    <Label>Montante Inicial</Label>
                    <NumericFormat
                      customInput={Input}
                      thousandSeparator="." decimalSeparator=","
                      prefix={indexType === 'SOFR' ? 'USD ' : 'R$ '}
                      decimalScale={2} fixedDecimalScale allowNegative={false}
                      placeholder={indexType === 'SOFR' ? 'USD 1.000.000,00' : 'R$ 100.000,00'}
                      value={amount || ''}
                      onValueChange={v => setAmount(v.floatValue || 0)}
                      className="text-base font-mono"
                    />
                  </div>

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
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO 4: CAMPOS ESPECÍFICOS DA TESE (Carência / Juros)
            ═══════════════════════════════════════════════════════════════ */}
            {isT3 && (
              <AccordionItem id="carencia" className="rounded-lg border border-orange-500/20 bg-orange-500/[0.03] overflow-hidden">
                <div className="px-3 py-2.5 border-l-2 border-orange-500/50">
                  <AccordionTrigger id="carencia" subtitle="Tipo · Data de término">
                    Período de Carência
                  </AccordionTrigger>
                </div>
                <AccordionContent id="carencia" className="px-3 pb-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Data de Término da Carência</Label>
                    <Input
                      type="date"
                      value={gracePeriodEndDate}
                      min={startDate} max={endDate}
                      onChange={e => setGracePeriodEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Tipo de Carência</Label>
                    <Select value={gracePeriodType} onValueChange={v => setGracePeriodType(v as GracePeriodType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(GRACE_TYPE_LABELS) as GracePeriodType[]).map(t => (
                          <SelectItem key={t} value={t}>{GRACE_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {isT5 && (
              <AccordionItem id="juros" className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] overflow-hidden">
                <div className="px-3 py-2.5 border-l-2 border-emerald-500/50">
                  <AccordionTrigger id="juros" subtitle="Taxa · Capitalização">
                    Juros Remuneratórios
                  </AccordionTrigger>
                </div>
                <AccordionContent id="juros" className="px-3 pb-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Taxa de Juros (% a.a.)</Label>
                    <Input
                      type="number" step="0.01" min="0"
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
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                SEÇÃO 5: OPÇÕES AVANÇADAS (Amortizações — colapsado)
            ═══════════════════════════════════════════════════════════════ */}
            {isStandardCorrection && (
              <AccordionItem id="avancado" className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
                <div className="px-3 py-2.5 border-l-2 border-muted-foreground/20">
                  <AccordionTrigger
                    id="avancado"
                    icon={<Sliders className="h-3.5 w-3.5" />}
                    subtitle={amortizations.length > 0 ? `${amortizations.length} cadastrada${amortizations.length > 1 ? 's' : ''}` : ''}
                  >
                    Amortizações
                  </AccordionTrigger>
                </div>
                <AccordionContent id="avancado" className="px-3 pb-3">
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      {amortizations.length > 0 && (
                        <Badge variant="secondary">{amortizations.length}</Badge>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowAmortModal(true)} className="gap-2 px-4">
                      <Plus className="h-4 w-4" />
                      Cadastrar
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

          </Accordion>

          {/* Erro */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3 mt-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="h-12 px-4 text-sm gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={resetForm}
              disabled={loading}
              title="Limpar todos os campos e começar do zero"
            >
              <RotateCcw className="h-4 w-4" /> Limpar
            </Button>
            <Button
              className="flex-1 h-12 text-base font-semibold gap-2"
              onClick={() => submit()}
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Calculando...</>
              ) : (
                <><Calculator className="h-4 w-4" /> Calcular</>
              )}
            </Button>
          </div>
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
