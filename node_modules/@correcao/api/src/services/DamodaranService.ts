/**
 * Serviço de dados Damodaran — Betas setoriais e prêmios de risco por país.
 *
 * Fase 1: Tabela estática com dados de mercados emergentes (Jan/2025).
 * Fonte: https://pages.stern.nyu.edu/~adamodar/pc/datasets/betaEmerging.xlsx
 *        https://pages.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.xlsx
 *
 * Atualização automática (futura): cron job mensal que baixa as planilhas e
 * atualiza o banco de dados SQLite local.
 */

export interface SetorData {
  id: string;
  nome: string;       // Nome PT-BR
  nomeEn: string;     // Nome original Damodaran
  betaDesalavancado: number;  // β unlevered (mercados emergentes, Jan/2025)
  betaAlavancado?: number;    // β levered médio do setor (referência)
  relacaoDividaEquity?: number; // D/E médio do setor
}

export interface PaisData {
  codigo: string;
  nome: string;
  crp: number;        // Country Risk Premium (% a.a., Jan/2025)
  erp?: number;       // ERP total do país
  ratingMoody?: string;
}

/**
 * Betas desalavancados por setor — Mercados Emergentes (Damodaran, Jan/2025)
 * Fonte: betaEmerging.xlsx — aba "Emerging Markets"
 */
export const SETORES_DAMODARAN: SetorData[] = [
  { id: 'aeroespacial',    nome: 'Aeroespacial e Defesa',         nomeEn: 'Aerospace/Defense',         betaDesalavancado: 0.87 },
  { id: 'agronegocio',     nome: 'Agronegócio',                   nomeEn: 'Farming/Agriculture',        betaDesalavancado: 0.56 },
  { id: 'automoveis',      nome: 'Automóveis e Caminhões',        nomeEn: 'Auto & Truck',               betaDesalavancado: 0.68 },
  { id: 'bancos',          nome: 'Bancos',                        nomeEn: 'Bank (Money Center)',        betaDesalavancado: 0.47 },
  { id: 'bancos_reg',      nome: 'Bancos Regionais',              nomeEn: 'Banks (Regional)',           betaDesalavancado: 0.43 },
  { id: 'biotecnologia',   nome: 'Biotecnologia',                 nomeEn: 'Biotechnology',              betaDesalavancado: 1.05 },
  { id: 'construcao',      nome: 'Construção Civil',              nomeEn: 'Homebuilding',               betaDesalavancado: 0.77 },
  { id: 'consumo_basico',  nome: 'Consumo Básico (Alimentos)',    nomeEn: 'Food Processing',            betaDesalavancado: 0.54 },
  { id: 'educacao',        nome: 'Educação',                      nomeEn: 'Education',                  betaDesalavancado: 0.75 },
  { id: 'energia_eletrica',nome: 'Energia Elétrica (Utilities)',  nomeEn: 'Electric Utility (General)', betaDesalavancado: 0.38 },
  { id: 'energia_petro',   nome: 'Energia — Petróleo e Gás',     nomeEn: 'Oil/Gas (Integrated)',       betaDesalavancado: 0.62 },
  { id: 'farmacos',        nome: 'Farmacêutico',                  nomeEn: 'Drug (Pharmaceutical)',      betaDesalavancado: 0.72 },
  { id: 'financeiras',     nome: 'Financeiras (não banco)',       nomeEn: 'Financial Svcs.',            betaDesalavancado: 0.56 },
  { id: 'imobiliario',     nome: 'Imobiliário (FIIs / REITs)',    nomeEn: 'Real Estate (General)',      betaDesalavancado: 0.61 },
  { id: 'industria_geral', nome: 'Indústria Geral',               nomeEn: 'Industrial Services',        betaDesalavancado: 0.69 },
  { id: 'logistica',       nome: 'Logística e Transporte',        nomeEn: 'Transportation',             betaDesalavancado: 0.64 },
  { id: 'metalurgia',      nome: 'Metalurgia e Siderurgia',       nomeEn: 'Steel',                      betaDesalavancado: 0.80 },
  { id: 'mineracao',       nome: 'Mineração',                     nomeEn: 'Mining',                     betaDesalavancado: 0.88 },
  { id: 'papel_celulose',  nome: 'Papel e Celulose',              nomeEn: 'Paper/Forest Products',      betaDesalavancado: 0.63 },
  { id: 'publico',         nome: 'Setor Público / Concessões',    nomeEn: 'Public (Govt) Sector',       betaDesalavancado: 0.42 },
  { id: 'saude',           nome: 'Saúde e Hospitais',             nomeEn: 'Healthcare Facilities',      betaDesalavancado: 0.70 },
  { id: 'seguros',         nome: 'Seguros',                       nomeEn: 'Insurance (General)',        betaDesalavancado: 0.49 },
  { id: 'software',        nome: 'Software e SaaS',               nomeEn: 'Software (Internet)',        betaDesalavancado: 1.03 },
  { id: 'tech_hardware',   nome: 'Tecnologia — Hardware',         nomeEn: 'Computers/Peripherals',      betaDesalavancado: 0.94 },
  { id: 'telecom',         nome: 'Telecomunicações',              nomeEn: 'Telecom. Services',          betaDesalavancado: 0.55 },
  { id: 'textil_varejo',   nome: 'Têxtil e Vestuário',            nomeEn: 'Apparel',                   betaDesalavancado: 0.78 },
  { id: 'varejo',          nome: 'Varejo (Lojas)',                 nomeEn: 'Retail Store',               betaDesalavancado: 0.82 },
  { id: 'varejo_online',   nome: 'E-commerce / Varejo Online',    nomeEn: 'Retail (Online)',            betaDesalavancado: 1.15 },
];

