import { EChartsOption } from 'echarts';
import { formatPValue } from '../../result-format';

const AXIS_COLOR = '#475569';
const TEXT_COLOR = '#0f172a';
// r is signed: red below zero, neutral grey at zero, primary blue above.
const CORRELATION_COLORS = ['#e34948', '#f1f5f9', '#2b33e9'];

type Matrix = Record<string, unknown> & { variables?: string[] };

/**
 * One correlation heatmap. A square matrix keeps only the lower triangle (each pair once,
 * no diagonal of 1s); a y-by-x matrix is drawn whole. p-values and the 95% CI travel in
 * the tooltip, and the pairs table under the chart lists them in full.
 */
export function buildMatrixChart(result: any): EChartsOption[] {
  const pickMatrix = (...keys: string[]): Matrix | null => {
    for (const key of keys) {
      const candidate = result?.[key];
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
    }
    return null;
  };

  const correlations = pickMatrix('correlations');
  if (!correlations) return [];
  // Backwards compatibility: saved Pearson results may use historical p-value and CI aliases.
  const pValues = pickMatrix('p_values', 'p-values', 'pvalues');
  const ciLower = pickMatrix('ci_lo', 'low_confidence_intervals');
  const ciUpper = pickMatrix('ci_hi', 'high_confidence_intervals');

  const allCols: string[] = correlations.variables ?? [];
  const allRows = Object.keys(correlations).filter((key) => key !== 'variables');
  if (!allCols.length || !allRows.length) return [];

  const square = allRows.length === allCols.length && allRows.every((row) => allCols.includes(row));
  const rows = square ? allCols.slice(1) : allRows;
  const cols = square ? allCols.slice(0, -1) : allCols;

  const cell = (matrix: Matrix | null, row: string, col: string): number | null => {
    const values = matrix?.[row];
    const index = (matrix?.variables ?? allCols).indexOf(col);
    const value = Array.isArray(values) && index >= 0 ? Number(values[index]) : NaN;
    return Number.isFinite(value) ? value : null;
  };

  const data = rows.flatMap((row, i) =>
    cols.flatMap((col, j) => {
      if (square && j > i) return [];
      const r = cell(correlations, row, col);
      if (r === null) return [];
      return [{ value: [j, i, r], label: { color: Math.abs(r) >= 0.5 ? '#ffffff' : TEXT_COLOR } }];
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
        const lines = [`${row} × ${col}`, `r = <b>${r.toFixed(3)}</b>`];
        const lower = cell(ciLower, row, col);
        const upper = cell(ciUpper, row, col);
        if (lower !== null && upper !== null) lines.push(`95% CI ${lower.toFixed(3)} to ${upper.toFixed(3)}`);
        const p = cell(pValues, row, col);
        if (p !== null) lines.push(`p ${formatPValue(p).startsWith('<') ? '' : '= '}${formatPValue(p)}`);
        return lines.join('<br/>');
      },
    },
    grid: { top: 16, left: 8, right: 16, bottom: 72, containLabel: true },
    xAxis: {
      type: 'category',
      data: cols,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: AXIS_COLOR, interval: 0, width: 110, overflow: 'break' },
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
      inRange: { color: CORRELATION_COLORS },
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
