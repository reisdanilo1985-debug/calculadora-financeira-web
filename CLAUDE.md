# Calculadora de Correção Financeira — CLAUDE.md

## Visão Geral
Aplicação web profissional para cálculos de correção monetária com múltiplos indexadores.

## Estrutura do Monorepo
```
packages/
  core/   → Motor de cálculo puro TypeScript (sem dependências de UI)
  api/    → Backend Express + cache SQLite
  web/    → Frontend React + Vite + Tailwind + shadcn/ui
```

## Regras Críticas de Negócio

### Precisão Numérica
- **NUNCA** usar aritmética nativa de ponto flutuante (`Number`) para cálculos financeiros
- **SEMPRE** usar `Decimal` do pacote `decimal.js` com mínimo 10 casas decimais
- Exibição formatada usa no máximo 6-8 casas decimais

### CDI / Selic (Base 252 dias úteis)
```
fator_diario = (1 + taxa_anual/100) ^ (1/252)
fator_acumulado = produto de todos os fatores diários no período
```
- Calendário de feriados brasileiro: ver `packages/core/src/utils/businessDays.ts`
- Percentual do CDI (ex: 110%): aplicar ANTES da exponenciação → `(1 + 1.10 * taxa/100)^(1/252)`

### IPCA / IGP-M / INCC (Índices Mensais)
```
fator_pro_rata = (1 + indice_mensal/100) ^ (dias_utilizados / dias_do_mes)
```
- Base 360 ou 365: configurável pelo usuário, afeta o cálculo do pro-rata

### SOFR (ACT/360)
```
fator = produto de (1 + sofr_diario/100 * dias_corridos/360) para cada dia
```
- Fins de semana e feriados: replicar taxa do último dia útil

### Taxa Pré-fixada
- Base 252: `(1 + taxa)^(du/252)` — du = dias úteis
- Base 360: `(1 + taxa)^(dc/360)` — dc = dias corridos
- Base 365: `(1 + taxa)^(dc/365)` — dc = dias corridos

### Composição com Spread
- IPCA + 6% a.a.: `fator_final = fator_ipca * (1 + 0.06)^(dc/365)`
- 110% do CDI: `fator_diario = (1 + 1.10 * cdi/100)^(1/252)`

## Fontes de Dados
| Indexador | API | Série SGS |
|-----------|-----|-----------|
| CDI | BCB SGS | 12 |
| Selic Meta | BCB SGS | 432 |
| Selic Over | BCB SGS | 1178 |
| IPCA | BCB SGS | 433 |
| IGP-M | BCB SGS | 189 |
| INCC | BCB SGS | 192 |
| SOFR | FRED API | SOFR |

Endpoint BCB: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json&dataInicial=DD/MM/YYYY&dataFinal=DD/MM/YYYY`

## Variáveis de Ambiente
```
# packages/api/.env
PORT=3001
FRED_API_KEY=  # API key gratuita em fred.stlouisfed.org/docs/api/api_key.html
DATABASE_PATH=./data/cache.db
```

## Convenções de Código
- Todos os valores monetários em `Decimal` durante cálculo
- Datas: objetos `Date` nativos internamente, `string DD/MM/YYYY` na interface com BCB
- Funções puras em `core/` — sem side effects, sem I/O
- Logs: usar `winston` no `api/`, `console` apenas em desenvolvimento
