/**
 * Fluxos de caixa datados: regras de linha, planilha padrão (modelo e exportação)
 * e importação. Usado por todas as telas que cadastram fluxos (Valor Presente e
 * Amortizações e aportes), para que digitar, importar e exportar sigam UMA regra.
 *
 * Importação estrita: só aceita arquivos no layout do modelo (aba "Fluxos" com o
 * cabeçalho exato na linha 1). Se qualquer linha tiver erro, nada é importado — um
 * fluxo descartado em silêncio mudaria o resultado do cálculo.
 *
 * Módulo sem React: a leitura recebe o conteúdo do arquivo (ArrayBuffer).
 */

import { lerNumeroPtBr } from '@/lib/numeroPtBr';
import { somarMesesISO, hojeISO } from '@/lib/datas';

export type UnidadeFluxo = 'R$' | '%';

/** Linha do editor: valor como digitado (texto pt-BR) ou número importado. */
export interface LinhaFluxo {
  date: string;
  amount: string | number;
  /** Só nas telas com coluna Unidade (padrão R$) */
  unit?: UnidadeFluxo;
}

export interface ModeloFluxos {
  id: 'valor-presente' | 'amortizacoes-aportes';
  /** Nome do modelo, citado nas instruções e nas mensagens */
  titulo: string;
  aba: string;
  colunas: readonly string[];
  comUnidade: boolean;
  /** Valor zero não é lançamento (ex.: amortização de R$ 0,00) */
  recusaZero: boolean;
  regraSinal: string;
  /** Base do nome dos arquivos gerados */
  arquivo: string;
  exemplos: { data: string; valor: number; unidade?: UnidadeFluxo; leitura: string }[];
}

export const MODELO_VALOR_PRESENTE: ModeloFluxos = {
  id: 'valor-presente',
  titulo: 'Fluxos de caixa — Valor Presente',
  aba: 'Fluxos',
  colunas: ['Data', 'Valor'],
  comUnidade: false,
  recusaZero: false,
  regraSinal: 'Saídas negativas, entradas positivas.',
  arquivo: 'fluxos-valor-presente',
  exemplos: [
    { data: '01/01/2026', valor: -100000, leitura: 'Saída de R$ 100.000,00 (ex.: investimento)' },
    { data: '01/01/2027', valor: 35000, leitura: 'Entrada de R$ 35.000,00' },
  ],
};

export const MODELO_AMORTIZACOES: ModeloFluxos = {
  id: 'amortizacoes-aportes',
  titulo: 'Amortizações e aportes',
  aba: 'Fluxos',
  colunas: ['Data', 'Valor', 'Unidade'],
  comUnidade: true,
  recusaZero: true,
  regraSinal: 'Amortizações negativas (saem do saldo), aportes positivos (entram no saldo).',
  arquivo: 'amortizacoes-aportes',
  exemplos: [
    { data: '15/03/2026', valor: -50000, unidade: 'R$', leitura: 'Amortização de R$ 50.000,00' },
    { data: '10/06/2026', valor: 10, unidade: '%', leitura: 'Aporte de 10% do saldo na data' },
  ],
};

/** Limite por arquivo: acima disso o editor fica lento e o arquivo provavelmente está errado */
export const LIMITE_FLUXOS = 2000;

/** Limite de linhas geradas de uma vez (mesmo teto das amortizações periódicas do motor) */
export const LIMITE_PERIODICOS = 1200;

// ── Regras de uma linha (editor e importação) ────────────────────────────────

export type LeituraLinha =
  | { tipo: 'vazia' }
  | { tipo: 'ok'; date: string; valor: number; unit: UnidadeFluxo }
  | { tipo: 'erro'; mensagem: string };

export function lerLinhaFluxo(linha: LinhaFluxo, modelo: ModeloFluxos): LeituraLinha {
  const leitura = lerNumeroPtBr(linha.amount);
  const erro = (mensagem: string): LeituraLinha => ({ tipo: 'erro', mensagem });
  if (leitura.tipo === 'vazio' && !linha.date) return { tipo: 'vazia' };
  if (leitura.tipo === 'erro') return erro(leitura.mensagem);
  if (!linha.date) return erro('Informe a data do fluxo.');
  if (leitura.tipo === 'vazio') return erro('Informe o valor do fluxo.');
  const unit: UnidadeFluxo = modelo.comUnidade && linha.unit === '%' ? '%' : 'R$';
  if (modelo.recusaZero && leitura.valor === 0) return erro('Informe um valor diferente de zero.');
  if (unit === '%' && Math.abs(leitura.valor) > 100) return erro('O percentual do saldo deve ser de até 100%.');
  return { tipo: 'ok', date: linha.date, valor: leitura.valor, unit };
}

