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

/** Item de sensibilidade devolvido pelo motor (POST /api/wacc/calcular → `sensibilidade`). */
interface WaccSensibilidadeItem {
  id: 'rf' | 'erp' | 'beta' | 'kd' | 'ir' | 'de';
  premissa: string;
  choque: string;
  waccChocado: number | null;
  deltaWaccPP: number | null;
  decomposicao?: { viaCustoDivida: number; viaBeta: number };
  descricao: string;
}

interface WaccResultProps {
  result: WaccResultType & { sensibilidade?: WaccSensibilidadeItem[] };
  request: WaccRequest;
}

/** Rótulo curto de cada choque, no estilo dos cartões. */
const ROTULO_CHOQUE: Record<WaccSensibilidadeItem['id'], string> = {
  beta: 'Se Beta subir +10%',
  rf: 'Se Rf subir +1,0 p.p.',
  erp: 'Se ERP subir +1,0 p.p.',
  kd: 'Se Kd (antes do IR) subir +1,0 p.p.',
  ir: 'Se IR subir +1,0 p.p.',
  de: 'Se D/E subir +10%',
};
const ORDEM_CHOQUES: WaccSensibilidadeItem['id'][] = ['beta', 'rf', 'erp', 'kd', 'ir', 'de'];

export function WaccResult({ result, request }: WaccResultProps) {
  const fmt = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',');
  const fmtPct = (v: number) => `${fmt(v)}%`;
  const fmtCurr = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: request.moeda }).format(v);
  /** Variação em p.p. com sinal; "−0,00" vira "0,00". */
  const fmtPP = (v: number) => {
    const arred = Math.round(v * 100) / 100;
    if (arred === 0) return '0,00 p.p.';
    return `${arred > 0 ? '+' : '−'}${fmt(Math.abs(arred))} p.p.`;
  };
  const sensibilidade = ORDEM_CHOQUES
    .map(id => result.sensibilidade?.find(s => s.id === id))
    .filter((s): s is WaccSensibilidadeItem => !!s);

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

      {/* ── Análise de Sensibilidade (calculada pelo motor, em p.p.) ── */}
      <Card className="glass-card border-emerald-500/10">
        <CardHeader className="py-3 border-b border-white/10 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-400/80">
            <AlertCircle className="h-4 w-4" />
            Análise de Sensibilidade
          </CardTitle>
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest bg-white/5 px-2 py-0.5 rounded">Fase 1</span>
        </CardHeader>
        <CardContent className="pt-4 py-4 px-4 text-center">
           <p className="text-xs text-muted-foreground mb-4">Como o WACC varia com um choque isolado em cada premissa (WACC recalculado, em pontos percentuais)</p>
           {sensibilidade.length > 0 ? (
             <div className="grid grid-cols-2 gap-4">
                {sensibilidade.map(s => (
                  <div key={s.id} className="bg-white/5 p-4 rounded-lg flex flex-col gap-2" title={s.descricao}>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{ROTULO_CHOQUE[s.id]}</span>
                    <span className={`text-lg font-bold ${s.deltaWaccPP !== null && s.deltaWaccPP < 0 ? 'text-emerald-400' : 'text-rose-400/80'}`}>
                      {s.deltaWaccPP === null ? '—' : `${fmtPP(s.deltaWaccPP)} no WACC`}
                    </span>
                    {s.id === 'ir' && s.decomposicao && (
                      <span className="text-[10px] text-muted-foreground">
                        {fmtPP(s.decomposicao.viaCustoDivida)} via Kd · {fmtPP(s.decomposicao.viaBeta)} via β realavancado
                      </span>
                    )}
                  </div>
                ))}
             </div>
           ) : (
             <p className="text-xs text-muted-foreground">Sensibilidade indisponível para este cálculo.</p>
           )}
           <p className="text-[9px] text-muted-foreground italic mt-4 uppercase tracking-tighter">* Demais premissas constantes. Beta +10% sobre o beta alavancado; IR inclui a realavancagem do beta; D/E +10% com V = E + D constante e Kd inalterado.</p>
        </CardContent>
      </Card>
    </div>
  );
}
