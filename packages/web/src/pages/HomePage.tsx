import React, { useState } from 'react';
import { BarChart3, Settings, TrendingUp, ShieldCheck, Database, Globe, HelpCircle, X, BarChart2, GitCompare } from 'lucide-react';
import { CalculatorForm } from '@/components/calculator/CalculatorForm';
import { ResultsSummary } from '@/components/results/ResultsSummary';
import { EvolutionChart } from '@/components/results/EvolutionChart';
import { MemoryTable } from '@/components/results/MemoryTable';
import { ExportButtons } from '@/components/results/ExportButtons';
import { FullFlowTable } from '@/components/results/FullFlowTable';
import { ComparadorForm } from '@/components/comparador/ComparadorForm';
import { ComparadorResult } from '@/components/comparador/ComparadorResult';
import { IndexAdmin } from '@/components/admin/IndexAdmin';
import { ExchangePanel } from '@/components/exchange/ExchangePanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalculationResult, CompareResult } from '@/lib/api';
import { LandingPage } from './LandingPage';
import { LiveTickerBar } from '@/components/dashboard/LiveTickerBar';

const HELP_STEPS = [
  { step: '1', text: 'Selecione o indexador de correção (CDI, IPCA, Selic…)' },
  { step: '2', text: 'Informe o montante inicial e o período (ou use os atalhos YTD / 12M / 24M)' },
  { step: '3', text: 'Escolha a base de cálculo: 252 d.u., 360 ou 365 d.c.' },
  { step: '4', text: 'Opcionalmente configure spread ou amortizações' },
  { step: '5', text: 'Para períodos futuros, informe premissas dos índices' },
  { step: '6', text: 'Clique em "Calcular Correção" para ver o resultado' },
];

const INDEX_REFS = [
  { label: 'CDI', desc: 'Série 12 · 252 d.u.', color: 'text-blue-400' },
  { label: 'IPCA', desc: 'Série 433 · Mensal', color: 'text-emerald-400' },
  { label: 'IGP-M', desc: 'Série 189 · Mensal', color: 'text-violet-400' },
  { label: 'INCC', desc: 'Série 192 · Mensal', color: 'text-orange-400' },
  { label: 'Selic', desc: 'Série 1178 · 252 d.u.', color: 'text-cyan-400' },
  { label: 'SOFR', desc: 'FRED · ACT/360', color: 'text-rose-400' },
];

