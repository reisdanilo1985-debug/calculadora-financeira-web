# Calculadora de Correção Financeira — CLAUDE.md

## Visão Geral
Aplicação web profissional para cálculos de correção monetária com múltiplos indexadores.
Este repositório (`projeto-web`) é a versão de **deploy cloud** (Vercel + Render).
A versão de **desenvolvimento local** está em `../correcao-financeira`.

## Deploy
- **Frontend**: Vercel — conectado a este repo, branch `main`, auto-deploy
- **Backend**: Render — conectado a este repo, branch `main`, auto-deploy
- Push para `main` dispara deploy automático nos dois serviços

## Estrutura do Monorepo
```
packages/
  core/   → Motor de cálculo puro TypeScript (sem dependências de UI)
  api/    → Backend Express + cache SQLite
  web/    → Frontend React + Vite + Tailwind + shadcn/ui
```

## CRÍTICO — baseURL dinâmica em `packages/web/src/lib/api.ts`
Este arquivo DEVE ter baseURL dinâmica via `VITE_API_URL`. **Nunca sobrescrever com `/api` fixo.**
```ts
const rawUrl = import.meta.env.VITE_API_URL || '';
const baseURL = rawUrl.endsWith('/api') ? rawUrl : (rawUrl ? `${rawUrl}/api` : '/api');
const api = axios.create({ baseURL, timeout: 30000, headers: { 'Content-Type': 'application/json' } });
```
Se após um sync com `correcao-financeira` esse trecho estiver com `baseURL: '/api'`, restaurar imediatamente.

## Mapa de Arquivos-Chave
| Área | Arquivo |
|------|---------|
| Calculadora principal (form) | `packages/web/src/components/calculator/CalculatorForm.tsx` |
| Painel de câmbio + conversor | `packages/web/src/components/exchange/ExchangePanel.tsx` |
| Ticker de cotações (topo) | `packages/web/src/components/dashboard/LiveTickerBar.tsx` |
| Página principal / navegação | `packages/web/src/pages/HomePage.tsx` |
| Cliente HTTP (frontend) | `packages/web/src/lib/api.ts` ← ver aviso acima |
| Animação CSS do ticker | `packages/web/src/index.css` |
| Tickers de mercado (Yahoo Finance) | `packages/api/src/services/MarketDashboardService.ts` |
| Rotas de câmbio (BCB) | `packages/api/src/routes/exchange.ts` |
| Serviço de câmbio | `packages/api/src/services/ExchangeService.ts` |

## Workflow de Sync (receber mudanças de correcao-financeira)
1. Copiar arquivo(s) modificados de `../correcao-financeira/` para o mesmo caminho aqui
2. **Se `api.ts` foi copiado**: verificar e restaurar o bloco `VITE_API_URL` acima
3. `git add <arquivos> && git commit -m "..." && git push origin main`

## Componentes UI Importantes
- **Accordion**: `AccordionTrigger` aceita props `id`, `icon`, `subtitle` e `children` (título)
- **NumericFormat**: de `react-number-format`, usado para inputs de valor monetário
- **Ticker animation**: `animate-marquee` em `index.css`, conteúdo triplicado para loop contínuo
  - Duração atual: 30s; keyframe: `translateX(-33.33333%)`

## Ticker de Mercado
Símbolos Yahoo Finance em `MarketDashboardService.ts`:
- USD/BRL: `USDBRL=X` (**não** `BRL=X`)
- BR 10Y: `BR10YT=RR`, JP 10Y: `JP10YT=RR` — podem não retornar dados do Yahoo

## Câmbio
- CNY não está no SGS do BCB — usa AwesomeAPI como fallback
- `/api/exchange/latest` busca últimos 7 dias para garantir ao menos 1 dia útil

## Regras Críticas de Negócio

### Precisão Numérica
- **NUNCA** usar aritmética nativa de ponto flutuante (`Number`) para cálculos financeiros
- **SEMPRE** usar `Decimal` do pacote `decimal.js` com mínimo 10 casas decimais

### CDI / Selic (Base 252 dias úteis)
```
fator_diario = (1 + taxa_anual/100) ^ (1/252)
```
- Percentual do CDI (ex: 110%): `(1 + 1.10 * taxa/100)^(1/252)`

### IPCA / IGP-M / INCC (Índices Mensais)
```
fator_pro_rata = (1 + indice_mensal/100) ^ (dias_utilizados / dias_do_mes)
```

### SOFR (ACT/360)
```
fator = produto de (1 + sofr_diario/100 * dias_corridos/360) para cada dia
```

### Taxa Pré-fixada
- Base 252: `(1 + taxa)^(du/252)` | Base 360: `(1 + taxa)^(dc/360)` | Base 365: `(1 + taxa)^(dc/365)`

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

## Variáveis de Ambiente
```
# packages/api — configurar no Render
PORT=3001
FRED_API_KEY=
DATABASE_PATH=./data/cache.db

# packages/web — configurar no Vercel
VITE_API_URL=https://<render-service>.onrender.com
```

## Convenções de Código
- Valores monetários em `Decimal` durante cálculo; `number` apenas na serialização JSON
- Datas: `Date` nativos internamente, `string DD/MM/YYYY` na interface com BCB
- Funções puras em `core/` — sem side effects, sem I/O
- Logs: `winston` no `api/`, `console` apenas em desenvolvimento
