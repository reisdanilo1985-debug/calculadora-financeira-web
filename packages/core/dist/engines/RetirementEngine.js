"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TABELA_IRPF_MENSAL_2026 = exports.TEMPO_MINIMO_INSS = exports.IDADE_MINIMA_INSS = exports.VIGENCIAS_RGPS = exports.PERFIS_RISCO = exports.SEMENTE_PADRAO_APOSENTADORIA = exports.VERSAO_MODELO_APOSENTADORIA = void 0;
exports.obterParametrosRGPS = obterParametrosRGPS;
exports.calcularBeneficioINSS = calcularBeneficioINSS;
exports.aliquotaRegressivaPrevidencia = aliquotaRegressivaPrevidencia;
exports.irpfMensalProgressivo = irpfMensalProgressivo;
exports.criarGeradorMulberry32 = criarGeradorMulberry32;
exports.simularAposentadoria = simularAposentadoria;
const decimal_js_1 = __importDefault(require("decimal.js"));
// ── Versão do modelo e semente ───────────────────────────────────────────────
exports.VERSAO_MODELO_APOSENTADORIA = 'aposentadoria-mc 2.0.0 (2026-09)';
/** Semente usada quando a entrada não informa `semente` (resultado reprodutível por padrão). */
exports.SEMENTE_PADRAO_APOSENTADORIA = 20260913;
// ── Perfis de Risco Calibrados para Brasil ───────────────────────────────────
exports.PERFIS_RISCO = {
    conservador: {
        retornoRealAnual: 5.0,
        volatilidade: 5.0,
        descricao: 'Tesouro IPCA+ + CDB + LCI/LCA (80% renda fixa)',
    },
    moderado: {
        retornoRealAnual: 6.5,
        volatilidade: 11.0,
        descricao: 'Balanceado: 50% renda fixa + 50% ações/FIIs',
    },
    agressivo: {
        retornoRealAnual: 8.0,
        volatilidade: 17.0,
        descricao: '80% renda variável (ações BR + BDRs internacionais)',
    },
};
// ── Parâmetros do RGPS por vigência ──────────────────────────────────────────
/**
 * Teto e salário mínimo do RGPS por vigência. Acrescente uma linha a cada portaria anual.
 * 2026: gov.br/inss — "Tabela de contribuição mensal", competência janeiro/2026
 * (Portaria Interministerial MPS/MF nº 13, de 09/01/2026).
 */
exports.VIGENCIAS_RGPS = [
    {
        vigenciaInicio: '2026-01-01',
        teto: 8475.55,
        salarioMinimo: 1621.0,
        fonte: 'Portaria Interministerial MPS/MF nº 13, de 09/01/2026',
    },
];
function paraDataISO(data) {
    if (data instanceof Date && !Number.isNaN(data.getTime()))
        return data.toISOString().slice(0, 10);
    if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data))
        return data;
    return new Date().toISOString().slice(0, 10);
}
/**
 * Seleciona a vigência de teto/salário mínimo aplicável à data (a mais recente com início ≤ data).
 * Datas anteriores à primeira vigência cadastrada usam a primeira, com alerta.
 */
function obterParametrosRGPS(dataReferencia) {
    const ref = paraDataISO(dataReferencia);
    const ordenadas = [...exports.VIGENCIAS_RGPS].sort((a, b) => a.vigenciaInicio.localeCompare(b.vigenciaInicio));
    const aplicaveis = ordenadas.filter(v => v.vigenciaInicio <= ref);
    if (aplicaveis.length === 0) {
        const p = ordenadas[0];
        return {
            parametros: p,
            dataReferencia: ref,
            alerta: `Não há teto/salário mínimo do RGPS cadastrados para ${ref}; usados os valores vigentes desde ${p.vigenciaInicio} (${p.fonte}).`,
        };
    }
    const p = aplicaveis[aplicaveis.length - 1];
    const anoRef = Number(ref.slice(0, 4));
    const anoVig = Number(p.vigenciaInicio.slice(0, 4));
    return {
        parametros: p,
        dataReferencia: ref,
        alerta: anoRef > anoVig
            ? `Teto e salário mínimo do RGPS de ${anoVig} (${p.fonte}); a portaria de ${anoRef} ainda não foi cadastrada no motor.`
            : undefined,
    };
}
// ── Funções auxiliares ───────────────────────────────────────────────────────
/**
 * Fator de redução de gastos com a idade (baseado em padrões IBGE/BLS).
 * Gastos caem progressivamente após os 65 anos.
 */
