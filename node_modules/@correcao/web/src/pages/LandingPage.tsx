import React from 'react';
import { TrendingUp, GitCompare, Globe, ShieldCheck, Database, ArrowRight } from 'lucide-react';
import { LiveTickerBar } from '../components/dashboard/LiveTickerBar';

interface LandingPageProps {
  onNavigate: (view: string) => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="flex-1 flex flex-col relative w-full overflow-y-auto">
      
      {/* ── Background Decorativo ── */}
      <div className="absolute top-[-10%] right-[-5%] w-[800px] h-[800px] bg-primary/5 rounded-full blur-[150px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />

      {/* ── Hero Section ── */}
      <section className="relative w-full pt-20 pb-24 px-6 flex flex-col items-center justify-center text-center z-10 min-h-[500px]">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6 animate-fade-in">
          <ShieldCheck className="h-4 w-4" />
          <span>Auditoria Financeira Suprema</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground max-w-4xl mb-6 leading-tight animate-slide-in-right">
          O Padrão Ouro em <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">
            Modelagem Econômica
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed font-light">
          A plataforma definitiva para cálculos complexos, simulação de múltiplos cenários rentáveis e análise global de moedas. Tenha o poder do Banco Central e dos mercados mundiais no seu navegador.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center w-full">
          <button
            onClick={() => onNavigate('calculadora')}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3.5 rounded-lg transition-all w-full sm:w-auto shadow-[0_0_20px_rgba(45,212,191,0.3)] hover:shadow-[0_0_30px_rgba(45,212,191,0.5)] hover:-translate-y-0.5"
          >
            Acessar Terminal
            <ArrowRight className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => onNavigate('cambio')}
            className="flex items-center justify-center gap-2 bg-card hover:bg-card/80 border border-white/10 text-foreground font-medium px-8 py-3.5 rounded-lg transition-all w-full sm:w-auto hover:-translate-y-0.5"
          >
            <Globe className="h-4 w-4 text-muted-foreground" />
            Explorar Câmbio
          </button>
        </div>
      </section>

      {/* ── Feature Cards (Ficheiros) ── */}
      <section className="w-full max-w-[1200px] mx-auto px-6 pb-24 z-10">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-foreground">A suíte completa de ferramentas</h2>
          <p className="text-sm text-muted-foreground mt-2">Navegue pelas nossas engrenagens primárias de alta performance</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard 
            icon={TrendingUp}
            title="Calculadora Oficial"
            desc="Motor de correção monetária instantâneo baseado em CDI, IPCA, Selic, SOFR e mais. Precisão com fator acumulado diário perfeitamente alinhado com o BACEN."
            color="text-emerald-400"
            onClick={() => onNavigate('calculadora')}
          />
          <FeatureCard 
            icon={GitCompare}
            title="Comparador de Cenários"
            desc="Crie e compare simultaneamente múltiplas projeções financeiras. Descubra qual indexador oferece a melhor rentabilidade ou o menor custo em segundos."
            color="text-cyan-400"
            onClick={() => onNavigate('comparador')}
          />
          <FeatureCard 
            icon={Globe}
            title="Central de Câmbio"
            desc="Cross-rate de moedas globais (USD, EUR, GBP, JPY, CNY) com gráficos dinâmicos de alta interatividade e capacidade imediata de exportação CSV para planilhas."
            color="text-violet-400"
            onClick={() => onNavigate('cambio')}
          />
        </div>
      </section>
      
      {/* ── Trust Section ── */}
      <section className="w-full border-t border-white/5 bg-black/40 py-16 mt-auto z-10">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-8">
            Fontes de Dados Em Tempo Real Integradas
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale">
            <div className="flex items-center gap-2 font-bold text-lg"><Database className="h-5 w-5"/> Banco Central do Brasil</div>
            <div className="flex items-center gap-2 font-bold text-lg"><TrendingUp className="h-5 w-5"/> IBGE / FGV</div>
            <div className="flex items-center gap-2 font-bold text-lg"><Globe className="h-5 w-5"/> FRED St. Louis</div>
            <div className="flex items-center gap-2 font-bold text-lg"><Globe className="h-5 w-5"/> Yahoo Finance API</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc, color, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className="glass-card p-6 flex flex-col items-start text-left cursor-pointer hover:bg-white/[0.03] transition-all group"
    >
      <div className={`p-3 rounded-xl bg-black/40 border border-white/5 mb-4 group-hover:scale-110 transition-transform ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {desc}
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs font-medium text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
        Acessar Ferramenta <ArrowRight className="h-3 w-3" />
      </div>
    </div>
  );
}
