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

/** Ratios (odds, hazard) at 3 significant digits by default: 0.725, 1.07, 904, then grouped integers from 1,000. */
export function formatRatio(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '';
  if (value >= 1000) return formatInteger(Math.round(value));
  return value.toPrecision(digits);
}

/** The fewest significant digits (3 to 6) at which a ratio's CI bounds read differently,
 *  so a tight interval such as 1.0345–1.0358 does not print as "1.04 to 1.04". */
export function ratioDigits(lower: number | null, upper: number | null): number {
  if (lower === null || upper === null) return 3;
  for (let digits = 3; digits < 6; digits++) {
    if (formatRatio(lower, digits) !== formatRatio(upper, digits)) return digits;
  }
  return 6;
}

/** APA style: `< 0.001` instead of 0, 1.1e-16 or 3.9e-238 — values that small are float noise. */
export function formatPValue(value: number | null): string {
  if (value === null) return '—';
  if (value < 0.001) return '< 0.001';
  return value.toFixed(3);
}

/** ln Γ(x), Lanczos approximation (g = 7), accurate to ~15 digits for x > 0. */
function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const shifted = x - 1;
  const t = shifted + 7.5;
  let sum = c[0];
  for (let i = 1; i < c.length; i++) sum += c[i] / (shifted + i);
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Upper tail P(χ²(df) ≥ x): the regularized upper incomplete gamma Q(df/2, x/2),
 *  by series below a + 1 and Lentz's continued fraction above (Numerical Recipes 6.2). */
export function chiSquarePValue(x: number, df: number): number {
  if (!(x > 0) || !(df > 0)) return 1;
  const a = df / 2;
  const z = x / 2;
  const lead = Math.exp(-z + a * Math.log(z) - logGamma(a));
  const tiny = 1e-300;

  if (z < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 1000 && term > sum * 1e-15; n++) {
      term *= z / (a + n);
      sum += term;
    }
    return Math.min(1, Math.max(0, 1 - sum * lead));
  }

  let b = z + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.min(1, Math.max(0, lead * h));
}

/** A raw snake_case code (a created column such as stroke_territory_cohort, or a level such as
 *  cluster_2) reads as words; labelled names pass through unchanged. */
export function readable(code: string): string {
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(code)) return code;
  const words = code.replace(/_/g, ' ').replace(/^kmeans\b/, 'K-means');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