function fatorReducaoGastos(idade) {
    if (idade < 65)
        return 1.00;
    if (idade < 75)
        return 0.90; // -10% entre 65-74
    if (idade < 85)
        return 0.75; // -25% entre 75-84
    return 0.62; // -38% aos 85+
}
/** Idade mínima da aposentadoria programada — EC 103/2019 art. 19 (regra permanente). */
exports.IDADE_MINIMA_INSS = { M: 65, F: 62 };
/** Tempo mínimo de contribuição — EC 103/2019 art. 19; também o limiar do acréscimo (art. 26 §§2º e 5º). */
exports.TEMPO_MINIMO_INSS = { M: 20, F: 15 };
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
function calcularBeneficioINSS(genero, idadeAposentadoria, tempoContribuicaoAnos, salarioContribuicaoMensal, dataReferencia) {
    const alertas = [];
    const { parametros, alerta } = obterParametrosRGPS(dataReferencia);
    if (alerta)
        alertas.push(alerta);
    const idadeMinima = exports.IDADE_MINIMA_INSS[genero] ?? exports.IDADE_MINIMA_INSS.M;
    const tempoMinimo = exports.TEMPO_MINIMO_INSS[genero] ?? exports.TEMPO_MINIMO_INSS.M;
    const base = { idadeMinima, tempoMinimo, parametrosRGPS: parametros };
    if (tempoContribuicaoAnos < tempoMinimo) {
        alertas.push(`Tempo mínimo de contribuição: ${tempoMinimo} anos. Atual: ${tempoContribuicaoAnos} anos.`);
        return {
            beneficio: 0,
            regra: 'Sem direito ao benefício: tempo de contribuição abaixo do mínimo (EC 103/2019 art. 19)',
            alertas,
            elegivel: false,
            ...base,
        };
    }
    if (idadeAposentadoria < idadeMinima) {
        alertas.push(`Idade mínima para a aposentadoria programada (EC 103/2019 art. 19): ${idadeMinima} anos. Antes disso o benefício é 0 — regras de transição não são modeladas.`);
        return {
            beneficio: 0,
            regra: `Sem direito ao benefício aos ${idadeAposentadoria} anos: idade mínima de ${idadeMinima} anos (EC 103/2019 art. 19)`,
            alertas,
            elegivel: false,
            ...base,
        };
    }
    const teto = new decimal_js_1.default(parametros.teto);
    const salarioMinimo = new decimal_js_1.default(parametros.salarioMinimo);
    // Salário de benefício: média dos salários de contribuição limitada ao teto (art. 26 §1º)
    const salarioBeneficio = decimal_js_1.default.min(new decimal_js_1.default(salarioContribuicaoMensal), teto);
    // Coeficiente: 60% + 2 p.p. por ano acima de 20 anos (H) / 15 anos (M) — art. 26 §2º e §5º.
    // Sem teto de 100%: com 45 anos de contribuição (H) o coeficiente é 110%.
    const limiarAcrescimo = genero === 'M' ? 20 : 15;
    const anosExtras = decimal_js_1.default.max(0, new decimal_js_1.default(tempoContribuicaoAnos).minus(limiarAcrescimo));
    const coeficiente = new decimal_js_1.default('0.60').plus(anosExtras.mul('0.02'));
    const beneficioBase = salarioBeneficio.mul(coeficiente);
    // Benefício limitado ao teto, com piso de 1 salário mínimo
    const beneficio = decimal_js_1.default.max(salarioMinimo, decimal_js_1.default.min(beneficioBase, teto)).toNumber();
    return {
        beneficio,
        regra: `Aposentadoria programada — regra permanente (EC 103/2019 art. 19; valor pelo art. 26, coeficiente ${coeficiente.mul(100).toFixed(0)}%)`,
        alertas,
        elegivel: true,
        ...base,
    };
}
// ── IR da previdência privada ────────────────────────────────────────────────
/** Tabela regressiva da previdência complementar — Lei 11.053/2004 art. 1º (prazo de acumulação em anos). */
function aliquotaRegressivaPrevidencia(prazoAnos) {
    if (prazoAnos <= 2)
        return 0.35;
    if (prazoAnos <= 4)
        return 0.30;
    if (prazoAnos <= 6)
        return 0.25;
    if (prazoAnos <= 8)
        return 0.20;
    if (prazoAnos <= 10)
        return 0.15;
    return 0.10;
}
/**
 * Tabela progressiva mensal do IRPF a partir de jan/2026 (Receita Federal, "Tabelas 2026"):
 * incidência mensal (Lei 15.191/2025) e redução mensal (Lei 15.270/2025).
 */
