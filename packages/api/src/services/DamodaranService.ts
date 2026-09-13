/**
 * Serviço de dados Damodaran — betas setoriais, prêmios de risco por país e parâmetros de mercado
 * (Rf e ERP) por moeda e regime (nominal/real), com data-base e versão da tabela.
 *
 * Versão da tabela: DAMODARAN_VERSAO (safra January 2026; consultado em 13/09/2026).
 * Fontes (NYU Stern, Aswath Damodaran):
 *   - Betas: https://pages.stern.nyu.edu/~adamodar/pc/datasets/betaemerg.xls
 *     (Emerging Markets, "Date updated" 05/01/2026; coluna "Unlevered beta")
 *   - CRP e ratings: https://pages.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.xlsx
 *     (aba "ERPs by country", January 1, 2026 update, ratings revistos em 16/02/2026;
 *      mature market ERP 4,23%, ERP dos EUA 4,46%)
 *   - Rf em USD: https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPbymonth.xlsx
 *     (linha 01/01/2026: T.Bond 10 anos 4,18%; "$ Riskfree Rate" 3,95% = T.Bond − spread de default dos EUA)
 * Inflação esperada usada no ajuste entre moedas (metas oficiais):
 *   - BRL 3,00% a.a.: Resolução CMN nº 5.141, de 26/06/2024 (meta contínua do IPCA a partir de 2025)
 *   - USD 2,00% a.a.: Federal Reserve/FOMC, meta de inflação de longo prazo
 *   - EUR 2,00% a.a.: BCE, meta simétrica de 2% (HICP)
 *
 * Atualização: trocar os valores abaixo pela nova safra e incrementar DAMODARAN_VERSAO.
 */

import {
  ajustarTaxaPorDiferencialInflacao,
  taxaRealDeNominal,
} from '@correcao/core';

export type Moeda = 'BRL' | 'USD' | 'EUR';
export type Regime = 'nominal' | 'real';

export const MOEDAS: readonly Moeda[] = ['BRL', 'USD', 'EUR'];
export const REGIMES: readonly Regime[] = ['nominal', 'real'];

export const DAMODARAN_VERSAO = {
  id: 'damodaran-2026-01',
  dataBase: 'January 2026',
  dataBaseISO: '2026-01-01',
  consultadoEm: '2026-09-13',
  fontes: {
    betas: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/betaemerg.xls (Emerging Markets, atualizado em 05/01/2026)',
    paises: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.xlsx (January 1, 2026 update; ratings de 16/02/2026)',
    riskfree: 'https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPbymonth.xlsx (linha 01/01/2026)',
  },
} as const;

export interface SetorData {
  id: string;
  nome: string;       // Nome PT-BR
  nomeEn: string;     // Indústria na tabela Damodaran (nome exato)
  betaDesalavancado: number;  // β unlevered (Emerging Markets, data-base em dataBase)
  betaAlavancado?: number;    // β levered médio do setor (referência)
  relacaoDividaEquity?: number; // D/E médio do setor
  regiao: string;     // recorte da tabela Damodaran
  dataBase: string;   // data-base do valor
  fonte: string;
  observacao?: string;
}

export interface PaisData {
  codigo: string;
  nome: string;
  crp: number;        // Country Risk Premium (% a.a.)
  erp?: number;       // ERP total do país (mature market ERP + CRP)
  spreadDefault?: number; // spread de default pelo rating (% a.a.)
  ratingMoody?: string;
  moeda: Moeda;       // moeda em que o prêmio foi estimado (spreads de títulos/CDS em USD)
  dataBase: string;
  fonte: string;
}

const BASE_SETOR = {
  regiao: 'Emerging Markets',
  dataBase: DAMODARAN_VERSAO.dataBase,
  fonte: DAMODARAN_VERSAO.fontes.betas,
};

/**
 * Betas desalavancados por setor — Mercados Emergentes (Damodaran, January 2026).
 * Valores da coluna "Unlevered beta" arredondados a 2 casas.
 */
