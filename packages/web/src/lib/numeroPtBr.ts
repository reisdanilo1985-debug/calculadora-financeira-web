/**
 * Leitura de números digitados em pt-BR (vírgula = decimal, ponto = milhar).
 *
 * Por que existe: `<input type="number">` e `Number(x)` leem "-10.000" como −10
 * (ponto decimal en-US). Numa tela de tesouraria isso muda a ordem de grandeza
 * sem aviso. Aqui toda entrada textual passa por UMA regra explícita, e o que
 * não tiver leitura única vira erro com mensagem — nunca conversão silenciosa.
 *
 * Regras (após trim; sinal opcional "+", "-" ou "−" no início):
 *  - Com vírgula: vírgula única = decimal; pontos só na parte inteira e em grupos
 *    de 3 ("1.234.567,89"). Ponto depois da vírgula ("1,234.56") → erro.
 *  - Sem vírgula e pontos em grupos de 3 ("10.000", "1.234.567") → milhar.
 *    Um ÚNICO ponto seguido de exatamente 3 dígitos ("1.048") é marcado
 *    `ambiguo` (en-US leria 1,048): quem chama decide se aceita como milhar
 *    (valores monetários) ou rejeita (taxas e fatores) — ver `lerNumeroPtBr`.
 *  - Sem vírgula e um único ponto que NÃO forma grupo de milhar ("14.4", "0.5")
 *    → ponto decimal (é a única leitura possível; também é o formato que o
 *    antigo `type=number` gravava no estado).
 *  - Letras, espaços internos, mais de uma vírgula ou grupos irregulares → erro.
 *  - Vazio / só espaços → `vazio` (nunca 0).
 *  - `number` finito passa direto (defaults e premissas do snapshot).
 *
 * Módulo puro (sem React/DOM): usado pela UI e pelo `buildBody` da Tesouraria.
 */

export type LeituraNumero =
  | { tipo: 'vazio' }
  | { tipo: 'ok'; valor: number; ambiguo: boolean }
  | { tipo: 'erro'; mensagem: string };

export type LeituraLista =
  | { tipo: 'vazio' }
  | { tipo: 'ok'; valores: number[] }
  | { tipo: 'erro'; mensagem: string };

export interface OpcoesLeitura {
  /** Exige número inteiro (dias, nº de parcelas…). */
  inteiro?: boolean;
  /** Rejeita "1.048" (um ponto + 3 dígitos, sem vírgula) em vez de ler como milhar. */
  rejeitarAmbiguo?: boolean;
}

/** Parte inteira com milhar pt-BR: 1–3 dígitos (sem zero à esquerda) + grupos ".ddd". */
const MILHAR = /^[1-9]\d{0,2}(?:\.\d{3})+$/;
const EXEMPLO = 'ex.: 1.234,56';

const erro = (mensagem: string): LeituraNumero => ({ tipo: 'erro', mensagem });

