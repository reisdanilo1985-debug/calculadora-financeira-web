/**
 * Divulgação progressiva do resultado de Tesouraria (Fase A):
 *   Nível 1 — Veredito executivo: frase de decisão + sinal com critério explícito.
 *   Nível 2 — Entenda: verbete de 6 campos (conceito na língua do CFO).
 *   Nível 3 — Modo mesa: números crus, fórmula e premissas (auditoria).
 */

import React, { useState } from 'react';
import { ChevronDown, BookOpen, Microscope, AlertTriangle } from 'lucide-react';
import { PremissasSnapshot } from '@/lib/api';
import { ResultView } from './ResultView';
import { decidir, EIXO_LABEL, Sinal } from './decision';
import { VERBETES, VERBETE_POR_CALC } from './glossario';

const SINAL_STYLE: Record<Sinal, { dot: string; label: string; badge: string }> = {
  verde: { dot: 'bg-emerald-400', label: 'Favorável', badge: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25' },
  amarelo: { dot: 'bg-amber-400', label: 'Atenção', badge: 'text-amber-300 bg-amber-400/10 border-amber-400/25' },
  vermelho: { dot: 'bg-red-400', label: 'Desfavorável', badge: 'text-red-300 bg-red-400/10 border-red-400/25' },
  info: { dot: 'bg-sky-400', label: 'Leitura', badge: 'text-sky-300 bg-sky-400/10 border-sky-400/25' },
};

interface Props {
  nome: string;
  /** Corpo enviado ao calculador (frações), para o decisor ler os inputs. */
  body: any;
  result: any;
  snapshot: PremissasSnapshot | null;
}

function Collapsible({
  icon,
  title,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white/5 hover:bg-white/10 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
          {icon}
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="p-4 animate-fade-in">{children}</div>}
    </div>
  );
}

/** Um campo do verbete (rótulo pequeno + texto). */
function Campo({ rotulo, children, destaque }: { rotulo: string; children: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={destaque ? 'rounded-md border border-amber-400/20 bg-amber-400/5 p-2.5' : ''}>
      <div className={`text-[10px] uppercase tracking-wide ${destaque ? 'text-amber-300' : 'text-muted-foreground/70'}`}>
        {rotulo}
      </div>
      <p className="text-xs text-foreground/85 mt-0.5 leading-relaxed">{children}</p>
    </div>
  );
}

export function DecisionView({ nome, body, result, snapshot }: Props) {
  const [showCriterio, setShowCriterio] = useState(false);
  const veredito = decidir(nome, body, result);
  const verbete = VERBETES[VERBETE_POR_CALC[nome] ?? ''];

  return (
    <div className="space-y-4">
      {/* ── Nível 1 — Veredito executivo ── */}
      {veredito && (
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-3 w-3 rounded-full shrink-0 ${SINAL_STYLE[veredito.sinal].dot}`} />
            <div className="flex-1 space-y-2">
              <p className="text-sm leading-relaxed text-foreground font-medium">{veredito.frase}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SINAL_STYLE[veredito.sinal].badge}`}>
                  {SINAL_STYLE[veredito.sinal].label}
                </span>
                <button
                  type="button"
                  onClick={() => setShowCriterio(s => !s)}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
                >
                  {showCriterio ? 'ocultar critério' : 'por que este sinal?'}
                </button>
              </div>
              {showCriterio && (
                <p className="text-[11px] text-muted-foreground leading-relaxed animate-fade-in">{veredito.criterio}</p>
              )}
            </div>
          </div>

          {/* Pontes de decisão: "o que isso muda" */}
          {veredito.pontes.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">O que isso muda</div>
              {veredito.pontes.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                    {EIXO_LABEL[p.eixo]}
                  </span>
                  <span className="text-foreground/80 leading-relaxed">{p.texto}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Nível 2 — Entenda o conceito ── */}
      {verbete && (
        <Collapsible icon={<BookOpen className="h-3.5 w-3.5 text-primary" />} title={`Entenda: ${verbete.titulo}`}>
          <div className="space-y-3">
            <Campo rotulo="Em uma frase">{verbete.umaFrase}</Campo>
            <Campo rotulo="O que a mesa adiciona">{verbete.mesaAdiciona}</Campo>
            <Campo rotulo="Como ler">{verbete.comoLer}</Campo>
            <Campo rotulo="Ponte de decisão">{verbete.ponte}</Campo>
            <Campo rotulo="Armadilha" destaque>
              <span className="inline-flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                <span>{verbete.armadilha}</span>
              </span>
            </Campo>
          </div>
        </Collapsible>
      )}

      {/* ── Nível 3 — Modo mesa (números crus + auditoria) ── */}
      <Collapsible
        icon={<Microscope className="h-3.5 w-3.5 text-primary" />}
        title="Modo mesa — números, fórmula e premissas"
        defaultOpen={!veredito}
      >
        <div className="space-y-4">
          <ResultView result={result} />
          {verbete && (
            <div className="rounded-md border border-white/5 bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Fórmula</div>
              <p className="text-[11px] font-mono text-foreground/80 mt-1 leading-relaxed break-words">{verbete.formula}</p>
            </div>
          )}
          {snapshot && (
            <p className="text-[10px] text-muted-foreground/60">
              Premissas de {snapshot.dataRef} — fontes por premissa no selo acima. Taxas internas em fração decimal
              (convenção do motor); percentuais convertidos na exibição.
            </p>
          )}
        </div>
      </Collapsible>
    </div>
  );
}
