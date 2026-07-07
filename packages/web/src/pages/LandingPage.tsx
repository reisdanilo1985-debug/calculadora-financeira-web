import React, { useRef } from 'react';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { LiveTickerBar } from '@/components/dashboard/LiveTickerBar';
import { HeroSection } from '@/components/landing/HeroSection';
import { TerminalPreview } from '@/components/landing/TerminalPreview';
import { QuickCalcWidget } from '@/components/landing/QuickCalcWidget';
import { StatsBar } from '@/components/landing/StatsBar';
import { FeatureShowcase } from '@/components/landing/FeatureShowcase';
import { PersonaSection } from '@/components/landing/PersonaSection';
import { DataSourcesSection } from '@/components/landing/DataSourcesSection';
import { FinalCTASection } from '@/components/landing/FinalCTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';

const NAV_LINKS = [
  { label: 'Funcionalidades', anchor: 'funcionalidades' },
  { label: 'Casos de uso', anchor: 'casos-de-uso' },
  { label: 'Fontes', anchor: 'fontes' },
];

interface LandingPageProps {
  onNavigate: (view: string) => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const demoRef = useRef<HTMLDivElement>(null);

  const scrollToAnchor = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* ── Background decorativo ── */}
      <div className="fixed top-[-10%] right-[-5%] w-[800px] h-[800px] bg-primary/5 rounded-full blur-[150px] pointer-events-none mix-blend-screen animate-float" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />

      {/* ── Cabeçalho: ticker real + navbar da landing ── */}
      <div className="sticky top-0 z-50 bg-background" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <LiveTickerBar />
        <header className="border-b border-white/5 bg-background/80 backdrop-blur-xl">
          <div className="max-w-[1200px] mx-auto h-16 flex items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2.5 min-w-0">
              <TrendingUp className="h-5 w-5 text-primary shrink-0" />
              <span className="font-bold text-base sm:text-lg text-foreground tracking-tight truncate">
                Correção Financeira
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-7">
              {NAV_LINKS.map(link => (
                <button
                  key={link.anchor}
                  onClick={() => scrollToAnchor(link.anchor)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            <button
              onClick={() => onNavigate('calculadora')}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg transition-all"
            >
              Acessar Terminal
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>
      </div>

      {/* ── Conteúdo ── */}
      <main className="flex-1 flex flex-col relative">
        <HeroSection
          onNavigate={onNavigate}
          onSeeDemo={() => demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />

        <div ref={demoRef}>
          <TerminalPreview />
        </div>

        <div className="w-full max-w-[1000px] mx-auto px-6 pb-20 z-10 relative">
          <QuickCalcWidget onNavigate={onNavigate} />
        </div>

        <StatsBar />
        <FeatureShowcase onNavigate={onNavigate} />
        <PersonaSection onNavigate={onNavigate} />
        <DataSourcesSection />
        <FinalCTASection onNavigate={onNavigate} />
      </main>

      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
}
