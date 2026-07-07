import React from 'react';
import { BarChart2, Database, Globe, LineChart, TrendingUp } from 'lucide-react';

const SOURCES = [
  { icon: Database, name: 'Banco Central do Brasil', detail: 'Séries SGS' },
  { icon: BarChart2, name: 'BCB Olinda', detail: 'PTAX oficial' },
  { icon: TrendingUp, name: 'IBGE / FGV', detail: 'IPCA · IGP-M · INCC' },
  { icon: LineChart, name: 'ANBIMA', detail: 'Curva ETTJ' },
  { icon: Globe, name: 'FRED St. Louis', detail: 'SOFR' },
  { icon: Globe, name: 'Yahoo Finance', detail: 'Mercados globais' },
];

/** Badges das fontes oficiais integradas — todas realmente consultadas pelo backend. */
export function DataSourcesSection() {
  return (
    <section id="fontes" className="w-full border-t border-white/5 bg-black/40 py-16 z-10 relative">
      <div className="max-w-[1200px] mx-auto px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Fontes de Dados Integradas
        </p>
        <p className="text-sm text-muted-foreground/70 mb-10">
          Consulta direta às APIs oficiais — sem intermediários
        </p>

        <div className="flex flex-wrap justify-center items-stretch gap-4">
          {SOURCES.map(s => {
            const Icon = s.icon;
            return (
              <div
                key={s.name}
                className="flex items-center gap-3 px-5 py-3 rounded-lg border border-white/10 bg-white/[0.02] opacity-70 hover:opacity-100 hover:border-primary/30 transition-all"
              >
                <Icon className="h-5 w-5 text-primary/70" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground leading-tight">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
