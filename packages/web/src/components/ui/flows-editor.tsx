import React, { useState } from 'react';
import { Plus, Trash2, Download, Upload, FileSpreadsheet, Repeat } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateInputBR } from '@/components/ui/date-input-br';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatarNumeroPtBr } from '@/lib/numeroPtBr';
import {
  LinhaFluxo, ModeloFluxos, UnidadeFluxo, PeriodicidadeFluxo,
  LIMITE_PERIODICOS, baixarModeloFluxos, datasPeriodicas, exportarFluxos,
  fluxosValidos, lerLinhaFluxo, linhaVazia,
} from '@/lib/planilhaFluxos';
import { FlowsImportDialog } from '@/components/ui/flows-import-dialog';

/** Linha de fluxo datado (mantido o nome usado pela Tesouraria) */
export type FlowRow = LinhaFluxo;

export const linhasVazias = (n = 2, modelo?: ModeloFluxos): FlowRow[] => Array.from({ length: n }, () => linhaVazia(modelo));

const paraTexto = (v: unknown): string =>
  typeof v === 'number' ? formatarNumeroPtBr(v) : v == null ? '' : String(v);

const PERIODICIDADES: { value: PeriodicidadeFluxo; label: string }[] = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
];

const dataBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** R$ | % no mesmo visual do seletor a.a. | a.m. */
function UnidadeToggle({ value, onChange }: { value: UnidadeFluxo; onChange: (u: UnidadeFluxo) => void }) {
  return (
    <div className="inline-flex rounded-md border border-white/10 overflow-hidden shrink-0" role="group" aria-label="Unidade do valor">
      {(['R$', '%'] as const).map(u => (
        <button
          key={u}
          type="button"
          aria-pressed={value === u}
          title={u === '%' ? 'Percentual do saldo na data' : 'Valor em reais'}
          onClick={() => onChange(u)}
          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === u
              ? 'bg-primary text-primary-foreground shadow-[0_0_8px_rgba(16,185,129,0.25)]'
              : 'text-muted-foreground hover:bg-white/5'
          }`}
        >
          {u}
        </button>
      ))}
    </div>
  );
}

/** Gera linhas com a mesma data-âncora e valor, a cada período */
function GeradorPeriodicos({
  modelo, onGerar, onFechar,
}: {
  modelo: ModeloFluxos;
  onGerar: (linhas: FlowRow[]) => void;
  onFechar: () => void;
}) {
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [periodicidade, setPeriodicidade] = useState<PeriodicidadeFluxo>('MONTHLY');
  const [valor, setValor] = useState('');
  const [unidade, setUnidade] = useState<UnidadeFluxo>('R$');

  const datas = datasPeriodicas(inicio, fim, periodicidade);
  const leitura = lerLinhaFluxo({ date: inicio || '0000-00-00', amount: valor, unit: unidade }, modelo);
  const erro =
    inicio && fim && fim < inicio ? 'A última data deve ser igual ou posterior à primeira.'
    : datas.length > LIMITE_PERIODICOS ? `O período gera mais de ${LIMITE_PERIODICOS.toLocaleString('pt-BR')} fluxos. Reduza o intervalo ou aumente a periodicidade.`
    : valor.trim() && leitura.tipo === 'erro' ? leitura.mensagem
    : null;
  const pronto = !erro && datas.length > 0 && leitura.tipo === 'ok';

  const gerar = () => {
    if (!pronto || leitura.tipo !== 'ok') return;
    onGerar(datas.map(date => (modelo.comUnidade ? { date, amount: leitura.valor, unit: unidade } : { date, amount: leitura.valor })));
    onFechar();
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
      <p className="text-xs font-medium text-foreground">Gerar fluxos periódicos</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Primeira data</label>
          <DateInputBR value={inicio} onChange={setInicio} placeholder="dd/mm/aaaa" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Última data</label>
          <DateInputBR value={fim} onChange={setFim} placeholder="dd/mm/aaaa" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Periodicidade</label>
          <Select value={periodicidade} onValueChange={v => setPeriodicidade(v as PeriodicidadeFluxo)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODICIDADES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Valor de cada fluxo (±)</label>
          <div className="flex gap-1.5">
            <Input
              type="text" inputMode="decimal" autoComplete="off"
              className="flex-1 font-mono tabular-nums"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="valor (± )"
            />
            {modelo.comUnidade && <UnidadeToggle value={unidade} onChange={setUnidade} />}
          </div>
        </div>
      </div>
      <p className={`text-[10px] ${erro ? 'text-destructive' : 'text-muted-foreground/80'}`}>
        {erro
          ?? (datas.length
            ? `${datas.length} fluxo${datas.length > 1 ? 's' : ''} de ${dataBr(datas[0])} a ${dataBr(datas[datas.length - 1])}, no mesmo dia de cada período (ajustado ao fim do mês quando preciso).`
            : 'Informe a primeira e a última data.')}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onFechar}>Cancelar</Button>
        <Button type="button" size="sm" className="h-7 text-xs" disabled={!pronto} onClick={gerar}>
          {pronto ? `Gerar ${datas.length} fluxo${datas.length > 1 ? 's' : ''}` : 'Gerar fluxos'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Editor de fluxos de caixa datados (data + valor com sinal). Com `modelo`, ganha a
 * coluna Unidade (se o modelo tiver), a planilha padrão (baixar modelo, importar,
 * exportar) e o gerador de fluxos periódicos — o mesmo cadastro em todas as telas.
 * O valor é texto lido pelas regras pt-BR ("-10.000" = −10.000).
 */
export function FlowsEditor({
  rows,
  onChange,
  erroLinha,
  onBlurLinha,
  modelo,
}: {
  rows: FlowRow[];
  onChange: (r: FlowRow[]) => void;
  /** Mensagem de erro da linha i (já filtrada por "tocado"/"tentou enviar"). */
  erroLinha: (i: number) => string | undefined;
  onBlurLinha: (i: number) => void;
  modelo?: ModeloFluxos;
}) {
  const [importando, setImportando] = useState(false);
  const [gerando, setGerando] = useState(false);

  const update = (i: number, patch: Partial<FlowRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, linhaVazia(modelo)]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  /** Linhas preenchidas (as totalmente vazias somem ao acrescentar importadas/geradas) */
  const preenchidas = () =>
    modelo ? rows.filter(r => lerLinhaFluxo(r, modelo).tipo !== 'vazia') : rows.filter(r => r.date || paraTexto(r.amount).trim());

  const validas = modelo ? fluxosValidos(rows, modelo).length : 0;

  return (
    <div className="space-y-2">
      {modelo && (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => baixarModeloFluxos(modelo)}>
            <Download className="h-3.5 w-3.5" /> Baixar modelo
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setImportando(true)}>
            <Upload className="h-3.5 w-3.5" /> Importar planilha
          </Button>
          <Button
            type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
            disabled={validas === 0}
            title={validas === 0 ? 'Não há fluxos válidos para exportar' : `Exporta ${validas} fluxo(s) válido(s) no layout do modelo`}
            onClick={() => exportarFluxos(modelo, rows)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
      )}

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
            {modelo?.comUnidade && (
              <UnidadeToggle value={r.unit === '%' ? '%' : 'R$'} onChange={unit => update(i, { unit })} />
            )}
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

      {modelo && gerando && (
        <GeradorPeriodicos
          modelo={modelo}
          onGerar={novas => onChange([...preenchidas(), ...novas])}
          onFechar={() => setGerando(false)}
        />
      )}

      <div className={modelo ? 'grid grid-cols-2 gap-2' : ''}>
        <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar fluxo
        </Button>
        {modelo && (
          <Button type="button" variant="outline" size="sm" onClick={() => setGerando(g => !g)} className="w-full" aria-expanded={gerando}>
            <Repeat className="h-3.5 w-3.5 mr-1" /> Gerar periódicos
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        {modelo?.regraSinal ?? 'Saídas negativas, entradas positivas.'}
        {modelo?.comUnidade && ' % = percentual do saldo na data.'}
      </p>

      {modelo && (
        <FlowsImportDialog
          open={importando}
          onOpenChange={setImportando}
          modelo={modelo}
          linhasAtuais={preenchidas().length}
          onImport={(importadas, modo) => onChange(modo === 'substituir' ? importadas : [...preenchidas(), ...importadas])}
        />
      )}
    </div>
  );
}
