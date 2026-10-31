/** Pure number formatting shared by the Data Handling summaries, evidence panes and exports. */

/** A summary cell as a number: tolerates grouping commas and a trailing %; null when not numeric. */
export function parseNumber(value: unknown): number | null {
  const text = String(value ?? '').replace(/[,%]/g, '').trim();
  const number = Number(text);
  return text !== '' && Number.isFinite(number) ? number : null;
}

/** Canonical (painted + exported) pivot cell: fixed 2 decimals, no grouping. */
export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(2);
}

/** Outlier preview bounds keep the old 6-decimal preview precision. */
export function formatOutlierBound(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function formatInteger(value: unknown, empty = 'N/A'): string {
  if (value === null || value === undefined || value === '') return empty;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(Math.round(n));
}

export function formatPercent(pct: number, digits?: number): string {
  const d = digits ?? (pct >= 10 || pct === 0 ? 0 : 1);
  return `${pct.toFixed(d)}%`;
}

export function formatOutlierPercentage(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(num)) return '-';
  return formatPercent(num, 2);
}