export const SETORES_DAMODARAN: SetorData[] = [
  { id: 'aeroespacial',    nome: 'Aeroespacial e Defesa',         nomeEn: 'Aerospace/Defense',                      betaDesalavancado: 1.18, ...BASE_SETOR },
  { id: 'agronegocio',     nome: 'Agronegócio',                   nomeEn: 'Farming/Agriculture',                    betaDesalavancado: 0.46, ...BASE_SETOR },
  { id: 'automoveis',      nome: 'Automóveis e Caminhões',        nomeEn: 'Auto & Truck',                           betaDesalavancado: 1.04, ...BASE_SETOR },
  { id: 'bancos',          nome: 'Bancos',                        nomeEn: 'Bank (Money Center)',                    betaDesalavancado: 0.25, ...BASE_SETOR },
  { id: 'bancos_reg',      nome: 'Bancos Regionais',              nomeEn: 'Banks (Regional)',                       betaDesalavancado: 0.12, ...BASE_SETOR },
  { id: 'biotecnologia',   nome: 'Biotecnologia',                 nomeEn: 'Drugs (Biotechnology)',                  betaDesalavancado: 1.34, ...BASE_SETOR },
  { id: 'construcao',      nome: 'Construção Civil',              nomeEn: 'Homebuilding',                           betaDesalavancado: 0.47, ...BASE_SETOR },
  { id: 'consumo_basico',  nome: 'Consumo Básico (Alimentos)',    nomeEn: 'Food Processing',                        betaDesalavancado: 0.56, ...BASE_SETOR },
  { id: 'educacao',        nome: 'Educação',                      nomeEn: 'Education',                              betaDesalavancado: 0.67, ...BASE_SETOR },
  { id: 'energia_eletrica',nome: 'Energia Elétrica (Utilities)',  nomeEn: 'Power',                                  betaDesalavancado: 0.43, ...BASE_SETOR,
    observacao: 'Indústria "Power" (geração/distribuição de energia elétrica) na classificação de 2026.' },
  { id: 'energia_petro',   nome: 'Energia — Petróleo e Gás',     nomeEn: 'Oil/Gas (Integrated)',                   betaDesalavancado: 0.70, ...BASE_SETOR },
  { id: 'farmacos',        nome: 'Farmacêutico',                  nomeEn: 'Drugs (Pharmaceutical)',                 betaDesalavancado: 0.97, ...BASE_SETOR },
  { id: 'financeiras',     nome: 'Financeiras (não banco)',       nomeEn: 'Financial Svcs. (Non-bank & Insurance)', betaDesalavancado: 0.37, ...BASE_SETOR },
  { id: 'imobiliario',     nome: 'Imobiliário (FIIs / REITs)',    nomeEn: 'Real Estate (General/Diversified)',      betaDesalavancado: 0.66, ...BASE_SETOR,
    observacao: 'Mapeamento mantido em "Real Estate (General/Diversified)"; para REITs puros a tabela tem "R.E.I.T." (β 0,31).' },
  { id: 'industria_geral', nome: 'Indústria Geral',               nomeEn: 'Machinery',                              betaDesalavancado: 1.38, ...BASE_SETOR,
    observacao: '"Industrial Services" não existe na classificação de 2026; usado "Machinery".' },
  { id: 'logistica',       nome: 'Logística e Transporte',        nomeEn: 'Transportation',                         betaDesalavancado: 0.71, ...BASE_SETOR },
  { id: 'metalurgia',      nome: 'Metalurgia e Siderurgia',       nomeEn: 'Steel',                                  betaDesalavancado: 0.84, ...BASE_SETOR },
  { id: 'mineracao',       nome: 'Mineração',                     nomeEn: 'Metals & Mining',                        betaDesalavancado: 1.30, ...BASE_SETOR },
  { id: 'papel_celulose',  nome: 'Papel e Celulose',              nomeEn: 'Paper/Forest Products',                  betaDesalavancado: 0.51, ...BASE_SETOR },
  { id: 'publico',         nome: 'Setor Público / Concessões',    nomeEn: 'Utility (General)',                      betaDesalavancado: 0.55, ...BASE_SETOR,
    observacao: '"Public (Govt) Sector" não existe na tabela Damodaran; usado "Utility (General)" como proxy de concessões reguladas.' },
  { id: 'saude',           nome: 'Saúde e Hospitais',             nomeEn: 'Hospitals/Healthcare Facilities',        betaDesalavancado: 0.62, ...BASE_SETOR },
  { id: 'seguros',         nome: 'Seguros',                       nomeEn: 'Insurance (General)',                    betaDesalavancado: 0.30, ...BASE_SETOR },
  { id: 'software',        nome: 'Software e SaaS',               nomeEn: 'Software (Internet)',                    betaDesalavancado: 1.27, ...BASE_SETOR },
  { id: 'tech_hardware',   nome: 'Tecnologia — Hardware',         nomeEn: 'Computers/Peripherals',                  betaDesalavancado: 1.47, ...BASE_SETOR },
  { id: 'telecom',         nome: 'Telecomunicações',              nomeEn: 'Telecom. Services',                      betaDesalavancado: 0.57, ...BASE_SETOR },
  { id: 'textil_varejo',   nome: 'Têxtil e Vestuário',            nomeEn: 'Apparel',                                betaDesalavancado: 0.61, ...BASE_SETOR },
  { id: 'varejo',          nome: 'Varejo (Lojas)',                 nomeEn: 'Retail (General)',                       betaDesalavancado: 0.81, ...BASE_SETOR },
  { id: 'varejo_online',   nome: 'E-commerce / Varejo Online',    nomeEn: 'Retail (General)',                       betaDesalavancado: 0.81, ...BASE_SETOR,
    observacao: '"Retail (Online)" deixou de existir na classificação de 2026 (incorporado a "Retail (General)").' },
];

