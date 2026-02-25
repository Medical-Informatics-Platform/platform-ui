import { EChartsOption } from 'echarts';

export function buildMeanPlotChart(result: any): EChartsOption[] {
  const ciInfo = result?.ci_info;
  if (!ciInfo || !ciInfo.means || !ciInfo['m-s'] || !ciInfo['m+s']) return [];

  const groups = Object.keys(ciInfo.means);

  const data = groups.map((group) => {
    const mean = ciInfo.means[group];
    const low = ciInfo['m-s'][group];
    const high = ciInfo['m+s'][group];
    return { group, mean, low, high };
  });

  // labels anova_table
  const xLabel = result?.anova_table?.x_label ?? 'Group';
  const yLabel = result?.anova_table?.y_label ?? 'Mean ± CI';

  const fmt = (v: number) =>
    Number.isFinite(v)
      ? (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, ''))
      : 'N/A';

  const minY = Math.min(...data.map(d => d.low));
  const maxY = Math.max(...data.map(d => d.high));
  const span = Math.max(1e-6, maxY - minY);
  const margin = span * 0.1;

  const meanMap: Record<string, number> =
    Object.fromEntries(data.map(d => [d.group, d.mean]));

  const option: EChartsOption = {
    title: {
      text: 'Mean Plot',
      left: 'center'
    },
    grid: { top: 48, right: 24, bottom: 64, left: 100 },
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        if (p.seriesType === 'scatter') {
          const group = p.name ?? (Array.isArray(p.value) ? p.value[0] : '');
          const mean = Array.isArray(p.value) ? p.value[1] : meanMap[group];
          return `${group}<br/>Mean: <b>${fmt(mean)}</b>`;
        }
        if (p.seriesType === 'custom' && Array.isArray(p.value)) {
          const group = p.value[0];
          const low = p.value[1];
          const high = p.value[2];
          const mean = meanMap[group];
          return `${group}<br/>Mean: <b>${fmt(mean)}</b><br/>CI: <b>[${fmt(low)} – ${fmt(high)}]</b>`;
        }
        return '';
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.group),
      name: xLabel,
      nameLocation: 'middle',
      nameGap: 40,
      axisLine: { lineStyle: { color: '#475569' } }, // MIP text-muted
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        formatter: (val: string) => val,
      }
    },
    yAxis: {
      type: 'value',
      name: yLabel,
      nameLocation: 'middle',
      nameGap: 60,
      min: Math.floor(minY - margin),
      max: Math.ceil(maxY + margin),
      axisPointer: { show: false },
      axisLabel: {
        formatter: (value: number) => (value < minY ? '' : value.toFixed(0))
      }
    },
    series: [
      {
        type: 'scatter',
        data: data.map(d => ({ name: d.group, value: [d.group, d.mean] })),
        symbolSize: 12,
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => {
            const raw = params?.data?.value;
            const value = Array.isArray(raw) ? raw[1] : raw;
            return typeof value === 'number' ? fmt(value) : `${value}`;
          }
        }
      },
      {
        type: 'custom',
        renderItem: (_params: any, api: any) => {
          const index = api.value(0) as number;
          const category = data[index].group;
          const lowVal = api.value(1) as number;
          const highVal = api.value(2) as number;

          const x = api.coord([category, lowVal])[0];
          const low = api.coord([category, lowVal])[1];
          const high = api.coord([category, highVal])[1];

          const band = api.size([1, 0])[0] ?? 20;
          const capWidth = Math.max(10, Math.min(24, band * 0.4));

          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: x, y1: low, x2: x, y2: high }, style: { stroke: '#000', lineWidth: 1.5 } },
              { type: 'line', shape: { x1: x - capWidth / 2, y1: high, x2: x + capWidth / 2, y2: high }, style: { stroke: '#000', lineWidth: 1.5 } },
              { type: 'line', shape: { x1: x - capWidth / 2, y1: low, x2: x + capWidth / 2, y2: low }, style: { stroke: '#000', lineWidth: 1.5 } }
            ]
          };
        },
        encode: { x: 0, y: [1, 2] },
        data: data.map((d, i) => [i, d.low, d.high]),
      }


    ]
  };

  return [option];
}
