import React from 'react';
import { ArrowRight, Briefcase, FileSpreadsheet, Scale } from 'lucide-react';
import { useInView } from '@/hooks/useInView';

const PERSONAS = [
  {
    icon: FileSpreadsheet,
    color: 'text-emerald-400',
    title: 'Contadores e Peritos',
    subtitle: 'Memorial que sustenta o laudo',
    bullets: [
      'Memorial de cálculo dia a dia com fator diário BACEN',
      'Exportação em Excel e PDF prontos para anexar',
      'Rastreabilidade completa: série SGS, data e taxa de cada linha',
      'Amortizações e aportes no meio do período',
    ],
    cta: 'Abrir Calculadora',
    view: 'calculadora',
  },
  {
    icon: Briefcase,
    color: 'text-amber-400',
    title: 'Tesoureiros e CFOs',
    subtitle: 'A mesa de operações completa',
    bullets: [
      '13 calculadoras: swap, duration, PU de títulos, NDF',
      'Curvas DI e cupom cambial com premissas ao vivo',
      'WACC com betas setoriais Damodaran (NYU Stern)',
      'Hedge cambial com PTAX oficial e paridade coberta',
    ],
    cta: 'Abrir Tesouraria',
    view: 'tesouraria',
  },
  {
    icon: Scale,
    color: 'text-cyan-400',
    title: 'Advogados e Jurídico',
    subtitle: 'Teses de cálculo prontas',
    bullets: [
      'Cinco teses: correção simples, valor presente, carência…',
      'Juros remuneratórios simples ou compostos',
      'Fluxos SAC, Price e Bullet para contratos de crédito',
      'Comparador de cenários para estratégia processual',
    ],
    cta: 'Ver teses de cálculo',
    view: 'calculadora',
  },
];

interface PersonaSectionProps {
  onNavigate: (view: string) => void;
}

/** Casos de uso por persona: contador/perito, tesoureiro/CFO, advogado. */
export function PersonaSection({ onNavigate }: PersonaSectionProps) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);

  return (
    <section id="casos-de-uso" className="w-full border-t border-white/5 bg-black/20 py-20 z-10 relative">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground">Feito para o seu caso de uso</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Do memorial pericial à mesa de tesouraria
          </p>
        </div>

        <div
          ref={ref}
          className={`grid grid-cols-1 md:grid-cols-3 gap-6 animate-on-scroll ${inView ? 'in-view' : ''}`}
        >
          {PERSONAS.map(p => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="glass-card shine-on-hover rounded-xl p-7 flex flex-col">
                <div className={`inline-flex self-start p-3 rounded-xl bg-black/40 border border-white/5 mb-4 ${p.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{p.title}</h3>
                <p className="text-xs text-muted-foreground mb-4">{p.subtitle}</p>

                <ul className="space-y-2.5 flex-1">
                  {p.bullets.map(b => (
                    <li key={b} className="flex gap-2.5 text-sm text-muted-foreground leading-snug">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 bg-current ${p.color}`} />
                      {b}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => onNavigate(p.view)}
                  className="mt-6 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline self-start"
                >
                  {p.cta} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
