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

  // Variables as rows and components as columns: long variable names wrap on the left, and
  // the short component headers fit even a 360px compare column.
  const componentHeaders = componentNames.map((name, i) =>
    shares[i] === undefined ? name : `${name}\n${shares[i].toFixed(1)}%`
  );
  const heatmapData = matrix.flatMap((row: number[], component: number) =>
    row.map((value, variable) => ({
      value: [component, variable, value],
      // White text on the saturated ends, ink on the pale middle.
      label: { color: Math.abs(value) >= 0.5 ? '#ffffff' : TEXT_COLOR },
    }))
  );

  const charts: EChartsOption[] = [];
  charts.push({
    mipChartHeight: 150 + 40 * nVariables,
    title: {
      text: 'Loadings',
      subtext: 'Weight of each variable in each component, with the variance the component explains',
      left: 'center',
    },
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const [component, variable, val] = params.value;
        return `${componentLabels[component]}<br/>${variableNames[variable]}: <b>${val.toFixed(3)}</b>`;
      },
    },
    grid: {
      top: 84,
      left: 8,
      right: 16,
      bottom: 56,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: componentHeaders,
      position: 'top',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: AXIS_COLOR, interval: 0, lineHeight: 15 },
    },
    yAxis: {
      type: 'category',
      data: variableNames,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: AXIS_COLOR, interval: 0, width: 120, overflow: 'break' },
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
      },
      legend: { top: 32, data: ['Per component', 'Cumulative'], textStyle: { color: AXIS_COLOR } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: any) => `${Number(value).toFixed(1)}%`,
      },
      grid: { top: 80, left: 8, right: 16, bottom: 12, containLabel: true },
      xAxis: {
        type: 'category',
        // Eigenvalue under each component, so the PCA summary table is not needed on screen.
        data: componentNames.map((name, i) => {
          const eigenvalue = Number(result.eigenvalues[i]);
          return Number.isFinite(eigenvalue) ? `${name}\nλ ${eigenvalue.toFixed(2)}` : name;
        }),
        axisLabel: { color: AXIS_COLOR, interval: 0, lineHeight: 16 },
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
