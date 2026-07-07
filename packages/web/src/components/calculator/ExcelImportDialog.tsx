import React, { useRef, useState } from 'react';
import { Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { downloadScheduleTemplate } from '@/lib/excel/scheduleTemplate';
import { parseScheduleFile, ParseError } from '@/lib/excel/scheduleParser';
import { AmortizationEntry } from './AmortizationModal';

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cronograma atual (para o modo "Mesclar" com dedupe). */
  current: AmortizationEntry[];
  onImport: (entries: AmortizationEntry[]) => void;
}

type Modo = 'substituir' | 'mesclar';

function chaveDedupe(e: Pick<AmortizationEntry, 'date' | 'type' | 'value' | 'direction'>): string {
  return `${e.date}|${e.type}|${e.value}|${e.direction ?? 'OUT'}`;
}

export function ExcelImportDialog({ open, onOpenChange, current, onImport }: ExcelImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [entries, setEntries] = useState<AmortizationEntry[]>([]);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [modo, setModo] = useState<Modo>('mesclar');

  const reset = () => {
    setFileName(null);
    setEntries([]);
    setErrors([]);
    setLoading(false);
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    try {
      const result = await parseScheduleFile(file);
      setEntries(result.entries);
      setErrors(result.errors);
    } catch (err: any) {
      setEntries([]);
      setErrors([{ row: 0, message: `Falha ao ler o arquivo: ${err.message ?? 'formato inválido.'}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleConfirm = () => {
    if (entries.length === 0) return;
    if (modo === 'substituir') {
      onImport(entries);
    } else {
      const existentes = new Set(current.map(chaveDedupe));
      const novos = entries.filter(e => !existentes.has(chaveDedupe(e)));
      onImport([...current, ...novos]);
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Cronograma via Excel</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
          <div className="text-sm text-muted-foreground">
            Baixe o modelo, preencha os lançamentos e importe de volta.
          </div>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => downloadScheduleTemplate()}
          >
            <Download className="h-4 w-4" />
            Baixar modelo
          </Button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            Arraste um arquivo .xlsx aqui, ou clique para selecionar
          </p>
          {fileName && (
            <p className="text-xs font-medium flex items-center gap-1.5 text-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {fileName}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {loading && <p className="text-sm text-muted-foreground text-center">Lendo arquivo...</p>}

        {!loading && (entries.length > 0 || errors.length > 0) && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="outline" className="gap-1.5 text-emerald-500 border-emerald-500/30">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {entries.length} válida(s)
              </Badge>
              {errors.length > 0 && (
                <Badge variant="outline" className="gap-1.5 text-destructive border-destructive/30">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {errors.length} com erro
                </Badge>
              )}
            </div>

            {errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 space-y-1">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">
                    Linha {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}

            {entries.length > 0 && (
              <div className="max-h-56 overflow-y-auto space-y-1.5">
                {entries.map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-md bg-card border text-sm">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                        e.direction === 'IN' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-primary/15 text-primary'
                      }`}>
                        {e.direction === 'IN' ? 'Aporte' : 'Amort.'}
                      </span>
                      <span className="text-muted-foreground font-mono">{formatDate(new Date(e.date))}</span>
                      <span className="font-medium">
                        {e.type === 'PERCENTAGE' ? `${e.value}% do saldo` : formatCurrency(e.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Substituir vs Mesclar */}
            <div className="flex rounded-lg border border-border overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setModo('mesclar')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  modo === 'mesclar' ? 'bg-primary/15 text-primary' : 'bg-input text-muted-foreground hover:text-foreground'
                }`}
              >
                Mesclar com atual
              </button>
              <button
                type="button"
                onClick={() => setModo('substituir')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  modo === 'substituir' ? 'bg-destructive/15 text-destructive' : 'bg-input text-muted-foreground hover:text-foreground'
                }`}
              >
                Substituir cronograma atual
              </button>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={entries.length === 0}>
            Importar {entries.length > 0 ? `${entries.length} lançamento(s)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
