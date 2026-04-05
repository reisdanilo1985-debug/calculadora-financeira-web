import React, { useState } from 'react';
import {
  User,
  Landmark,
  TrendingUp,
  HeartPulse,
  BarChart3,
  HelpCircle,
  Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RetirementRequest } from '@/lib/api';

interface RetirementFormProps {
  onCalculate: (data: RetirementRequest) => void;
  loading: boolean;
}

const DEFAULT_INPUT: RetirementRequest = {
  idadeAtual: 35,
  idadeAposentadoria: 65,
  expectativaVida: 90,
  genero: 'M',
  patrimonioTributavel: 0,
  saldoPGBL: 0,
  saldoVGBL: 0,
  rendaAluguel: 0,
  aporteMensal: 2000,
  aportePGBL: 0,
  aporteVGBL: 0,
  incluirINSS: true,
  salarioContribuicao: 5000,
  tempoContribuicaoAnos: 10,
  gastoMensalDesejado: 8000,
  incluirInflacaoMedica: true,
  gastoMensalSaude: 1200,
  perfilRisco: 'moderado',
  ipcaMeta: 3.5,
  tabelaPGBL: 'regressiva',
  numeroSimulacoes: 1000,
};

export function RetirementForm({ onCalculate, loading }: RetirementFormProps) {
  const [form, setForm] = useState<RetirementRequest>(DEFAULT_INPUT);

  const set = (field: Partial<RetirementRequest>) => setForm(prev => ({ ...prev, ...field }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCalculate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Dados Pessoais ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <User className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Dados Pessoais</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Idade Atual</Label>
            <Input type="number" value={form.idadeAtual} min={18} max={90}
              onChange={e => set({ idadeAtual: +e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Idade de Aposentadoria</Label>
            <Input type="number" value={form.idadeAposentadoria} min={form.idadeAtual + 1} max={99}
              onChange={e => set({ idadeAposentadoria: +e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Expectativa de Vida</Label>
            <Input type="number" value={form.expectativaVida} min={form.idadeAposentadoria + 1} max={110}
              onChange={e => set({ expectativaVida: +e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Gênero</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.genero}
              onChange={e => set({ genero: e.target.value as 'M' | 'F' })}
            >
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Patrimônio Atual ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Landmark className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Patrimônio Atual (R$)</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Patrimônio Tributável
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="CDB, Tesouro Direto, ações, FIIs, LCI/LCA" />
            </Label>
            <Input type="number" value={form.patrimonioTributavel || ''}
              onChange={e => set({ patrimonioTributavel: +e.target.value || 0 })}
              placeholder="R$ 0,00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Saldo PGBL
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Plano Gerador de Benefício Livre — IR na saída sobre valor total" />
            </Label>
            <Input type="number" value={form.saldoPGBL || ''}
              onChange={e => set({ saldoPGBL: +e.target.value || 0 })}
              placeholder="R$ 0,00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Saldo VGBL
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Vida Gerador de Benefício Livre — IR só sobre o rendimento" />
            </Label>
            <Input type="number" value={form.saldoVGBL || ''}
              onChange={e => set({ saldoVGBL: +e.target.value || 0 })}
              placeholder="R$ 0,00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Renda de Aluguel (R$/mês)
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Renda de imóveis. Isenta de PGBL/VGBL, tributada como pessoa física" />
            </Label>
            <Input type="number" value={form.rendaAluguel || ''}
              onChange={e => set({ rendaAluguel: +e.target.value || 0 })}
              placeholder="R$ 0,00" />
          </div>
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Aportes Mensais ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <TrendingUp className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Aportes Mensais (R$)</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Geral (Tributável)</Label>
            <Input type="number" value={form.aporteMensal || ''}
              onChange={e => set({ aporteMensal: +e.target.value || 0 })}
              placeholder="ex: 2.000" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              PGBL
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Máx. 12% da renda bruta anual. Dedutível no IR." />
            </Label>
            <Input type="number" value={form.aportePGBL || ''}
              onChange={e => set({ aportePGBL: +e.target.value || 0 })}
              placeholder="ex: 800" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">VGBL</Label>
            <Input type="number" value={form.aporteVGBL || ''}
              onChange={e => set({ aporteVGBL: +e.target.value || 0 })}
              placeholder="ex: 500" />
          </div>
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── INSS ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Landmark className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Previdência Social (INSS)</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-muted-foreground">Incluir</span>
            <input
              type="checkbox"
              checked={form.incluirINSS}
              onChange={e => set({ incluirINSS: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
          </label>
        </div>
        {form.incluirINSS && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Salário de Contribuição (R$/mês)</Label>
              <Input type="number" value={form.salarioContribuicao || ''}
                onChange={e => set({ salarioContribuicao: +e.target.value || 0 })}
                placeholder="ex: 5.000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                Tempo de Contribuição (anos)
                <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Anos já contribuídos. O motor soma os anos restantes até a aposentadoria." />
              </Label>
              <Input type="number" value={form.tempoContribuicaoAnos || ''}
                onChange={e => set({ tempoContribuicaoAnos: +e.target.value || 0 })}
                placeholder="ex: 10" />
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Gastos na Aposentadoria ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <HeartPulse className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Gastos na Aposentadoria</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Gasto Mensal Desejado (R$ de hoje)
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Valor em R$ atuais. O motor corrige pela IPCA até a data de aposentadoria." />
            </Label>
            <Input type="number" value={form.gastoMensalDesejado || ''}
              onChange={e => set({ gastoMensalDesejado: +e.target.value || 0 })}
              placeholder="ex: 8.000" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Gasto Saúde (R$/mês)
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Plano de saúde e despesas médicas. Cresce IPCA + 3% a.a." />
            </Label>
            <div className="flex items-center gap-2">
              <Input type="number" value={form.gastoMensalSaude || ''}
                onChange={e => set({ gastoMensalSaude: +e.target.value || 0 })}
                placeholder="ex: 1.200"
                disabled={!form.incluirInflacaoMedica} />
              <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={form.incluirInflacaoMedica}
                  onChange={e => set({ incluirInflacaoMedica: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-[10px] text-muted-foreground">+3% a.a.</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Premissas ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <BarChart3 className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Premissas de Mercado</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Perfil de Risco</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.perfilRisco}
              onChange={e => set({ perfilRisco: e.target.value as any })}
            >
              <option value="conservador">Conservador — Tesouro IPCA+, CDB, LCI/LCA</option>
              <option value="moderado">Moderado — 50% renda fixa + 50% ações/FIIs</option>
              <option value="agressivo">Agressivo — 80% renda variável (ações + BDRs)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Meta IPCA (% a.a.)
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Inflação esperada para correção dos gastos. Meta CMN 2025: 3,0%." />
            </Label>
            <div className="relative">
              <Input type="number" step="0.1" value={form.ipcaMeta || ''}
                onChange={e => set({ ipcaMeta: +e.target.value || 3.5 })}
                placeholder="ex: 3.5"
                className="pr-12" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">% a.a.</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tabela PGBL/VGBL</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.tabelaPGBL}
              onChange={e => set({ tabelaPGBL: e.target.value as any })}
            >
              <option value="regressiva">Regressiva (10% a 35% conforme prazo)</option>
              <option value="progressiva">Progressiva (tabela normal IR)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Simulações Monte Carlo
              <HelpCircle className="h-3 w-3 text-muted-foreground/60" title="Quanto mais simulações, mais preciso. Máximo: 5.000." />
            </Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.numeroSimulacoes}
              onChange={e => set({ numeroSimulacoes: +e.target.value })}
            >
              <option value={500}>500 (rápido)</option>
              <option value={1000}>1.000 (padrão)</option>
              <option value={2000}>2.000 (preciso)</option>
              <option value={5000}>5.000 (máximo)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <Button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 h-11">
          <Calculator className="h-4 w-4" />
          {loading ? 'Simulando...' : 'Simular Aposentadoria'}
        </Button>
        <p className="text-[10px] text-center text-muted-foreground mt-3 uppercase tracking-tighter opacity-60">
          Monte Carlo · EC 103/2019 · Damodaran Risk Premium · Tábua IBGE 2024
        </p>
      </div>
    </form>
  );
}
