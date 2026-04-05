import React from 'react';
import { WaccMemorialStep } from '@/lib/api';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Calculator, Info } from 'lucide-react';

interface WaccMemoryProps {
  steps: WaccMemorialStep[];
}

export function WaccMemory({ steps }: WaccMemoryProps) {
  const fmt = (v: number, casas = 2) => {
    if (v > 1000) return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    return v.toFixed(casas).replace('.', ',');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 px-1">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Memorial de Cálculo Passo-a-Passo</h3>
      </div>

      <div className="rounded-lg border border-white/5 overflow-hidden">
        <Table>
          <TableHeader className="bg-white/5">
            <TableRow className="hover:bg-transparent border-white/10">
              <TableHead className="w-[200px] text-[10px] uppercase font-bold tracking-widest">Etapa / Título</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest text-center">Fórmula Aplicada</TableHead>
              <TableHead className="text-[10px] uppercase font-bold tracking-widest text-right">Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.map((step, idx) => (
              <React.Fragment key={idx}>
                <TableRow className="border-white/5 hover:bg-white/5 transition-colors group">
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-foreground">{step.titulo}</span>
                      <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[250px] opacity-0 group-hover:opacity-100 transition-opacity">
                        {step.descricao}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-center">
                    <div className="flex flex-col gap-1.5">
                      <code className="text-[11px] text-primary font-mono bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
                        {step.formula}
                      </code>
                      <code className="text-[10px] text-muted-foreground font-mono italic">
                        {step.formulaComValores}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <span className={`text-sm font-extrabold tabular-nums ${idx === steps.length - 1 ? 'text-primary' : 'text-foreground'}`}>
                      {fmt(step.resultado)} {step.unidade}
                    </span>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-start gap-2 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
        <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-[10px] text-blue-400/80 leading-relaxed uppercase tracking-tighter">
          Este memorial detalha o processo de cálculo conforme a metodologia de Damodaran. Valores de pesos (We, Wd) e custos (Ke, Kd) são fundamentais para auditoria do valuation.
        </p>
      </div>
    </div>
  );
}
