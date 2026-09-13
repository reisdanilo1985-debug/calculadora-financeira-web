import React, { useRef, useState } from 'react';
import { Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import {
  LinhaFluxo, ModeloFluxos, ResultadoImportacao, baixarModeloFluxos, lerPlanilhaFluxos,
} from '@/lib/planilhaFluxos';

type Modo = 'acrescentar' | 'substituir';

const ERROS_EXIBIDOS = 50;

/**
 * Importação de fluxos pela planilha padrão. Aceita só o layout do modelo; se houver
 * qualquer erro, nada é importado (o usuário corrige a planilha e tenta de novo).
 */
export function FlowsImportDialog({
  open, onOpenChange, modelo, linhasAtuais, onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelo: ModeloFluxos;
  /** Linhas já preenchidas na tela (define se há o que acrescentar ou substituir) */
  linhasAtuais: number;
  onImport: (linhas: LinhaFluxo[], modo: Modo) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [modo, setModo] = useState<Modo>('acrescentar');

  const limpar = () => {
    setArquivo(null);
    setResultado(null);
    setLendo(false);
    setModo('acrescentar');
  };

  const fechar = () => {
    limpar();
    onOpenChange(false);
  };

  const ler = async (file: File) => {
    setLendo(true);
    setArquivo(file.name);
    try {
      setResultado(await lerPlanilhaFluxos(await file.arrayBuffer(), modelo));
    } catch {
      setResultado({
        tipo: 'fora-do-modelo',
        mensagem: 'Não foi possível ler o arquivo. Envie uma planilha Excel (.xlsx) gerada pelo botão "Baixar modelo".',
      });
    } finally {
      setLendo(false);
    }
  };

  const importar = () => {
    if (resultado?.tipo !== 'ok') return;
    onImport(resultado.linhas, linhasAtuais > 0 ? modo : 'substituir');
    fechar();
  };

  const totais = (() => {
    if (resultado?.tipo !== 'ok') return null;
    const emReais = resultado.linhas.filter(l => l.unit !== '%').map(l => Number(l.amount));
    const percentuais = resultado.linhas.length - emReais.length;
    return {
      entradas: emReais.filter(v => v > 0).reduce((s, v) => s + v, 0),
      saidas: emReais.filter(v => v < 0).reduce((s, v) => s + v, 0),
      percentuais,
    };
  })();

  return (
    <Dialog open={open} onOpenChange={o => (o ? onOpenChange(true) : fechar())}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar fluxos de planilha</DialogTitle>
          <DialogDescription>
            Modelo padrão: <strong className="text-foreground">{modelo.titulo}</strong> (aba "{modelo.aba}", colunas "{modelo.colunas.join(' | ')}").
            Arquivos com estrutura diferente são recusados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">Baixe o modelo, preencha a aba "{modelo.aba}" e importe o arquivo.</p>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => baixarModeloFluxos(modelo)}>
            <Download className="h-4 w-4" /> Baixar modelo
          </Button>
        </div>

        <div
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          onDragOver={e => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={e => {
            e.preventDefault();
            setArrastando(false);
            const f = e.dataTransfer.files?.[0];
            if (f) ler(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
            arrastando ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">Arraste a planilha .xlsx aqui ou clique para selecionar</p>
          {arquivo && (
            <p className="text-xs font-medium flex items-center gap-1.5 text-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" /> {arquivo}
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) ler(f);
              e.target.value = '';
            }}
          />
        </div>

        {lendo && <p className="text-sm text-muted-foreground text-center">Lendo planilha…</p>}

        {!lendo && resultado?.tipo === 'fora-do-modelo' && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1" role="alert">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Arquivo fora do modelo padrão
            </p>
            <p className="text-xs text-destructive/90">{resultado.mensagem}</p>
          </div>
        )}

        {!lendo && resultado?.tipo === 'erros' && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2" role="alert">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Nenhum fluxo foi importado: {resultado.erros.length} {resultado.erros.length === 1 ? 'erro encontrado' : 'erros encontrados'}
            </p>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {resultado.erros.slice(0, ERROS_EXIBIDOS).map((e, i) => (
                <p key={i} className="text-xs text-destructive/90">
                  {e.linha > 0 ? `Linha ${e.linha}: ` : ''}{e.mensagem}
                </p>
              ))}
              {resultado.erros.length > ERROS_EXIBIDOS && (
                <p className="text-xs text-destructive/80">… e mais {resultado.erros.length - ERROS_EXIBIDOS} erro(s).</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Corrija a planilha e importe novamente.</p>
          </div>
        )}

        {!lendo && resultado?.tipo === 'ok' && totais && (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {resultado.linhas.length} {resultado.linhas.length === 1 ? 'fluxo pronto' : 'fluxos prontos'} para importar
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                Entradas {formatCurrency(totais.entradas)} · Saídas {formatCurrency(totais.saidas)}
                {totais.percentuais > 0 && ` · ${totais.percentuais} em % do saldo`}
              </p>
            </div>
            {linhasAtuais > 0 && (
              <div className="flex rounded-lg border border-border overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => setModo('acrescentar')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    modo === 'acrescentar' ? 'bg-primary/15 text-primary' : 'bg-input text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {linhasAtuais === 1 ? 'Acrescentar à linha atual' : `Acrescentar às ${linhasAtuais} linhas atuais`}
                </button>
                <button
                  type="button"
                  onClick={() => setModo('substituir')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    modo === 'substituir' ? 'bg-destructive/15 text-destructive' : 'bg-input text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {linhasAtuais === 1 ? 'Substituir a linha atual' : 'Substituir as linhas atuais'}
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Cancelar</Button>
          <Button onClick={importar} disabled={resultado?.tipo !== 'ok'}>
            {resultado?.tipo === 'ok' ? `Importar ${resultado.linhas.length} fluxo${resultado.linhas.length > 1 ? 's' : ''}` : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
