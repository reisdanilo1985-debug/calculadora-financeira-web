import React, { useMemo, useRef, useState } from 'react';
import type { OptionLeg, OptionsSimulationInput, OptionsSimulationResult } from '@correcao/core';
import { OPTION_STRATEGIES } from '../../../../core/src/options/strategies';
import { simulateOptions, getOptionsUnderlying } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, BarChart3, CandlestickChart, Copy, Download, Loader2, Plus,
  RefreshCw, Save, Trash2, Upload,
} from 'lucide-react';
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';

const STORAGE_KEY = 'correcao-financeira:options-simulations:v1';
const SCHEMA_VERSION = 1;
const fieldClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary';
const labelClass = 'text-[11px] text-muted-foreground';

interface SavedSimulation { id: string; name: string; schemaVersion: number; input: OptionsSimulationInput; }

function today() { return new Date().toISOString().slice(0, 10); }
function futureDate(days = 90) { return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10); }
function money(value: number | null) {
  if (value == null) return 'Ilimitado';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}
function pct(value: number | null | undefined) { return value == null ? '' : (value * 100).toString(); }
function n(value: string) { return value === '' ? 0 : Number(value); }
function id() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }

function defaultInput(): OptionsSimulationInput {
  return {
    strategyName: 'Compra de call',
    market: { symbol: 'PETR4', spot: 40, valuationDate: today(), riskFreeRate: .12, dividendYield: .05, currency: 'BRL' },
    legs: OPTION_STRATEGIES.find(s => s.id === 'long-call')!.build(40, futureDate()).map(l => ({ ...l, symbol: l.instrument === 'OPTION' ? 'PETRA40' : 'PETR4', premium: l.instrument === 'OPTION' ? 2 : 40 })),
    costs: {
      entry: { fixedPerOrder: 0, perContract: 0, percentNotional: 0 },
      exit: { fixedPerOrder: 0, perContract: 0, percentNotional: 0 },
      exercisePerContract: 0, includeExitCosts: false,
    },
    grid: { spotMin: 28, spotMax: 52, spotSteps: 41, dateSteps: 8, volatilityShift: 0 },
  };
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): OptionLeg[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV sem linhas de dados.');
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim());
  const required = ['symbol', 'instrument', 'side', 'quantity', 'multiplier', 'premium'];
  if (required.some(h => !headers.includes(h))) throw new Error(`Cabeçalhos obrigatórios: ${required.join(', ')}.`);
  return lines.slice(1).map((line, index) => {
    const values = line.split(delimiter).map(v => v.trim());
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    if (!['OPTION', 'UNDERLYING'].includes(row.instrument) || !['LONG', 'SHORT'].includes(row.side)) throw new Error(`Linha ${index + 2}: instrumento ou lado inválido.`);
    return {
      id: id(), symbol: row.symbol, instrument: row.instrument as OptionLeg['instrument'], side: row.side as OptionLeg['side'],
      optionType: row.optionType ? row.optionType as OptionLeg['optionType'] : undefined,
      quantity: n(row.quantity), multiplier: n(row.multiplier), strike: row.strike ? n(row.strike) : undefined,
      expiry: row.expiry || undefined, premium: n(row.premium), impliedVolatility: row.impliedVolatility ? n(row.impliedVolatility) : undefined,
    };
  });
}

