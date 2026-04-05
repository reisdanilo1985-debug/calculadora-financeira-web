import React, { useState } from 'react';
import { WaccForm } from './WaccForm';
import { WaccResult as WaccResultComp } from './WaccResult';
import { WaccMemory } from './WaccMemory';
import { 
  runWaccCalculation, 
  WaccRequest, 
  WaccResult as WaccResultType 
} from '@/lib/api';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Calculator, 
  ListChecks, 
  History, 
  BarChart2, 
  HelpCircle 
} from 'lucide-react';

export function WaccPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WaccResultType | null>(null);
  const [lastRequest, setLastRequest] = useState<WaccRequest | null>(null);
  const [activeSubTab, setActiveSubTab] = useState('resultado');

  const handleCalculate = async (data: WaccRequest) => {
    setLoading(true);
    try {
      const res = await runWaccCalculation(data);
      setResult(res);
      setLastRequest(data);
      setActiveSubTab('resultado');
    } catch (err) {
      console.error('Falha no cálculo WACC:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] max-w-[1600px] mx-auto w-full h-full">
      {/* ── Sidebar: Formulário ── */}
      <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm relative glass-panel mb-0 rounded-none border-y-0 border-l-0">
        <div className="p-5">
           <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold tracking-tight">Cálculo de WACC</h2>
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
          <WaccForm onCalculate={handleCalculate} loading={loading} />
        </div>
      </aside>

      {/* ── Main: Resultados e Memorial ── */}
      <section className="overflow-y-auto bg-transparent relative p-6">
        {result && lastRequest ? (
          <div className="space-y-6 max-w-4xl mx-auto">
            <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                 <TabsList className="bg-white/5 border border-white/10 p-1 h-10">
                  <TabsTrigger value="resultado" className="text-xs gap-2 px-4 data-[state=active]:bg-primary/20">
                    <BarChart2 className="h-3.5 w-3.5" />
                    Resultado Final
                  </TabsTrigger>
                  <TabsTrigger value="memorial" className="text-xs gap-2 px-4 data-[state=active]:bg-primary/20">
                    <History className="h-3.5 w-3.5" />
                    Memorial de Cálculo
                  </TabsTrigger>
                </TabsList>
                
                <div className="flex items-center gap-4 px-2">
                   <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-none">Status</p>
                    <p className="text-[11px] font-semibold text-emerald-400">Padrão Damodaran OK</p>
                   </div>
                </div>
              </div>

              <TabsContent value="resultado" className="mt-0 focus-visible:outline-none">
                <WaccResultComp result={result} request={lastRequest} />
              </TabsContent>

              <TabsContent value="memorial" className="mt-0 focus-visible:outline-none">
                <WaccMemory steps={result.memorial} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
            <div className="rounded-full bg-primary/10 border border-primary/20 p-6">
              <Calculator className="h-12 w-12 text-primary/60" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground/80 tracking-tight">Módulo WACC (CMPC)</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
                Determine o custo do capital próprio e o custo da dívida de mercado. 
                Preencha os parâmetros e clique em <span className="text-primary font-medium">Calcular WACC</span>.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4 opacity-60">
               <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">β Hamada</span>
               <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">CAPM + CRP</span>
               <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">Tax Shield</span>
               <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">Market Values</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
