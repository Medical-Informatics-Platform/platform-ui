import { PivotBlock } from '../data-handling.models';
import { SUMMARY_METRICS, isCountMetricLabel } from './statistic-summary.utils';
import { displayNumber, formatPercent, parseNumber } from './statistic-format.utils';

/** Pure reads over the pivot tables a summary surface shows: coverage, distribution and category shares. */

type PivotRow = PivotBlock['rows'][number];

export interface Coverage {
  total: number;
  missing: number;
  share: number;
}

export interface PooledCoverage extends Coverage {
  variables: number;
}

export interface DatasetCoverage extends Coverage {
  label: string;
}

export interface DistributionPoint {
  label: string;
  value: string;
}

export interface CategoryShare extends DistributionPoint {
  share: number;
}

/** The pooled column when the block has one, else its first dataset. */
function pooledColumn(block: PivotBlock): string {
  return block.columns.includes('all datasets') ? 'all datasets' : block.columns[0];
}

/** One metric row as the pooled column states it ('N/A' when the block has no such row). */
export function pooledMetricText(block: PivotBlock, metric: string): string {
  const row = block.rows.find((item) => item.metric === metric);
  if (!row) return 'N/A';
  return row.values[pooledColumn(block)] ?? 'N/A';
}

function pooledMetricNumber(block: PivotBlock, metric: string): number {
  const value = Number(pooledMetricText(block, metric).replace(/,/g, ''));
  return Number.isFinite(value) ? value : 0;
}

/** What share of a variable's records are missing; null when the block has no records. */
export function blockCoverage(block: PivotBlock | null | undefined): Coverage | null {
  if (!block) return null;
  const total = pooledMetricNumber(block, 'Total');
  if (total <= 0) return null;
  const missing = Math.min(Math.round(pooledMetricNumber(block, 'Missing')), total);
  return { total, missing, share: missing / total };
}

/**
 * Coverage re-pooled over several variables. Per-variable shares are not additive, so
 * this sums the counts and divides once — averaging 0.7% and 100% would state a number
 * that describes no dataset. Null when no block has statistics, so a caller shows
 * nothing rather than 0%.
 */
export function pooledCoverage(blocks: readonly PivotBlock[]): PooledCoverage | null {
  let total = 0;
  let missing = 0;
  let variables = 0;
  for (const block of blocks) {
    const coverage = blockCoverage(block);
    if (!coverage) continue;
    total += coverage.total;
    missing += coverage.missing;
    variables += 1;
  }
  if (variables === 0 || total <= 0) return null;
  return { total, missing, share: Math.min(missing / total, 1), variables };
}

/** The "n%" note beside a Missing cell, from the Missing and Total rows of the same dataset column. */
export function missingShareNote(block: PivotBlock, row: PivotRow, dataset: string): string | null {
  if (row.metric !== 'Missing') return null;
  const parse = (metric: string) =>
    Number((block.rows.find((item) => item.metric === metric)?.values[dataset] ?? '').replace(/,/g, ''));
  const missing = parse('Missing');
  const total = parse('Total');
  if (!Number.isFinite(missing) || !Number.isFinite(total) || total <= 0) return null;
  return coveragePercent({ share: Math.min(missing / total, 1) });
}

/**
 * Per-dataset coverage, minus the rollup column. `datasetLabel` names a column; the
 * pooled column is the one that carries the same name as 'all datasets'.
 */
export function coverageByDataset(block: PivotBlock | null | undefined, datasetLabel: (code: string) => string): DatasetCoverage[] {
  if (!block) return [];
  const totalRow = block.rows.find((row) => row.metric === 'Total');
  const missingRow = block.rows.find((row) => row.metric === 'Missing');
  if (!totalRow || !missingRow) return [];
  const rollupLabel = datasetLabel('all datasets');
  return block.columns
    .filter((dataset) => datasetLabel(dataset) !== rollupLabel)
    .map((dataset) => {
      const total = parseNumber(totalRow.values[dataset]) ?? 0;
      if (total <= 0) return null;
      const missing = Math.min(parseNumber(missingRow.values[dataset]) ?? 0, total);
      return { label: datasetLabel(dataset), missing, total, share: missing / total };
    })
    .filter((tile): tile is DatasetCoverage => !!tile);
}

/** The pooled mean/std/quantile rows of a block, formatted for display. */
export function blockDistribution(block: PivotBlock | null | undefined): DistributionPoint[] {
  if (!block) return [];
  // A nominal block carries no quantile rows at all, so the lookups come back
  // 'N/A'; those are absent data, not values, and must not render as a row of N/A.
  return SUMMARY_METRICS
    .filter((metric) => !isCountMetricLabel(metric.label))
    .map((metric) => ({ label: metric.label, value: displayNumber(pooledMetricText(block, metric.label)) }))
    .filter((point) => point.value !== 'N/A');
}

/**
 * Category frequencies of a nominal block: in the pivot these are the rows after the
 * three count metrics. A numeric block's remaining rows (Mean, Std, Min, ...) are not
 * categories, so the caller only asks for a categorical variable.
 */
export function categoryShares(block: PivotBlock | null | undefined, limit = 6): CategoryShare[] {
  if (!block) return [];
  const dataset = pooledColumn(block);
  const datapoints = Number((block.rows.find((row) => row.metric === 'Datapoints')?.values[dataset] ?? '').replace(/,/g, ''));
  return block.rows
    .filter((row) => !isCountMetricLabel(row.metric))
    .map((row) => {
      const value = row.values[dataset] ?? '';
      const count = Number(value.replace(/,/g, ''));
      return {
        label: row.metric,
        value: displayNumber(value || '0'),
        share: Number.isFinite(count) && datapoints > 0 ? Math.min(count / datapoints, 1) : 0,
      };
    })
    .slice(0, limit);
}

/** Group heading above rows[index], or null when the row continues the group above it. */
export function metricGroupLabel(rows: readonly PivotRow[], index: number): string | null {
  const here = isCountMetricLabel(rows[index]?.metric);
  if (index === 0 || isCountMetricLabel(rows[index - 1]?.metric) !== here) {
    return here ? 'Coverage' : 'Distribution';
  }
  return null;
}

export function coveragePercent(coverage: { share: number }): string {
  return formatPercent(coverage.share * 100);
}

/** The full count belongs in a tooltip; the row only carries the share. */
export function coverageTitle(coverage: { total: number; missing: number }): string {
  return `${coverage.missing.toLocaleString()} of ${coverage.total.toLocaleString()} values missing`;
}

/**
 * Three bands. At a single 10% floor 30% and 100% rendered in the same red, so across a
 * rail of variables the colour ranked nothing. 10% keeps the studio's "worth noticing"
 * onset; 50% is where a variable stops being usable. The exact figure always sits
 * beside the colour.
 */
export function coverageSeverity(coverage: { share: number }): 'none' | 'warning' | 'high' {
  if (coverage.share >= 0.5) return 'high';
  if (coverage.share >= 0.1) return 'warning';
  return 'none';
}

/** Bar length for a share scaled up so small shares stay visible (×1000: 5% is a half bar), floored at 2% so a clean variable still shows the track. */
export function barWidth(share: unknown, scale: number): number {
  return Math.max(2, Math.min(100, (parseNumber(share) ?? 0) * scale));
}
