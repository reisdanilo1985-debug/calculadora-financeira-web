import React from 'react';
import {
  Calculator,
  GitCompare,
  Globe,
  TrendingUp,
  Landmark,
  CandlestickChart,
  Percent,
  PiggyBank,
  Database,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  /** Rótulo curto (barra inferior no celular). */
  short: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Seções da plataforma — dirige a navbar (desktop), o menu lateral e a barra inferior (mobile). */
export const NAV_ITEMS: NavItem[] = [
  { key: 'calculadora', label: 'Calculadora', short: 'Calc.', icon: Calculator },
  { key: 'comparador', label: 'Comparador', short: 'Comparar', icon: GitCompare },
  { key: 'cambio', label: 'Câmbio', short: 'Câmbio', icon: Globe },
  { key: 'ptax', label: 'PTAX BCB', short: 'PTAX', icon: TrendingUp },
  { key: 'tesouraria', label: 'Tesouraria', short: 'Tesour.', icon: Landmark },
  { key: 'opcoes', label: 'Opções', short: 'Opções', icon: CandlestickChart },
  { key: 'wacc', label: 'WACC', short: 'WACC', icon: Percent },
  { key: 'aposentadoria', label: 'Aposentadoria', short: 'Aposent.', icon: PiggyBank },
  { key: 'indices', label: 'Índices / Admin', short: 'Índices', icon: Database },
];

/** Abas com atalho direto na barra inferior do celular; as demais ficam em "Mais". */
export const PRIMARY_TABS: readonly string[] = ['calculadora', 'comparador', 'cambio', 'tesouraria'];