/** Linhas válidas e preenchidas (vazias e com erro ficam de fora) */
export function fluxosValidos(linhas: LinhaFluxo[], modelo: ModeloFluxos): { date: string; valor: number; unit: UnidadeFluxo }[] {
  return linhas.flatMap(l => {
    const r = lerLinhaFluxo(l, modelo);
    return r.tipo === 'ok' ? [{ date: r.date, valor: r.valor, unit: r.unit }] : [];
  });
}

export const linhaVazia = (modelo?: ModeloFluxos): LinhaFluxo =>
  modelo?.comUnidade ? { date: '', amount: '', unit: 'R$' } : { date: '', amount: '' };

// ── Fluxos periódicos ────────────────────────────────────────────────────────

export const MESES_PERIODICIDADE = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 } as const;
export type PeriodicidadeFluxo = keyof typeof MESES_PERIODICIDADE;

/**
 * Datas de um fluxo periódico de `inicio` até `fim` (inclusive), ancoradas no dia de
 * `inicio` com ajuste ao fim do mês (31/01 → 28/02 → 31/03) — a mesma regra do motor.
 */
export function datasPeriodicas(inicio: string, fim: string, periodicidade: PeriodicidadeFluxo): string[] {
  if (!inicio || !fim || fim < inicio) return [];
  const passo = MESES_PERIODICIDADE[periodicidade];
  const datas: string[] = [];
  for (let k = 0; k <= LIMITE_PERIODICOS; k++) {
    const d = somarMesesISO(inicio, k * passo);
    if (d > fim) break;
    datas.push(d);
  }
  return datas;
}

// ── Datas da planilha ────────────────────────────────────────────────────────

const EPOCA_EXCEL_UTC = Date.UTC(1899, 11, 30);
const DIA_MS = 86400000;

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 'AAAA-MM-DD' → número de série do Excel (célula de data) */
export function isoParaSerialExcel(dataIso: string): number {
  const [y, m, d] = dataIso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCA_EXCEL_UTC) / DIA_MS);
}

function dataCivilValida(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2200 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Célula de data (série do Excel) ou texto dd/mm/aaaa → 'AAAA-MM-DD'; null se inválida */
function lerDataCelula(valor: unknown): string | null {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 1) return null;
    const t = new Date(EPOCA_EXCEL_UTC + Math.floor(valor) * DIA_MS);
    const y = t.getUTCFullYear();
    return y >= 1900 && y <= 2200 ? iso(y, t.getUTCMonth() + 1, t.getUTCDate()) : null;
  }
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valor ?? '').trim());
  if (!m) return null;
  const [d, mes, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return dataCivilValida(y, mes, d) ? iso(y, mes, d) : null;
}

// ── Importação ───────────────────────────────────────────────────────────────

export interface ErroLinhaPlanilha {
  /** Linha da planilha (1 = cabeçalho) */
  linha: number;
  mensagem: string;
}

export type ResultadoImportacao =
  | { tipo: 'ok'; linhas: LinhaFluxo[] }
  /** Estrutura diferente do modelo padrão (aba, cabeçalho, colunas extras) ou arquivo ilegível */
  | { tipo: 'fora-do-modelo'; mensagem: string }
  /** Estrutura correta, conteúdo com erros: nada é importado */
  | { tipo: 'erros'; erros: ErroLinhaPlanilha[] };

const normalizarCabecalho = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const letraColuna = (c: number) => String.fromCharCode(65 + c);

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

const textoOriginal = (v: unknown) => (typeof v === 'number' ? String(v) : String(v ?? '').trim());

