/**
 * Motor de Simulação de Aposentadoria — Retirement Architect
 *
 * Metodologia (VERSAO_MODELO_APOSENTADORIA):
 *   - Tudo em termos REAIS (R$ de hoje): retorno real por perfil; gastos, aluguel, INSS, teto e salário
 *     mínimo em R$ de hoje. A Meta IPCA (ipcaMeta) só converte resultados para R$ nominais de referência.
 *   - Acumulação determinística com o retorno real médio do perfil (capitalização mensal).
 *   - Distribuição: Monte Carlo com retornos anuais log-normais (E[1+R] = 1 + retorno real do perfil),
 *     gerador pseudoaleatório com semente (mulberry32 + Box-Muller) — mesma entrada e semente
 *     reproduzem o resultado.
 *   - "Projeção anual P50" = mediana do patrimônio de TODAS as trajetórias, ano a ano (não é uma
 *     trajetória com retorno médio fixo). Guardam-se só os percentis por ano (memória O(N)).
 *   - Esgotamento P5/P50 calculados sobre todas as simulações (null = a mediana não esgota).
 *   - Renda necessária (retirada que o plano exige) separada da renda sustentável (retirada constante
 *     que o patrimônio sustenta até a expectativa de vida em 90% das simulações).
 *   - Gastos decrescentes com a idade; saúde cresce 3% a.a. acima do IPCA.
 *   - INSS (EC 103/2019): elegibilidade (art. 19: 65 H / 62 M; 20 H / 15 M anos de contribuição)
 *     separada do valor (art. 26). O benefício entra na projeção só a partir da idade de elegibilidade.
 *   - Teto e salário mínimo do RGPS por vigência (VIGENCIAS_RGPS).
 *   - IR da previdência privada na retirada (PGBL: valor total; VGBL: rendimentos): tabela regressiva
 *     (Lei 11.053/2004) ou progressiva mensal (Lei 15.191/2025 + redução da Lei 15.270/2025).
 *
 * Não modelado (declarado): tábua de mortalidade — a expectativa de vida é a informada pelo usuário
 * e o gênero só afeta as regras do INSS; regras de transição da EC 103/2019 (arts. 15 a 17, 20 e 21);
 * IR sobre o patrimônio tributável, sobre o aluguel e sobre o INSS.
 *
 * Referências:
 *   - EC 103/2019, arts. 19 e 26 (Reforma da Previdência)
 *   - Portaria Interministerial MPS/MF nº 13, de 09/01/2026 (teto e salário mínimo 2026)
 *   - Lei 11.053/2004, art. 1º (tabela regressiva da previdência complementar)
 *   - Lei 15.191/2025 e Lei 15.270/2025 (tabela mensal do IRPF e redução a partir de jan/2026)
 */