/**
 * Prêmio de Risco País (CRP) por país — Damodaran (Jan/2025)
 * Fonte: ctryprem.xlsx — coluna "Country Risk Premium"
 * ERP Base Global: 5.80% (Damodaran, Jan/2025)
 */
export const ERP_BASE_GLOBAL = 5.80; // % a.a.
export const RF_DEFAULT = 4.20;      // US T-Bond 10Y (referência)

export const PAISES_DAMODARAN: PaisData[] = [
  { codigo: 'USA', nome: 'Estados Unidos',  crp: 0.00,  ratingMoody: 'Aaa' },
  { codigo: 'BRA', nome: 'Brasil',          crp: 3.97,  ratingMoody: 'Ba3' },
  { codigo: 'ARG', nome: 'Argentina',       crp: 19.79, ratingMoody: 'Ca'  },
  { codigo: 'MEX', nome: 'México',          crp: 2.11,  ratingMoody: 'Baa2'},
  { codigo: 'COL', nome: 'Colômbia',        crp: 3.07,  ratingMoody: 'Ba2' },
  { codigo: 'CHL', nome: 'Chile',           crp: 0.63,  ratingMoody: 'A2'  },
  { codigo: 'URU', nome: 'Uruguai',         crp: 0.97,  ratingMoody: 'Baa1'},
  { codigo: 'PER', nome: 'Peru',            crp: 1.90,  ratingMoody: 'Baa3'},
  { codigo: 'GBR', nome: 'Reino Unido',     crp: 0.00,  ratingMoody: 'Aa3' },
  { codigo: 'DEU', nome: 'Alemanha',        crp: 0.00,  ratingMoody: 'Aaa' },
  { codigo: 'FRA', nome: 'França',          crp: 0.46,  ratingMoody: 'Aa2' },
  { codigo: 'CHN', nome: 'China',           crp: 0.63,  ratingMoody: 'A1'  },
  { codigo: 'IND', nome: 'Índia',           crp: 1.54,  ratingMoody: 'Baa3'},
  { codigo: 'JPN', nome: 'Japão',           crp: 0.63,  ratingMoody: 'A1'  },
  { codigo: 'PRT', nome: 'Portugal',        crp: 0.97,  ratingMoody: 'Baa2'},
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

/**
 * Retorna os valores padrão de mercado (Rf e ERP).
 */
export function getParametrosMercadoPadrao(): { rf: number; erp: number } {
  return { rf: RF_DEFAULT, erp: ERP_BASE_GLOBAL };
}
