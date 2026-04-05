import React, { useState } from 'react';
import { AlertTriangle, Plus, Trash2, Copy } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FuturePremise } from '@/components/calculator/FuturePremisesModal';
import { formatDate } from '@/lib/utils';

export interface ScenarioPremisesInfo {
  label: string;
  indexType: string;
  premisesRequiredFrom: string;
  lastAvailableDate?: string | null;
  lastAvailableRate?: number | null;
  premises: FuturePremise[];
}

interface ScenarioPremisesSectionProps {
  info: ScenarioPremisesInfo;
  calcEndDate: string;
  onUpdate: (premises: FuturePremise[]) => void;
}

function ScenarioPremisesSection({ info, calcEndDate, onUpdate }: ScenarioPremisesSectionProps) {
  const isMonthly = ['IPCA', 'IGPM', 'INCC'].includes(info.indexType);
  const isSOFR = info.indexType === 'SOFR';
  const rateLabel = isMonthly ? 'Taxa Mensal (% a.m.)' : isSOFR ? 'Taxa Diária SOFR (% a.d.)' : 'Taxa Anual (% a.a.)';
  const ratePlaceholder = isMonthly ? 'ex: 0.45' : isSOFR ? 'ex: 5.30' : 'ex: 10.5';
  const rateUnit = isMonthly ? '% a.m.' : isSOFR ? '% a.d.' : '% a.a.';

  const [form, setForm] = useState({
    startDate: info.premisesRequiredFrom.slice(0, 10),
    endDate: calcEndDate,
    rate: 0,
  });

  const add = () => {
    if (!form.startDate || !form.endDate || form.rate <= 0) return;
    onUpdate([...info.premises, { ...form, id: crypto.randomUUID() }]);
    setForm(f => ({ ...f, startDate: form.endDate, rate: 0 }));
  };

  const replicate = () => {
    if (!info.lastAvailableRate) return;
    onUpdate([{
      id: crypto.randomUUID(),
      startDate: info.premisesRequiredFrom.slice(0, 10),
      endDate: calcEndDate,
      rate: info.lastAvailableRate,
    }]);
  };

  const remove = (id: string) => onUpdate(info.premises.filter(p => p.id !== id));

  return (
    <div className="space-y-3">
      {info.lastAvailableRate != null && info.lastAvailableRate > 0 && (
        <button
          type="button"
          onClick={replicate}
          className="w-full flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-colors text-left group"
        >
          <div className="flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
            <Copy className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Replicar último índice disponível</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Usar <span className="font-semibold text-primary">{info.lastAvailableRate}{rateUnit}</span>
              {info.lastAvailableDate && <> de {formatDate(new Date(info.lastAvailableDate))}</>}
              {' '}para todo o período restante
            </p>
          </div>
        </button>
      )}

      <div className="border rounded-lg p-3 space-y-3 bg-projected/5 border-projected/30">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.endDate}
              max={calcEndDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">{rateLabel}</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              step={0.01}
              min={0}
              value={form.rate || ''}
              onChange={e => setForm(f => ({ ...f, rate: parseFloat(e.target.value) || 0 }))}
              placeholder={ratePlaceholder}
            />
          </div>
        </div>
        <Button size="sm" onClick={add} className="gap-2 h-7 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Adicionar Período
        </Button>
      </div>

      {info.premises.length > 0 && (
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {info.premises.map(p => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded border text-xs bg-card">
              <span className="font-mono text-muted-foreground">
                {formatDate(new Date(p.startDate))} → {formatDate(new Date(p.endDate))}
              </span>
              <span className="font-semibold text-projected">
                {p.rate}%{isMonthly ? ' a.m.' : isSOFR ? ' a.d.' : ' a.a.'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={() => remove(p.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ComparadorPremisesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calcEndDate: string;
  scenarios: ScenarioPremisesInfo[];
  scenarioColors: Record<string, string>;
  onUpdate: (label: string, premises: FuturePremise[]) => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function ComparadorPremisesModal({
  open, onOpenChange, calcEndDate, scenarios, scenarioColors,
  onUpdate, onConfirm, loading,
}: ComparadorPremisesModalProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const allHavePremises = scenarios.every(s => s.premises.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Premissas Futuras Necessárias
          </DialogTitle>
          <DialogDescription>
            {scenarios.length > 1
              ? `${scenarios.length} cenários precisam de premissas para cobrir o período selecionado.`
              : `O cenário "${scenarios[0]?.label}" precisa de premissas futuras para completar o cálculo.`}
          </DialogDescription>
        </DialogHeader>

        {/* Seletor de cenário */}
        {scenarios.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {scenarios.map((s, idx) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  activeIdx === idx
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/50 text-muted-foreground hover:border-border'
                }`}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: scenarioColors[s.label] ?? '#94a3b8' }}
                />
                {s.label}
                {s.premises.length > 0 && (
                  <span className="text-emerald-400 text-[10px] font-bold ml-0.5">✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {scenarios[activeIdx] && (
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              Dados oficiais disponíveis até{' '}
              <strong className="text-foreground">
                {formatDate(new Date(scenarios[activeIdx].premisesRequiredFrom))}
              </strong>.
              {' '}Informe a premissa para completar até{' '}
              <strong className="text-foreground">{formatDate(new Date(calcEndDate))}</strong>.
            </p>
            <ScenarioPremisesSection
              key={scenarios[activeIdx].label}
              info={scenarios[activeIdx]}
              calcEndDate={calcEndDate}
              onUpdate={premises => onUpdate(scenarios[activeIdx].label, premises)}
            />
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={!allHavePremises || loading}>
            {loading ? 'Calculando...' : 'Calcular com Premissas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
