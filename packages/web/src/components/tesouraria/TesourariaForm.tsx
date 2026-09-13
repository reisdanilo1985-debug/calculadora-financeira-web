import React, { useEffect, useMemo, useState } from 'react';
import { Wand2, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DateInputBR } from '@/components/ui/date-input-br';
import { FlowsEditor, FlowRow, linhasVazias } from '@/components/ui/flows-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PremissasSnapshot } from '@/lib/api';
import { formatarNumeroPtBr } from '@/lib/numeroPtBr';
import { CalcDef, FieldDef, erroCampo, erroValorFluxo } from './calcConfig';

/**
 * Estado do campo → texto exibido. Números (defaults, premissas) saem em pt-BR
 * ("14,4"); o que o usuário digitou é mostrado como está e lido no buildBody
 * pelas regras pt-BR (vírgula decimal, ponto de milhar).
 */
const paraTexto = (v: unknown): string =>
  typeof v === 'number' ? formatarNumeroPtBr(v) : v == null ? '' : String(v);

interface Props {
  calc: CalcDef;
  snapshot: PremissasSnapshot | null;
  loading: boolean;
  onSubmit: (body: Record<string, any>) => void;
}

function initialValues(calc: CalcDef): Record<string, any> {
  const v: Record<string, any> = {};
  for (const f of calc.fields) {
    if (f.kind === 'flows') v[f.key] = linhasVazias();
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
  /** Campos que já perderam o foco (o erro só aparece depois disso ou ao calcular). */
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [tentouEnviar, setTentouEnviar] = useState(false);

  // Reinicia ao trocar de calculadora
  useEffect(() => {
    setValues(initialValues(calc));
    setAuto(initialAuto(calc));
    setTocados({});
    setTentouEnviar(false);
  }, [calc.nome]);

  const setVal = (key: string, val: any) => setValues(prev => ({ ...prev, [key]: val }));
  const tocar = (key: string) => setTocados(prev => (prev[key] ? prev : { ...prev, [key]: true }));

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

  /** Valores que o buildBody recebe: premissas em modo auto já resolvidas. */
  const resolverValores = (): Record<string, any> => {
    const merged = { ...values };
    for (const f of calc.fields) {
      if (f.premise && auto[f.key] && snapshot) {
        const p = f.premise(snapshot, values);
        if (p != null && isFinite(p)) merged[f.key] = p;
      }
    }
    return merged;
  };

  /** Erros de leitura pt-BR por campo visível (fluxos: chave `campo.linha`). */
  const validar = (merged: Record<string, any>): Record<string, string> => {
    const e: Record<string, string> = {};
    for (const f of visibleFields) {
      if (f.kind === 'flows') {
        ((merged[f.key] || []) as FlowRow[]).forEach((r, i) => {
          const msg = erroValorFluxo(r.amount);
          if (msg) e[`${f.key}.${i}`] = msg;
        });
      } else {
        const msg = erroCampo(f, merged[f.key]);
        if (msg) e[f.key] = msg;
      }
    }
    return e;
  };

  const erros = validar(resolverValores());
  const erroVisivel = (key: string): string | undefined =>
    tentouEnviar || tocados[key] ? erros[key] : undefined;

  const handleSubmit = () => {
    const merged = resolverValores();
    // Entrada inválida/ambígua bloqueia o envio e aparece no próprio campo.
    if (Object.keys(validar(merged)).length > 0) {
      setTentouEnviar(true);
      return;
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
            <FlowsEditor
              rows={values[f.key] || []}
              onChange={rows => setVal(f.key, rows)}
              erroLinha={i => erroVisivel(`${f.key}.${i}`)}
              onBlurLinha={i => tocar(`${f.key}.${i}`)}
            />
          ) : (
            // type="text": o type="number" do navegador lê "-10.000" como −10.
            // A leitura pt-BR é feita no buildBody (mesma regra da validação).
            <Input
              type="text"
              inputMode={f.kind === 'numlist' ? 'text' : 'decimal'}
              autoComplete="off"
              className="font-mono tabular-nums"
              value={paraTexto(displayVal(f))}
              disabled={!!(f.premise && auto[f.key])}
              onChange={e => setVal(f.key, e.target.value)}
              onBlur={() => tocar(f.key)}
              aria-invalid={erroVisivel(f.key) ? true : undefined}
              placeholder={f.help}
            />
          )}
          {f.kind !== 'flows' && erroVisivel(f.key) && (
            <p className="text-[10px] text-destructive">{erroVisivel(f.key)}</p>
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