exports.TABELA_IRPF_MENSAL_2026 = {
    vigenciaInicio: '2026-01-01',
    faixas: [
        { ate: 2428.80, aliquota: 0, deducao: 0 },
        { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
        { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
        { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
        { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ],
    descontoSimplificadoMensal: 607.20,
    reducao: { isencaoAte: 5000.0, reducaoMaxima: 312.89, faixaAte: 7350.0, constante: 978.62, coeficiente: 0.133145 },
    fonte: 'Receita Federal — Tabelas 2026: Lei nº 15.191/2025 (incidência mensal) e Lei nº 15.270/2025 (redução mensal)',
};
/**
 * IRPF mensal sobre um rendimento tributável isolado: base = rendimento − desconto simplificado mensal;
 * imposto pela tabela progressiva; menos a redução da Lei 15.270/2025.
 */
function irpfMensalProgressivo(rendimentoTributavelMensal) {
    const t = exports.TABELA_IRPF_MENSAL_2026;
    const r = new decimal_js_1.default(rendimentoTributavelMensal);
    if (!r.isFinite() || r.lte(0))
        return 0;
    const base = decimal_js_1.default.max(0, r.minus(t.descontoSimplificadoMensal));
    const faixa = t.faixas.find(f => base.lte(f.ate)) ?? t.faixas[t.faixas.length - 1];
    const imposto = decimal_js_1.default.max(0, base.mul(faixa.aliquota).minus(faixa.deducao));
    let reducao = new decimal_js_1.default(0);
    if (r.lte(t.reducao.isencaoAte)) {
        reducao = decimal_js_1.default.min(imposto, t.reducao.reducaoMaxima);
    }
    else if (r.lte(t.reducao.faixaAte)) {
        reducao = decimal_js_1.default.max(0, new decimal_js_1.default(t.reducao.constante).minus(r.mul(t.reducao.coeficiente)));
    }
    return decimal_js_1.default.max(0, imposto.minus(reducao)).toNumber();
}
// ── Gerador pseudoaleatório com semente ──────────────────────────────────────
function normalizarSemente(semente) {
    const n = Number(semente);
    return semente !== undefined && semente !== null && Number.isFinite(n)
        ? (Math.trunc(n) >>> 0)
        : exports.SEMENTE_PADRAO_APOSENTADORIA;
}
/** mulberry32: gerador de 32 bits com semente; devolve uniformes em [0, 1). */
function criarGeradorMulberry32(semente) {
    let a = semente >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Normal padrão por Box-Muller a partir de um gerador uniforme (usa os dois valores de cada par). */
function criarGeradorNormal(uniforme) {
    let reserva = null;
    return () => {
        if (reserva !== null) {
            const z = reserva;
            reserva = null;
            return z;
        }
        const u1 = 1 - uniforme(); // (0, 1] — evita log(0)
        const u2 = uniforme();
        const raio = Math.sqrt(-2 * Math.log(u1));
        const angulo = 2 * Math.PI * u2;
        reserva = raio * Math.sin(angulo);
        return raio * Math.cos(angulo);
    };
}
/**
 * Patrimônio projetado até a data de aposentadoria.
 */
function projetarAcumulacao(patrimonioInicial, aporteMensalTotal, anosAteAposentadoria, retornoRealAnual) {
    const retornoMensal = Math.pow(1 + retornoRealAnual / 100, 1 / 12) - 1;
    let saldo = patrimonioInicial;
    for (let m = 0; m < anosAteAposentadoria * 12; m++) {
        saldo = saldo * (1 + retornoMensal) + aporteMensalTotal;
    }
    return saldo;
}
function percentilOrdenado(ordenado, p) {
    return ordenado[Math.min(ordenado.length - 1, Math.floor(ordenado.length * p))];
}
// ── Função principal ─────────────────────────────────────────────────────────
/**
 * Simula o plano de aposentadoria usando Monte Carlo.
 * Retorna probabilidade de sucesso, distribuição de saldos e projeção mediana ano a ano.
 */
function simularAposentadoria(input) {
    const perfil = exports.PERFIS_RISCO[input.perfilRisco];
    const { parametros: parametrosRGPS, dataReferencia, alerta: alertaRGPS } = obterParametrosRGPS(input.dataReferencia);
    const anoReferencia = Number(dataReferencia.slice(0, 4));
    const anosAcumulacao = Math.max(0, input.idadeAposentadoria - input.idadeAtual);
    const anosDistribuicao = Math.max(1, input.expectativaVida - input.idadeAposentadoria);
    const aporteMensalTotal = input.aporteMensal + input.aportePGBL + input.aporteVGBL;
    const patrimonioTotal = input.patrimonioTributavel + input.saldoPGBL + input.saldoVGBL;
    const semente = normalizarSemente(input.semente);
    const nInformado = Number(input.numeroSimulacoes);
    const N = Number.isFinite(nInformado) ? Math.max(1, Math.floor(nInformado)) : 1000;
    const ipcaMeta = Number.isFinite(Number(input.ipcaMeta)) ? Number(input.ipcaMeta) : 3.5;
    const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // ── INSS: elegibilidade separada do valor ──────────────────────────────────
    const tempoNaAposentadoria = input.tempoContribuicaoAnos + anosAcumulacao; // contribuições param na aposentadoria
    const idadeMinimaINSS = exports.IDADE_MINIMA_INSS[input.genero] ?? exports.IDADE_MINIMA_INSS.M;
    const idadeCandidataINSS = Math.max(input.idadeAposentadoria, idadeMinimaINSS);
    const inssProjetado = input.incluirINSS
        ? calcularBeneficioINSS(input.genero, idadeCandidataINSS, tempoNaAposentadoria, input.salarioContribuicao, dataReferencia)
        : null;
    const beneficioINSSProjetadoMensal = inssProjetado?.beneficio ?? 0;
    const idadeInicioINSS = inssProjetado && inssProjetado.elegivel ? idadeCandidataINSS : null;
    const beneficioINSSMensal = idadeInicioINSS !== null && input.idadeAposentadoria >= idadeInicioINSS
        ? beneficioINSSProjetadoMensal
        : 0;
    const rendaAluguelMensal = input.rendaAluguel;
    // Patrimônio estimado na aposentadoria (fase acumulação, retorno real médio)
    const patrimonioNaAposentadoria = projetarAcumulacao(patrimonioTotal, aporteMensalTotal, anosAcumulacao, perfil.retornoRealAnual);
    const fatorInflacaoAcumulacao = new decimal_js_1.default(1).plus(new decimal_js_1.default(ipcaMeta).div(100)).pow(anosAcumulacao);
    const patrimonioNaAposentadoriaNominal = new decimal_js_1.default(patrimonioNaAposentadoria).mul(fatorInflacaoAcumulacao).toNumber();
    // ── Previdência privada: fração tributável da retirada ─────────────────────
    // Convenção: as carteiras rendem igual e as retiradas saem pro rata; PGBL tributa o valor total,
    // VGBL só os rendimentos (saldo VGBL atual tratado como principal).
    const fatorCrescimento = projetarAcumulacao(1, 0, anosAcumulacao, perfil.retornoRealAnual);
    const pgblNaApos = projetarAcumulacao(input.saldoPGBL, input.aportePGBL, anosAcumulacao, perfil.retornoRealAnual);
    const vgblNaApos = projetarAcumulacao(input.saldoVGBL, input.aporteVGBL, anosAcumulacao, perfil.retornoRealAnual);
    const principalVGBL = input.saldoVGBL + input.aporteVGBL * 12 * anosAcumulacao;
    const baseTributavelPrev = pgblNaApos + Math.max(0, vgblNaApos - principalVGBL);
    const fracaoTributavel = patrimonioNaAposentadoria > 0
        ? Math.min(1, Math.max(0, baseTributavelPrev / patrimonioNaAposentadoria))
        : 0;
    const totalPrevNaApos = pgblNaApos + vgblNaApos;
    const pesoSaldoAtualPrev = totalPrevNaApos > 0
        ? Math.min(1, ((input.saldoPGBL + input.saldoVGBL) * fatorCrescimento) / totalPrevNaApos)
        : 1;
    /** Alíquota efetiva da tabela regressiva no ano `ano` da distribuição (prazo médio ponderado). */
    const aliquotaRegressivaAno = (ano) => {
        const prazoSaldo = anosAcumulacao + ano + 1; // saldo atual: acumula desde hoje
        const prazoAportes = anosAcumulacao / 2 + ano + 1; // aportes: em média desde a metade da acumulação
        return new decimal_js_1.default(pesoSaldoAtualPrev).mul(aliquotaRegressivaPrevidencia(prazoSaldo))
            .plus(new decimal_js_1.default(1 - pesoSaldoAtualPrev).mul(aliquotaRegressivaPrevidencia(prazoAportes)));
    };
    /** Retirada bruta anual que entrega `liquidaAnual` após o IR da previdência privada. */
    const retiradaBrutaAnual = (liquidaAnual, ano) => {
        if (liquidaAnual <= 0 || fracaoTributavel <= 0)
            return Math.max(0, liquidaAnual);
        const f = new decimal_js_1.default(fracaoTributavel);
        if (input.tabelaPGBL === 'progressiva') {
            const liquidaMensal = new decimal_js_1.default(liquidaAnual).div(12);
            let bruta = liquidaMensal;
            for (let i = 0; i < 200; i++) {
                const proxima = liquidaMensal.plus(irpfMensalProgressivo(f.mul(bruta).toNumber()));
                if (proxima.minus(bruta).abs().lt('1e-9')) {
                    bruta = proxima;
                    break;
                }
                bruta = proxima;
            }
            return bruta.mul(12).toNumber();
        }
        return new decimal_js_1.default(liquidaAnual).div(new decimal_js_1.default(1).minus(f.mul(aliquotaRegressivaAno(ano)))).toNumber();
    };
    /** Renda líquida de IR da previdência para uma retirada bruta anual constante (IR do 1º ano). */
    const liquidaDeBrutaAnual = (brutaAnual) => {
        if (brutaAnual <= 0 || fracaoTributavel <= 0)
            return Math.max(0, brutaAnual);
        const f = new decimal_js_1.default(fracaoTributavel);
        if (input.tabelaPGBL === 'progressiva') {
            const brutaMensal = new decimal_js_1.default(brutaAnual).div(12);
            return brutaMensal.minus(irpfMensalProgressivo(f.mul(brutaMensal).toNumber())).mul(12).toNumber();
        }
        return new decimal_js_1.default(brutaAnual).mul(new decimal_js_1.default(1).minus(f.mul(aliquotaRegressivaAno(0)))).toNumber();
    };
    // ── Fluxos determinísticos por ano (R$ de hoje) ────────────────────────────
    const gastoBaseAnual = input.gastoMensalDesejado * 12;
    const gastoSaudeBaseAnual = input.incluirInflacaoMedica ? input.gastoMensalSaude * 12 : 0;
    const gastoTotalAno = [];
    const inssAno = [];
    const necessidadeLiquidaAno = [];
    const retiradaAno = [];
    for (let ano = 0; ano < anosDistribuicao; ano++) {
        const idade = input.idadeAposentadoria + ano;
        const gasto = gastoBaseAnual * fatorReducaoGastos(idade) + gastoSaudeBaseAnual * Math.pow(1.03, ano);
        const inss = idadeInicioINSS !== null && idade >= idadeInicioINSS ? beneficioINSSProjetadoMensal * 12 : 0;
        const liquida = Math.max(0, gasto - inss - rendaAluguelMensal * 12);
        gastoTotalAno.push(gasto);
        inssAno.push(inss);
        necessidadeLiquidaAno.push(liquida);
        retiradaAno.push(retiradaBrutaAnual(liquida, ano));
    }
    const necessidadeLiquidaAnual = necessidadeLiquidaAno[0];
    const retiradaInicialAnual = retiradaAno[0];
    const taxaRetiradaInicial = patrimonioNaAposentadoria > 0
        ? (retiradaInicialAnual / patrimonioNaAposentadoria) * 100
        : 0;
    // ── Monte Carlo (percentis por ano; memória O(N)) ──────────────────────────
    // Estatística de simulação em ponto flutuante nativo: os fluxos monetários determinísticos acima
    // usam Decimal; aqui o erro de arredondamento é desprezível frente ao erro amostral.
    const mu = Math.log(1 + perfil.retornoRealAnual / 100) - 0.5 * Math.pow(perfil.volatilidade / 100, 2);
    const sigma = perfil.volatilidade / 100;
    const normal = criarGeradorNormal(criarGeradorMulberry32(semente));
    const saldo = new Float64Array(N).fill(patrimonioNaAposentadoria);
    const crescimento = new Float64Array(N).fill(1); // G_s,k = Π (1 + R)
    const somaInversoCrescimento = new Float64Array(N); // Σ_k 1 / G_s,k
    const idadeEsgotamento = new Float64Array(N).fill(Infinity);
    const ordenado = new Float64Array(N);
    const medianaFimAno = new Float64Array(anosDistribuicao);
    const esgotadasAteAno = new Uint32Array(anosDistribuicao);
    let esgotadas = 0;
    for (let ano = 0; ano < anosDistribuicao; ano++) {
        const retirada = retiradaAno[ano];
        const idadeNoAno = input.idadeAposentadoria + ano;
        for (let s = 0; s < N; s++) {
            const fator = Math.exp(mu + sigma * normal()); // 1 + R (log-normal)
            crescimento[s] *= fator;
            somaInversoCrescimento[s] += 1 / crescimento[s];
            if (idadeEsgotamento[s] === Infinity) {
                const bruto = saldo[s] * fator;
                if (bruto < retirada) {
                    saldo[s] = 0;
                    idadeEsgotamento[s] = idadeNoAno;
                    esgotadas++;
                }
                else {
                    saldo[s] = bruto - retirada;
                }
            }
        }
        ordenado.set(saldo);
        ordenado.sort();
        medianaFimAno[ano] = percentilOrdenado(ordenado, 0.50);
        esgotadasAteAno[ano] = esgotadas;
    }
    // `ordenado` contém os saldos finais ordenados (último ano)
    const p5 = percentilOrdenado(ordenado, 0.05);
    const p50 = percentilOrdenado(ordenado, 0.50);
    const p95 = percentilOrdenado(ordenado, 0.95);
    const simulacoesSucesso = N - esgotadas;
    const probSucesso = (simulacoesSucesso / N) * 100;
    // Esgotamento sobre TODAS as simulações (as que não esgotam contam como +∞)
    ordenado.set(idadeEsgotamento);
    ordenado.sort();
    const idadeEsgP5 = percentilOrdenado(ordenado, 0.05);
    const idadeEsgP50 = percentilOrdenado(ordenado, 0.50);
    const anoEsgotamentoP5 = Number.isFinite(idadeEsgP5) ? idadeEsgP5 : null;
    const anoEsgotamentoP50 = Number.isFinite(idadeEsgP50) ? idadeEsgP50 : null;
    // Renda sustentável: maior retirada bruta constante que cada trajetória suporta, W_s = P ÷ Σ 1/G_s,k;
    // publica-se o P10 (sustentada em 90% das simulações), líquido do IR da previdência do 1º ano.
    for (let s = 0; s < N; s++) {
        ordenado[s] = patrimonioNaAposentadoria > 0 ? patrimonioNaAposentadoria / somaInversoCrescimento[s] : 0;
    }
    ordenado.sort();
    const rendaSustentavelBrutaAnual = percentilOrdenado(ordenado, 0.10);
    const rendaSustentavelLiquidaAnual = liquidaDeBrutaAnual(rendaSustentavelBrutaAnual);
    const rendaPatrimonioMensal = rendaSustentavelLiquidaAnual / 12;
    // ── Projeção anual: mediana (P50) de todas as trajetórias, ano a ano ───────
    const limiteMediana = Math.floor(N * 0.50); // índice do P50 no vetor ordenado
    const projecaoAnualP50 = [];
    for (let ano = 0; ano < anosDistribuicao; ano++) {
        const inicio = ano === 0 ? patrimonioNaAposentadoria : medianaFimAno[ano - 1];
        const fim = medianaFimAno[ano];
        const retirada = retiradaAno[ano];
        const retiradaEfetiva = fim > 0 ? retirada : Math.min(retirada, inicio);
        projecaoAnualP50.push({
            ano: anoReferencia + anosAcumulacao + ano,
            idade: input.idadeAposentadoria + ano,
            patrimonioInicio: inicio,
            aportesAno: 0,
            retornoNominal: inicio > 0 && fim > 0 ? fim - inicio + retiradaEfetiva : 0,
            gastoAno: gastoTotalAno[ano],
            beneficioINSS: inssAno[ano],
            rendaAluguel: rendaAluguelMensal * 12,
            retiradaPatrimonio: retiradaEfetiva,
            patrimonioFim: fim,
            taxaRetirada: inicio > 0 ? (retiradaEfetiva / inicio) * 100 : 0,
            esgotado: esgotadasAteAno[ano] > limiteMediana,
        });
    }
    // ── Memorial de cálculo ────────────────────────────────────────────────────
    const regimeIR = fracaoTributavel > 0
        ? (input.tabelaPGBL === 'progressiva'
            ? 'tabela progressiva mensal 2026 sobre a parcela tributável'
            : `tabela regressiva, alíquota efetiva ${aliquotaRegressivaAno(0).mul(100).toFixed(1).replace('.', ',')}% no 1º ano`)
        : 'sem previdência privada';
    const teto = parametrosRGPS.teto;
    const descricaoINSS = !input.incluirINSS
        ? 'INSS não considerado'
        : idadeInicioINSS === null
            ? (inssProjetado?.regra ?? 'Sem direito ao benefício')
            : `${inssProjetado?.regra}. Entra na projeção a partir dos ${idadeInicioINSS} anos (tempo de contribuição: ${tempoNaAposentadoria} anos; teto e salário mínimo: ${parametrosRGPS.fonte}).`;
    const memorial = [
        {
            titulo: 'Patrimônio na Aposentadoria',
            formula: 'P_apos = P_atual × (1+r)^n + PMT × [(1+r)^n - 1] / r',
            formulaComValores: `P = R$${fmt(patrimonioTotal)} × (1+${perfil.retornoRealAnual}%)^${anosAcumulacao} + R$${fmt(aporteMensalTotal * 12)}/ano × ...`,
            resultado: patrimonioNaAposentadoria,
            unidade: 'R$',
            descricao: `Patrimônio estimado ao se aposentar aos ${input.idadeAposentadoria} anos, em R$ de hoje, com retorno real de ${perfil.retornoRealAnual}% a.a. (perfil ${input.perfilRisco}). Em R$ nominais, com IPCA de ${fmt(ipcaMeta)}% a.a.: R$ ${fmt(patrimonioNaAposentadoriaNominal)}.`,
        },
        {
            titulo: 'Benefício INSS Estimado',
            formula: 'Elegível se idade ≥ 65 H / 62 M e tempo ≥ 20 H / 15 M; B = min(média, teto) × (60% + 2 p.p. × anos acima de 20 H / 15 M); teto ≥ B ≥ 1 salário mínimo',
            formulaComValores: `B = min(R$${fmt(input.salarioContribuicao)}, R$${fmt(teto)}) × coeficiente (tempo: ${tempoNaAposentadoria} anos; idade de início: ${idadeInicioINSS ?? '—'})`,
            resultado: beneficioINSSProjetadoMensal,
            unidade: 'R$/mês',
            descricao: descricaoINSS,
        },
        {
            titulo: 'Retirada Necessária do Patrimônio (1º ano)',
            formula: 'NL = Gasto_total − INSS − Aluguel; Retirada = NL + IR da previdência privada',
            formulaComValores: `NL = R$${fmt(gastoTotalAno[0])}/ano − R$${fmt(inssAno[0] + rendaAluguelMensal * 12)}/ano = R$${fmt(necessidadeLiquidaAnual)}/ano; IR = R$${fmt(retiradaInicialAnual - necessidadeLiquidaAnual)}/ano`,
            resultado: retiradaInicialAnual,
            unidade: 'R$/ano',
            descricao: `Valor que o patrimônio precisa entregar no 1º ano (já descontadas rendas passivas). IR da previdência: ${regimeIR}; fração tributável da retirada ${fmt(fracaoTributavel * 100)}% (PGBL integral; VGBL só rendimentos).`,
        },
        {
            titulo: 'Taxa de Retirada Inicial',
            formula: 'TR = Retirada ÷ Patrimônio × 100',
            formulaComValores: `TR = R$${fmt(retiradaInicialAnual)} ÷ R$${fmt(patrimonioNaAposentadoria)} × 100`,
            resultado: taxaRetiradaInicial,
            unidade: '%',
            descricao: 'Referência: taxa ≤ 3,5% é sustentável para perfil conservador. 4% para moderado.',
        },
        {
            titulo: 'Probabilidade de Sucesso (Monte Carlo)',
            formula: `Sucesso% = simulações_sem_esgotamento ÷ ${N} × 100`,
            formulaComValores: `Sucesso% = ${simulacoesSucesso} ÷ ${N} × 100`,
            resultado: probSucesso,
            unidade: '%',
            descricao: `Percentual de simulações em que o patrimônio durou até os ${input.expectativaVida} anos. Modelo ${exports.VERSAO_MODELO_APOSENTADORIA}; semente ${semente} (mulberry32) — a mesma entrada com a mesma semente reproduz o resultado.`,
        },
        {
            titulo: 'Renda Sustentável do Patrimônio',
            formula: 'W_s = P_apos ÷ Σ_k 1/G_s,k (G = retorno acumulado da simulação s); W = P10 dos W_s, líquido de IR',
            formulaComValores: `W = P10 de ${N} simulações = R$${fmt(rendaSustentavelBrutaAnual)}/ano bruto → R$${fmt(rendaSustentavelLiquidaAnual)}/ano líquido`,
            resultado: rendaPatrimonioMensal,
            unidade: 'R$/mês',
            descricao: `Maior retirada constante (R$ de hoje) que o patrimônio sustenta até os ${input.expectativaVida} anos em 90% das simulações. Não confundir com a renda necessária: R$ ${fmt(necessidadeLiquidaAnual / 12)}/mês no 1º ano.`,
        },
        {
            titulo: 'Saldo Final Mediano (P50)',
            formula: 'P50 = percentil 50 dos saldos finais de todas as simulações',
            formulaComValores: `P50 de ${N} simulações Monte Carlo`,
            resultado: p50,
            unidade: 'R$',
            descricao: 'Em metade das simulações, o patrimônio final ficou acima desse valor. A projeção anual mostra a mesma mediana ano a ano.',
        },
    ];
    // ── Alertas ────────────────────────────────────────────────────────────────
    const alertas = [];
    if (probSucesso < 70) {
        alertas.push({
            tipo: 'danger',
            mensagem: `Probabilidade de sucesso baixa (${probSucesso.toFixed(0)}%). Considere aumentar aportes, adiar aposentadoria ou reduzir gastos desejados.`,
        });
    }
    else if (probSucesso < 85) {
        alertas.push({
            tipo: 'warning',
            mensagem: `Probabilidade de sucesso moderada (${probSucesso.toFixed(0)}%). Pequenos ajustes podem elevar significativamente a segurança do plano.`,
        });
    }
    if (taxaRetiradaInicial > 5) {
        alertas.push({
            tipo: 'danger',
            mensagem: `Taxa de retirada inicial de ${taxaRetiradaInicial.toFixed(1)}% é muito alta. Recomenda-se até 3,5% (conservador) ou 4% (moderado) para planos de longo prazo no Brasil.`,
        });
    }
    else if (taxaRetiradaInicial > 4) {
        alertas.push({
            tipo: 'warning',
            mensagem: `Taxa de retirada de ${taxaRetiradaInicial.toFixed(1)}% está no limite. Considere um colchão de segurança.`,
        });
    }
    if (anosAcumulacao < 5) {
        alertas.push({
            tipo: 'warning',
            mensagem: 'Menos de 5 anos até a aposentadoria. O crescimento do patrimônio depende principalmente dos aportes, não dos rendimentos.',
        });
    }
    if (input.saldoPGBL > 0 || input.aportePGBL > 0 || input.saldoVGBL > 0 || input.aporteVGBL > 0) {
        alertas.push({
            tipo: 'info',
            mensagem: input.tabelaPGBL === 'progressiva'
                ? 'Previdência na tabela progressiva: IR pela tabela mensal de 2026 (com redução da Lei 15.270/2025) sobre a parcela tributável da retirada, sem somar INSS/aluguel e sem a parcela isenta de 65+.'
                : 'Previdência na tabela regressiva: a alíquota cai de 35% para 10% após 10 anos de acumulação. O modelo usa prazo médio ponderado (saldo atual desde hoje; aportes desde a metade da acumulação).',
        });
    }
    if (input.incluirInflacaoMedica && input.gastoMensalSaude > 0) {
        alertas.push({
            tipo: 'info',
            mensagem: `Inflação médica projetada em IPCA + 3% a.a. Aos ${input.expectativaVida} anos, o gasto com saúde será ~${(Math.pow(1.03, anosDistribuicao) * 100 - 100).toFixed(0)}% maior em termos reais.`,
        });
    }
    if (input.incluirINSS && inssProjetado) {
        if (idadeInicioINSS === null) {
            inssProjetado.alertas.forEach(msg => alertas.push({ tipo: 'warning', mensagem: msg }));
        }
        else {
            if (idadeInicioINSS > input.idadeAposentadoria) {
                alertas.push({
                    tipo: 'warning',
                    mensagem: `O INSS só entra aos ${idadeInicioINSS} anos (idade mínima, EC 103/2019 art. 19): dos ${input.idadeAposentadoria} aos ${idadeInicioINSS} anos o patrimônio cobre a renda sozinho.`,
                });
            }
            inssProjetado.alertas
                .filter(msg => msg === alertaRGPS)
                .forEach(msg => alertas.push({ tipo: 'info', mensagem: msg }));
        }
        alertas.push({
            tipo: 'info',
            mensagem: 'INSS pela regra permanente da EC 103/2019. Regras de transição (arts. 15 a 17, 20 e 21) para quem contribuía antes de 13/11/2019 não são modeladas.',
        });
    }
    // ── Retorno ────────────────────────────────────────────────────────────────
    const totalAportado = aporteMensalTotal * 12 * anosAcumulacao;
    const totalRendimento = patrimonioNaAposentadoria - patrimonioTotal - totalAportado;
    return {
        versaoModelo: exports.VERSAO_MODELO_APOSENTADORIA,
        semente,
        numeroSimulacoes: N,
        idadeFinal: input.idadeAposentadoria + anosDistribuicao,
        probabilidadeSucesso: probSucesso,
        saldoFinalP5: Math.max(0, p5),
        saldoFinalP50: Math.max(0, p50),
        saldoFinalP95: Math.max(0, p95),
        beneficioINSSMensal,
        beneficioINSSProjetadoMensal,
        idadeInicioINSS,
        rendaNecessariaPatrimonioMensal: necessidadeLiquidaAnual / 12,
        rendaPatrimonioMensal,
        rendaTotalMensal: beneficioINSSMensal + rendaAluguelMensal + rendaPatrimonioMensal,
        anoEsgotamentoP5,
        anoEsgotamentoP50,
        taxaRetiradaInicial,
        patrimonioAcumuladoAposentadoria: patrimonioNaAposentadoria,
        totalAportado,
        totalRendimento: Math.max(0, totalRendimento),
        ipcaMeta,
        patrimonioAcumuladoAposentadoriaNominal: patrimonioNaAposentadoriaNominal,
        parametrosRGPS,
        projecaoAnualP50,
        memorial,
        alertas,
    };
}
//# sourceMappingURL=RetirementEngine.js.map