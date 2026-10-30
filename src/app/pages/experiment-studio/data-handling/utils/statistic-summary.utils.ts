import { VariableStats } from '../../../../models/algorithm-results.model';
import { MetricKey, PivotBlock, VariableRow } from '../data-handling.models';
import { formatInteger, formatNumber } from './statistic-format.utils';

/** The describe metrics a summary table shows, in row order, with their row labels. */
export const SUMMARY_METRICS: ReadonlyArray<{ key: MetricKey; label: string }> = [
  { key: 'num_dtps', label: 'Datapoints' },
  { key: 'num_na', label: 'Missing' },
  { key: 'num_total', label: 'Total' },
  { key: 'mean', label: 'Mean' },
  { key: 'std', label: 'Standard Deviation' },
  { key: 'min', label: 'Min' },
  { key: 'q1', label: 'Q1' },
  { key: 'q2', label: 'Median' },
  { key: 'q3', label: 'Q3' },
  { key: 'max', label: 'Max' },
];

/** Record counts: shown as integers, and the only rows a categorical variable gets. */
const COUNT_METRICS: ReadonlySet<MetricKey> = new Set(['num_dtps', 'num_na', 'num_total']);
const COUNT_ROWS = SUMMARY_METRICS.filter((metric) => COUNT_METRICS.has(metric.key));

/** Whether a summary row is one of the record counts (Datapoints, Missing, Total) by its label. */
export function isCountMetricLabel(label: string | undefined): boolean {
  return COUNT_ROWS.some((metric) => metric.label === label);
}

type DescribeStats = NonNullable<VariableStats['data']>;
type PivotRow = PivotBlock['rows'][number];

/** The name a variable is shown under. */
export function variableLabel(variable: VariableRow): string {
  return variable.name ?? variable.label ?? variable.code;
}

export function isCategoricalVariable(variable: VariableRow): boolean {
  return String(variable.type ?? '').toLowerCase() === 'nominal' || !!variable.enumerations?.length;
}

/** Category code -> display label, from the variable's enumerations (empty when it has none). */
export function enumLabelMap(variable: VariableRow | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of variable?.enumerations ?? []) {
    const raw = item?.code ?? item?.label ?? item?.name;
    if (raw === null || raw === undefined) continue;
    map.set(String(raw), String(item?.label ?? item?.name ?? raw));
  }
  return map;
}

/** The record count of the pooled "all datasets" row, or null when the payload has none. */
export function pooledTotalRows(rows: readonly VariableStats[]): number | null {
  const pooled = rows.find((row) => row.dataset === 'all datasets');
  if (!pooled) return null;
  const total = Number(pooled.data?.num_total);
  return Number.isFinite(total) ? total : null;
}

function metricValue(stats: DescribeStats | undefined, key: MetricKey): unknown {
  return (stats as Partial<Record<MetricKey, unknown>> | undefined)?.[key];
}

/** A nominal variable's per-category record counts; empty for numeric stats or missing data. */
export function categoryCounts(stats: VariableStats['data'] | undefined): Record<string, number> {
  const counts: unknown = stats && 'counts' in stats ? stats.counts : undefined;
  return counts && typeof counts === 'object' ? (counts as Record<string, number>) : {};
}

/**
 * Turns describe's featurewise rows (one per variable x dataset) into one table per
 * variable: a column per dataset in `datasetOrder`, a row per metric.
 * - Variables the payload reports category counts for get the three record counts
 *   plus one row per category (enumeration order first, then any others).
 * - Other categorical variables get the record counts only; the rest get every metric.
 * Variables come out in payload order and are labelled from `variables` when known.
 */
export function pivotByDataset(
  rows: readonly VariableStats[],
  variables: readonly VariableRow[],
  datasetOrder: readonly string[],
): PivotBlock[] {
  // A plain record on purpose: Object.entries order is the order tables have always had.
  const rowsByVariable: Record<string, VariableStats[]> = {};
  for (const row of rows) (rowsByVariable[row.variable] ??= []).push(row);

  return Object.entries(rowsByVariable).map(([code, variableRows]) => {
    const variable = variables.find((item) => item.code === code);
    const statsByDataset = new Map<string, DescribeStats>();
    for (const row of variableRows) statsByDataset.set(row.dataset, row.data ?? ({} as DescribeStats));

    const metricRow = (metric: { key: MetricKey; label: string }): PivotRow => ({
      metric: metric.label,
      values: Object.fromEntries(datasetOrder.map((ds) => {
        const value = metricValue(statsByDataset.get(ds), metric.key);
        return [ds, COUNT_METRICS.has(metric.key) ? formatInteger(value) : formatNumber(value)];
      })),
    });

    const categories = new Set<string>();
    for (const ds of datasetOrder) Object.keys(categoryCounts(statsByDataset.get(ds))).forEach((key) => categories.add(key));

    let tableRows: PivotRow[];
    if (categories.size > 0) {
      const labels = enumLabelMap(variable);
      const ordered = [
        ...Array.from(labels.keys()).filter((key) => categories.has(key)),
        ...Array.from(categories).filter((key) => !labels.has(key)),
      ];
      tableRows = [
        ...COUNT_ROWS.map(metricRow),
        ...ordered.map((key) => ({
          metric: labels.get(key) ?? key,
          values: Object.fromEntries(datasetOrder.map((ds) => [ds, formatInteger(categoryCounts(statsByDataset.get(ds))[key])])),
        })),
      ];
    } else {
      const categorical = !!variable && isCategoricalVariable(variable);
      tableRows = (categorical ? COUNT_ROWS : SUMMARY_METRICS).map(metricRow);
    }

    return { code, name: variable ? variableLabel(variable) : code, columns: [...datasetOrder], rows: tableRows };
  });
}
