import { EChartsOption } from 'echarts';
import { formatPValue } from '../../result-format';
import { DIVERGING_COLORS, cellLabelColor } from '../chart-palette';
import { escapeHtml } from '../../../../../core/html.utils';

const AXIS_COLOR = '#475569';

type Matrix = Record<string, unknown> & { variables?: string[] };

/** A Pearson result's correlation, p-value and CI matrices, read the same way by the chart and the pairs table. */
export interface CorrelationMatrices {
  correlations: Matrix;
  pValues: Matrix | null;
  ciLower: Matrix | null;
  ciUpper: Matrix | null;
  /** Column variables, in the order the engine sent them. */
  cols: string[];
  /** Row variables, in the order the engine sent them. */
  rows: string[];
  /** Rows and columns name the same variables: every pair appears twice and the diagonal is 1. */
  square: boolean;
  /** One finite value of a matrix, or null. */
  cell: (matrix: Matrix | null, row: string, col: string) => number | null;
}

export function readCorrelations(result: any): CorrelationMatrices | null {
  const pickMatrix = (...keys: string[]): Matrix | null => {
    for (const key of keys) {
      const candidate = result?.[key];
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
    }
    return null;
  };

  const correlations = pickMatrix('correlations');
  if (!correlations) return null;
  const cols: string[] = correlations.variables ?? [];
  const rows = Object.keys(correlations).filter((key) => key !== 'variables');
  const cell = (matrix: Matrix | null, row: string, col: string): number | null => {
    const values = matrix?.[row];
    const index = (matrix?.variables ?? cols).indexOf(col);
    const value = Array.isArray(values) && index >= 0 ? Number(values[index]) : NaN;
    return Number.isFinite(value) ? value : null;
  };
  return {
    correlations,
    // Backwards compatibility: saved Pearson results may use historical p-value and CI aliases.
    pValues: pickMatrix('p_values', 'p-values', 'pvalues'),
    ciLower: pickMatrix('ci_lo', 'low_confidence_intervals'),
    ciUpper: pickMatrix('ci_hi', 'high_confidence_intervals'),
    cols,
    rows,
    square: rows.length === cols.length && rows.every((row) => cols.includes(row)),
    cell,
  };
}

/**
 * One correlation heatmap. A square matrix keeps only the lower triangle (each pair once,
 * no diagonal of 1s); a y-by-x matrix is drawn whole. p-values and the 95% CI travel in
 * the tooltip, and the pairs table under the chart lists them in full.
 */
export function buildMatrixChart(result: any): EChartsOption[] {
  const matrices = readCorrelations(result);
  if (!matrices || !matrices.cols.length || !matrices.rows.length) return [];
  const { correlations, pValues, ciLower, ciUpper, square, cell } = matrices;
  const rows = square ? matrices.cols.slice(1) : matrices.rows;
  const cols = square ? matrices.cols.slice(0, -1) : matrices.cols;

  const data = rows.flatMap((row, i) =>
    cols.flatMap((col, j) => {
      if (square && j > i) return [];
      const r = cell(correlations, row, col);
      if (r === null) return [];
      return [{ value: [j, i, r], label: { color: cellLabelColor(r) } }];
    })
  );

  return [{
    mipChartHeight: 110 + 48 * rows.length,
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const [j, i, r] = params.value;
        const row = rows[i];
        const col = cols[j];
        const lines = [`${escapeHtml(row)} × ${escapeHtml(col)}`, `r = <b>${r.toFixed(3)}</b>`];
        const lower = cell(ciLower, row, col);
        const upper = cell(ciUpper, row, col);
        if (lower !== null && upper !== null) lines.push(`95% CI ${lower.toFixed(3)} to ${upper.toFixed(3)}`);
        const p = cell(pValues, row, col);
        if (p !== null) lines.push(`p ${formatPValue(p).startsWith('<') ? '' : '= '}${formatPValue(p)}`);
        return lines.join('<br/>');
      },
    },
    grid: { top: 16, left: 8, right: 24, bottom: 48, containLabel: true },
    xAxis: {
      type: 'category',
      data: cols,
      axisLine: { show: false },
      axisTick: { show: false },
      // Slanted so neighbouring names never run together, even in a 360px compare column.
      axisLabel: { color: AXIS_COLOR, interval: 0, rotate: 30, width: 110, overflow: 'truncate' },
    },
    yAxis: {
      type: 'category',
      data: rows,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: AXIS_COLOR, interval: 0, width: 140, overflow: 'break' },
    },
    visualMap: {
      min: -1,
      max: 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemWidth: 12,
      itemHeight: 160,
      text: ['r = +1', '−1'],
      textStyle: { color: AXIS_COLOR },
      inRange: { color: DIVERGING_COLORS },
    },
    series: [{
      name: 'Pearson r',
      type: 'heatmap',
      data,
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      label: { show: true, fontSize: 12, formatter: (params: any) => params.value[2]?.toFixed(2) },
    }],
  } as EChartsOption];
}