export async function lerPlanilhaFluxos(conteudo: ArrayBuffer, modelo: ModeloFluxos): Promise<ResultadoImportacao> {
  const XLSX = await import('xlsx');
  const foraDoModelo = (detalhe: string): ResultadoImportacao => ({
    tipo: 'fora-do-modelo',
    mensagem: `O arquivo não segue o modelo padrão de "${modelo.titulo}": ${detalhe} ` +
      'Baixe o modelo pelo botão "Baixar modelo", preencha sem alterar a estrutura e importe novamente.',
  });

  let wb;
  try {
    wb = XLSX.read(new Uint8Array(conteudo), { type: 'array', cellDates: false });
  } catch {
    return {
      tipo: 'fora-do-modelo',
      mensagem: 'Não foi possível ler o arquivo. Envie uma planilha Excel (.xlsx) gerada pelo botão "Baixar modelo".',
    };
  }

  const ws = wb.Sheets[modelo.aba];
  if (!ws) {
    return foraDoModelo(`a aba "${modelo.aba}" não foi encontrada (abas no arquivo: ${wb.SheetNames.map(n => `"${n}"`).join(', ') || 'nenhuma'}).`);
  }

  const esperado = modelo.colunas.join(' | ');
  if (!ws['!ref']) return foraDoModelo(`a aba "${modelo.aba}" está vazia; a linha 1 deve conter o cabeçalho "${esperado}".`);
  const faixa = XLSX.utils.decode_range(ws['!ref']);
  const matriz: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
  // sheet_to_json começa na primeira célula usada: desloca para contar a partir de A1
  const linhaInicial = faixa.s.r;
  const colunaInicial = faixa.s.c;
  const celula = (r: number, c: number): unknown => {
    const rr = r - linhaInicial;
    const cc = c - colunaInicial;
    return rr >= 0 && cc >= 0 ? matriz[rr]?.[cc] : '';
  };

  const ultimaColuna = faixa.e.c;
  const cabecalho: string[] = [];
  for (let c = 0; c <= Math.max(ultimaColuna, modelo.colunas.length - 1); c++) cabecalho.push(textoOriginal(celula(0, c)));
  while (cabecalho.length > modelo.colunas.length && cabecalho[cabecalho.length - 1] === '') cabecalho.pop();
  const cabecalhoConfere =
    cabecalho.length === modelo.colunas.length &&
    modelo.colunas.every((nome, i) => normalizarCabecalho(cabecalho[i]) === normalizarCabecalho(nome));
  if (!cabecalhoConfere) {
    const encontrado = cabecalho.filter(Boolean).join(' | ') || 'vazio';
    return foraDoModelo(
      `a linha 1 da aba "${modelo.aba}" deve conter exatamente as colunas "${esperado}", nessa ordem (encontrado: "${encontrado}"). ` +
      'Não renomeie, reordene, inclua nem remova colunas.'
    );
  }

  // Conteúdo fora das colunas do modelo
  for (let r = 1; r <= faixa.e.r; r++) {
    for (let c = modelo.colunas.length; c <= ultimaColuna; c++) {
      if (!vazio(celula(r, c))) {
        return foraDoModelo(`há conteúdo fora das colunas do modelo (célula ${letraColuna(c)}${r + 1}).`);
      }
    }
  }

  const linhas: LinhaFluxo[] = [];
  const erros: ErroLinhaPlanilha[] = [];
  for (let r = 1; r <= faixa.e.r; r++) {
    const valores = modelo.colunas.map((_, c) => celula(r, c));
    if (valores.every(vazio)) continue;
    const linhaPlanilha = r + 1;
    const [dataBruta, valorBruto, unidadeBruta] = valores;

    const dataIso = vazio(dataBruta) ? null : lerDataCelula(dataBruta);
    if (vazio(dataBruta)) {
      erros.push({ linha: linhaPlanilha, mensagem: 'Data não informada.' });
      continue;
    }
    if (!dataIso) {
      erros.push({ linha: linhaPlanilha, mensagem: `Data inválida ("${textoOriginal(dataBruta)}"). Use o formato dd/mm/aaaa.` });
      continue;
    }

    let unit: UnidadeFluxo | undefined;
    if (modelo.comUnidade) {
      const u = textoOriginal(unidadeBruta).toUpperCase();
      if (u !== 'R$' && u !== '%') {
        erros.push({
          linha: linhaPlanilha,
          mensagem: vazio(unidadeBruta)
            ? 'Unidade não informada. Use R$ ou %.'
            : `Unidade inválida ("${textoOriginal(unidadeBruta)}"). Use R$ ou %.`,
        });
        continue;
      }
      unit = u as UnidadeFluxo;
    }

    if (vazio(valorBruto)) {
      erros.push({ linha: linhaPlanilha, mensagem: 'Valor não informado.' });
      continue;
    }
    const linha: LinhaFluxo = { date: dataIso, amount: typeof valorBruto === 'number' ? valorBruto : textoOriginal(valorBruto), ...(unit ? { unit } : {}) };
    const leitura = lerLinhaFluxo(linha, modelo);
    if (leitura.tipo === 'erro') {
      erros.push({ linha: linhaPlanilha, mensagem: `Valor "${textoOriginal(valorBruto)}": ${leitura.mensagem}` });
      continue;
    }
    if (leitura.tipo === 'ok') {
      linhas.push(modelo.comUnidade ? { date: leitura.date, amount: leitura.valor, unit: leitura.unit } : { date: leitura.date, amount: leitura.valor });
    }
  }

  if (erros.length) return { tipo: 'erros', erros };
  if (!linhas.length) {
    return { tipo: 'erros', erros: [{ linha: 2, mensagem: `A aba "${modelo.aba}" não tem fluxos preenchidos a partir da linha 2.` }] };
  }
  if (linhas.length > LIMITE_FLUXOS) {
    return {
      tipo: 'erros',
      erros: [{ linha: 0, mensagem: `A planilha tem ${linhas.length} fluxos; o limite é ${LIMITE_FLUXOS.toLocaleString('pt-BR')} por importação.` }],
    };
  }
  return { tipo: 'ok', linhas };
}

