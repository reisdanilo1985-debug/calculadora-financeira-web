/**
 * Planilha padrão de fluxos: ida e volta (exportar → importar), recusa de arquivos fora
 * do modelo, erros por linha (nada é importado) e datas dos fluxos periódicos.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  LIMITE_FLUXOS,
  MODELO_AMORTIZACOES,
  MODELO_VALOR_PRESENTE,
  datasPeriodicas,
  isoParaSerialExcel,
  lerLinhaFluxo,
  lerPlanilhaFluxos,
  montarPlanilhaFluxos,
} from '@/lib/planilhaFluxos';

const arquivo = (abas: Record<string, unknown[][]>): ArrayBuffer => {
  const wb = XLSX.utils.book_new();
  for (const [nome, aoa] of Object.entries(abas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nome);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
};

const exportado = async (modelo = MODELO_VALOR_PRESENTE, linhas: any[] = []) => {
  const { wb } = await montarPlanilhaFluxos(modelo, linhas);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};

describe('ida e volta', () => {
  it('Valor Presente: exporta e reimporta as mesmas datas e valores', async () => {
    const linhas = [
      { date: '2026-01-01', amount: '-100.000,00' },
      { date: '2026-06-30', amount: 1234.56 },
      { date: '2027-01-01', amount: '35000' },
    ];
    const r = await lerPlanilhaFluxos(await exportado(MODELO_VALOR_PRESENTE, linhas), MODELO_VALOR_PRESENTE);
    expect(r).toEqual({
      tipo: 'ok',
      linhas: [
        { date: '2026-01-01', amount: -100000 },
        { date: '2026-06-30', amount: 1234.56 },
        { date: '2027-01-01', amount: 35000 },
      ],
    });
  });

  it('Amortizações: mantém unidade R$ e %', async () => {
    const linhas = [
      { date: '2026-03-15', amount: '-50.000', unit: 'R$' },
      { date: '2026-06-10', amount: '10', unit: '%' },
    ];
    const r = await lerPlanilhaFluxos(await exportado(MODELO_AMORTIZACOES, linhas), MODELO_AMORTIZACOES);
    expect(r).toEqual({
      tipo: 'ok',
      linhas: [
        { date: '2026-03-15', amount: -50000, unit: 'R$' },
        { date: '2026-06-10', amount: 10, unit: '%' },
      ],
    });
  });

  it('modelo em branco importado sem preencher: avisa que não há fluxos', async () => {
    const r = await lerPlanilhaFluxos(await exportado(), MODELO_VALOR_PRESENTE);
    expect(r.tipo).toBe('erros');
    if (r.tipo === 'erros') expect(r.erros[0].mensagem).toMatch(/não tem fluxos preenchidos/);
  });

  it('aceita datas em texto dd/mm/aaaa, valores pt-BR e ignora linhas em branco', async () => {
    const buf = arquivo({ Fluxos: [['Data', 'Valor'], ['15/03/2026', '-1.234,56'], ['', ''], [isoParaSerialExcel('2026-12-31'), 10]] });
    const r = await lerPlanilhaFluxos(buf, MODELO_VALOR_PRESENTE);
    expect(r).toEqual({ tipo: 'ok', linhas: [{ date: '2026-03-15', amount: -1234.56 }, { date: '2026-12-31', amount: 10 }] });
  });
});

describe('arquivo fora do modelo padrão', () => {
  const recusa = async (buf: ArrayBuffer, modelo = MODELO_VALOR_PRESENTE) => {
    const r = await lerPlanilhaFluxos(buf, modelo);
    expect(r.tipo).toBe('fora-do-modelo');
    return r.tipo === 'fora-do-modelo' ? r.mensagem : '';
  };

  it('aba renomeada', async () => {
    expect(await recusa(arquivo({ Planilha1: [['Data', 'Valor'], ['01/01/2026', 1]] }))).toMatch(/aba "Fluxos" não foi encontrada/);
  });

  it('coluna renomeada', async () => {
    const msg = await recusa(arquivo({ Fluxos: [['Data', 'Valor (R$)'], ['01/01/2026', 1]] }));
    expect(msg).toMatch(/exatamente as colunas "Data \| Valor", nessa ordem/);
    expect(msg).toMatch(/encontrado: "Data \| Valor \(R\$\)"/);
  });

  it('colunas reordenadas', async () => {
    await recusa(arquivo({ Fluxos: [['Valor', 'Data'], [1, '01/01/2026']] }));
  });

  it('coluna incluída no cabeçalho', async () => {
    await recusa(arquivo({ Fluxos: [['Data', 'Valor', 'Descrição'], ['01/01/2026', 1, 'x']] }));
  });

  it('conteúdo fora das colunas do modelo', async () => {
    const msg = await recusa(arquivo({ Fluxos: [['Data', 'Valor'], ['01/01/2026', 1], ['01/02/2026', 2, 'anotação']] }));
    expect(msg).toMatch(/célula C3/);
  });

  it('modelo de outra tela (amortizações importado no Valor Presente)', async () => {
    await recusa(await exportado(MODELO_AMORTIZACOES, [{ date: '2026-01-01', amount: '-10', unit: 'R$' }]));
  });

  it('arquivo que não é planilha', async () => {
    const lixo = new TextEncoder().encode('não sou uma planilha').buffer;
    await recusa(lixo as ArrayBuffer);
  });

  it('diferença só de maiúsculas e espaços no cabeçalho é aceita', async () => {
    const r = await lerPlanilhaFluxos(arquivo({ Fluxos: [[' data ', 'VALOR'], ['01/01/2026', 1]] }), MODELO_VALOR_PRESENTE);
    expect(r.tipo).toBe('ok');
  });
});

describe('erros por linha: nada é importado', () => {
  it('lista cada linha com erro e não devolve fluxos', async () => {
    const buf = arquivo({
      Fluxos: [
        ['Data', 'Valor'],
        ['31/02/2026', 100],
        ['01/03/2026', ''],
        ['2026-04-01', 100],
        ['01/05/2026', '1,2,3'],
        ['01/06/2026', 500],
      ],
    });
    const r = await lerPlanilhaFluxos(buf, MODELO_VALOR_PRESENTE);
    expect(r.tipo).toBe('erros');
    if (r.tipo !== 'erros') return;
    expect(r.erros.map(e => e.linha)).toEqual([2, 3, 4, 5]);
    expect(r.erros[0].mensagem).toMatch(/Data inválida \("31\/02\/2026"\)/);
    expect(r.erros[1].mensagem).toBe('Valor não informado.');
    expect(r.erros[3].mensagem).toMatch(/Mais de uma vírgula/);
  });

  it('amortizações: valor zero, percentual acima de 100% e unidade inválida', async () => {
    const buf = arquivo({
      Fluxos: [
        ['Data', 'Valor', 'Unidade'],
        ['01/01/2026', 0, 'R$'],
        ['01/02/2026', 150, '%'],
        ['01/03/2026', -10, 'BRL'],
        ['01/04/2026', -10, ''],
      ],
    });
    const r = await lerPlanilhaFluxos(buf, MODELO_AMORTIZACOES);
    expect(r.tipo).toBe('erros');
    if (r.tipo !== 'erros') return;
    expect(r.erros.map(e => e.mensagem)).toEqual([
      'Valor "0": Informe um valor diferente de zero.',
      'Valor "150": O percentual do saldo deve ser de até 100%.',
      'Unidade inválida ("BRL"). Use R$ ou %.',
      'Unidade não informada. Use R$ ou %.',
    ]);
  });

  it(`mais de ${LIMITE_FLUXOS} fluxos`, async () => {
    const aoa: unknown[][] = [['Data', 'Valor']];
    for (let i = 0; i <= LIMITE_FLUXOS; i++) aoa.push([isoParaSerialExcel('2026-01-01') + i, 1]);
    const r = await lerPlanilhaFluxos(arquivo({ Fluxos: aoa }), MODELO_VALOR_PRESENTE);
    expect(r.tipo).toBe('erros');
    if (r.tipo === 'erros') expect(r.erros[0].mensagem).toMatch(/o limite é 2\.000/);
  });
});

describe('linha do editor e fluxos periódicos', () => {
  it('mesma regra do editor: meia linha preenchida é erro, linha vazia é ignorada', () => {
    expect(lerLinhaFluxo({ date: '', amount: '' }, MODELO_VALOR_PRESENTE).tipo).toBe('vazia');
    expect(lerLinhaFluxo({ date: '2026-01-01', amount: '' }, MODELO_VALOR_PRESENTE)).toEqual({ tipo: 'erro', mensagem: 'Informe o valor do fluxo.' });
    expect(lerLinhaFluxo({ date: '', amount: '10' }, MODELO_VALOR_PRESENTE)).toEqual({ tipo: 'erro', mensagem: 'Informe a data do fluxo.' });
    expect(lerLinhaFluxo({ date: '2026-01-01', amount: '0' }, MODELO_VALOR_PRESENTE).tipo).toBe('ok');
  });

  it('mensal a partir de 31/01: ancorado no dia, ajustado ao fim do mês', () => {
    expect(datasPeriodicas('2026-01-31', '2026-04-30', 'MONTHLY')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('trimestral inclui a última data quando cai no período', () => {
    expect(datasPeriodicas('2026-01-15', '2027-01-15', 'QUARTERLY')).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15', '2027-01-15']);
  });
});