function EmptyResultsPanel({ onHelp }: { onHelp: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
      <div className="rounded-full bg-primary/10 border border-primary/20 p-5">
        <BarChart2 className="h-10 w-10 text-primary/60" />
      </div>
      <div>
        <p className="text-base font-medium text-foreground/80">Nenhum cálculo realizado</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Preencha os parâmetros ao lado e clique em{' '}
          <span className="text-primary font-medium">Calcular Correção</span> para ver os resultados aqui.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 w-full max-w-sm">
        {INDEX_REFS.map(idx => (
          <div key={idx.label} className="rounded border border-border bg-card/60 px-3 py-2 card-hover cursor-default">
            <div className={`font-semibold text-sm tabular-nums ${idx.color}`}>{idx.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{idx.desc}</div>
          </div>
        ))}
      </div>
      <button
        onClick={onHelp}
        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Ver instruções de uso
      </button>
    </div>
  );
}

function HelpPopover({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute top-12 right-4 z-50 w-80 rounded-lg border border-border bg-popover shadow-xl animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Como usar</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-2.5">
        {HELP_STEPS.map(({ step, text }) => (
          <div key={step} className="flex gap-3 text-sm">
            <span className="shrink-0 h-5 w-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">
              {step}
            </span>
            <span className="text-muted-foreground">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [activeTab, setActiveTab] = useState('calculadora');
  const [showHelp, setShowHelp] = useState(false);
  const [view, setView] = useState<'landing' | 'app'>('landing');

  const handleResult = (r: CalculationResult) => {
    setResult(r);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* ── Background Decorativo ── */}
      <div className="fixed top-0 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-secondary/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />


      {/* ── Cabeçalho Fixo: Cotações + Navbar ── */}
      <div className="fixed top-0 left-0 right-0 z-50">
        {/* ── Cotações em Tempo Real (global) ── */}
        <LiveTickerBar />
      
        {/* ── Navbar Global ── */}
        <header className="border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto h-16 flex items-center justify-between px-6">
          <button onClick={() => setView('landing')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="font-bold text-lg text-foreground tracking-tight">Correção Financeira</span>
          </button>
          
          <nav className="hidden md:flex items-center gap-8">
            <button 
              onClick={() => { setView('app'); setActiveTab('calculadora'); }} 
              className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${view === 'app' && activeTab === 'calculadora' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Calculadora
            </button>
            <button 
              onClick={() => { setView('app'); setActiveTab('comparador'); }} 
              className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${view === 'app' && activeTab === 'comparador' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Comparador
            </button>
            <button 
              onClick={() => { setView('app'); setActiveTab('cambio'); }} 
              className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${view === 'app' && activeTab === 'cambio' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Câmbio
            </button>
            <button 
              onClick={() => { setView('app'); setActiveTab('indices'); }} 
              className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${view === 'app' && activeTab === 'indices' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Índices/Admin
            </button>
          </nav>
        </div>
      </header>
      </div>

      {/* ── Espaçador para compensar cabeçalho fixo (ticker 28px + navbar 64px) ── */}
      <div className="h-[92px] shrink-0" />

      {/* ── View Control ── */}
      {view === 'landing' ? (
        <LandingPage onNavigate={(tab) => { setView('app'); setActiveTab(tab); }} />
      ) : (
        <div className="flex-1 flex flex-col relative z-10 bg-black/20">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            
            {/* Tab: Calculadora */}
            <TabsContent value="calculadora" className="flex-1 m-0 data-[state=active]:flex flex-col">
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] max-w-[1600px] mx-auto w-full">
                <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm relative glass-panel mb-0 rounded-none border-y-0 border-l-0">
                  <div className="p-5 relative">
                    <div className="absolute top-5 right-5 z-10">
                      <button
                        onClick={() => setShowHelp(v => !v)}
                        title="Como usar"
                        className="text-muted-foreground hover:text-primary p-1 rounded transition-colors"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                      {showHelp && <HelpPopover onClose={() => setShowHelp(false)} />}
                    </div>
                    <CalculatorForm onResult={handleResult} />
                  </div>
                </aside>

                <section className="overflow-y-auto bg-transparent relative">
                  {result ? (
                    <div className="p-6 space-y-6 animate-slide-in-right">
                      <ResultsSummary result={result} />
                      <Card className="glass-card">
                        <CardHeader className="pb-3 border-b border-white/5">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground tracking-wide">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            Evolução do Saldo
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <EvolutionChart result={result} />
                        </CardContent>
                      </Card>

                      {result.thesisType === 'FLUXO_COMPLETO' && result.fullFlowResult ? (
                        <Card className="glass-card">
                          <CardHeader className="pb-3 border-b border-white/5">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground">Cronograma de Amortização</CardTitle>
                              <ExportButtons result={result} />
                            </div>
                          </CardHeader>
                          <CardContent className="pt-3">
                            <FullFlowTable result={result.fullFlowResult} />
                          </CardContent>
                        </Card>
                      ) : (
                        <Card className="glass-card">
                          <CardHeader className="pb-3 border-b border-white/5">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground">Memória de Cálculo</CardTitle>
                              <ExportButtons result={result} />
                            </div>
                          </CardHeader>
                          <CardContent className="pt-3">
                            <MemoryTable rows={result.memoryRows} indexType={result.indexType} />
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : (
                    <EmptyResultsPanel onHelp={() => setShowHelp(true)} />
                  )}
                </section>
              </div>
            </TabsContent>

            {/* Tab: Comparador */}
            <TabsContent value="comparador" className="flex-1 m-0 data-[state=active]:flex flex-col">
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] max-w-[1600px] mx-auto w-full">
                <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm relative glass-panel mb-0 rounded-none border-y-0 border-l-0">
                  <div className="p-5">
                    <ComparadorForm onResult={setCompareResult} />
                  </div>
                </aside>
                <section className="overflow-y-auto bg-transparent relative">
                  {compareResult ? (
                    <div className="p-6 space-y-6 animate-slide-in-right">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-base font-semibold">Comparação de Cenários</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {compareResult.scenarios.filter(s => !s.error).length} cenários calculados
                            · Montante base: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(compareResult.initialAmount)}
                          </p>
                        </div>
                      </div>
                      <ComparadorResult result={compareResult} />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
                      <div className="rounded-full bg-primary/10 border border-primary/20 p-5">
                        <GitCompare className="h-10 w-10 text-primary/60" />
                      </div>
                      <div>
                        <p className="text-base font-medium text-foreground/80">Nenhuma comparação realizada</p>
                        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                          Configure os cenários ao lado e clique em{' '}
                          <span className="text-primary font-medium">Comparar Cenários</span>.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </TabsContent>

            {/* Tab: Índices */}
            <TabsContent value="indices" className="m-0 p-6 max-w-[1600px] mx-auto w-full">
              <IndexAdmin />
            </TabsContent>

            {/* Tab: Câmbio */}
            <TabsContent value="cambio" className="flex-1 m-0 data-[state=active]:flex flex-col">
              <ExchangePanel />
            </TabsContent>

          </Tabs>
        </div>
      )}

      {/* Footer só aparece no app para economizar espaço visual na landing (opcional) */}
      {view === 'app' && (
        <footer className="border-t border-white/5 py-4 text-center bg-card/20 backdrop-blur-md relative z-10">
          <p className="text-[11px] text-muted-foreground">
            CDI · Selic · IPCA · IGP-M · INCC via{' '}
            <span className="text-primary font-medium">BCB SGS</span>
            {' · '}SOFR via <span className="text-primary font-medium">FRED</span>
          </p>
        </footer>
      )}
    </div>
  );
}