/** Lê um valor pelas regras pt-BR descritas no topo do arquivo. */
export function parseNumeroPtBr(entrada: unknown): LeituraNumero {
  if (entrada === null || entrada === undefined) return { tipo: 'vazio' };
  if (typeof entrada === 'number') {
    return Number.isFinite(entrada)
      ? { tipo: 'ok', valor: entrada, ambiguo: false }
      : erro('Número inválido.');
  }
  if (typeof entrada !== 'string') return erro('Número inválido.');

  const s = entrada.trim();
  if (s === '') return { tipo: 'vazio' };

  const m = /^([+\-−]?)([\d.,]+)$/.exec(s);
  if (!m || !/\d/.test(m[2])) {
    return erro(`Número inválido — use dígitos, vírgula decimal e ponto de milhar (${EXEMPLO}).`);
  }
  const negativo = m[1] === '-' || m[1] === '−';
  const corpo = m[2];

  const virgulas = corpo.split(',').length - 1;
  let inteira: string;
  let decimal = '';
  let ambiguo = false;

  if (virgulas > 1) {
    return erro(`Mais de uma vírgula — a vírgula é o separador decimal (${EXEMPLO}).`);
  }
  if (virgulas === 1) {
    [inteira, decimal] = corpo.split(',');
    if (decimal.includes('.')) {
      return erro(`Formato misto: em pt-BR a vírgula é o decimal e o ponto, o milhar (${EXEMPLO}).`);
    }
    if (inteira.includes('.')) {
      if (!MILHAR.test(inteira)) return erro('Ponto de milhar mal posicionado (ex.: 1.234.567,89).');
      inteira = inteira.replace(/\./g, '');
    }
  } else {
    const pontos = corpo.split('.').length - 1;
    if (pontos === 0) {
      inteira = corpo;
    } else if (MILHAR.test(corpo)) {
      inteira = corpo.replace(/\./g, '');
      ambiguo = pontos === 1;
    } else if (pontos === 1) {
      [inteira, decimal] = corpo.split('.');
    } else {
      return erro('Ponto de milhar mal posicionado (ex.: 1.234.567,89).');
    }
  }

  // Só dígitos a partir daqui: a conversão abaixo é exata na leitura de string.
  const valor = Number(`${inteira || '0'}.${decimal || '0'}`);
  if (!Number.isFinite(valor)) return erro('Número fora do intervalo.');
  return { tipo: 'ok', valor: negativo && valor !== 0 ? -valor : valor, ambiguo };
}

/** `parseNumeroPtBr` + restrições do campo (inteiro, rejeição do ponto ambíguo). */
export function lerNumeroPtBr(entrada: unknown, opcoes: OpcoesLeitura = {}): LeituraNumero {
  const r = parseNumeroPtBr(entrada);
  if (r.tipo !== 'ok') return r;
  if (opcoes.rejeitarAmbiguo && r.ambiguo) {
    const txt = String(entrada).trim();
    return erro(`"${txt}" é ambíguo: use ${txt.replace('.', ',')} (decimal) ou ${txt.replace('.', '')} (milhar).`);
  }
  if (opcoes.inteiro && !Number.isInteger(r.valor)) return erro('Informe um número inteiro.');
  return r;
}

/**
 * Lista de inteiros ("126, 252; 378"): separadores vírgula, ponto e vírgula ou
 * espaço; cada item segue as regras pt-BR ("1.260" = 1260). Item inválido → erro
 * (antes era descartado em silêncio).
 */
export function parseListaInteirosPtBr(entrada: unknown): LeituraLista {
  if (entrada === null || entrada === undefined) return { tipo: 'vazio' };
  const itens: unknown[] = Array.isArray(entrada)
    ? entrada
    : typeof entrada === 'number'
      ? [entrada]
      : String(entrada).split(/[;,\s]+/).filter(t => t !== '');
  if (itens.length === 0) return { tipo: 'vazio' };
  const valores: number[] = [];
  for (const item of itens) {
    const r = lerNumeroPtBr(item, { inteiro: true });
    if (r.tipo !== 'ok') {
      return {
        tipo: 'erro',
        mensagem: `Item "${String(item)}" inválido: use inteiros separados por vírgula (ex.: 126, 252, 378).`,
      };
    }
    valores.push(r.valor);
  }
  return { tipo: 'ok', valores };
}

/**
 * Número → texto editável em pt-BR, sem separador de milhar ("14,4", "1000000",
 * "-10000"). A volta por `parseNumeroPtBr` devolve exatamente o mesmo número.
 */
export function formatarNumeroPtBr(n: number): string {
  if (!Number.isFinite(n)) return '';
  let s = String(n);
  if (/e/i.test(s)) {
    // notação científica (|n| < 1e-6 ou ≥ 1e21): expande para dígitos simples
    s = Math.abs(n) < 1
      ? n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '')
      : BigInt(Math.round(n)).toString();
  }
  return s.replace('.', ',');
}
