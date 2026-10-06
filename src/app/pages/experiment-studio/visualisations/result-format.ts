/** Number formatting shared by the summary views (key figures, coefficient rows). */

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Typographic minus, 3 decimals below 1 and 2 above. */
export function formatSignedNumber(value: number): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  return `${sign}${abs.toFixed(abs < 1 ? 3 : 2)}`;
}

export function formatInteger(value: number): string {
  return value.toLocaleString('en-US');
}

/** Grouped integers from 1,000 up, signed decimals below. */
export function formatSummaryNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000) return formatInteger(Math.round(value));
  return formatSignedNumber(value);
}

/** APA style: `< 0.001` instead of 0, 1.1e-16 or 3.9e-238 — values that small are float noise. */
export function formatPValue(value: number | null): string {
  if (value === null) return '—';
  if (value < 0.001) return '< 0.001';
  return value.toFixed(3);
}
