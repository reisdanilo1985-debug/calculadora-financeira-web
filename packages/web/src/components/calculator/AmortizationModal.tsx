import React, { useState } from 'react';
import { Plus, Trash2, Download, Upload, FileSpreadsheet } from 'lucide-react';
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
import { downloadScheduleTemplate } from '@/lib/excel/scheduleTemplate';
import { exportSchedule } from '@/lib/excel/scheduleExport';
import { ExcelImportDialog } from './ExcelImportDialog';

export interface AmortizationEntry {
  id: string;
  date: string;
  type: 'FIXED' | 'PERCENTAGE' | 'PERIODIC';
  value: number;
  periodicity?: string;
  periodicEndDate?: string;
  isPeriodicPercentage?: boolean;
  /** OUT = amortização (saída, default), IN = aporte/captação (entrada) */
  direction?: 'OUT' | 'IN';
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
  direction: 'OUT',
};

export function AmortizationModal({
  open, onOpenChange, amortizations, onChange,
}: AmortizationModalProps) {
  const [form, setForm] = useState({ ...EMPTY });
  const [importOpen, setImportOpen] = useState(false);

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
          <DialogTitle>Cronograma de Amortizações e Aportes</DialogTitle>
        </DialogHeader>

        {/* Barra de ações — Excel */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => downloadScheduleTemplate()}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar modelo
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            Importar Excel
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            disabled={amortizations.length === 0}
            onClick={() => exportSchedule(amortizations)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>

        <ExcelImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          current={amortizations}
          onImport={onChange}
        />

        {/* Formulário de novo lançamento */}
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Novo Lançamento
          </h4>

          {/* Direção: amortização (saída) vs aporte (entrada) */}
          <div className="flex rounded-lg border border-border overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, direction: 'OUT' }))}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                form.direction !== 'IN'
                  ? 'bg-primary/15 text-primary'
                  : 'bg-input text-muted-foreground hover:text-foreground'
              }`}
            >
              Amortização (saída)
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, direction: 'IN' }))}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                form.direction === 'IN'
                  ? 'bg-cyan-500/15 text-cyan-400'
                  : 'bg-input text-muted-foreground hover:text-foreground'
              }`}
            >
              Aporte (entrada)
            </button>
          </div>

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

        {/* Lista de lançamentos */}
        {amortizations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Lançamentos Cadastrados ({amortizations.length})
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
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          a.direction === 'IN'
                            ? 'bg-cyan-500/15 text-cyan-400'
                            : 'bg-primary/15 text-primary'
                        }`}
                      >
                        {a.direction === 'IN' ? 'Aporte' : 'Amort.'}
                      </span>
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
