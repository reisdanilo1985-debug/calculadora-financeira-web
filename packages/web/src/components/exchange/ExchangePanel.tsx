import React, { useState, useEffect, useMemo } from 'react';
import { Download, TrendingUp, Globe, BarChart3, AlertCircle, ArrowLeftRight, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NumericFormat } from 'react-number-format';
import { getExchangeRates, getExchangeSummary, getLatestRates, LatestRate, ExchangeRateData, ExchangeSummaryData, getPtaxSummary, PtaxSummaryData } from '@/lib/api';
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

// Novas moedas para PTAX
const PTAX_LATAM = ['ARS', 'CLP', 'MXN', 'COP', 'PEN', 'UYU', 'PYG'];
const PTAX_MAJORS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CNY', 'AUD', 'CAD'];
const PTAX_CURRENCIES = [...PTAX_MAJORS, ...PTAX_LATAM];

const COLORS: Record<string, string> = {
  USD: '#10b981', // emerald
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
  PYG: '#ef4444'
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

// ── Conversor Instantâneo ──────────────────────────────────────────────────

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

  const ratesInBRL = useMemo(() => {
    const map: Record<string, number> = { BRL: 1 };
    latestRates.forEach(r => { map[r.currency] = r.rate; });
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
      {converted !== null && amount > 0 ? (
        <div className="rounded-lg bg-black/30 border border-white/10 p-3 text-center">
          <p className="text-2xl font-bold text-primary font-mono">
            {fmt(converted, to)} <span className="text-base font-semibold text-foreground">{to}</span>
          </p>
          {rateLabel && (
            <p className="text-[11px] text-muted-foreground mt-1">{rateLabel}</p>
          )}
          {rateDate && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Cotação BCB: {rateDate.split('-').reverse().join('/')}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-black/30 border border-white/10 p-3 text-center">
          <p className="text-xs text-muted-foreground">
            {latestRates.length === 0 ? 'Carregando cotações…' : 'Informe um valor para converter'}
          </p>
        </div>
      )}
    </div>
  );
}

// ── SGS Panel (Multimoeda SGS do BCB/AwesomeAPI) ───────────────────────────

function SgsPanel() {
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
    const dateMap = new Map<string, any>();
    rates.forEach(cr => {
      cr.data.forEach(d => {
        if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
        dateMap.get(d.date)[cr.currency] = d.sellValue;
      });
    });
    const rows = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) return;
    const headers = ['Data', ...selectedCurrencies];
    const csvContent = [
      headers.join(';'),
      ...rows.map(row => [
        row.date.split('-').reverse().join('/'),
        ...selectedCurrencies.map(c => row[c] !== undefined ? row[c].toString().replace('.', ',') : '')
      ].join(';'))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cambio_sgs_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = useMemo(() => {
    if (!rates) return [];
    const map = new Map<string, any>();
    rates.forEach(cr => {
      cr.data.forEach(d => {
        if (!map.has(d.date)) map.set(d.date, { date: d.date.split('-').reverse().slice(0, 2).join('/'), fullDate: d.date });
        map.get(d.date)[cr.currency] = d.sellValue;
      });
    });
    return Array.from(map.values()).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [rates]);

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] max-w-[1600px] mx-auto w-full h-[calc(100vh-92px)] overflow-hidden">
      <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm glass-panel mb-0 rounded-none border-y-0 border-l-0 p-5 pb-20">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
          <Globe className="h-5 w-5 text-primary" />
          Câmbio Comercial Multimoeda
        </h2>
        <p className="text-xs text-muted-foreground mb-6">Consulte cotações diárias de encerramento vs BRL na base SGS do BCB.</p>
        
        <div className="space-y-5">
          <CurrencyConverter />

          <div className="border-t border-white/5 pt-5 space-y-3">
            <Label>Moedas para Comparação (vs BRL)</Label>
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
            {loading ? 'Consultando BCB...' : 'Gerar Relatório SGS'}
          </Button>
        </div>
      </aside>

      <section className="overflow-y-auto p-6 space-y-6 pb-20 relative">
        {!summaries ? (
          <div className="h-full flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
            <div className="rounded-full bg-primary/10 border border-primary/20 p-5">
              <BarChart3 className="h-10 w-10 text-primary/60" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground/80">Nenhum câmbio consultado</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Selecione as moedas e o período ao lado para visualizar os gráficos de evolução e sumários do SGS.
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Resumo do Período - SGS
              </h3>
              <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>

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
                          <span className="text-muted-foreground text-xs">Média {s.currency}/USD:</span>
                          <span className="font-mono text-xs">{s.crossRateUSD.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {chartData.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Evolução Histórica (Venda)
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

// ── PTAX Panel (BCB Olinda - Compra e Venda / Moeda Única) ─────────────────

function PtaxPanel() {
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
      setError(err.response?.data?.error || err.message || 'Erro ao buscar dados do PTAX.');
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
    link.setAttribute('download', `ptax_${currency}_${bulletin}_${startDate}_a_${endDate}.csv`);
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
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] max-w-[1600px] mx-auto w-full h-[calc(100vh-92px)] overflow-hidden">
      <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm glass-panel mb-0 rounded-none border-y-0 border-l-0 p-5 pb-20">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-1 text-cyan-400">
          <Landmark className="h-5 w-5" />
          PTAX Oficial
        </h2>
        <p className="text-xs text-muted-foreground mb-6">Consulte as taxas PTAX de compra e venda diretamente do Banco Central do Brasil.</p>
        
        <div className="space-y-5">
          <div className="space-y-1.5">
             <Label>Moeda</Label>
             <select
               value={currency}
               onChange={e => setCurrency(e.target.value)}
               className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
             >
               <optgroup label="Principais">
                 {PTAX_MAJORS.map(c => <option key={c} value={c}>{c}</option>)}
               </optgroup>
               <optgroup label="América Latina">
                 {PTAX_LATAM.map(c => <option key={c} value={c}>{c}</option>)}
               </optgroup>
             </select>
          </div>
          
          <div className="space-y-1.5">
             <Label>Boletim PTAX</Label>
             <select
               value={bulletin}
               onChange={e => setBulletin(e.target.value)}
               className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
             >
               <option value="Fechamento">Fechamento (PTAX Dia)</option>
               <option value="Abertura">Abertura</option>
               <option value="Intermediário">Intermediário</option>
               <option value="Todos">Todos os Boletins</option>
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

          <Button onClick={handleFetch} disabled={loading} variant="secondary" className="w-full bg-cyan-900/40 hover:bg-cyan-900/60 text-cyan-50 border border-cyan-800/50">
            {loading ? 'Consultando Olinda BCB...' : 'Consultar PTAX'}
          </Button>
        </div>
      </aside>

      <section className="overflow-y-auto p-6 space-y-6 pb-20 relative">
        {!summary ? (
          <div className="h-full flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
            <div className="rounded-full bg-cyan-500/10 border border-cyan-500/20 p-5">
              <Landmark className="h-10 w-10 text-cyan-500/60" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground/80">Monitor PTAX BCB</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Selecione uma moeda (USD, EUR, ARS, etc) para ver o histórico detalhado da PTAX (compra e venda).
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-cyan-400">
                <Landmark className="h-5 w-5" />
                Resumo PTAX - {summary.currency} ({summary.bulletinType})
              </h3>
              <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar Histórico
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass-card ring-1 ring-cyan-500/20">
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
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Extremos (Venda)</CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1 pt-4">
                    <div className="flex justify-between items-baseline pt-1 group" title={new Date(summary.minSellDate).toISOString().slice(0,10)}>
                      <span className="text-xs text-muted-foreground">Mínima:</span>
                      <span className="font-mono text-sm text-emerald-400">R$ {summary.minSellRate.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between items-baseline group" title={new Date(summary.maxSellDate).toISOString().slice(0,10)}>
                      <span className="text-xs text-muted-foreground">Máxima:</span>
                      <span className="font-mono text-sm text-rose-400">R$ {summary.maxSellRate.toFixed(4)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="py-3 pb-0">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Período</CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="space-y-1 pt-4">
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-xs text-muted-foreground">Dias úteis c/ dados:</span>
                      <span className="font-mono text-sm font-medium">{summary.businessDays}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Total registros:</span>
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
                    Evolução PTAX (Compra x Venda)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px] w-full">
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
                          stroke={COLORS[currency] || '#3b82f6'}
                          strokeOpacity={0.5}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="venda"
                          name="Venda"
                          stroke={COLORS[currency] || '#3b82f6'}
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

// ── Main Wrapper com Tabs ───────────────────────────────────────────────────

export function ExchangePanel() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black/10">
      <div className="border-b border-border/50 bg-card/10 backdrop-blur-md sticky top-0 z-20 px-6 pt-3">
        <Tabs defaultValue="ptax" className="w-full">
          <TabsList className="mb-[-1px] bg-transparent pb-0 h-auto gap-4 rounded-none border-b border-transparent p-0">
            <TabsTrigger 
              value="ptax" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-cyan-500 data-[state=active]:bg-transparent px-2 pb-3 pt-2 font-medium data-[state=active]:text-cyan-400 text-muted-foreground data-[state=active]:shadow-none"
            >
              <Landmark className="h-4 w-4 mr-2" />
              PTAX (BCB Olinda)
            </TabsTrigger>
            <TabsTrigger 
              value="sgs" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-2 pb-3 pt-2 font-medium data-[state=active]:text-emerald-400 text-muted-foreground data-[state=active]:shadow-none"
            >
              <Globe className="h-4 w-4 mr-2" />
              SGS Multimoeda
            </TabsTrigger>
          </TabsList>

          {/* Sub-panels rendidos condicionalmente sem usar wrapper limitante */}
          <TabsContent value="ptax" className="m-0 border-0 p-0 outline-none w-full">
            <PtaxPanel />
          </TabsContent>
          <TabsContent value="sgs" className="m-0 border-0 p-0 outline-none w-full">
            <SgsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
