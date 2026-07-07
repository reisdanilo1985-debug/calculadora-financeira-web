import { http, HttpResponse } from 'msw';

/**
 * Fixtures representativas do formato real de cada fonte (estrutura documentada
 * nos serviços — BCBService.ts, FREDService.ts, PtaxService.ts, snapshot.ts).
 * Não são gravações ao vivo (ambiente sem acesso de rede estável) — o formato
 * dos campos (nomes, tipos, encoding) segue exatamente o que cada serviço parseia.
 */

/** Gera uma série BCB SGS diária plana entre duas datas DD/MM/YYYY. */
function gerarSerieBcb(dataInicial: string, dataFinal: string, valor: string) {
  const [d0, m0, y0] = dataInicial.split('/').map(Number);
  const [d1, m1, y1] = dataFinal.split('/').map(Number);
  const start = new Date(y0, m0 - 1, d0);
  const end = new Date(y1, m1 - 1, d1);
  const out: { data: string; valor: string }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // pula fim de semana (aprox. dia útil)
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    out.push({ data: `${dd}/${mm}/${d.getFullYear()}`, valor });
  }
  return out;
}

export const handlers = [
  // BCB SGS — CDI (série 12) retorna taxa DIÁRIA % a.d.
  http.get('https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados', ({ request }) => {
    const url = new URL(request.url);
    const di = url.searchParams.get('dataInicial') ?? '01/01/2024';
    const df = url.searchParams.get('dataFinal') ?? '31/01/2024';
    return HttpResponse.json(gerarSerieBcb(di, df, '0,053800'));
  }),

  // BCB SGS — demais séries (Selic Meta 432, Selic Over 1178, IPCA 433, IGP-M 189, INCC 192) — taxa ANUAL % a.a.
  http.get(/https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.(\d+)\/dados/, ({ request, params }) => {
    const url = new URL(request.url);
    const di = url.searchParams.get('dataInicial') ?? '01/01/2024';
    const df = url.searchParams.get('dataFinal') ?? '31/01/2024';
    return HttpResponse.json(gerarSerieBcb(di, df, '0,45'));
  }),

  // FRED CSV — SOFR
  http.get('https://fred.stlouisfed.org/graph/fredgraph.csv', () => {
    const rows = ['observation_date,SOFR'];
    const start = new Date('2024-01-01');
    for (let i = 0; i < 20; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      rows.push(`${d.toISOString().slice(0, 10)},5.30`);
    }
    return HttpResponse.text(rows.join('\n'));
  }),

  // Olinda — Expectativas Focus IPCA 12 meses
  http.get('https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoInflacao12Meses', () => {
    return HttpResponse.json({ value: [{ Mediana: 4.5, Data: '2024-01-15' }] });
  }),

  // Olinda — PTAX Dólar período
  http.get(/https:\/\/olinda\.bcb\.gov\.br\/olinda\/servico\/PTAX\/versao\/v1\/odata\/CotacaoDolarPeriodo.*/, () => {
    return HttpResponse.json({
      value: [
        { dataHoraCotacao: '2024-01-15 13:00:00.0', cotacaoCompra: '4.90', cotacaoVenda: '4.9006' },
        { dataHoraCotacao: '2024-01-16 13:00:00.0', cotacaoCompra: '4.91', cotacaoVenda: '4.9106' },
      ],
    });
  }),

  // Olinda — PTAX moeda período (EUR etc.)
  http.get(/https:\/\/olinda\.bcb\.gov\.br\/olinda\/servico\/PTAX\/versao\/v1\/odata\/CotacaoMoedaPeriodo.*/, () => {
    return HttpResponse.json({
      value: [
        {
          dataHoraCotacao: '2024-01-15 13:00:00.0',
          cotacaoCompra: '5.30',
          cotacaoVenda: '5.3006',
          paridadeCompra: '1.08',
          paridadeVenda: '1.0806',
          tipoBoletim: 'Fechamento PTAX',
        },
      ],
    });
  }),

  // Olinda — lista de moedas PTAX
  http.get('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/Moedas', () => {
    return HttpResponse.json({ value: [{ simbolo: 'USD', nomeFormatado: 'Dólar americano', tipoMoeda: 'A' }] });
  }),

  // AwesomeAPI — fallback CNY
  http.get(/https:\/\/economia\.awesomeapi\.com\.br\/json\/daily\/.*/, () => {
    return HttpResponse.json([{ high: '0.77', low: '0.76', bid: '0.765', ask: '0.766', timestamp: '1705320000' }]);
  }),

  // ANBIMA ETTJ — sem mock de conteúdo real (CSV latin-1 proprietário); simula
  // indisponibilidade para exercitar o fallback LKG/seed do snapshot.
  http.post('https://www.anbima.com.br/informacoes/est-termo/CZ-down.asp', () => {
    return new HttpResponse(null, { status: 503 });
  }),

  // Tesouro Transparente — mesmo racional: fallback LKG/seed.
  http.get(
    'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv',
    () => new HttpResponse(null, { status: 503 })
  ),
];
