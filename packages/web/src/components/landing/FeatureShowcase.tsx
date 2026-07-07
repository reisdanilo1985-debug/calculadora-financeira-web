import React from 'react';
import {
  ArrowRight,
  BrainCircuit,
  Calculator,
  GitCompare,
  Globe,
  Landmark,
  Percent,
  TrendingUp,
} from 'lucide-react';
import { useInView } from '@/hooks/useInView';

const INDEX_CHIPS = ['CDI', 'Selic', 'IPCA', 'IGP-M', 'INCC', 'SOFR', 'Pré', 'PTAX'];

const TREASURY_CHIPS = [
  'Swap CDI×Pré',
  'Duration & DV01',
  'PU LTN/NTN-F',
  'Forward & NDF',
  'TIR / VPL',
  'Curvas DI',
];

const SMALL_FEATURES = [
  {
    key: 'comparador',
    icon: GitCompare,
    title: 'Comparador de Cenários',
    desc: 'Múltiplos indexadores lado a lado — descubra a melhor alternativa em segundos.',
    color: 'text-cyan-400',
  },
  {
    key: 'cambio',
    icon: Globe,
    title: 'Central de Câmbio',
    desc: 'USD, EUR, GBP, JPY, CHF e CNY com conversor instantâneo e histórico gráfico.',
    color: 'text-violet-400',
  },
  {
    key: 'ptax',
    icon: Landmark,
    title: 'PTAX BCB Oficial',
    desc: 'Boletins de fechamento direto do serviço Olinda do Banco Central.',
    color: 'text-blue-400',
  },
  {
    key: 'wacc',
    icon: Percent,
    title: 'WACC Damodaran',
    desc: 'Custo de capital com betas setoriais NYU Stern e memorial completo.',
    color: 'text-orange-400',
  },
  {
    key: 'aposentadoria',
    icon: BrainCircuit,
    title: 'Aposentadoria Monte Carlo',
    desc: 'INSS via EC 103/2019, PGBL/VGBL e 1.000+ simulações de longo prazo.',
    color: 'text-pink-400',
  },
];

interface FeatureShowcaseProps {
  onNavigate: (view: string) => void;
}

/** Grid bento com os 7 módulos: 2 cards grandes (Calculadora e Tesouraria) + 5 menores. */
export function FeatureShowcase({ onNavigate }: FeatureShowcaseProps) {
  const { ref, inView } = useInView<HTMLDivElement>(0.1);

  return (
    <section id="funcionalidades" className="w-full max-w-[1200px] mx-auto px-6 py-20 z-10 relative">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-foreground">Sete módulos, um terminal</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Dados oficiais, metodologias consagradas e memoriais auditáveis em tudo
        </p>
      </div>

      <div ref={ref} className={`animate-on-scroll ${inView ? 'in-view' : ''}`}>
        {/* Cards grandes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <BigCard
            icon={TrendingUp}
            color="text-emerald-400"
            title="Calculadora de Correção"
            desc="Motor de atualização monetária com fator diário alinhado ao BACEN, cinco teses de cálculo (correção simples, valor presente, carência, fluxo SAC/Price/Bullet e juros remuneratórios), amortizações e memorial passo a passo exportável em Excel e PDF."
            chips={INDEX_CHIPS}
            onClick={() => onNavigate('calculadora')}
          />
          <BigCard
            icon={Landmark}
            color="text-amber-400"
            title="Mesa de Tesouraria"
            desc="Treze calculadoras profissionais para operações de mercado: swap, duration e convexidade, preço unitário de títulos públicos, forward e NDF de dólar, TIR/VPL e conversões entre convenções de juros — com premissas de mercado ao vivo."
            chips={TREASURY_CHIPS}
            onClick={() => onNavigate('tesouraria')}
          />
        </div>

        {/* Cards menores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {SMALL_FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.key}
                onClick={() => onNavigate(f.key)}
                className="glass-card shine-on-hover card-hover rounded-xl p-5 cursor-pointer group"
              >
                <div className={`inline-flex p-2.5 rounded-lg bg-black/40 border border-white/5 mb-3 ${f.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1.5 group-hover:text-primary transition-colors">
                  {f.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BigCard({ icon: Icon, color, title, desc, chips, onClick }: {
  icon: React.ElementType;
  color: string;
  title: string;
  desc: string;
  chips: string[];
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="glass-card shine-on-hover card-hover rounded-xl p-7 cursor-pointer group flex flex-col"
    >
      <div className={`inline-flex self-start p-3 rounded-xl bg-black/40 border border-white/5 mb-4 group-hover:scale-110 transition-transform ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed flex-1">{desc}</p>

      <div className="flex flex-wrap gap-2 mt-5">
        {chips.map(chip => (
          <span
            key={chip}
            className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/10 text-[11px] font-mono text-foreground/70"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs font-medium text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
        Acessar módulo <ArrowRight className="h-3 w-3" />
      </div>
    </div>
  );
}