/** Prêmio pelo risco de um mercado maduro (Damodaran, January 2026) — % a.a. */
export const ERP_MERCADO_MADURO = 4.23;
/** Taxa do T-Bond de 10 anos dos EUA em 01/01/2026 — % a.a. */
export const US_TBOND_10A = 4.18;
/** Spread de default dos EUA (rating Aa1) usado por Damodaran — % a.a. */
export const US_SPREAD_DEFAULT = 0.23;
/** Rf em USD de Damodaran ("$ Riskfree Rate") = T-Bond 10a − spread de default dos EUA — % a.a. */
export const RF_USD = 3.95;

/** Inflação esperada por moeda usada no ajuste por diferencial de inflação (metas oficiais). */
export const INFLACAO_ESPERADA: Record<Moeda, { taxa: number; fonte: string }> = {
  BRL: { taxa: 3.0, fonte: 'Meta contínua do IPCA — Resolução CMN nº 5.141/2024' },
  USD: { taxa: 2.0, fonte: 'Meta de inflação de longo prazo do FOMC/Federal Reserve' },
  EUR: { taxa: 2.0, fonte: 'Meta simétrica de inflação do BCE (HICP)' },
};

const BASE_PAIS = {
  moeda: 'USD' as Moeda,
  dataBase: DAMODARAN_VERSAO.dataBase,
  fonte: DAMODARAN_VERSAO.fontes.paises,
};

/**
 * Prêmio de Risco País (CRP) por país — Damodaran (January 2026), método por rating (Moody's)
 * com o spread de default multiplicado pela volatilidade relativa ações/títulos (1,52).
 * ERP do país = ERP de mercado maduro (4,23%) + CRP.
 */
export const PAISES_DAMODARAN: PaisData[] = [
  { codigo: 'USA', nome: 'Estados Unidos', crp: 0.23, erp: 4.46,  spreadDefault: 0.23, ratingMoody: 'Aa1',  ...BASE_PAIS },
  { codigo: 'BRA', nome: 'Brasil',         crp: 3.24, erp: 7.47,  spreadDefault: 2.13, ratingMoody: 'Ba1',  ...BASE_PAIS },
  { codigo: 'ARG', nome: 'Argentina',      crp: 9.71, erp: 13.94, spreadDefault: 6.37, ratingMoody: 'Caa1', ...BASE_PAIS },
  { codigo: 'MEX', nome: 'México',         crp: 2.46, erp: 6.69,  spreadDefault: 1.62, ratingMoody: 'Baa2', ...BASE_PAIS },
  { codigo: 'COL', nome: 'Colômbia',       crp: 2.85, erp: 7.08,  spreadDefault: 1.87, ratingMoody: 'Baa3', ...BASE_PAIS },
  { codigo: 'CHL', nome: 'Chile',          crp: 1.10, erp: 5.33,  spreadDefault: 0.72, ratingMoody: 'A2',   ...BASE_PAIS },
  { codigo: 'URU', nome: 'Uruguai',        crp: 2.07, erp: 6.30,  spreadDefault: 1.36, ratingMoody: 'Baa1', ...BASE_PAIS },
  { codigo: 'PER', nome: 'Peru',           crp: 2.07, erp: 6.30,  spreadDefault: 1.36, ratingMoody: 'Baa1', ...BASE_PAIS },
  { codigo: 'GBR', nome: 'Reino Unido',    crp: 0.78, erp: 5.01,  spreadDefault: 0.51, ratingMoody: 'Aa3',  ...BASE_PAIS },
  { codigo: 'DEU', nome: 'Alemanha',       crp: 0.00, erp: 4.23,  spreadDefault: 0.00, ratingMoody: 'Aaa',  ...BASE_PAIS },
  { codigo: 'FRA', nome: 'França',         crp: 0.78, erp: 5.01,  spreadDefault: 0.51, ratingMoody: 'Aa3',  ...BASE_PAIS },
  { codigo: 'CHN', nome: 'China',          crp: 0.91, erp: 5.14,  spreadDefault: 0.60, ratingMoody: 'A1',   ...BASE_PAIS },
  { codigo: 'IND', nome: 'Índia',          crp: 2.85, erp: 7.08,  spreadDefault: 1.87, ratingMoody: 'Baa3', ...BASE_PAIS },
  { codigo: 'JPN', nome: 'Japão',          crp: 0.91, erp: 5.14,  spreadDefault: 0.60, ratingMoody: 'A1',   ...BASE_PAIS },
  { codigo: 'PRT', nome: 'Portugal',       crp: 1.55, erp: 5.78,  spreadDefault: 1.02, ratingMoody: 'A3',   ...BASE_PAIS },
];

