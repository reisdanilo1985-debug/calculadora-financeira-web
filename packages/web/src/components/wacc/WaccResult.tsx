import React from 'react';
import { 
  WaccResult as WaccResultType, 
  WaccRequest 
} from '@/lib/api';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  TrendingUp, 
  Coins, 
  BarChart3, 
  Percent, 
  Scale,
  AlertCircle
} from 'lucide-react';

interface WaccResultProps {
  result: WaccResultType;
  request: WaccRequest;
}

export function WaccResult({ result, request }: WaccResultProps) {
  const fmt = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',');
  const fmtPct = (v: number) => `${fmt(v)}%`;
  const fmtCurr = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: request.moeda }).format(v);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Card Principal: WACC ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card border-primary/30 bg-primary/5 col-span-1 md:col-span-3">
          <CardContent className="pt-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                <Percent className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Custo Médio Ponderado de Capital</h3>
                <div className="flex items-baseline gap-2">
                   <h2 className="text-4xl font-extrabold text-foreground tracking-tighter">
                    {fmtPct(result.wacc)}
                  </h2>
                  <span className="text-primary font-semibold">WACC</span>
                </div>
              </div>
            </div>
            
            <div className="h-px w-full md:h-12 md:w-px bg-white/10" />

            <div className="flex gap-8">
              <div className="text-center md:text-left">
                <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Custo do Equity (Ke)</p>
                <p className="text-xl font-bold text-emerald-400">{fmtPct(result.custoEquity)}</p>
              </div>
              <div className="text-center md:text-left">
                <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Custo da Dívida (Kd)</p>
                <p className="text-xl font-bold text-rose-400">{fmtPct(result.custoDividaAfterTax)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Cards de Detalhes ── */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground tracking-widest uppercase">
              <Scale className="h-4 w-4 text-blue-400" />
              Estrutura de Capital
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Market Cap (Equity)</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{fmtCurr(request.marketCap)}</span>
                <span className="text-sm text-blue-400 font-bold">{fmtPct(result.pesoEquity)}</span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden flex">
              <div className="h-full bg-blue-400" style={{ width: `${result.pesoEquity}%` }} />
              <div className="h-full bg-rose-400" style={{ width: `${result.pesoDivida}%` }} />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Dívida Bruta (Mercado)</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{fmtCurr(request.dividaBruta)}</span>
                <span className="text-sm text-rose-400 font-bold">{fmtPct(result.pesoDivida)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground tracking-widest uppercase">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Premissas de Risco
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
             <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs text-muted-foreground">Beta Alavancado (β)</span>
              <span className="text-sm font-semibold text-foreground">{fmt(result.betaAlavancado, 4)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs text-muted-foreground">Taxa Livre de Risco (Rf)</span>
              <span className="text-sm font-semibold text-foreground">{fmtPct(request.taxaLivreDeRisco)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Risk Premium (ERP+CRP)</span>
              <span className="text-sm font-semibold text-foreground">{fmtPct(request.premioRiscoMercado + request.premioRiscoPais)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground tracking-widest uppercase">
              <BarChart3 className="h-4 w-4 text-violet-400" />
              Impacto Fiscal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs text-muted-foreground">Alíquota de IR Efetiva</span>
              <span className="text-sm font-semibold text-foreground">{fmtPct(request.aliquotaIR)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs text-muted-foreground">Benefício Fiscal (VPD)</span>
              <span className="text-sm font-semibold text-emerald-400">-{fmtPct(request.custoDividaPreTax - result.custoDividaAfterTax)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Valor Firma (V)</span>
              <span className="text-sm font-semibold text-foreground">{fmtCurr(result.valorTotalFirma)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabela de Sensibilidade (Simplificada Fase 1) ── */}
      <Card className="glass-card border-emerald-500/10">
        <CardHeader className="py-3 border-b border-white/10 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-400/80">
            <AlertCircle className="h-4 w-4" />
            Análise de Sensibilidade
          </CardTitle>
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest bg-white/5 px-2 py-0.5 rounded">Fase 1</span>
        </CardHeader>
        <CardContent className="pt-4 py-4 px-4 text-center">
           <p className="text-xs text-muted-foreground mb-4">Como o WACC varia com a mudança do Beta (β) e do ERP</p>
           <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-4 rounded-lg flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Se Beta subir +10%</span>
                <span className="text-lg font-bold text-rose-400/80">+{fmt(result.wacc * 0.05)}% no WACC</span>
              </div>
              <div className="bg-white/5 p-4 rounded-lg flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Se Rf subir +1.0pp</span>
                <span className="text-lg font-bold text-rose-400/80">+{fmt(result.pesoEquity)}pp no WACC</span>
              </div>
           </div>
           <p className="text-[9px] text-muted-foreground italic mt-4 uppercase tracking-tighter">* Matriz completa 5x5 disponível na versão Premium.</p>
        </CardContent>
      </Card>
    </div>
  );
}
