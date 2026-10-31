import { OutlierRule } from '../../../../core/outlier-rules';
import { OutlierPreviewRow } from '../data-handling.models';
import { parseNumber } from './statistic-format.utils';

/** The summary numbers the outlier strip is drawn from. */
export interface OutlierDistributionNumbers {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number | null;
  std: number | null;
}

/** Where values start to be capped; null on a side the rule's tail leaves alone. */
export interface OutlierBounds {
  lo: number | null;
  hi: number | null;
}

/** What the outlier strip draws: positions in percent of the min–max span, plus labels. */
export interface OutlierBoundsView {
  min: number;
  iqrLeft: number;
  iqrWidth: number;
  medianLeft: number;
  loPct: number | null;
  hiPct: number | null;
  cappedLeft: number | null;
  cappedRight: number | null;
  loLabel: string | null;
  hiLabel: string | null;
  note: string;
}

/** The five-number summary (plus mean and std when present) from labelled summary points; null if any quartile is missing. */
export function outlierDistributionNumbers(points: ReadonlyArray<{ label: string; value: unknown }>): OutlierDistributionNumbers | null {
  if (!points.length) return null;
  const byLabel = new Map(points.map((point) => [point.label.toLowerCase(), point.value]));
  const number = (label: string) => parseNumber(byLabel.get(label));
  const min = number('min');
  const q1 = number('q1');
  const median = number('median');
  const q3 = number('q3');
  const max = number('max');
  if (min === null || q1 === null || median === null || q3 === null || max === null) return null;
  return { min, q1, median, q3, max, mean: number('mean'), std: number('standard deviation') };
}

/** The bounds the outlier report itself returned for a variable, once a report has run. */
export function reportBounds(reportRows: readonly OutlierPreviewRow[]): OutlierBounds | null {
  const row = reportRows[0];
  if (!row) return null;
  const lo = parseNumber(row.lowerBound);
  const hi = parseNumber(row.upperBound);
  return lo === null && hi === null ? null : { lo, hi };
}

/**
 * Client-side bounds for the strategies the summary can price (IQR, and Gaussian with mean
 * and std). MAD and arbitrary quantiles are not in the summary: the report's own bounds are
 * the fallback once a report has run, else null and the strip says so.
 */
export function outlierBounds(
  numbers: OutlierDistributionNumbers,
  rule: Pick<OutlierRule, 'strategy' | 'fold' | 'tail'>,
  reportRows: readonly OutlierPreviewRow[]
): OutlierBounds | null {
  const k = Number(rule.fold);
  if (!Number.isFinite(k)) return null;
  let lo: number;
  let hi: number;
  if (rule.strategy === 'iqr') {
    const iqr = numbers.q3 - numbers.q1;
    lo = numbers.q1 - k * iqr;
    hi = numbers.q3 + k * iqr;
  } else if (rule.strategy === 'gaussian' && numbers.mean !== null && numbers.std !== null) {
    lo = numbers.mean - k * numbers.std;
    hi = numbers.mean + k * numbers.std;
  } else {
    return reportBounds(reportRows);
  }
  return {
    lo: rule.tail === 'right' ? null : lo,
    hi: rule.tail === 'left' ? null : hi,
  };
}

/** The strip for one variable's rule, or null while its summary cannot span a range. */
export function outlierBoundsView(
  numbers: OutlierDistributionNumbers | null,
  rule: Pick<OutlierRule, 'strategy' | 'fold' | 'tail'>,
  reportRows: readonly OutlierPreviewRow[]
): OutlierBoundsView | null {
  if (!numbers || numbers.max <= numbers.min) return null;
  const span = numbers.max - numbers.min;
  const pct = (value: number) => Math.max(0, Math.min(100, ((value - numbers.min) / span) * 100));
  const bounds = outlierBounds(numbers, rule, reportRows);
  const loPct = bounds?.lo != null ? pct(bounds.lo) : null;
  const hiPct = bounds?.hi != null ? pct(bounds.hi) : null;
  const cappedCount = reportRows.reduce(
    (sum, row) => sum + (parseNumber(row.lowerOutliers) ?? 0) + (parseNumber(row.upperOutliers) ?? 0),
    0
  );
  const note = bounds
    ? `Below ${bounds.lo?.toLocaleString() ?? '—'} or above ${bounds.hi?.toLocaleString() ?? '—'} → capped`
      + (reportRows.length && cappedCount > 0 ? ` · ${cappedCount.toLocaleString()} values` : '')
    : 'Bounds shown after Refresh report';

  return {
    min: numbers.min,
    iqrLeft: pct(numbers.q1),
    iqrWidth: Math.max(2, pct(numbers.q3) - pct(numbers.q1)),
    medianLeft: pct(numbers.median),
    loPct,
    hiPct,
    cappedLeft: loPct,
    cappedRight: hiPct !== null ? 100 - hiPct : null,
    loLabel: bounds?.lo != null ? bounds.lo.toLocaleString() : null,
    hiLabel: bounds?.hi != null ? bounds.hi.toLocaleString() : null,
    note,
  };
}