export declare const VERSAO_MODELO_APOSENTADORIA = "aposentadoria-mc 2.0.0 (2026-09)";
/** Semente usada quando a entrada não informa `semente` (resultado reprodutível por padrão). */
export declare const SEMENTE_PADRAO_APOSENTADORIA = 20260913;
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
    /** Semente do gerador pseudoaleatório (inteiro de 32 bits). Ausente → SEMENTE_PADRAO_APOSENTADORIA. */
    semente?: number;
    /** Data de referência AAAA-MM-DD (vigência de teto/salário mínimo e ano da tabela). Ausente → hoje. */
    dataReferencia?: string;
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
    retiradaPatrimonio: number;
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
export interface VigenciaRGPS {
    vigenciaInicio: string;
    teto: number;
    salarioMinimo: number;
    fonte: string;
}
export interface RetirementResult {
    versaoModelo: string;
    semente: number;
    numeroSimulacoes: number;
    idadeFinal: number;
    probabilidadeSucesso: number;
    saldoFinalP5: number;
    saldoFinalP50: number;
    saldoFinalP95: number;
    beneficioINSSMensal: number;
    beneficioINSSProjetadoMensal: number;
    idadeInicioINSS: number | null;
    rendaNecessariaPatrimonioMensal: number;
    rendaPatrimonioMensal: number;
    rendaTotalMensal: number;
    anoEsgotamentoP5: number | null;
    anoEsgotamentoP50: number | null;
    taxaRetiradaInicial: number;
    patrimonioAcumuladoAposentadoria: number;
    totalAportado: number;
    totalRendimento: number;
    ipcaMeta: number;
    patrimonioAcumuladoAposentadoriaNominal: number;
    parametrosRGPS: VigenciaRGPS;
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
 * Teto e salário mínimo do RGPS por vigência. Acrescente uma linha a cada portaria anual.
 * 2026: gov.br/inss — "Tabela de contribuição mensal", competência janeiro/2026
 * (Portaria Interministerial MPS/MF nº 13, de 09/01/2026).
 */
export declare const VIGENCIAS_RGPS: readonly VigenciaRGPS[];
/**
 * Seleciona a vigência de teto/salário mínimo aplicável à data (a mais recente com início ≤ data).
 * Datas anteriores à primeira vigência cadastrada usam a primeira, com alerta.
 */
export declare function obterParametrosRGPS(dataReferencia?: string | Date): {
    parametros: VigenciaRGPS;
    dataReferencia: string;
    alerta?: string;
};
/** Idade mínima da aposentadoria programada — EC 103/2019 art. 19 (regra permanente). */
export declare const IDADE_MINIMA_INSS: Record<Genero, number>;
/** Tempo mínimo de contribuição — EC 103/2019 art. 19; também o limiar do acréscimo (art. 26 §§2º e 5º). */
export declare const TEMPO_MINIMO_INSS: Record<Genero, number>;
export interface BeneficioINSSResultado {
    beneficio: number;
    regra: string;
    alertas: string[];
    elegivel: boolean;
    idadeMinima: number;
    tempoMinimo: number;
    parametrosRGPS: VigenciaRGPS;
}
/**
 * Estima o benefício INSS com base nas regras pós-EC 103/2019.
 *
 * Elegibilidade (regra permanente, art. 19): idade ≥ 65 (H) / 62 (M) E tempo de contribuição
 * ≥ 20 (H) / 15 (M) anos. Sem elegibilidade o benefício é 0 (regras de transição não modeladas).
 *
 * Valor do benefício (regra geral, EC 103/2019 art. 26):
 *   - média dos salários de contribuição limitada ao teto do RGPS (§1º);
 *   - coeficiente = 60% + 2 p.p. por ano de contribuição acima de 20 anos
 *     (homem, §2º) ou 15 anos (mulher, §5º) — sem limitação a 100%;
 *   - benefício limitado ao teto e com piso de 1 salário mínimo (CF art. 201 §2º).
 *
 * Teto e salário mínimo pela vigência da `dataReferencia` (padrão: hoje).
 */
export declare function calcularBeneficioINSS(genero: Genero, idadeAposentadoria: number, tempoContribuicaoAnos: number, salarioContribuicaoMensal: number, dataReferencia?: string | Date): BeneficioINSSResultado;
/** Tabela regressiva da previdência complementar — Lei 11.053/2004 art. 1º (prazo de acumulação em anos). */
export declare function aliquotaRegressivaPrevidencia(prazoAnos: number): number;
/**
 * Tabela progressiva mensal do IRPF a partir de jan/2026 (Receita Federal, "Tabelas 2026"):
 * incidência mensal (Lei 15.191/2025) e redução mensal (Lei 15.270/2025).
 */
export declare const TABELA_IRPF_MENSAL_2026: {
    readonly vigenciaInicio: "2026-01-01";
    readonly faixas: readonly [{
        readonly ate: 2428.8;
        readonly aliquota: 0;
        readonly deducao: 0;
    }, {
        readonly ate: 2826.65;
        readonly aliquota: 0.075;
        readonly deducao: 182.16;
    }, {
        readonly ate: 3751.05;
        readonly aliquota: 0.15;
        readonly deducao: 394.16;
    }, {
        readonly ate: 4664.68;
        readonly aliquota: 0.225;
        readonly deducao: 675.49;
    }, {
        readonly ate: number;
        readonly aliquota: 0.275;
        readonly deducao: 908.73;
    }];
    readonly descontoSimplificadoMensal: 607.2;
    readonly reducao: {
        readonly isencaoAte: 5000;
        readonly reducaoMaxima: 312.89;
        readonly faixaAte: 7350;
        readonly constante: 978.62;
        readonly coeficiente: 0.133145;
    };
    readonly fonte: "Receita Federal — Tabelas 2026: Lei nº 15.191/2025 (incidência mensal) e Lei nº 15.270/2025 (redução mensal)";
};
/**
 * IRPF mensal sobre um rendimento tributável isolado: base = rendimento − desconto simplificado mensal;
 * imposto pela tabela progressiva; menos a redução da Lei 15.270/2025.
 */
export declare function irpfMensalProgressivo(rendimentoTributavelMensal: number): number;
/** mulberry32: gerador de 32 bits com semente; devolve uniformes em [0, 1). */
export declare function criarGeradorMulberry32(semente: number): () => number;
/**
 * Simula o plano de aposentadoria usando Monte Carlo.
 * Retorna probabilidade de sucesso, distribuição de saldos e projeção mediana ano a ano.
 */
export declare function simularAposentadoria(input: RetirementInput): RetirementResult;
//# sourceMappingURL=RetirementEngine.d.ts.map