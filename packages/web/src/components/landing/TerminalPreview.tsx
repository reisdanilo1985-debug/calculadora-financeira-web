import React from 'react';
import { TrendingUp } from 'lucide-react';
import { useInView } from '@/hooks/useInView';

/** Pontos do mini-gráfico de evolução (SVG puro, sem dependências). */
const CHART_POINTS = '0,58 40,55 80,50 120,52 160,44 200,40 240,36 280,30 320,26 360,18 400,12';

const TICKER_ITEMS = [
  { label: 'CDI', value: '14,90%', up: true },
  { label: 'IPCA 12M', value: '5,32%', up: false },
  { label: 'USD/BRL', value: '5,43', up: true },
  { label: 'SELIC', value: '15,00%', up: true },
  { label: 'IGP-M', value: '4,11%', up: false },
];

const MEMORY_ROWS = [
  { date: '02/01/2025', rate: '11,15', factor: '1,00041956', balance: 'R$ 1.000.419,56' },
  { date: '03/01/2025', rate: '11,15', factor: '1,00083930', balance: 'R$ 1.000.839,30' },
  { date: '06/01/2025', rate: '11,15', factor: '1,00125921', balance: 'R$ 1.001.259,21' },
  { date: '07/01/2025', rate: '11,15', factor: '1,00167930', balance: 'R$ 1.001.679,30' },
];

/**
 * "Screenshot" do terminal construído em HTML/CSS — sempre nítido, zero peso
 * de imagem, com leve perspectiva 3D que endireita no hover.
 */
export function TerminalPreview() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="relative w-full max-w-[1000px] mx-auto px-6 pb-20 z-10">
      <div ref={ref} className={`animate-on-scroll ${inView ? 'in-view' : ''}`}>
        <div className="terminal-tilt glass-panel rounded-xl overflow-hidden shadow-[0_25px_80px_-20px_rgba(16,185,129,0.25)]">
          {/* Barra de janela */}
          <div className="flex items-center gap-2 px-4 py-3 bg-black/40 border-b border-white/5">
            <span className="h-3 w-3 rounded-full bg-red-500/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <span className="h-3 w-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs text-muted-foreground font-mono truncate">
              correcao-financeira — terminal
            </span>
          </div>

          {/* Ticker estático */}
          <div className="flex items-center gap-6 px-4 py-2 bg-black/20 border-b border-white/5 overflow-hidden whitespace-nowrap">
            {TICKER_ITEMS.map(t => (
              <span key={t.label} className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums shrink-0">
                <span className="text-muted-foreground">{t.label}</span>
                <span className={t.up ? 'text-emerald-400' : 'text-rose-400'}>{t.value}</span>
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-0">
            {/* Gráfico de evolução */}
            <div className="p-5 border-b md:border-b-0 md:border-r border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                  Evolução do Saldo — CDI
                </span>
              </div>
              <svg viewBox="0 0 400 70" className="w-full h-auto" aria-hidden="true">
                <defs>
                  <linearGradient id="landing-chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(158 64% 52%)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="hsl(158 64% 52%)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,70 ${CHART_POINTS} 400,70`} fill="url(#landing-chart-fill)" />
                <polyline
                  points={CHART_POINTS}
                  fill="none"
                  stroke="hsl(158 64% 52%)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="400" cy="12" r="3.5" fill="hsl(158 64% 52%)" />
              </svg>
              <div className="flex items-baseline justify-between mt-3">
                <span className="text-[11px] text-muted-foreground font-mono">R$ 1.000.000,00</span>
                <span className="text-sm font-bold text-emerald-400 font-mono tabular-nums">R$ 1.149.033,17</span>
              </div>
            </div>

            {/* Memória de cálculo */}
            <div className="p-5">
              <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                Memória de Cálculo
              </span>
              <table className="w-full mt-3 text-[11px] font-mono tabular-nums">
                <thead>
                  <tr className="text-muted-foreground/70 text-left">
                    <th className="font-medium pb-1.5">Data</th>
                    <th className="font-medium pb-1.5">Taxa</th>
                    <th className="font-medium pb-1.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {MEMORY_ROWS.map(r => (
                    <tr key={r.date} className="border-t border-white/5">
                      <td className="py-1.5 text-muted-foreground">{r.date}</td>
                      <td className="py-1.5 text-foreground/80">{r.rate}%</td>
                      <td className="py-1.5 text-right text-emerald-400/90">{r.balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground/60 mt-3">
                Fator diário BACEN · exportável em Excel e PDF
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
