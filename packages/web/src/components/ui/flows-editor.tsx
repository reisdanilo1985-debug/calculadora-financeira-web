import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateInputBR } from '@/components/ui/date-input-br';
import { formatarNumeroPtBr } from '@/lib/numeroPtBr';

/** Linha de fluxo datado: valor como digitado (texto pt-BR) ou número. */
export interface FlowRow {
  date: string;
  amount: string | number;
}

export const linhasVazias = (n = 2): FlowRow[] => Array.from({ length: n }, () => ({ date: '', amount: '' }));

const paraTexto = (v: unknown): string =>
  typeof v === 'number' ? formatarNumeroPtBr(v) : v == null ? '' : String(v);

/**
 * Editor de fluxos de caixa datados (data + valor com sinal), usado na Calculadora
 * (Valor Presente) e na Tesouraria. O valor é texto lido pelas regras pt-BR por quem
 * consome as linhas ("-10.000" = −10.000).
 */
export function FlowsEditor({
  rows,
  onChange,
  erroLinha,
  onBlurLinha,
}: {
  rows: FlowRow[];
  onChange: (r: FlowRow[]) => void;
  /** Mensagem de erro do valor da linha i (já filtrada por "tocado"/"tentou enviar"). */
  erroLinha: (i: number) => string | undefined;
  onBlurLinha: (i: number) => void;
}) {
  const update = (i: number, patch: Partial<FlowRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { date: '', amount: '' }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <DateInputBR value={r.date || ''} onChange={iso => update(i, { date: iso })} placeholder="dd/mm/aaaa" />
            </div>
            {/* type="text" + leitura pt-BR: "-10.000" = −10.000 (o type="number" lia −10). */}
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="flex-1 font-mono tabular-nums"
              value={paraTexto(r.amount)}
              onChange={e => update(i, { amount: e.target.value })}
              onBlur={() => onBlurLinha(i)}
              aria-invalid={erroLinha(i) ? true : undefined}
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
          {erroLinha(i) && <p className="mt-1 text-[10px] text-destructive">{erroLinha(i)}</p>}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar fluxo
      </Button>
      <p className="text-[10px] text-muted-foreground/70">Saídas negativas, entradas positivas.</p>
    </div>
  );
}
