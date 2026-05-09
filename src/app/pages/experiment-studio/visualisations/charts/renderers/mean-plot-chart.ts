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
  const pValue = Number(result?.anova_table?.p_value);

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
  const meanColor = '#2b33e9';
  const intervalColor = '#7f9ce8';
  const axisColor = '#64748b';
  const textColor = '#0f172a';

  const option: EChartsOption = {
    color: [meanColor, intervalColor],
    backgroundColor: 'transparent',
    title: {
      text: `Group Means (95% CI)${Number.isFinite(pValue) ? `\np-value: ${pValue.toExponential(3)}` : ''}`,
      left: 'center',
      textStyle: {
        color: textColor,
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 20,
      }
    },
    legend: {
      top: 50,
      left: 'center',
      itemGap: 18,
      itemWidth: 18,
      itemHeight: 10,
      textStyle: {
        color: axisColor,
        fontSize: 12,
        fontWeight: 600,
      },
      data: ['Group mean', '95% confidence interval'],
    },
    grid: { top: 96, right: 32, bottom: 72, left: 96 },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: 'rgba(43, 51, 233, 0.16)',
      borderWidth: 1,
      textStyle: { color: textColor },
      formatter: (p: any) => {
        if (p.seriesType === 'scatter') {
          const group = p.name ?? (Array.isArray(p.value) ? p.value[0] : '');
          const mean = Array.isArray(p.value) ? p.value[1] : meanMap[group];
          return `${group}<br/>Mean: <b>${fmt(mean)}</b>`;
        }
        if (p.seriesType === 'custom' && Array.isArray(p.value)) {
          const group = p.value[4];
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
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: axisColor,
        fontWeight: 600,
        formatter: (val: string) => val,
      },
      nameTextStyle: {
        color: axisColor,
        fontWeight: 700,
      },
    },
    yAxis: {
      type: 'value',
      name: yLabel,
      nameLocation: 'middle',
      nameGap: 60,
      min: Math.floor(minY - margin),
      max: Math.ceil(maxY + margin),
      axisPointer: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: 'rgba(148, 163, 184, 0.22)',
          type: 'dashed',
        },
      },
      axisLabel: {
        color: axisColor,
        formatter: (value: number) => (value < minY ? '' : value.toFixed(0))
      },
      nameTextStyle: {
        color: axisColor,
        fontWeight: 700,
      },
    },
    series: [
      {
        name: 'Group mean',
        type: 'scatter',
        data: data.map(d => ({ name: d.group, value: [d.group, d.mean] })),
        symbolSize: 14,
        itemStyle: {
          color: meanColor,
          borderColor: '#ffffff',
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: 'rgba(43, 51, 233, 0.28)',
        },
        label: {
          show: true,
          position: 'top',
          color: textColor,
          fontSize: 11,
          fontWeight: 700,
          distance: 8,
          formatter: (params: any) => {
            const raw = params?.data?.value;
            const value = Array.isArray(raw) ? raw[1] : raw;
            return typeof value === 'number' ? fmt(value) : `${value}`;
          }
        }
      },
      {
        name: '95% confidence interval',
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
          const capWidth = Math.max(12, Math.min(30, band * 0.36));

          return {
            type: 'group',
            children: [
              {
                type: 'line',
                shape: { x1: x, y1: low, x2: x, y2: high },
                style: { stroke: intervalColor, lineWidth: 3, opacity: 0.9 }
              },
              {
                type: 'line',
                shape: { x1: x - capWidth / 2, y1: high, x2: x + capWidth / 2, y2: high },
                style: { stroke: intervalColor, lineWidth: 3, opacity: 0.9 }
              },
              {
                type: 'line',
                shape: { x1: x - capWidth / 2, y1: low, x2: x + capWidth / 2, y2: low },
                style: { stroke: intervalColor, lineWidth: 3, opacity: 0.9 }
              }
            ]
          };
        },
        encode: { x: 0, y: [1, 2] },
        data: data.map((d, i) => [i, d.low, d.high, d.mean, d.group]),
      }


    ]
  };

  return [option];
}
