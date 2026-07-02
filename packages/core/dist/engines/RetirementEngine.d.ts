/**
 * Motor de Simulação de Aposentadoria — Retirement Architect
 *
 * Metodologia:
 *   - Monte Carlo com distribuição log-normal para retornos reais
 *   - Gastos decrescentes com a idade (dados IBGE/BLS)
 *   - Sistema previdenciário brasileiro (INSS, PGBL, VGBL)
 *   - Tributação regressiva/progressiva de previdência privada
 *   - Inflação médica separada (IPCA + delta)
 *
 * Referências:
 *   - EC 103/2019 (Reforma da Previdência)
 *   - Tabela regressiva IR Previdência (Lei 11.053/2004)
 *   - Tábua de mortalidade IBGE 2024
 */
export type PerfilRisco = 'conservador' | 'moderado' | 'agressivo';
export type TabelaPGBL = 'regressiva' | 'progressiva';
export type Genero = 'M' | 'F';
export interface RetirementInput {
    idadeAtual: number;
    idadeAposentadoria: number;
    expectativaVida: number;
    genero: Genero;
    patrimonioTributavel: number;
    saldoPGBL: number;
    saldoVGBL: number;
    rendaAluguel: number;
    aporteMensal: number;
    aportePGBL: number;
    aporteVGBL: number;
    incluirINSS: boolean;
    salarioContribuicao: number;
    tempoContribuicaoAnos: number;
    gastoMensalDesejado: number;
    incluirInflacaoMedica: boolean;
    gastoMensalSaude: number;
    perfilRisco: PerfilRisco;
    ipcaMeta: number;
    tabelaPGBL: TabelaPGBL;
    numeroSimulacoes: number;
}
export interface RetirementYearRow {
    ano: number;
    idade: number;
    patrimonioInicio: number;
    aportesAno: number;
    retornoNominal: number;
    gastoAno: number;
    beneficioINSS: number;
    rendaAluguel: number;
    patrimonioFim: number;
    taxaRetirada: number;
    esgotado: boolean;
}
export interface RetirementMemorialStep {
    titulo: string;
    formula: string;
    formulaComValores: string;
    resultado: number;
    unidade: string;
    descricao: string;
}
export interface RetirementAlert {
    tipo: 'danger' | 'warning' | 'info';
    mensagem: string;
}
export interface RetirementResult {
    probabilidadeSucesso: number;
    saldoFinalP5: number;
    saldoFinalP50: number;
    saldoFinalP95: number;
    beneficioINSSMensal: number;
    rendaPatrimonioMensal: number;
    rendaTotalMensal: number;
    anoEsgotamentoP5: number | null;
    anoEsgotamentoP50: number | null;
    taxaRetiradaInicial: number;
    patrimonioAcumuladoAposentadoria: number;
    totalAportado: number;
    totalRendimento: number;
    projecaoAnualP50: RetirementYearRow[];
    memorial: RetirementMemorialStep[];
    alertas: RetirementAlert[];
}
export declare const PERFIS_RISCO: Record<PerfilRisco, {
    retornoRealAnual: number;
    volatilidade: number;
    descricao: string;
}>;
/**
 * Estima o benefício INSS com base nas regras pós-EC 103/2019.
 * Usa a regra de pontuação (97H / 87M em 2024, +1 por ano até 2031-2027).
 */
export declare function calcularBeneficioINSS(genero: Genero, idadeAposentadoria: number, tempoContribuicaoAnos: number, salarioContribuicaoMensal: number): {
    beneficio: number;
    regra: string;
    alertas: string[];
};
/**
 * Simula o plano de aposentadoria usando Monte Carlo.
 * Retorna probabilidade de sucesso, distribuição de saldos e projeção detalhada.
 */
export declare function simularAposentadoria(input: RetirementInput): RetirementResult;
//# sourceMappingURL=RetirementEngine.d.ts.map