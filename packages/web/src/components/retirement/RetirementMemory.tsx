import React from 'react';
import { RetirementMemorialStep } from '@/lib/api';
import { Calculator } from 'lucide-react';

interface RetirementMemoryProps {
  steps: RetirementMemorialStep[];
}

export function RetirementMemory({ steps }: RetirementMemoryProps) {
  const fmt = (v: number) => {
    if (Math.abs(v) > 1000) return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v.toFixed(2).replace('.', ',');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 px-1">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Memorial de Cálculo</h3>
      </div>

      <div className="rounded-lg border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr className="border-b border-white/10">
              <th className="w-[200px] text-[10px] uppercase font-bold tracking-widest text-left px-4 py-3 text-muted-foreground">Etapa</th>
              <th className="text-[10px] uppercase font-bold tracking-widest text-center px-4 py-3 text-muted-foreground">Fórmula Aplicada</th>
              <th className="text-[10px] uppercase font-bold tracking-widest text-right px-4 py-3 text-muted-foreground">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, idx) => (
              <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                <td className="py-4 px-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-foreground">{step.titulo}</span>
                    <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[250px] opacity-0 group-hover:opacity-100 transition-opacity">
                      {step.descricao}
                    </p>
                  </div>
                </td>
                <td className="py-4 px-4 text-center">
                  <div className="flex flex-col gap-1.5">
                    <code className="text-[11px] text-primary font-mono bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
                      {step.formula}
                    </code>
                    <code className="text-[10px] text-muted-foreground font-mono italic">
                      {step.formulaComValores}
                    </code>
                  </div>
                </td>
                <td className="py-4 px-4 text-right">
                  <span className={`text-sm font-extrabold tabular-nums ${idx === steps.length - 1 ? 'text-primary' : 'text-foreground'}`}>
                    {fmt(step.resultado)} {step.unidade}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
