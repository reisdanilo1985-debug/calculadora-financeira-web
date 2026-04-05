import React, { useState, useMemo } from 'react';
import { Download, Landmark, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { getPtaxSummary, PtaxSummaryData } from '@/lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

const PTAX_LATAM = ['ARS', 'CLP', 'MXN', 'COP', 'PEN', 'UYU', 'PYG'];
const PTAX_MAJORS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CNY', 'AUD', 'CAD'];

// Identidade visual mantendo paleta emerald/primary da aplicação
const COLORS: Record<string, string> = {
  USD: '#10b981', // primary/emerald
  EUR: '#3b82f6', // blue
  GBP: '#8b5cf6', // violet
  JPY: '#f43f5e', // rose
  CHF: '#f59e0b', // amber
  CNY: '#ef4444', // red
  ARS: '#60a5fa', 
  CLP: '#ef4444', 
  MXN: '#22c55e', 
  COP: '#facc15', 
  PEN: '#ef4444', 
  UYU: '#3b82f6', 
  PYG: '#ef4444', 
};

export function PtaxPanel() {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('USD');
  const [bulletin, setBulletin] = useState('Fechamento');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<PtaxSummaryData | null>(null);

  const handleFetch = async () => {
    if (startDate >= endDate) {
      setError('Data inicial deve ser anterior à final.');
      return;
    }
    
    setError('');
    setLoading(true);
    try {
      const data = await getPtaxSummary(currency, startDate, endDate, bulletin);
      setSummary(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Erro ao buscar dados do PTAX da base Olinda do BCB.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!summary || summary.quotes.length === 0) return;
    
    const headers = ['Data', 'Boletim', 'Compra', 'Venda'];
    if (summary.quotes[0].buyParity !== undefined) headers.push('Paridade Compra', 'Paridade Venda');
    
    const csvContent = [
      headers.join(';'),
      ...summary.quotes.map(q => {
        const row = [
          new Date(q.date).toISOString().slice(0, 10).split('-').reverse().join('/'),
          q.bulletinType,
          q.buyRate.toString().replace('.', ','),
          q.sellRate.toString().replace('.', ','),
        ];
        if (q.buyParity !== undefined) row.push(q.buyParity.toString().replace('.', ','), q.sellParity!.toString().replace('.', ','));
        return row.join(';');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ptax_bcb_${currency}_${bulletin}_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = useMemo(() => {
    if (!summary) return [];
    return summary.quotes.map(q => ({
      date: new Date(q.date).toISOString().slice(0, 10).split('-').reverse().slice(0, 2).join('/'),
      fullDate: q.date,
      compra: q.buyRate,
      venda: q.sellRate
    }));
  }, [summary]);

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] max-w-[1600px] mx-auto w-full">
      {/* Sidebar: Form */}
      <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm glass-panel mb-0 rounded-none border-y-0 border-l-0 p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
          <Landmark className="h-5 w-5 text-primary" />
          Câmbio PTAX Oficial
        </h2>
        <p className="text-xs text-muted-foreground mb-6">
          Consulte cotações oficiais de compra e venda extraídas diretamente da API Olinda do Banco Central do Brasil.
        </p>
        
        <div className="space-y-5">
          <div className="space-y-1.5">
             <Label>Moeda da Conversão</Label>
             <select
               value={currency}
               onChange={e => setCurrency(e.target.value)}
               className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
             >
               <optgroup label="Principais PTAX">
                 {PTAX_MAJORS.map(c => <option key={c} value={c}>{c}</option>)}
               </optgroup>
               <optgroup label="América Latina">
                 {PTAX_LATAM.map(c => <option key={c} value={c}>{c}</option>)}
               </optgroup>
             </select>
          </div>
          
          <div className="space-y-1.5">
             <Label>Tipo de Boletim PTAX</Label>
             <select
               value={bulletin}
               onChange={e => setBulletin(e.target.value)}
               className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
             >
               <option value="Fechamento">Fechamento Oficial (Padrão)</option>
               <option value="Abertura">Abertura</option>
               <option value="Intermediário">Boletim Intermediário</option>
               <option value="Todos">Todos os Boletins no Dia</option>
             </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data Inicial</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data Final</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded border border-destructive/20">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button onClick={handleFetch} disabled={loading} className="w-full">
            {loading ? 'Consultando Olinda BCB...' : 'Extrair PTAX'}
          </Button>
        </div>
      </aside>

      {/* Main Content: Results */}
      <section className="overflow-y-auto p-6 space-y-6">
        {!summary ? (
          <div className="h-full flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
            <div className="rounded-full bg-primary/10 border border-primary/20 p-5">
              <Landmark className="h-10 w-10 text-primary/60" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground/80">Monitor PTAX</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Selecione uma moeda e o período para verificar a paridade e a variação da PTAX oficial no painel.
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                Dossiê PTAX - {summary.currency} ({summary.bulletinType})
              </h3>
              <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="gap-2">
                <Download className="h-4 w-4" />
                Baixar Histórico Completo
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass-card ring-1 ring-primary/20">
                <CardHeader className="py-3 pb-0">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Último Valor</CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{new Date(summary.lastQuoteDate).toISOString().slice(0, 10).split('-').reverse().join('/')}</p>
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-xs text-muted-foreground">Compra:</span>
                      <span className="font-mono text-base font-medium">R$ {summary.lastQuoteBuy.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Venda:</span>
                      <span className="font-mono text-base font-medium text-primary">R$ {summary.lastQuoteSell.toFixed(4)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="py-3 pb-0">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Média no Período</CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1 pt-4">
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-xs text-muted-foreground">Média Compra:</span>
                      <span className="font-mono text-sm">R$ {summary.averageBuyRate.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Média Venda:</span>
                      <span className="font-mono text-sm">R$ {summary.averageSellRate.toFixed(4)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="py-3 pb-0">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Extremos</CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1 pt-4">
                    <div className="flex justify-between items-baseline pt-1 group" title={new Date(summary.minSellDate).toISOString().slice(0,10)}>
                      <span className="text-xs text-muted-foreground">Mínima (V):</span>
                      <span className="font-mono text-sm">R$ {summary.minSellRate.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between items-baseline group" title={new Date(summary.maxSellDate).toISOString().slice(0,10)}>
                      <span className="text-xs text-muted-foreground">Máxima (V):</span>
                      <span className="font-mono text-sm text-rose-500">R$ {summary.maxSellRate.toFixed(4)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="py-3 pb-0">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Volume e Base</CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1 pt-4">
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-xs text-muted-foreground">Dias Comerciais:</span>
                      <span className="font-mono text-sm font-medium text-emerald-400">{summary.businessDays}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Qtd. Registros:</span>
                      <span className="font-mono text-sm">{summary.quotes.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {chartData.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Gráfico Comparativo PTAX (Compra x Venda)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/50" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="currentColor" 
                          className="text-muted-foreground text-xs" 
                          tickLine={false} 
                          axisLine={false}
                          minTickGap={30}
                        />
                        <YAxis 
                          stroke="currentColor" 
                          className="text-muted-foreground text-xs" 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(val) => `R$ ${val.toFixed(2)}`}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                          formatter={(value: number, name: string) => [`R$ ${value.toFixed(4)}`, name === 'compra' ? 'Compra' : 'Venda']}
                          labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '4px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Line
                          type="monotone"
                          dataKey="compra"
                          name="Compra"
                          stroke={'#3b82f6'}
                          strokeOpacity={0.8}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="venda"
                          name="Venda"
                          stroke={'#10b981'}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
