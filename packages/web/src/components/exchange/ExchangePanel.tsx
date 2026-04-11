import React, { useState, useEffect, useMemo } from 'react';
import { Download, TrendingUp, Globe, BarChart3, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { NumericFormat } from 'react-number-format';
import { getExchangeRates, getExchangeSummary, getLatestRates, LatestRate, ExchangeRateData, ExchangeSummaryData } from '@/lib/api';
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

const ALL_CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CNY'];

const CURRENCY_NAMES: Record<string, string> = {
  BRL: 'Real Brasileiro',
  USD: 'Dólar Americano',
  EUR: 'Euro',
  GBP: 'Libra Esterlina',
  JPY: 'Iene Japonês',
  CHF: 'Franco Suíço',
  CNY: 'Yuan Chinês',
};

function CurrencyConverter() {
  const [latestRates, setLatestRates] = useState<LatestRate[]>([]);
  const [amount, setAmount] = useState<number>(1000);
  const [from, setFrom] = useState('BRL');
  const [to, setTo] = useState('USD');
  const [rateDate, setRateDate] = useState('');

  useEffect(() => {
    getLatestRates().then(rates => {
      setLatestRates(rates);
      if (rates.length > 0) setRateDate(rates[0].date);
    }).catch(() => {});
  }, []);

  // Taxas em BRL (base): BRL=1, demais vêm da API
  const ratesInBRL = useMemo(() => {
    const map: Record<string, number> = { BRL: 1 };
    latestRates.forEach(r => { map[r.currency] = r.rate; });
    // CNY: se não disponível na API, estima via USD (aprox.)
    return map;
  }, [latestRates]);

  const converted = useMemo(() => {
    if (!amount || !ratesInBRL[from] || !ratesInBRL[to]) return null;
    const inBRL = amount * ratesInBRL[from];
    return inBRL / ratesInBRL[to];
  }, [amount, from, to, ratesInBRL]);

  const swap = () => { setFrom(to); setTo(from); };

  const fmt = (val: number, currency: string) => {
    if (currency === 'JPY') return val.toLocaleString('ja-JP', { maximumFractionDigits: 0 });
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  const rateLabel = useMemo(() => {
    if (!ratesInBRL[from] || !ratesInBRL[to]) return null;
    const r = ratesInBRL[from] / ratesInBRL[to];
    return `1 ${from} = ${fmt(r, to)} ${to}`;
  }, [from, to, ratesInBRL]);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <ArrowLeftRight className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Conversor Instantâneo</span>
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <Label className="text-xs">Valor</Label>
        <NumericFormat
          customInput={Input}
          thousandSeparator="."
          decimalSeparator=","
          decimalScale={2}
          allowNegative={false}
          value={amount || ''}
          onValueChange={v => setAmount(v.floatValue || 0)}
          className="font-mono"
        />
      </div>

      {/* From / To */}
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">De</Label>
          <select
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {ALL_CURRENCIES.map(c => (
              <option key={c} value={c}>{c} — {CURRENCY_NAMES[c]}</option>
            ))}
          </select>
        </div>

        <button onClick={swap} className="mt-5 p-2 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-primary">
          <ArrowLeftRight className="h-4 w-4" />
        </button>

        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Para</Label>
          <select
            value={to}
            onChange={e => setTo(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {ALL_CURRENCIES.map(c => (
              <option key={c} value={c}>{c} — {CURRENCY_NAMES[c]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Result */}
      {converted !== null && amount > 0 ? (
        <div className="rounded-xl bg-black/30 border border-primary/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 text-center">
            Resultado
          </p>
          <p className="font-display font-bold text-primary tabular-nums text-center leading-none"
             style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2rem)' }}>
            {fmt(converted, to)}
            <span className="ml-2 text-lg font-semibold text-foreground/70">{to}</span>
          </p>
          {rateLabel && (
            <p className="text-[11px] text-muted-foreground mt-2 text-center">{rateLabel}</p>
          )}
          {rateDate && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5 text-center">
              BCB · {rateDate.split('-').reverse().join('/')}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-black/30 border border-white/10 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            {latestRates.length === 0 ? 'Carregando cotações…' : 'Informe um valor para converter'}
          </p>
        </div>
      )}
    </div>
  );
}

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
          <CurrencyConverter />

          <div className="border-t border-white/5 pt-5 space-y-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {summaries.map(s => {
                const variation = ((s.maxRate - s.minRate) / s.minRate) * 100;
                const currencyColor = COLORS[s.currency] || 'hsl(var(--primary))';
                return (
                  <Card key={s.currency} className="glass-card card-hover">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {s.currency} / BRL
                          </p>
                          <p className="text-xs text-muted-foreground/60">{CURRENCY_NAMES[s.currency]}</p>
                        </div>
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full font-mono"
                          style={{ backgroundColor: `${currencyColor}22`, color: currencyColor }}
                        >
                          ±{variation.toFixed(1)}%
                        </span>
                      </div>

                      {/* Featured average */}
                      <p
                        className="font-display font-bold tabular-nums leading-none mb-3"
                        style={{ fontSize: '1.5rem', color: currencyColor }}
                      >
                        R$ {s.averageRate.toFixed(4)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 -mt-2 mb-3">Média do período</p>

                      {/* Min / Max row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md bg-emerald-500/10 px-2 py-1.5">
                          <p className="text-[9px] uppercase tracking-wider text-emerald-400/70 font-semibold">Mín</p>
                          <p className="text-xs font-mono font-semibold text-emerald-400">R$ {s.minRate.toFixed(4)}</p>
                          <p className="text-[9px] text-muted-foreground/50 font-mono">{s.minRateDate.split('-').reverse().join('/')}</p>
                        </div>
                        <div className="rounded-md bg-rose-500/10 px-2 py-1.5">
                          <p className="text-[9px] uppercase tracking-wider text-rose-400/70 font-semibold">Máx</p>
                          <p className="text-xs font-mono font-semibold text-rose-400">R$ {s.maxRate.toFixed(4)}</p>
                          <p className="text-[9px] text-muted-foreground/50 font-mono">{s.maxRateDate.split('-').reverse().join('/')}</p>
                        </div>
                      </div>

                      {s.crossRateUSD && s.currency !== 'USD' && (
                        <div className="flex justify-between text-[11px] pt-2.5 mt-2.5 border-t border-white/5">
                          <span className="text-muted-foreground">{s.currency}/USD cross</span>
                          <span className="font-mono text-foreground/70">{s.crossRateUSD.toFixed(4)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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
