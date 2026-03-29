import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCurrency, formatDate } from '@/lib/utils';

export interface AmortizationEntry {
  id: string;
  date: string;
  type: 'FIXED' | 'PERCENTAGE' | 'PERIODIC';
  value: number;
  periodicity?: string;
  periodicEndDate?: string;
  isPeriodicPercentage?: boolean;
}

interface AmortizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amortizations: AmortizationEntry[];
  onChange: (amortizations: AmortizationEntry[]) => void;
}

const EMPTY: Omit<AmortizationEntry, 'id'> = {
  date: '',
  type: 'FIXED',
  value: 0,
  periodicity: 'MONTHLY',
  periodicEndDate: '',
  isPeriodicPercentage: false,
};

export function AmortizationModal({
  open, onOpenChange, amortizations, onChange,
}: AmortizationModalProps) {
  const [form, setForm] = useState({ ...EMPTY });

  const add = () => {
    if (!form.date || form.value <= 0) return;
    onChange([
      ...amortizations,
      { ...form, id: crypto.randomUUID() },
    ]);
    setForm({ ...EMPTY });
  };

  const remove = (id: string) => onChange(amortizations.filter(a => a.id !== id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cronograma de Amortizações</DialogTitle>
        </DialogHeader>

        {/* Formulário de nova amortização */}
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Nova Amortização
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={v => setForm(f => ({ ...f, type: v as any }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Valor Fixo (R$)</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentual do Saldo (%)</SelectItem>
                  <SelectItem value="PERIODIC">Periódico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{form.type === 'PERCENTAGE' ? 'Percentual (%)' : 'Valor (R$)'}</Label>
              <Input
                type="number"
                min={0}
                step={form.type === 'PERCENTAGE' ? 0.01 : 100}
                value={form.value || ''}
                onChange={e => setForm(f => ({ ...f, value: parseFloat(e.target.value) || 0 }))}
                placeholder={form.type === 'PERCENTAGE' ? 'ex: 10' : 'ex: 50000'}
              />
            </div>

            {form.type === 'PERIODIC' && (
              <>
                <div className="space-y-1.5">
                  <Label>Periodicidade</Label>
                  <Select
                    value={form.periodicity}
                    onValueChange={v => setForm(f => ({ ...f, periodicity: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Mensal</SelectItem>
                      <SelectItem value="QUARTERLY">Trimestral</SelectItem>
                      <SelectItem value="SEMIANNUAL">Semestral</SelectItem>
                      <SelectItem value="ANNUAL">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data Final das Parcelas</Label>
                  <Input
                    type="date"
                    value={form.periodicEndDate}
                    onChange={e => setForm(f => ({ ...f, periodicEndDate: e.target.value }))}
                  />
                </div>
              </>
            )}
          </div>

          <Button onClick={add} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>

        {/* Lista de amortizações */}
        {amortizations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Amortizações Cadastradas ({amortizations.length})
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
              {amortizations
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(a => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-2.5 rounded-md bg-card border text-sm"
                  >
                    <div className="flex gap-4">
                      <span className="text-muted-foreground font-mono">
                        {formatDate(new Date(a.date))}
                      </span>
                      <span className="font-medium">
                        {a.type === 'FIXED'
                          ? formatCurrency(a.value)
                          : a.type === 'PERCENTAGE'
                          ? `${a.value}% do saldo`
                          : `${a.value}${a.isPeriodicPercentage ? '%' : 'R$'} ${a.periodicity?.toLowerCase()}`}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => remove(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