// ── Modelo e exportação ──────────────────────────────────────────────────────

/** Monta a planilha no layout do modelo; com `linhas`, é a exportação (reimportável). */
export async function montarPlanilhaFluxos(modelo: ModeloFluxos, linhas: LinhaFluxo[] = []) {
  const XLSX = await import('xlsx');
  const validas = fluxosValidos(linhas, modelo);

  const dados: (string | number)[][] = [
    [...modelo.colunas],
    ...validas.map(f => (modelo.comUnidade ? [isoParaSerialExcel(f.date), f.valor, f.unit] : [isoParaSerialExcel(f.date), f.valor])),
  ];
  const wsFluxos = XLSX.utils.aoa_to_sheet(dados);
  validas.forEach((_, i) => {
    const r = i + 2;
    if (wsFluxos[`A${r}`]) wsFluxos[`A${r}`].z = 'dd/mm/yyyy';
    if (wsFluxos[`B${r}`]) wsFluxos[`B${r}`].z = '#,##0.00';
  });
  wsFluxos['!cols'] = modelo.colunas.map((_, i) => ({ wch: i === 0 ? 14 : 18 }));

  const esperado = modelo.colunas.join(' | ');
  const instrucoes: (string | number)[][] = [
    [`Modelo: ${modelo.titulo}`],
    [],
    ['Como preencher'],
    ['Aba', `Preencha a aba "${modelo.aba}". Não a renomeie.`],
    ['Cabeçalho', `A linha 1 deve conter exatamente "${esperado}", nessa ordem. Não renomeie, reordene, inclua nem remova colunas.`],
    ['Data', 'Data do fluxo em dd/mm/aaaa (texto ou célula de data do Excel).'],
    ['Valor', `${modelo.regraSinal} Vírgula decimal e ponto de milhar (ex.: -1.234,56) ou número do Excel.`],
    ...(modelo.comUnidade
      ? [['Unidade', 'R$ para valor em reais; % para percentual do saldo na data (até 100).']]
      : []),
    [],
    ['Exemplos'],
    [...modelo.colunas, 'Leitura'],
    ...modelo.exemplos.map(e => (modelo.comUnidade ? [e.data, e.valor, e.unidade ?? 'R$', e.leitura] : [e.data, e.valor, e.leitura])),
    [],
    ['Regras da importação'],
    ['-', 'Linhas totalmente em branco são ignoradas.'],
    ['-', 'Se alguma linha tiver erro, nenhum fluxo é importado e os erros são listados por linha.'],
    ['-', 'Arquivos fora do modelo (aba, cabeçalho ou colunas diferentes) são recusados.'],
    ['-', `Limite de ${LIMITE_FLUXOS.toLocaleString('pt-BR')} fluxos por arquivo.`],
  ];
  const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes);
  wsInstrucoes['!cols'] = [{ wch: 14 }, { wch: 90 }, { wch: 12 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsFluxos, modelo.aba);
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, 'Instruções');
  return { XLSX, wb, quantidade: validas.length };
}

/** Baixa o modelo em branco */
export async function baixarModeloFluxos(modelo: ModeloFluxos) {
  const { XLSX, wb } = await montarPlanilhaFluxos(modelo);
  XLSX.writeFile(wb, `${modelo.arquivo}-modelo.xlsx`);
}

/** Exporta as linhas válidas no layout do modelo (pode ser editada e reimportada) */
export async function exportarFluxos(modelo: ModeloFluxos, linhas: LinhaFluxo[]) {
  const { XLSX, wb } = await montarPlanilhaFluxos(modelo, linhas);
  XLSX.writeFile(wb, `${modelo.arquivo}-${hojeISO()}.xlsx`);
}
