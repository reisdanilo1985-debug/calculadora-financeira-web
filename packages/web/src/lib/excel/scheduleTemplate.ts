import { COLUNAS, SHEET_LANCAMENTOS, SHEET_INSTRUCOES } from './scheduleShared';

const EXEMPLOS: (string | number)[][] = [
  ['15/03/2024', 'AMORTIZACAO', 'FIXO', 50000, '', '', ''],
  ['10/06/2024', 'APORTE', 'PERCENTUAL', 10, '', '', ''],
  ['01/01/2025', 'AMORTIZACAO', 'PERIODICO', 2000, 'MENSAL', '01/01/2027', 'NAO'],
];

const INSTRUCOES: (string | number)[][] = [
  ['Como preencher a planilha de Lançamentos'],
  [],
  ['Data', 'Data do lançamento, formato dd/mm/aaaa (ex.: 15/03/2024).'],
  ['Operação', "AMORTIZACAO (reduz o saldo) ou APORTE (aumenta o saldo — captação adicional)."],
  ['Tipo', 'FIXO (valor em R$), PERCENTUAL (% do saldo na data) ou PERIODICO (repete em intervalos).'],
  ['Valor', 'Valor em R$ para FIXO/PERIODICO; percentual (ex.: 10 para 10%) para PERCENTUAL.'],
  ['Periodicidade', 'Apenas para Tipo=PERIODICO: MENSAL, TRIMESTRAL, SEMESTRAL ou ANUAL.'],
  ['Data Final', 'Apenas para Tipo=PERIODICO: última data em que o lançamento periódico se repete, dd/mm/aaaa.'],
  ['Percentual Periódico', 'Apenas para Tipo=PERIODICO: SIM se "Valor" é percentual do saldo, NAO se é R$ fixo.'],
  [],
  ['Observações'],
  ['- Não altere os nomes das colunas na primeira linha.'],
  ['- Linhas em branco são ignoradas.'],
  ['- Datas também podem ser inseridas como data do Excel (célula formatada como data).'],
  ['- Valores aceitam vírgula decimal (ex.: 1.234,56) ou ponto (ex.: 1234.56).'],
  ['- Ao importar, linhas com erro são listadas individualmente e não impedem a importação das linhas válidas.'],
];

export async function downloadScheduleTemplate(filename = 'modelo-cronograma.xlsx') {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  const wsLancamentos = XLSX.utils.aoa_to_sheet([[...COLUNAS], ...EXEMPLOS]);
  wsLancamentos['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLancamentos, SHEET_LANCAMENTOS);

  const wsInstrucoes = XLSX.utils.aoa_to_sheet(INSTRUCOES);
  wsInstrucoes['!cols'] = [{ wch: 22 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, SHEET_INSTRUCOES);

  XLSX.writeFile(wb, filename);
}
