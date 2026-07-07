import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useInView } from '@/hooks/useInView';

interface FinalCTASectionProps {
  onNavigate: (view: string) => void;
}

/** Bloco de fechamento com CTA principal. */
export function FinalCTASection({ onNavigate }: FinalCTASectionProps) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);

  return (
    <section className="w-full py-24 z-10 relative overflow-hidden">
      {/* Gradiente radial de fundo */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,hsl(158_64%_52%/0.08),transparent)] pointer-events-none" />

      <div
        ref={ref}
        className={`relative max-w-[700px] mx-auto px-6 text-center animate-on-scroll ${inView ? 'in-view' : ''}`}
      >
        <h2 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4 leading-tight">
          Precisão de centavos.
          <br />
          <span className="text-gradient-primary">Memorial de auditoria.</span>
        </h2>
        <p className="text-muted-foreground mb-8">
          Comece agora — sem cadastro, direto no navegador.
        </p>
        <button
          onClick={() => onNavigate('calculadora')}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-10 py-4 rounded-lg text-lg transition-all shadow-[0_0_25px_rgba(45,212,191,0.35)] hover:shadow-[0_0_40px_rgba(45,212,191,0.55)] hover:-translate-y-0.5"
        >
          Acessar Terminal
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
