import React, { useEffect, useState } from 'react';
import { useInView } from '@/hooks/useInView';

const STATS = [
  { value: 8, suffix: '', label: 'indexadores oficiais' },
  { value: 13, suffix: '', label: 'calculadoras de tesouraria' },
  { value: 6, suffix: '', label: 'moedas com PTAX BCB' },
  { value: 1000, suffix: '+', label: 'cenários Monte Carlo' },
  { value: 28, suffix: '', label: 'dígitos de precisão Decimal' },
];

/** Contador que anima de 0 até o valor quando entra no viewport. */
function AnimatedCounter({ target, suffix, active }: { target: number; suffix: string; active: boolean }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }

    const duration = 1200;
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // Ease-out cúbico
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);

  return (
    <span className="font-mono tabular-nums">
      {new Intl.NumberFormat('pt-BR').format(value)}
      {suffix}
    </span>
  );
}

/** Faixa horizontal com números-âncora do produto, animados on-scroll. */
export function StatsBar() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);

  return (
    <section className="w-full border-y border-white/5 bg-black/30 py-10 z-10 relative">
      <div
        ref={ref}
        className={`max-w-[1200px] mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-8 text-center animate-on-scroll ${inView ? 'in-view' : ''}`}
      >
        {STATS.map(stat => (
          <div key={stat.label}>
            <p className="text-3xl md:text-4xl font-extrabold text-gradient-primary">
              <AnimatedCounter target={stat.value} suffix={stat.suffix} active={inView} />
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
