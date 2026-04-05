import React, { useState } from 'react';
import { RetirementForm } from './RetirementForm';
import { RetirementResult } from './RetirementResult';
import { runRetirementCalculation, RetirementRequest, RetirementResultData } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart2, Calculator, BrainCircuit } from 'lucide-react';

export function RetirementPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RetirementResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState('resultado');

  const handleCalculate = async (data: RetirementRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await runRetirementCalculation(data);
      setResult(res);
      setActiveSubTab('resultado');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao processar simulação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] max-w-[1600px] mx-auto w-full h-full">
      {/* ── Sidebar: Formulário ── */}
      <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm relative glass-panel mb-0 rounded-none border-y-0 border-l-0">
        <div className="p-5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold tracking-tight">Retirement Architect</h2>
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
          <RetirementForm onCalculate={handleCalculate} loading={loading} />
        </div>
      </aside>

      {/* ── Main: Resultados ── */}
      <section className="overflow-y-auto bg-transparent relative p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-sm">
            {error}
          </div>
        )}

        {result ? (
          <div className="space-y-6 max-w-4xl mx-auto">
            <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                <TabsList className="bg-white/5 border border-white/10 p-1 h-10">
                  <TabsTrigger value="resultado" className="text-xs gap-2 px-4 data-[state=active]:bg-primary/20">
                    <BarChart2 className="h-3.5 w-3.5" />
                    Simulação
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-4 px-2">
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-none">Sucesso</p>
                    <p className={`text-[11px] font-semibold ${result.probabilidadeSucesso >= 85 ? 'text-emerald-400' : result.probabilidadeSucesso >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {result.probabilidadeSucesso.toFixed(0)}% das simulações
                    </p>
                  </div>
                </div>
              </div>

              <TabsContent value="resultado" className="mt-0 focus-visible:outline-none">
                <RetirementResult result={result} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
            <div className="rounded-full bg-primary/10 border border-primary/20 p-6">
              <BrainCircuit className="h-12 w-12 text-primary/60" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground/80 tracking-tight">Retirement Architect</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
                Simule seu plano de aposentadoria com Monte Carlo, INSS (EC 103/2019),
                PGBL/VGBL e inflação médica. Preencha os dados e clique em{' '}
                <span className="text-primary font-medium">Simular Aposentadoria</span>.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4 opacity-60">
              <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">Monte Carlo</span>
              <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">EC 103/2019</span>
              <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">PGBL/VGBL</span>
              <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">Inflação Médica</span>
              <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">Perfis de Risco</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
