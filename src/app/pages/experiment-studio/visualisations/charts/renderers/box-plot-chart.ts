import { EChartsOption } from 'echarts';
import { getFeaturewiseDescribeRows } from '../../../../../core/describe-result.utils';

// Builds a Box Plot chart (Q1–Q3 boxes + min/max whiskers + mean dots)
// for descriptive statistics results.
export function buildBoxPlotChart(result: any): EChartsOption[] {
  const featurewise = getFeaturewiseDescribeRows(result);
  if (featurewise.length === 0) return [];

  const firstVariable = featurewise[0]?.variable ?? 'Variable';
  // Filter for the first variable and exclude 'all datasets' as per request
  const filtered = featurewise.filter(v =>
    v.variable === firstVariable &&
    v.dataset !== 'all datasets'
  );

  // datasets (x-axis)
  const datasets = filtered.map(v => v.dataset || 'Dataset');

  // Extract Q1, Q3, median, min, max, mean
  const boxData = filtered.map(v => {
    const d = (v.data ?? {}) as Record<string, number | null | undefined>;
    // Only include in boxplot if we have essential quartiles
    if (d['q1'] == null || d['q3'] == null) return [];
    return [d['min'], d['q1'], d['q2'], d['q3'], d['max']];
  });

  const meanPoints = filtered.map((v, idx) => {
    const d = (v.data ?? {}) as Record<string, number | null | undefined>;
    const mean = d['mean'] ?? null;
    return mean != null ? [idx, mean] : null;
  }).filter(Boolean) as [number, number][];

  const isDark = false;
  const textColor = isDark ? '#f1f5f9' : '#0f172a';
  const axisColor = isDark ? 'rgba(255, 255, 255, 0.3)' : '#475569';
  const splitLineColor = isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0';

  const chart: EChartsOption = {
    title: {
      text: `Distribution for ${firstVariable}`,
      left: 'center',
      textStyle: { color: textColor }
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: isDark ? '#1c253d' : '#fff',
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#ccc',
      textStyle: { color: textColor },
      formatter: (p: any) => {
        const fmt = (v: any) => (v === null || v === undefined) ? 'N/A' : (typeof v === 'number' ? v.toFixed(2) : v);

        if (p.seriesType === 'boxplot') {
          // ECharts might prepend category index to p.value on category axes
          const vals = p.value.length === 6 ? p.value.slice(1) : p.value;
          const [min, q1, median, q3, max] = vals;
          return `
            <b>${datasets[p.dataIndex]}</b><br/>
            Min: ${fmt(min)}<br/>
            Q1: ${fmt(q1)}<br/>
            Median: ${fmt(median)}<br/>
            Q3: ${fmt(q3)}<br/>
            Max: ${fmt(max)}
          `;
        } else if (p.seriesType === 'scatter') {
          // p.value for scatter is [index, mean]
          return `${datasets[p.value[0]]}<br/>Mean: ${fmt(p.value[1])}`;
        }
        return '';
      },
    },
    grid: { left: '10%', right: '10%', bottom: '10%', top: '15%' },
    xAxis: {
      type: 'category',
      data: datasets,
      boundaryGap: true,
      name: 'Dataset',
      nameLocation: 'middle',
      nameGap: 25,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: axisColor } },
      nameTextStyle: { color: textColor }
    },
    yAxis: {
      type: 'value',
      name: 'Value',
      nameLocation: 'middle',
      nameGap: 35,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: axisColor } },
      splitLine: { lineStyle: { color: splitLineColor } },
      nameTextStyle: { color: textColor }
    },
    series: [
      {
        name: 'Boxplot',
        type: 'boxplot',
        data: boxData as any[],
        itemStyle: {
          color: isDark ? 'rgba(127, 156, 232, 0.2)' : 'rgba(43, 51, 233, 0.3)',
          borderColor: isDark ? '#7f9ce8' : '#2b33e9',
        },
        boxWidth: [20, 30],
      },
      {
        name: 'Mean',
        type: 'scatter',
        data: meanPoints,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#ffba08' },         // MIP orange for mean
      },
    ],
  };

  return [chart];
}
