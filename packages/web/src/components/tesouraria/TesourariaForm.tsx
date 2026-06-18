import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wand2, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DateInputBR } from '@/components/ui/date-input-br';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PremissasSnapshot } from '@/lib/api';
import { CalcDef, FieldDef } from './calcConfig';

interface Props {
  calc: CalcDef;
  snapshot: PremissasSnapshot | null;
  loading: boolean;
  onSubmit: (body: Record<string, any>) => void;
}

function initialValues(calc: CalcDef): Record<string, any> {
  const v: Record<string, any> = {};
  for (const f of calc.fields) {
    if (f.kind === 'flows') v[f.key] = [{ date: '', amount: '' }, { date: '', amount: '' }];
    else v[f.key] = f.default ?? '';
  }
  return v;
}

function initialAuto(calc: CalcDef): Record<string, boolean> {
  const a: Record<string, boolean> = {};
  for (const f of calc.fields) if (f.premise) a[f.key] = true;
  return a;
}

export function TesourariaForm({ calc, snapshot, loading, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, any>>(() => initialValues(calc));
  const [auto, setAuto] = useState<Record<string, boolean>>(() => initialAuto(calc));

  // Reinicia ao trocar de calculadora
  useEffect(() => {
    setValues(initialValues(calc));
    setAuto(initialAuto(calc));
  }, [calc.nome]);

  const setVal = (key: string, val: any) => setValues(prev => ({ ...prev, [key]: val }));

  /** Valor a exibir num campo (considera auto-fill da premissa). */
  const displayVal = (f: FieldDef): any => {
    if (f.premise && auto[f.key] && snapshot) {
      const p = f.premise(snapshot, values);
      if (p != null && isFinite(p)) return Number(p.toFixed(6));
    }
    return values[f.key];
  };

  const visibleFields = useMemo(
    () => calc.fields.filter(f => !f.showIf || f.showIf(values)),
    [calc, values]
  );

  const handleSubmit = () => {
    // Resolve premissas em modo auto
    const merged = { ...values };
    for (const f of calc.fields) {
      if (f.premise && auto[f.key] && snapshot) {
        const p = f.premise(snapshot, values);
        if (p != null && isFinite(p)) merged[f.key] = p;
      }
    }
    onSubmit(calc.buildBody(merged));
  };

  const toggleAuto = (f: FieldDef) => {
    setAuto(prev => {
      const next = { ...prev, [f.key]: !prev[f.key] };
      // ao passar para manual, semeia o valor atual da premissa
      if (!next[f.key] && f.premise && snapshot) {
        const p = f.premise(snapshot, values);
        if (p != null) setVal(f.key, Number(p.toFixed(6)));
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {visibleFields.map(f => (
        <div key={f.key} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              {f.label}
              {f.optional && <span className="ml-1 text-[10px] opacity-60">(opcional)</span>}
            </Label>
            {f.premise && (
              <button
                type="button"
                onClick={() => toggleAuto(f)}
                title={auto[f.key] ? 'Usando premissa automática — clique para editar' : 'Manual — clique para usar premissa'}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  auto[f.key]
                    ? 'text-primary bg-primary/10 border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground border border-white/10'
                }`}
              >
                {auto[f.key] ? <Wand2 className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                {auto[f.key] ? 'auto' : 'manual'}
              </button>
            )}
          </div>

          {f.kind === 'select' ? (
            <Select value={String(values[f.key] ?? '')} onValueChange={val => setVal(f.key, val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {f.options!.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : f.kind === 'date' ? (
            <DateInputBR value={values[f.key] || ''} onChange={iso => setVal(f.key, iso)} placeholder="dd/mm/aaaa" />
          ) : f.kind === 'flows' ? (
            <FlowsEditor rows={values[f.key] || []} onChange={rows => setVal(f.key, rows)} />
          ) : (
            <Input
              type={f.kind === 'numlist' ? 'text' : 'number'}
              inputMode={f.kind === 'numlist' ? 'text' : 'decimal'}
              className="font-mono tabular-nums"
              value={displayVal(f) ?? ''}
              disabled={!!(f.premise && auto[f.key])}
              onChange={e => setVal(f.key, e.target.value)}
              placeholder={f.help}
            />
          )}
          {f.help && f.kind !== 'numlist' && (
            <p className="text-[10px] text-muted-foreground/70">{f.help}</p>
          )}
        </div>
      ))}

      <Button onClick={handleSubmit} disabled={loading} className="w-full mt-2">
        {loading ? 'Calculando…' : 'Calcular'}
      </Button>
    </div>
  );
}

// ───────────────────────────── Editor de fluxos (TIR/VPL) ────────────────────

interface FlowRow {
  date: string;
  amount: string | number;
}

function FlowsEditor({ rows, onChange }: { rows: FlowRow[]; onChange: (r: FlowRow[]) => void }) {
  const update = (i: number, patch: Partial<FlowRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { date: '', amount: '' }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <DateInputBR value={r.date || ''} onChange={iso => update(i, { date: iso })} placeholder="dd/mm/aaaa" />
          </div>
          <Input
            type="number"
            inputMode="decimal"
            className="flex-1 font-mono tabular-nums"
            value={r.amount}
            onChange={e => update(i, { amount: e.target.value })}
            placeholder="valor (± )"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive p-1"
            title="Remover"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar fluxo
      </Button>
      <p className="text-[10px] text-muted-foreground/70">Saídas negativas, entradas positivas.</p>
    </div>
  );
}
