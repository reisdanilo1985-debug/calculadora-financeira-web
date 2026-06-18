import React from 'react';

/** Formata número no padrão pt-BR com até 6 casas; milhares para valores grandes. */
function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .replace(/\bAa\b/, 'a.a.')
    .trim();
}

function Table({ rows }: { rows: Record<string, any>[] }) {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-md border border-white/5">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {cols.map(c => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">
                {humanize(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 400).map((r, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              {cols.map(c => (
                <td key={c} className="px-3 py-1.5 whitespace-nowrap">
                  {typeof r[c] === 'number' ? fmt(r[c]) : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 400 && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">… {rows.length - 400} linhas omitidas.</div>
      )}
    </div>
  );
}

/** Renderiza recursivamente o objeto de resultado do calculador. */
export function ResultView({ result }: { result: any }) {
  if (result == null) return null;

  const scalars: [string, any][] = [];
  const blocks: React.ReactNode[] = [];

  for (const [key, value] of Object.entries(result)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === 'object') {
        blocks.push(
          <div key={key} className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground/80">{humanize(key)}</h4>
            <Table rows={value as Record<string, any>[]} />
          </div>
        );
      }
    } else if (typeof value === 'object') {
      blocks.push(
        <div key={key} className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground/80">{humanize(key)}</h4>
          <div className="rounded-md border border-white/5 p-3">
            <ResultView result={value} />
          </div>
        </div>
      );
    } else {
      scalars.push([key, value]);
    }
  }

  return (
    <div className="space-y-5">
      {scalars.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {scalars.map(([k, v]) => (
            <div key={k} className="rounded-md border border-white/5 bg-white/5 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{humanize(k)}</div>
              <div className="text-sm font-semibold tabular-nums text-foreground mt-0.5">
                {typeof v === 'number' ? fmt(v) : String(v)}
              </div>
            </div>
          ))}
        </div>
      )}
      {blocks}
    </div>
  );
}
