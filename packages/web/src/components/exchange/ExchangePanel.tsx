import React, { useState } from 'react';
import { Download, TrendingUp, Globe, BarChart3, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { getExchangeRates, getExchangeSummary, ExchangeRateData, ExchangeSummaryData } from '@/lib/api';
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

const AVAILABLE_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CNY'];

const COLORS: Record<string, string> = {
  USD: '#10b981', // emerald
  EUR: '#3b82f6', // blue
  GBP: '#8b5cf6', // violet
  JPY: '#f43f5e', // rose
  CHF: '#f59e0b', // amber
  CNY: '#ef4444', // red
};

export function ExchangePanel() {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(['USD', 'EUR']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [rates, setRates] = useState<ExchangeRateData[] | null>(null);
  const [summaries, setSummaries] = useState<ExchangeSummaryData[] | null>(null);

  const toggleCurrency = (c: string) => {
    setSelectedCurrencies(prev => 
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  const handleFetch = async () => {
    if (selectedCurrencies.length === 0) {
      setError('Selecione pelo menos uma moeda.');
      return;
    }
    if (startDate >= endDate) {
      setError('Data inicial deve ser anterior à final.');
      return;
    }
    
    setError('');
    setLoading(true);
    try {
      const summaryData = await getExchangeSummary(selectedCurrencies, startDate, endDate);
      const ratesData = await getExchangeRates(selectedCurrencies, startDate, endDate);
      
      setSummaries(summaryData);
      setRates(ratesData);
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar taxas de câmbio');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!rates || rates.length === 0) return;

    // Build cross-tab data (merged by date)
    const dateMap = new Map<string, any>();
    
    // Initialize all found dates
    rates.forEach(cr => {
      cr.data.forEach(d => {
        if (!dateMap.has(d.date)) {
          dateMap.set(d.date, { date: d.date });
        }
        dateMap.get(d.date)[cr.currency] = d.sellValue;
      });
    });

    const rows = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    
    if (rows.length === 0) return;

    const headers = ['Data', ...selectedCurrencies];
    const csvContent = [
      headers.join(';'),
      ...rows.map(row => {
        return [
          row.date.split('-').reverse().join('/'),
          ...selectedCurrencies.map(c => row[c] !== undefined ? row[c].toString().replace('.', ',') : '')
        ].join(';');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cambio_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Convert separate rate streams into a single list for Recharts
  const chartData = React.useMemo(() => {
    if (!rates) return [];
    const map = new Map<string, any>();
    rates.forEach(cr => {
      cr.data.forEach(d => {
        if (!map.has(d.date)) {
          map.set(d.date, {
            date: d.date.split('-').reverse().slice(0, 2).join('/'),
            fullDate: d.date
          });
        }
        map.get(d.date)[cr.currency] = d.sellValue;
      });
    });
    return Array.from(map.values()).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [rates]);

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] max-w-[1600px] mx-auto w-full">
      {/* Sidebar: Form */}
      <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm glass-panel mb-0 rounded-none border-y-0 border-l-0 p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
          <Globe className="h-5 w-5 text-primary" />
          Central de Câmbio
        </h2>
        <p className="text-xs text-muted-foreground mb-6">Consulte limites, médias e faça o download histórico de moedas oficiais.</p>
        
        <div className="space-y-5">
          <div className="space-y-3">
            <Label>Moedas Opcionais (vs BRL)</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_CURRENCIES.map(c => (
                <button
                  key={c}
                  onClick={() => toggleCurrency(c)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    selectedCurrencies.includes(c) 
                    ? 'bg-primary/20 border-primary/40 text-primary' 
                    : 'bg-background/50 border-border text-muted-foreground hover:bg-background/80'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
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
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button onClick={handleFetch} disabled={loading} className="w-full">
            {loading ? 'Consultando BCB...' : 'Gerar Relatório'}
          </Button>
        </div>
      </aside>

      {/* Main Content: Results */}
      <section className="overflow-y-auto p-6 space-y-6">
        {!summaries ? (
          <div className="h-full flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
            <div className="rounded-full bg-primary/10 border border-primary/20 p-5">
              <BarChart3 className="h-10 w-10 text-primary/60" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground/80">Nenhum câmbio consultado</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Selecione as moedas e o período ao lado para visualizar os gráficos de evolução e sumários de mercado.
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Resumo do Período
              </h3>
              <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {summaries.map(s => (
                <Card key={s.currency} className="glass-card">
                  <CardHeader className="py-3 pb-0">
                    <CardTitle className="text-sm font-semibold">{s.currency} / BRL</CardTitle>
                  </CardHeader>
                  <CardContent className="py-3">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Média:</span>
                        <span className="font-mono">R$ {s.averageRate.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Mínima:</span>
                        <span className="font-mono text-emerald-500">
                          R$ {s.minRate.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Máxima:</span>
                        <span className="font-mono text-rose-500">
                          R$ {s.maxRate.toFixed(4)}
                        </span>
                      </div>
                      {s.crossRateUSD && s.currency !== 'USD' && (
                        <div className="flex justify-between text-sm pt-2 border-t border-white/5 mt-1">
                          <span className="text-muted-foreground text-xs">Média {s.currency}/USD (Cross):</span>
                          <span className="font-mono text-xs">{s.crossRateUSD.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Evolução Histórica
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
                          formatter={(value: number) => [`R$ ${value.toFixed(4)}`, undefined]}
                          labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '4px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        {selectedCurrencies.map(c => (
                          <Line
                            key={c}
                            type="monotone"
                            dataKey={c}
                            name={c}
                            stroke={COLORS[c] || '#ffffff'}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                          />
                        ))}
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