/**
 * Busca o beta desalavancado de um setor pelo ID.
 */
export function getBetaBySetor(setorId: string): SetorData | undefined {
  return SETORES_DAMODARAN.find(s => s.id === setorId);
}

/**
 * Busca o CRP de um país pelo código ISO.
 */
export function getCRPByPais(codigoPais: string): PaisData | undefined {
  return PAISES_DAMODARAN.find(p => p.codigo === codigoPais);
}

export interface ParametrosMercado {
  moeda: Moeda;
  regime: Regime;
  rf: number;           // % a.a., na moeda e regime indicados
  erp: number;          // % a.a. (prêmio de mercado maduro; somar o CRP do país)
  dataBase: string;
  fonte: string;
  observacao: string;
  metodoRf: 'rf-usd-damodaran' | 'diferencial-inflacao';
  inflacaoEsperada: number;   // % a.a. da moeda (meta oficial)
  versaoTabela: string;
}

const arred2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`;

/**
 * Parâmetros de referência (Rf e ERP) coerentes com a moeda e o regime.
 *   - USD nominal: Rf = T-Bond 10a − spread de default dos EUA (Damodaran).
 *   - BRL/EUR nominal: Rf USD ajustada pelo diferencial de inflação (Fisher), com as metas oficiais.
 *   - Regime real: (1 + Rf nominal)/(1 + inflação da moeda) − 1.
 *   - ERP e CRP: prêmios aditivos, mantidos iguais entre moedas e regimes (aproximação declarada).
 */
export function getParametrosMercado(moeda: Moeda = 'BRL', regime: Regime = 'nominal'): ParametrosMercado {
  const infl = INFLACAO_ESPERADA[moeda];
  const inflUSD = INFLACAO_ESPERADA.USD.taxa;
  const rfNominal = moeda === 'USD' ? RF_USD : ajustarTaxaPorDiferencialInflacao(RF_USD, inflUSD, infl.taxa);
  const rf = regime === 'real' ? taxaRealDeNominal(rfNominal, infl.taxa) : rfNominal;

  const baseUSD = `Rf USD ${pct(RF_USD)} = Treasury 10 anos dos EUA ${pct(US_TBOND_10A)} − spread de default dos EUA ${pct(US_SPREAD_DEFAULT)} (Damodaran, 01/01/2026)`;
  const conversao = moeda === 'USD'
    ? baseUSD
    : `Rf ${moeda} nominal = (1 + Rf USD) × (1 + ${pct(infl.taxa)}) ÷ (1 + ${pct(inflUSD)}) − 1 = ${pct(arred2(rfNominal))}; ${baseUSD}; inflação: ${infl.fonte} e meta do Fed`;
  const real = regime === 'real'
    ? `; regime real: (1 + Rf nominal) ÷ (1 + ${pct(infl.taxa)}) − 1`
    : '';

  return {
    moeda,
    regime,
    rf: arred2(rf),
    erp: ERP_MERCADO_MADURO,
    dataBase: DAMODARAN_VERSAO.dataBase,
    fonte: `Damodaran (NYU Stern) — data-base ${DAMODARAN_VERSAO.dataBase} (ERPbymonth.xlsx e ctryprem.xlsx)`,
    observacao: `${conversao}${real}. ERP: prêmio de mercado maduro ${pct(ERP_MERCADO_MADURO)} (somar o CRP do país); ERP e CRP mantidos entre moedas e regimes (aproximação).`,
    metodoRf: moeda === 'USD' ? 'rf-usd-damodaran' : 'diferencial-inflacao',
    inflacaoEsperada: infl.taxa,
    versaoTabela: DAMODARAN_VERSAO.id,
  };
}

/** Tabela completa de parâmetros por moeda e regime. */
export function getTabelaParametrosMercado(): Record<Moeda, Record<Regime, ParametrosMercado>> {
  const tabela = {} as Record<Moeda, Record<Regime, ParametrosMercado>>;
  for (const m of MOEDAS) {
    tabela[m] = { nominal: getParametrosMercado(m, 'nominal'), real: getParametrosMercado(m, 'real') };
  }
  return tabela;
}
