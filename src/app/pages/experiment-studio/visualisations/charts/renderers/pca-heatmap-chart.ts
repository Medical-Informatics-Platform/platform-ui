import { EChartsOption } from "echarts";
import { CHART_SERIES_COLORS } from '../chart-palette';

const AXIS_COLOR = '#475569';
const TEXT_COLOR = '#0f172a';
// Loadings are signed, so the scale diverges: red below zero, neutral grey at zero, primary blue above.
const LOADING_COLORS = ['#e34948', '#f1f5f9', '#2b33e9'];

/** Share of total variance per component, in percent. */
function varianceShares(eigenvalues: unknown): number[] {
  if (!Array.isArray(eigenvalues)) return [];
  const values = eigenvalues.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? values.map((value) => (value / total) * 100) : [];
}

export function buildPCAHeatmapChart(result: any): EChartsOption[] {
  const matrix = result?.eigenvectors;

  if (!matrix || !Array.isArray(matrix)) {
    console.warn('[PCAHeatmap] Eigenvectors missing or invalid');
    return [];
  }

  const nComponents = matrix.length;
  const nVariables = matrix[0]?.length ?? 0;

  if (!nComponents || !nVariables) {
    console.warn('[PCAHeatmap] Invalid shape');
    return [];
  }

  let variableNames = result?.variable_names;
  if (!Array.isArray(variableNames) || variableNames.length === 0) {
    variableNames = Array.from({ length: nVariables }, (_, i) => `Var${i + 1}`);
  } else if (variableNames.length !== nVariables) {
    console.warn(`[PCAHeatmap] Label count mismatch: expected ${nVariables}, got ${variableNames.length}`);
    // If we have more labels than variables, truncate. If less, pad.
    if (variableNames.length > nVariables) {
      variableNames = variableNames.slice(0, nVariables);
    } else {
      const padding = Array.from({ length: nVariables - variableNames.length }, (_, i) => `Var${variableNames.length + i + 1}`);
      variableNames = [...variableNames, ...padding];
    }
  }

  const shares = varianceShares(result?.eigenvalues);
  const componentNames = Array.from({ length: nComponents }, (_, i) => `PC${i + 1}`);
  const componentLabels = componentNames.map((name, i) =>
    shares[i] === undefined ? name : `${name} · ${shares[i].toFixed(1)}%`
  );

  const heatmapData = matrix.flatMap((row: number[], i: number) =>
    row.map((value, j) => ({
      value: [j, i, value],
      // White text on the saturated ends, ink on the pale middle.
      label: { color: Math.abs(value) >= 0.5 ? '#ffffff' : TEXT_COLOR },
    }))
  );

  const charts: EChartsOption[] = [];
  charts.push({
    mipChartHeight: 120 + 44 * nComponents,
    title: {
      text: 'Loadings',
      subtext: 'Weight of each variable in each component; rows list the share of variance the component explains',
      left: 'center',
      textStyle: { fontSize: 13, fontWeight: 600, color: TEXT_COLOR },
      subtextStyle: { color: AXIS_COLOR },
    },
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const [x, y, val] = params.value;
        return `${componentLabels[y]}<br/>${variableNames[x]}: <b>${val.toFixed(3)}</b>`;
      },
    },
    grid: {
      top: 64,
      left: 8,
      right: 16,
      bottom: 56,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: variableNames,
      position: 'top',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: AXIS_COLOR, interval: 0, width: 110, overflow: 'break' },
    },
    yAxis: {
      type: 'category',
      data: componentLabels,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: AXIS_COLOR, interval: 0 },
    },
    visualMap: {
      min: -1,
      max: 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemWidth: 12,
      itemHeight: 160,
      text: ['+1', '−1'],
      textStyle: { color: AXIS_COLOR },
      inRange: { color: LOADING_COLORS },
    },
    series: [
      {
        name: 'Loadings',
        type: 'heatmap',
        data: heatmapData,
        itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        label: {
          show: true,
          fontSize: 12,
          formatter: (params: any) => params.value[2]?.toFixed(2),
        },
      },
    ],
  } as EChartsOption);

  if (shares.length) {
    let running = 0;
    const cumulative = shares.map((share) => (running += share));
    const round1 = (value: number) => Math.round(value * 10) / 10;
    charts.push({
      mipChartHeight: 340,
      title: {
        text: 'Variance explained',
        left: 'center',
        textStyle: { fontSize: 13, fontWeight: 600, color: TEXT_COLOR },
      },
      legend: { top: 32, data: ['Per component', 'Cumulative'], textStyle: { color: AXIS_COLOR } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: any) => `${Number(value).toFixed(1)}%`,
      },
      grid: { top: 80, left: 8, right: 16, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        data: componentNames,
        axisLabel: { color: AXIS_COLOR, interval: 0 },
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLabel: { color: AXIS_COLOR, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          name: 'Per component',
          type: 'bar',
          barMaxWidth: 48,
          data: shares.map(round1),
          itemStyle: { color: CHART_SERIES_COLORS[0] },
          label: { show: true, position: 'top', color: TEXT_COLOR, formatter: '{c}%' },
        },
        {
          name: 'Cumulative',
          type: 'line',
          data: cumulative.map(round1),
          itemStyle: { color: CHART_SERIES_COLORS[2] },
          lineStyle: { color: CHART_SERIES_COLORS[2] },
          symbol: 'circle',
          symbolSize: 8,
        },
      ],
    } as EChartsOption);
  }

  return charts;
}
