import React from 'react';
import { TrendingUp } from 'lucide-react';

const MODULES = [
  { label: 'Calculadora de Correção', view: 'calculadora' },
  { label: 'Comparador de Cenários', view: 'comparador' },
  { label: 'Central de Câmbio', view: 'cambio' },
  { label: 'PTAX BCB', view: 'ptax' },
  { label: 'Tesouraria', view: 'tesouraria' },
  { label: 'WACC', view: 'wacc' },
  { label: 'Aposentadoria', view: 'aposentadoria' },
];

const SOURCES = [
  'BCB SGS (CDI, Selic, IPCA, IGP-M, INCC)',
  'BCB Olinda (PTAX)',
  'FRED St. Louis (SOFR)',
  'ANBIMA (ETTJ)',
  'Damodaran / NYU Stern (betas)',
];

interface LandingFooterProps {
  onNavigate: (view: string) => void;
}

export function LandingFooter({ onNavigate }: LandingFooterProps) {
  return (
    <footer className="w-full border-t border-white/5 bg-black/40 py-12 z-10 relative">
      <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground">Correção Financeira</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
            Terminal profissional de correção monetária, tesouraria e câmbio.
            Cálculos com aritmética decimal de precisão estendida e dados de
            fontes oficiais.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Módulos
          </p>
          <ul className="space-y-1.5">
            {MODULES.map(m => (
              <li key={m.view + m.label}>
                <button
                  onClick={() => onNavigate(m.view)}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Fontes de dados
          </p>
          <ul className="space-y-1.5">
            {SOURCES.map(s => (
              <li key={s} className="text-sm text-muted-foreground">{s}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 mt-10 pt-6 border-t border-white/5">
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
          Os cálculos desta plataforma seguem as convenções de mercado brasileiras
          (base 252 dias úteis, pro-rata de índices mensais, convenção CETIP/B3 para
          percentual do CDI). Resultados têm caráter informativo e não constituem
          recomendação de investimento.
        </p>
      </div>
    </footer>
  );
}
