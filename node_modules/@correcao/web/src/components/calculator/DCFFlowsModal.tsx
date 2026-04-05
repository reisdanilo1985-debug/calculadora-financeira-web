import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericFormat } from 'react-number-format';
import { formatDate } from '@/lib/utils';

export interface DCFCashFlow {
  id: string;
  date: string;
  amount: number;
  label?: string;
}

interface DCFFlowsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flows: DCFCashFlow[];
  onChange: (flows: DCFCashFlow[]) => void;
}

export function DCFFlowsModal({ open, onOpenChange, flows, onChange }: DCFFlowsModalProps) {
  const [form, setForm] = useState({ date: '', amount: 0, label: '' });

  const add = () => {
    if (!form.date || form.amount <= 0) return;
    onChange([...flows, { ...form, id: crypto.randomUUID() }]);
    setForm({ date: form.date, amount: 0, label: '' });
  };

  const remove = (id: string) => onChange(flows.filter(f => f.id !== id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fluxos de Caixa Futuros</DialogTitle>
        </DialogHeader>

        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data do Fluxo</Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <NumericFormat
                customInput={Input}
                thousandSeparator="."
                decimalSeparator=","
                prefix="R$ "
                decimalScale={2}
                fixedDecimalScale
                allowNegative={false}
                value={form.amount || ''}
                onValueChange={v => setForm(f => ({ ...f, amount: v.floatValue || 0 }))}
                placeholder="R$ 0,00"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Descrição <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="ex: Parcela 1, Principal, Resgate..."
              />
            </div>
          </div>
          <Button size="sm" onClick={add} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Fluxo
          </Button>
        </div>

        {flows.length > 0 && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {flows
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 rounded border text-sm bg-card">
                  <div className="flex flex-col">
                    <span className="font-mono text-muted-foreground text-xs">
                      {formatDate(new Date(f.date + 'T12:00:00'))}
                    </span>
                    {f.label && <span className="text-xs text-muted-foreground/60">{f.label}</span>}
                  </div>
                  <span className="font-semibold text-primary font-mono">
                    R$ {f.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => remove(f.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            <div className="flex justify-between px-2 py-1.5 border-t text-sm font-semibold">
              <span className="text-muted-foreground">Total nominal</span>
              <span className="font-mono text-foreground">
                R$ {flows.reduce((s, f) => s + f.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