function readSaved(): SavedSimulation[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export function OptionsPanel() {
  const [input, setInput] = useState<OptionsSimulationInput>(defaultInput);
  const [selectedTemplate, setSelectedTemplate] = useState('long-call');
  const [result, setResult] = useState<OptionsSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [simulationName, setSimulationName] = useState('Minha estratégia');
  const [saved, setSaved] = useState<SavedSimulation[]>(readSaved);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => [...new Set(OPTION_STRATEGIES.map(s => s.category))], []);
  const updateMarket = (key: keyof OptionsSimulationInput['market'], value: string | number) => setInput(v => ({ ...v, market: { ...v.market, [key]: value } }));
  const updateGrid = (key: keyof OptionsSimulationInput['grid'], value: number) => setInput(v => ({ ...v, grid: { ...v.grid, [key]: value } }));
  const updateLeg = (legId: string, patch: Partial<OptionLeg>) => setInput(v => ({ ...v, legs: v.legs.map(l => l.id === legId ? { ...l, ...patch } : l) }));

  const applyTemplate = (templateId: string) => {
    const template = OPTION_STRATEGIES.find(s => s.id === templateId)!;
    const expiry = input.legs.find(l => l.expiry)?.expiry || futureDate();
    const legs = template.build(input.market.spot, expiry).map(l => ({ ...l, id: id(), symbol: l.instrument === 'UNDERLYING' ? input.market.symbol : '' }));
    setSelectedTemplate(templateId); setInput(v => ({ ...v, strategyName: template.name, legs })); setResult(null); setMessage(null);
  };

  const addLeg = () => setInput(v => ({ ...v, legs: [...v.legs, { id: id(), symbol: '', instrument: 'OPTION', side: 'LONG', optionType: 'CALL', quantity: 1, multiplier: 100, strike: v.market.spot, expiry: futureDate(), premium: 0, impliedVolatility: .3 }] }));

  const fetchQuote = async () => {
    setQuoteLoading(true); setMessage(null);
    try {
      const quote = await getOptionsUnderlying(input.market.symbol);
      setInput(v => ({ ...v, market: { ...v.market, spot: quote.price }, grid: { ...v.grid, spotMin: +(quote.price * .7).toFixed(2), spotMax: +(quote.price * 1.3).toFixed(2) } }));
      setMessage(`${quote.symbol}: ${money(quote.price)} · ${quote.source}${quote.delayed ? ' (cotação possivelmente atrasada)' : ''}`);
    } catch (error: any) { setMessage(error.response?.data?.error || 'Cotação indisponível; mantenha o preço manual.'); }
    finally { setQuoteLoading(false); }
  };

  const run = async () => {
    setLoading(true); setMessage(null);
    try {
      const request = input.costs.includeExitCosts
        ? { ...input, costs: { ...input.costs, exit: { ...input.costs.entry } } }
        : input;
      setResult(await simulateOptions(request));
    }
    catch (error: any) { setResult(null); setMessage(error.response?.data?.error || error.message || 'Não foi possível simular.'); }
    finally { setLoading(false); }
  };

  const persist = (duplicate = false) => {
    const item: SavedSimulation = { id: id(), name: duplicate ? `${simulationName} (cópia)` : simulationName, schemaVersion: SCHEMA_VERSION, input };
    const next = duplicate ? [...saved, item] : [...saved.filter(s => s.name !== simulationName), item];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(next); setMessage(duplicate ? 'Cópia salva no navegador.' : 'Simulação salva no navegador.');
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text); const imported = parsed.input ?? parsed;
        if (!imported.market || !Array.isArray(imported.legs)) throw new Error('JSON não contém uma simulação válida.');
        setInput(imported); setSimulationName(parsed.name || 'Simulação importada');
      } else setInput(v => ({ ...v, legs: parseCsv(text) }));
      setResult(null); setMessage('Arquivo importado. Revise os dados e simule.');
    } catch (error: any) { setMessage(error.message || 'Arquivo inválido.'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const exportLegs = () => {
    const header = 'symbol,instrument,side,optionType,quantity,multiplier,strike,expiry,premium,impliedVolatility';
    const rows = input.legs.map(l => [l.symbol, l.instrument, l.side, l.optionType || '', l.quantity, l.multiplier, l.strike || '', l.expiry || '', l.premium, l.impliedVolatility || ''].join(','));
    download('pernas-opcoes.csv', [header, ...rows].join('\n'), 'text/csv;charset=utf-8');
  };
  const exportGrid = () => result && download('cenarios-opcoes.csv', ['date,' + result.spots.join(','), ...result.heatmap.map(r => `${r.date},${r.values.join(',')}`)].join('\n'), 'text/csv;charset=utf-8');

  const maxAbsHeat = result ? Math.max(1, ...result.heatmap.flatMap(r => r.values.map(Math.abs))) : 1;
  const chartData = result?.spots.map((spot, i) => Object.fromEntries([['spot', spot], ...result.valuationCurves.map(c => [c.date, c.points[i].pnl])])) || [];

  return (
    <div className="flex-1 grid grid-cols-1 xl:grid-cols-[470px_1fr] max-w-[1800px] mx-auto w-full h-full">
      <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm glass-panel rounded-none border-y-0 border-l-0">
        <div className="p-5 space-y-5">
          <div><h2 className="text-lg font-bold flex items-center gap-2"><CandlestickChart className="h-5 w-5 text-primary" /> Estratégias com opções</h2><p className="text-xs text-muted-foreground mt-1">B3 · Black-Scholes · análise teórica</p></div>

          <section className="space-y-2">
            <label className={labelClass}>Estratégia</label>
            <select className={fieldClass} value={selectedTemplate} onChange={e => applyTemplate(e.target.value)}>
              {categories.map(category => <optgroup key={category} label={category}>{OPTION_STRATEGIES.filter(s => s.category === category).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
            </select>
            <p className="text-[11px] text-muted-foreground">{OPTION_STRATEGIES.find(s => s.id === selectedTemplate)?.description}</p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Premissas de mercado</h3><button className="text-xs text-primary flex items-center gap-1" onClick={fetchQuote} disabled={quoteLoading}>{quoteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Buscar spot</button></div>
            <div className="grid grid-cols-2 gap-2">
              <label className={labelClass}>Ativo<input className={fieldClass} value={input.market.symbol} onChange={e => updateMarket('symbol', e.target.value.toUpperCase())} /></label>
              <label className={labelClass}>Spot (R$)<input className={fieldClass} type="number" step="0.01" value={input.market.spot} onChange={e => updateMarket('spot', n(e.target.value))} /></label>
              <label className={labelClass}>Data-base<input className={fieldClass} type="date" value={input.market.valuationDate} onChange={e => updateMarket('valuationDate', e.target.value)} /></label>
              <label className={labelClass}>Juros a.a. (%)<input className={fieldClass} type="number" step="0.01" value={pct(input.market.riskFreeRate)} onChange={e => updateMarket('riskFreeRate', n(e.target.value) / 100)} /></label>
              <label className={labelClass}>Dividend yield (%)<input className={fieldClass} type="number" step="0.01" value={pct(input.market.dividendYield)} onChange={e => updateMarket('dividendYield', n(e.target.value) / 100)} /></label>
              <label className={labelClass}>Choque de vol. (p.p.)<input className={fieldClass} type="number" step="1" value={input.grid.volatilityShift * 100} onChange={e => updateGrid('volatilityShift', n(e.target.value) / 100)} /></label>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Pernas</h3><Button size="sm" variant="outline" onClick={addLeg}><Plus className="h-3.5 w-3.5 mr-1" /> Perna</Button></div>
            {input.legs.length === 0 && <div className="rounded border border-dashed p-4 text-xs text-muted-foreground text-center">Adicione uma perna para começar.</div>}
            {input.legs.map((leg, index) => <div key={leg.id} className="rounded-lg border border-white/10 bg-white/[.03] p-3 space-y-2">
              <div className="flex justify-between items-center"><span className="text-xs font-semibold">Perna {index + 1}</span><button title="Remover" onClick={() => setInput(v => ({ ...v, legs: v.legs.filter(l => l.id !== leg.id) }))}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button></div>
              <div className="grid grid-cols-3 gap-2">
                <label className={labelClass}>Instrumento<select className={fieldClass} value={leg.instrument} onChange={e => updateLeg(leg.id, { instrument: e.target.value as OptionLeg['instrument'] })}><option value="OPTION">Opção</option><option value="UNDERLYING">Ação</option></select></label>
                <label className={labelClass}>Lado<select className={fieldClass} value={leg.side} onChange={e => updateLeg(leg.id, { side: e.target.value as OptionLeg['side'] })}><option value="LONG">Compra</option><option value="SHORT">Venda</option></select></label>
                {leg.instrument === 'OPTION' && <label className={labelClass}>Tipo<select className={fieldClass} value={leg.optionType} onChange={e => updateLeg(leg.id, { optionType: e.target.value as OptionLeg['optionType'] })}><option value="CALL">Call</option><option value="PUT">Put</option></select></label>}
                <label className={labelClass}>Ticker<input className={fieldClass} value={leg.symbol} onChange={e => updateLeg(leg.id, { symbol: e.target.value.toUpperCase() })} /></label>
                <label className={labelClass}>Quantidade<input className={fieldClass} type="number" min="0.01" step="1" value={leg.quantity} onChange={e => updateLeg(leg.id, { quantity: n(e.target.value) })} /></label>
                <label className={labelClass}>Multiplicador<input className={fieldClass} type="number" min="1" value={leg.multiplier} onChange={e => updateLeg(leg.id, { multiplier: n(e.target.value) })} /></label>
                {leg.instrument === 'OPTION' && <><label className={labelClass}>Strike<input className={fieldClass} type="number" step="0.01" value={leg.strike} onChange={e => updateLeg(leg.id, { strike: n(e.target.value) })} /></label><label className={labelClass}>Vencimento<input className={fieldClass} type="date" value={leg.expiry} onChange={e => updateLeg(leg.id, { expiry: e.target.value })} /></label></>}
                <label className={labelClass}>Prêmio/preço<input className={fieldClass} type="number" step="0.01" value={leg.premium} onChange={e => updateLeg(leg.id, { premium: n(e.target.value) })} /></label>
                {leg.instrument === 'OPTION' && <label className={labelClass}>Vol. implícita (%)<input className={fieldClass} type="number" step="0.1" placeholder="Calcular do prêmio" value={pct(leg.impliedVolatility)} onChange={e => updateLeg(leg.id, { impliedVolatility: e.target.value === '' ? undefined : n(e.target.value) / 100 })} /></label>}
              </div>
            </div>)}
          </section>

          <details className="rounded-lg border border-white/10 p-3"><summary className="text-sm font-semibold cursor-pointer">Cenários e custos</summary><div className="grid grid-cols-2 gap-2 mt-3">
            <label className={labelClass}>Spot mínimo<input className={fieldClass} type="number" value={input.grid.spotMin} onChange={e => updateGrid('spotMin', n(e.target.value))} /></label>
            <label className={labelClass}>Spot máximo<input className={fieldClass} type="number" value={input.grid.spotMax} onChange={e => updateGrid('spotMax', n(e.target.value))} /></label>
            <label className={labelClass}>Pontos de preço<input className={fieldClass} type="number" min="5" max="201" value={input.grid.spotSteps} onChange={e => updateGrid('spotSteps', n(e.target.value))} /></label>
            <label className={labelClass}>Pontos de data<input className={fieldClass} type="number" min="2" max="60" value={input.grid.dateSteps} onChange={e => updateGrid('dateSteps', n(e.target.value))} /></label>
            <label className={labelClass}>Entrada por ordem<input className={fieldClass} type="number" value={input.costs.entry.fixedPerOrder} onChange={e => setInput(v => ({ ...v, costs: { ...v.costs, entry: { ...v.costs.entry, fixedPerOrder: n(e.target.value) } } }))} /></label>
            <label className={labelClass}>Entrada por contrato<input className={fieldClass} type="number" value={input.costs.entry.perContract} onChange={e => setInput(v => ({ ...v, costs: { ...v.costs, entry: { ...v.costs.entry, perContract: n(e.target.value) } } }))} /></label>
            <label className={labelClass}>Entrada sobre notional (%)<input className={fieldClass} type="number" step="0.001" value={input.costs.entry.percentNotional * 100} onChange={e => setInput(v => ({ ...v, costs: { ...v.costs, entry: { ...v.costs.entry, percentNotional: n(e.target.value) / 100 } } }))} /></label>
            <label className={labelClass}>Exercício por contrato<input className={fieldClass} type="number" value={input.costs.exercisePerContract} onChange={e => setInput(v => ({ ...v, costs: { ...v.costs, exercisePerContract: n(e.target.value) } }))} /></label>
            <label className="col-span-2 text-xs flex gap-2 items-center"><input type="checkbox" checked={input.costs.includeExitCosts} onChange={e => setInput(v => ({ ...v, costs: { ...v.costs, includeExitCosts: e.target.checked } }))} /> Incluir custos de saída (configurados iguais à entrada)</label>
          </div></details>

          {message && <div className="rounded border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{message}</div>}
          <Button className="w-full" onClick={run} disabled={loading || !input.legs.length}>{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />} Simular estratégia</Button>

          <section className="space-y-2 border-t border-white/10 pt-4">
            <div className="flex gap-2"><input className={fieldClass} value={simulationName} onChange={e => setSimulationName(e.target.value)} /><Button size="sm" variant="outline" onClick={() => persist(false)} title="Salvar"><Save className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => persist(true)} title="Duplicar"><Copy className="h-4 w-4" /></Button></div>
            {saved.length > 0 && <select className={fieldClass} defaultValue="" onChange={e => { const item = saved.find(s => s.id === e.target.value); if (item) { setInput(item.input); setSimulationName(item.name); setResult(null); } }}><option value="" disabled>Carregar simulação salva…</option>{saved.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
            <div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => download('simulacao-opcoes.json', JSON.stringify({ schemaVersion: SCHEMA_VERSION, name: simulationName, input }, null, 2), 'application/json')}><Download className="h-3.5 w-3.5 mr-1" /> JSON</Button><Button size="sm" variant="outline" onClick={exportLegs}><Download className="h-3.5 w-3.5 mr-1" /> Pernas CSV</Button><Button size="sm" variant="outline" onClick={exportGrid} disabled={!result}><Download className="h-3.5 w-3.5 mr-1" /> Cenários CSV</Button><Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5 mr-1" /> Importar</Button></div>
            <input ref={fileRef} className="hidden" type="file" accept=".json,.csv,text/csv,application/json" onChange={e => importFile(e.target.files?.[0])} />
          </section>
        </div>
      </aside>

      <section className="overflow-y-auto p-4 sm:p-6 space-y-5">
        {!result ? <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-20"><CandlestickChart className="h-12 w-12 text-primary/50" /><h3 className="font-semibold">Monte e simule sua estratégia</h3><p className="text-sm text-muted-foreground max-w-md">O resultado mostrará payoff, efeito do tempo, sensibilidade à volatilidade e gregas consolidadas.</p></div> : <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[['Prêmio líquido', money(result.summary.netPremium)], ['Valor teórico', money(result.summary.currentValue)], ['Lucro máximo', result.summary.profitUnlimited ? 'Ilimitado' : money(result.summary.maxProfit)], ['Perda máxima', result.summary.lossUnlimited ? 'Ilimitada' : money(result.summary.maxLoss)]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold tabular-nums mt-1">{value}</div></CardContent></Card>)}
          </div>
          <Card><CardHeader><CardTitle className="text-sm">Resultado por preço e data</CardTitle></CardHeader><CardContent><div className="h-[330px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" /><XAxis dataKey="spot" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${Number(v).toLocaleString('pt-BR', { notation: 'compact' })}`} /><Tooltip formatter={(v: number) => money(v)} labelFormatter={v => `Spot: ${money(Number(v))}`} /><Legend /><ReferenceLine y={0} stroke="#94a3b8" />{result.valuationCurves.map((curve, i) => <Line key={curve.date} type="monotone" dataKey={curve.date} stroke={['#22c55e', '#38bdf8', '#f59e0b'][i]} dot={false} strokeWidth={2} />)}</LineChart></ResponsiveContainer></div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Mapa de resultado — preço × data</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><div className="min-w-[680px]"><div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `90px repeat(${result.spots.length}, minmax(11px, 1fr))` }}><span />{result.spots.map((s, i) => <span key={s} className="text-[9px] text-muted-foreground text-center">{i % Math.max(1, Math.floor(result.spots.length / 8)) === 0 ? s.toFixed(0) : ''}</span>)}</div>{result.heatmap.map(row => <div key={row.date} className="grid gap-1 mb-1" style={{ gridTemplateColumns: `90px repeat(${result.spots.length}, minmax(11px, 1fr))` }}><span className="text-[10px] text-muted-foreground pr-2">{new Date(`${row.date}T00:00:00`).toLocaleDateString('pt-BR')}</span>{row.values.map((v, i) => { const alpha = .12 + .78 * Math.min(1, Math.abs(v) / maxAbsHeat); return <span key={i} className="h-5 rounded-[2px]" style={{ backgroundColor: v >= 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})` }} title={`${row.date} · Spot ${money(result.spots[i])} · P&L ${money(v)}`} />; })}</div>)}</div></div><p className="text-[10px] text-muted-foreground mt-2">Verde: lucro · vermelho: prejuízo. Passe o cursor sobre uma célula para detalhes.</p></CardContent></Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card><CardHeader><CardTitle className="text-sm">Gregas consolidadas</CardTitle></CardHeader><CardContent><div className="grid grid-cols-5 gap-2">{Object.entries(result.summary.greeks).map(([key, value]) => <div key={key} className="rounded border border-white/10 p-2 text-center"><div className="text-[10px] uppercase text-muted-foreground">{key}</div><div className="text-sm font-semibold tabular-nums">{value.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</div></div>)}</div><div className="mt-4 text-xs text-muted-foreground">Break-even: {result.summary.breakEvens.length ? result.summary.breakEvens.map(money).join(' · ') : 'não identificado na faixa'}</div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Premissas e alertas</CardTitle></CardHeader><CardContent className="space-y-2">{result.warnings.map(w => <div key={w} className="flex gap-2 text-xs text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />{w}</div>)}</CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-sm">Reconciliação por perna</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-muted-foreground"><tr>{['Perna', 'Mercado', 'Teórico', 'IV', 'Valor posição', 'P&L', 'Delta', 'Theta', 'Vega'].map(h => <th key={h} className="text-right first:text-left p-2 border-b border-white/10">{h}</th>)}</tr></thead><tbody>{result.legs.map((leg, i) => <tr key={leg.id} className="border-b border-white/5"><td className="p-2">{input.legs[i]?.symbol || `Perna ${i + 1}`}</td><td className="p-2 text-right">{money(leg.marketPrice)}</td><td className="p-2 text-right">{money(leg.theoreticalPrice)}</td><td className="p-2 text-right">{leg.impliedVolatility == null ? '—' : `${(leg.impliedVolatility * 100).toFixed(2)}%`}</td><td className="p-2 text-right">{money(leg.positionValue)}</td><td className={`p-2 text-right ${leg.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(leg.pnl)}</td><td className="p-2 text-right">{leg.greeks.delta.toFixed(3)}</td><td className="p-2 text-right">{leg.greeks.theta.toFixed(3)}</td><td className="p-2 text-right">{leg.greeks.vega.toFixed(3)}</td></tr>)}</tbody></table></div></CardContent></Card>
        </>}
      </section>
    </div>
  );
}
