import React from 'react';
import { ArrowRight, PlayCircle, ShieldCheck } from 'lucide-react';

interface HeroSectionProps {
  onNavigate: (view: string) => void;
  onSeeDemo: () => void;
}

/** Seção de abertura: badge de credibilidade, headline com gradiente e CTA duplo. */
export function HeroSection({ onNavigate, onSeeDemo }: HeroSectionProps) {
  return (
    <section className="relative w-full pt-24 pb-16 px-6 flex flex-col items-center justify-center text-center z-10">
      {/* Grid pattern de fundo */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      <div className="relative inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6 animate-fade-in">
        <ShieldCheck className="h-4 w-4" />
        <span>Dados Oficiais BCB · ANBIMA · FRED &nbsp;·&nbsp; Precisão Decimal de 28 dígitos</span>
      </div>

      <h1 className="relative text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight text-foreground max-w-4xl mb-6 leading-tight animate-fade-in">
        O terminal financeiro para{' '}
        <span className="text-gradient-primary">correção, tesouraria e câmbio</span>
      </h1>

      <p className="relative text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed font-light animate-fade-in">
        Atualização monetária com memorial auditável, 13 calculadoras de tesouraria,
        PTAX oficial, WACC Damodaran e simulação de aposentadoria — em um único lugar.
      </p>

      <div className="relative flex flex-col sm:flex-row gap-4 items-center justify-center w-full animate-fade-in">
        <button
          onClick={() => onNavigate('calculadora')}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3.5 rounded-lg transition-all w-full sm:w-auto shadow-[0_0_20px_rgba(45,212,191,0.3)] hover:shadow-[0_0_30px_rgba(45,212,191,0.5)] hover:-translate-y-0.5 animate-pulse-glow"
        >
          Acessar Terminal
          <ArrowRight className="h-4 w-4" />
        </button>

        <button
          onClick={onSeeDemo}
          className="flex items-center justify-center gap-2 bg-card hover:bg-card/80 border border-white/10 text-foreground font-medium px-8 py-3.5 rounded-lg transition-all w-full sm:w-auto hover:-translate-y-0.5"
        >
          <PlayCircle className="h-4 w-4 text-muted-foreground" />
          Ver demonstração
        </button>
      </div>
    </section>
  );
}
