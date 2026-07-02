import React, { useEffect, useState } from 'react';
import { Landmark, RefreshCw, CheckCircle2, AlertTriangle, Calculator } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PremissasSnapshot,
  getPremissasTesouraria,
  refreshPremissasTesouraria,
  runTesourariaCalc,
} from '@/lib/api';
import { CALCULADORES, getCalcByNome } from './calcConfig';
import { TesourariaForm } from './TesourariaForm';
import { DecisionView } from './DecisionView';

/** Premissas ao vivo (escalares + curvas pré/real do Tesouro). */
const LIVE_KEYS = ['cdiAa', 'selicMeta', 'ipcaFocus12m', 'usdbrl', 'eurusd', 'sofrAa', 'diPre', 'real'];

function pct(n?: number) {
  return n == null ? '—' : `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export function TesourariaPanel() {
  const [snapshot, setSnapshot] = useState<PremissasSnapshot | null>(null);
  const [snapLoading, setSnapLoading] = useState(true);
  const [selected, setSelected] = useState<string>('conversor');
  /** Resultado + corpo enviado (o veredito precisa dos inputs). */
  const [result, setResult] = useState<{ body: any; data: any } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calc = getCalcByNome(selected)!;

  // Limpa o resultado ao trocar de calculador (evita veredito órfão na tela).
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [selected]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snap = await getPremissasTesouraria();
        if (active) setSnapshot(snap);
      } catch {
        if (active) setSnapshot(null);
      } finally {
        if (active) setSnapLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = async () => {
    setSnapLoading(true);
    try {
      setSnapshot(await refreshPremissasTesouraria());
    } catch {
      /* mantém snapshot atual */
    } finally {
      setSnapLoading(false);
    }
  };

  const handleSubmit = async (body: Record<string, any>) => {
    setCalcLoading(true);
    setError(null);
    try {
      const data = await runTesourariaCalc(selected, body);
      setResult({ body, data });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Erro no cálculo. Revise os parâmetros — taxas em %, prazos em dias.');
      setResult(null);
    } finally {
      setCalcLoading(false);
    }
  };

  const liveStale =
    snapshot && LIVE_KEYS.some(k => snapshot.proveniencia[k]?.flagDesatualizado);

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] max-w-[1600px] mx-auto w-full h-full">
      {/* ── Sidebar: seletor + formulário ── */}
      <aside className="border-r border-white/5 overflow-y-auto bg-card/20 backdrop-blur-sm relative glass-panel mb-0 rounded-none border-y-0 border-l-0">
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold tracking-tight">Tesouraria</h2>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Cálculo</label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALCULADORES.map(c => (
                  <SelectItem key={c.nome} value={c.nome}>
                    {c.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/80">{calc.descricao}</p>
          </div>

          <TesourariaForm calc={calc} snapshot={snapshot} loading={calcLoading} onSubmit={handleSubmit} />
        </div>
      </aside>

      {/* ── Main: premissas + resultado ── */}
      <section className="overflow-y-auto bg-transparent relative p-6 space-y-6">
        {/* Selo de premissas */}
        <Card className="glass-card">
          <CardHeader className="pb-3 border-b border-white/5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground tracking-wide">
                <Landmark className="h-4 w-4 text-primary" />
                Premissas de mercado
                {snapshot && (
                  <span className="text-xs font-normal text-muted-foreground/80">· {snapshot.dataRef}</span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {snapshot &&
                  (liveStale ? (
                    <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded">
                      <AlertTriangle className="h-3 w-3" /> desatualizado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                      <CheckCircle2 className="h-3 w-3" /> atualizado
                    </span>
                  ))}
                <button
                  onClick={handleRefresh}
                  disabled={snapLoading}
                  title="Atualizar premissas"
                  className="text-muted-foreground hover:text-primary p-1 rounded transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${snapLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {snapshot ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                  ['CDI', snapshot.escalares.cdiAa, 'cdiAa'],
                  ['Selic', snapshot.escalares.selicMeta, 'selicMeta'],
                  ['IPCA 12m', snapshot.escalares.ipcaFocus12m, 'ipcaFocus12m'],
                  ['SOFR', snapshot.escalares.sofrAa, 'sofrAa'],
                ].map(([label, val, key]) => (
                  <div key={key as string} className="rounded border border-white/5 bg-white/5 px-3 py-2" title={snapshot.proveniencia[key as string]?.fonte}>
                    <div className="text-[11px] text-muted-foreground">{label as string}</div>
                    <div className="text-sm font-semibold tabular-nums text-foreground mt-0.5">{pct(val as number)}</div>
                  </div>
                ))}
                <div className="rounded border border-white/5 bg-white/5 px-3 py-2" title={snapshot.proveniencia.usdbrl?.fonte}>
                  <div className="text-[11px] text-muted-foreground">USD/BRL</div>
                  <div className="text-sm font-semibold tabular-nums text-foreground mt-0.5">
                    {snapshot.escalares.usdbrl.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  </div>
                </div>
                <div className="rounded border border-white/5 bg-white/5 px-3 py-2" title={snapshot.proveniencia.eurusd?.fonte}>
                  <div className="text-[11px] text-muted-foreground">EUR/USD</div>
                  <div className="text-sm font-semibold tabular-nums text-foreground mt-0.5">
                    {snapshot.escalares.eurusd.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{snapLoading ? 'Carregando premissas…' : 'Premissas indisponíveis (usando seeds).'}</p>
            )}
            {snapshot && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                {([
                  ['Curva pré', 'diPre', snapshot.curvas.diPre?.length],
                  ['Curva real', 'real', snapshot.curvas.real?.length],
                ] as const).map(([label, key, n]) => {
                  const prov = snapshot.proveniencia[key];
                  const live = prov && !prov.flagDesatualizado;
                  return (
                    <span key={key} className={`flex items-center gap-1 ${live ? 'text-primary' : 'text-amber-400'}`} title={prov?.fonte}>
                      {live ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {label} {n ? `(${n} vért.)` : ''} · {prov?.fonte ?? 'seed'}
                    </span>
                  );
                })}
                <span className="text-muted-foreground/60">Cupom cambial / UST: seed manual.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card className="glass-card">
          <CardHeader className="pb-3 border-b border-white/5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground tracking-wide">
              <Calculator className="h-4 w-4 text-primary" />
              {calc.titulo}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {error && (
              <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                {error}
              </div>
            )}
            {result ? (
              <div className="animate-fade-in">
                <DecisionView nome={selected} body={result.body} result={result.data} snapshot={snapshot} />
              </div>
            ) : (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Preencha os parâmetros e clique em <span className="text-primary font-medium">Calcular</span>.
                </p>
                <p className="text-[11px] text-muted-foreground/60 max-w-md mx-auto">
                  O resultado vem em três camadas: o <span className="text-foreground/80">veredito</span> (a decisão em uma
                  frase), o <span className="text-foreground/80">conceito</span> (entenda o que está por trás) e o{' '}
                  <span className="text-foreground/80">modo mesa</span> (números, fórmula e premissas para auditoria).
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
