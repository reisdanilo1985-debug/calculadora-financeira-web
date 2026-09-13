/**
 * Datas civis locais para formulários e presets de período.
 *
 * `new Date().toISOString().slice(0, 10)` devolve a data em UTC: à noite no
 * Brasil (após 21h) isso já é "amanhã". Use sempre estas funções para montar
 * datas 'AAAA-MM-DD' a partir do relógio do usuário.
 */

/** 'AAAA-MM-DD' com os componentes locais da data */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Data de hoje no fuso do usuário, 'AAAA-MM-DD' */
export function hojeISO(): string {
  return isoLocal(new Date());
}

/** Converte 'AAAA-MM-DD' em Date local à meia-noite (sem passar por UTC) */
export function parseISOLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Soma dias corridos a uma data 'AAAA-MM-DD' */
export function somarDiasISO(iso: string, dias: number): string {
  const d = parseISOLocal(iso);
  d.setDate(d.getDate() + dias);
  return isoLocal(d);
}

/**
 * Soma meses mantendo o dia; se o dia não existe no mês de destino, usa o
 * último dia do mês (29/02 − 12 meses → 28/02; 31/03 − 1 mês → 28/02 ou 29/02).
 */
export function somarMesesISO(iso: string, meses: number): string {
  const base = parseISOLocal(iso);
  const alvo = new Date(base.getFullYear(), base.getMonth() + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(base.getDate(), ultimoDia));
  return isoLocal(alvo);
}
