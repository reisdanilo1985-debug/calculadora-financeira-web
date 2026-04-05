import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Globe, 
  TrendingUp, 
  Calculator, 
  Info, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  getWaccSetores, 
  getWaccPaises, 
  getWaccMarketParams, 
  WaccSetor, 
  WaccPais, 
  WaccRequest 
} from '@/lib/api';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WaccFormProps {
  onCalculate: (data: WaccRequest) => void;
  loading: boolean;
}

export function WaccForm({ onCalculate, loading }: WaccFormProps) {
  const [setores, setSetores] = useState<WaccSetor[]>([]);
  const [paises, setPaises] = useState<WaccPais[]>([]);
  const [marketParams, setMarketParams] = useState<{ rf: number; erp: number; fonte: string } | null>(null);

  const [formData, setFormData] = useState<WaccRequest>({
    setor: '',
    pais: 'BRA',
    moeda: 'BRL',
    taxaLivreDeRisco: 0,
    premioRiscoMercado: 0,
    betaDesalavancado: 0,
    premioRiscoPais: 0,
    premioTamanho: 0,
    marketCap: 0,
    dividaBruta: 0,
    aliquotaIR: 34,
    custoDividaPreTax: 0,
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [s, p, m] = await Promise.all([
          getWaccSetores(),
          getWaccPaises(),
          getWaccMarketParams()
        ]);
        setSetores(s);
        setPaises(p);
        setMarketParams(m);
        
        // Initial setup for Brazil
        const brasil = p.find(item => item.codigo === 'BRA');
        setFormData(prev => ({
          ...prev,
          taxaLivreDeRisco: m.rf,
          premioRiscoMercado: m.erp,
          premioRiscoPais: brasil?.crp || 0
        }));
      } catch (err) {
        console.error('Erro ao carregar dados do WACC:', err);
      }
    }
    loadData();
  }, []);

  const handleSetorChange = (setorId: string) => {
    const s = setores.find(item => item.id === setorId);
    setFormData(prev => ({
      ...prev,
      setor: setorId,
      betaDesalavancado: s?.betaDesalavancado || prev.betaDesalavancado
    }));
  };

  const handlePaisChange = (paisCodigo: string) => {
    const p = paises.find(item => item.codigo === paisCodigo);
    setFormData(prev => ({
      ...prev,
      pais: paisCodigo,
      premioRiscoPais: p?.crp || 0,
      moeda: paisCodigo === 'BRA' ? 'BRL' : (paisCodigo === 'USA' ? 'USD' : prev.moeda)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCalculate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Seção 1: Identificação ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Building2 className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Identificação da Empresa</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Setor de Atuação
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-[10px]">
                    Define o Beta Desalavancado (Risco do Negócio) conforme tabelas de Damodaran.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={formData.setor}
              onChange={(e) => handleSetorChange(e.target.value)}
              required
            >
              <option value="" disabled>Selecione um setor...</option>
              {setores.map(s => (
                <option key={s.id} value={s.id}>{s.nome} ({s.nomeEn})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">País de Atuação</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={formData.pais}
                onChange={(e) => handlePaisChange(e.target.value)}
              >
                {paises.map(p => (
                  <option key={p.codigo} value={p.codigo}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Moeda do Cálculo</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={formData.moeda}
                onChange={(e) => setFormData(prev => ({ ...prev, moeda: e.target.value as any }))}
              >
                <option value="BRL">BRL (R$)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Seção 2: Risco de Mercado ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Globe className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Risco de Mercado (CAPM)</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Taxa Livre de Risco (Rf)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-[10px]">
                    Sugerido: US Treasury 10Y (DGS10) por ser o benchmark global.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                className="pr-8"
                value={formData.taxaLivreDeRisco || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, taxaLivreDeRisco: parseFloat(e.target.value) || 0 }))}
                placeholder="ex: 4.20"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium uppercase">% a.a.</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Equity Risk Premium (ERP)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-[10px]">
                    Prêmio pelo risco de mercado global. Damodaran Jan/2025: 5.80%.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                className="pr-8"
                value={formData.premioRiscoMercado || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, premioRiscoMercado: parseFloat(e.target.value) || 0 }))}
                placeholder="ex: 5.80"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium uppercase">% a.a.</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Beta Desalavancado (β)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-[10px]">
                    Beta do setor sem dívida. Sugerido automaticamente ao selecionar o setor.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              type="number"
              step="0.01"
              value={formData.betaDesalavancado || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, betaDesalavancado: parseFloat(e.target.value) || 0 }))}
              placeholder="ex: 1.05"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Risco País (CRP)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-[10px]">
                    Country Risk Premium. Sugerido automaticamente ao selecionar o país.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                className="pr-8"
                value={formData.premioRiscoPais || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, premioRiscoPais: parseFloat(e.target.value) || 0 }))}
                placeholder="ex: 4.30"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium uppercase">% a.a.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Seção 3: Estrutura de Capital ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <TrendingUp className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Estrutura de Capital</h3>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Market Cap (Equity)</Label>
              <Input
                type="number"
                value={formData.marketCap || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, marketCap: parseFloat(e.target.value) || 0 }))}
                placeholder="Valor de Mercado"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Dívida Bruta (Market Value)</Label>
              <Input
                type="number"
                value={formData.dividaBruta || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, dividaBruta: parseFloat(e.target.value) || 0 }))}
                placeholder="Dívida de Mercado"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Alíquota de IR Efetiva (IRPJ+CSLL)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-[10px]">
                    No Brasil (Lucro Real): tipicamente 34%.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                className="pr-8"
                value={formData.aliquotaIR || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, aliquotaIR: parseFloat(e.target.value) || 0 }))}
                placeholder="ex: 34"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium uppercase">%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* ── Seção 4: Custo da Dívida ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Calculator className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Custo da Dívida</h3>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            Kd Pré-Impostos (Custo Bruto da Dívida)
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-[10px]">
                  Taxa anual média paga sobre as dívidas onerosas da firma.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              className="pr-8"
              value={formData.custoDividaPreTax || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, custoDividaPreTax: parseFloat(e.target.value) || 0 }))}
              placeholder="ex: 12.50"
              required
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium uppercase">% a.a.</span>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <Button 
          type="submit" 
          disabled={loading || !formData.setor} 
          className="w-full flex items-center justify-center gap-2 h-11"
        >
          <Calculator className="h-4 w-4" />
          {loading ? 'Calculando...' : 'Calcular WACC / CMPC'}
        </Button>
        <p className="text-[10px] text-center text-muted-foreground mt-3 uppercase tracking-tighter opacity-60">
          Fundamentação: Metodologia Aswath Damodaran (NYU Stern)
        </p>
      </div>
    </form>
  );
}
