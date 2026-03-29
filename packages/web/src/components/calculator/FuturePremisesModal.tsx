import React, { useState } from 'react';
import { AlertTriangle, Plus, Trash2, Copy } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';

export interface FuturePremise {
  id: string;
  startDate: string;
  endDate: string;
  rate: number;
}

interface FuturePremisesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  premisesRequiredFrom: string;
  calcEndDate: string;
  indexType: string;
  premises: FuturePremise[];
  onChange: (premises: FuturePremise[]) => void;
  onConfirm: () => void;
  lastAvailableRate?: number | null;
  lastAvailableDate?: string | null;
}

export function FuturePremisesModal({
  open, onOpenChange, premisesRequiredFrom, calcEndDate,
  indexType, premises, onChange, onConfirm,
  lastAvailableRate, lastAvailableDate,
}: FuturePremisesModalProps) {
  const [form, setForm] = useState({
    startDate: premisesRequiredFrom.slice(0, 10),
    endDate: calcEndDate,
    rate: 0,
  });

  const isMonthly = ['IPCA', 'IGPM', 'INCC'].includes(indexType);
  const rateLabel = isMonthly ? 'Taxa Mensal (% a.m.)' : 'Taxa Anual (% a.a.)';
  const ratePlaceholder = isMonthly ? 'ex: 0.45' : 'ex: 10.5';
  const rateUnit = isMonthly ? '% a.m.' : '% a.a.';

  const canReplicate = lastAvailableRate != null && lastAvailableRate > 0;

  const add = () => {
    if (!form.startDate || !form.endDate || form.rate <= 0) return;
    onChange([...premises, { ...form, id: crypto.randomUUID() }]);
    setForm(f => ({ ...f, startDate: form.endDate, rate: 0 }));
  };

  const replicate = () => {
    if (!canReplicate) return;
    const start = premisesRequiredFrom.slice(0, 10);
    const end = calcEndDate;
    onChange([{
      id: crypto.randomUUID(),
      startDate: start,
      endDate: end,
      rate: lastAvailableRate!,
    }]);
  };

  const remove = (id: string) => onChange(premises.filter(p => p.id !== id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-projected" />
            Premissas Futuras Necessárias
          </DialogTitle>
          <DialogDescription>
            Os dados oficiais estão disponíveis até{' '}
            <strong>{formatDate(new Date(premisesRequiredFrom))}</strong>.
            Informe as premissas para completar o cálculo até{' '}
            <strong>{formatDate(new Date(calcEndDate))}</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Replicate last index button */}
        {canReplicate && (
          <button
            type="button"
            onClick={replicate}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-colors text-left group"
          >
            <div className="flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
              <Copy className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Replicar último índice disponível
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Usar <span className="font-semibold text-primary">{lastAvailableRate}{rateUnit}</span>
                {lastAvailableDate && (
                  <> de {formatDate(new Date(lastAvailableDate))}</>
                )}
                {' '}para todo o período restante
              </p>
            </div>
          </button>
        )}

        <div className="border rounded-lg p-4 space-y-3 bg-projected/5 border-projected/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>De</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Até</Label>
              <Input
                type="date"
                value={form.endDate}
                max={calcEndDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{rateLabel}</Label>
              <Input
                type="number"
                step={0.01}
                min={0}
                value={form.rate || ''}
                onChange={e => setForm(f => ({ ...f, rate: parseFloat(e.target.value) || 0 }))}
                placeholder={ratePlaceholder}
              />
            </div>
          </div>
          <Button size="sm" onClick={add} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Período
          </Button>
        </div>

        {premises.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
            {premises.map(p => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded border text-sm bg-card">
                <span className="font-mono text-muted-foreground">
                  {formatDate(new Date(p.startDate))} → {formatDate(new Date(p.endDate))}
                </span>
                <span className="font-semibold text-projected">
                  {p.rate}%{isMonthly ? ' a.m.' : ' a.a.'}
                </span>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => remove(p.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={onConfirm}
            disabled={premises.length === 0}
          >
            Calcular com Premissas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
