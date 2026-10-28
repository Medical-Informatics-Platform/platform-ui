import { EChartsOption } from 'echarts';
import { escapeHtml } from '../../../../../core/html.utils';
import { groupThousands } from '../../result-format';

interface IntervalPoint {
  group: string;
  mean: number;
  low: number;
  high: number;
}

interface IntervalLabels {
  x: string;
  y: string;
  /** Legend names of the point and its whisker, and the whisker's name in the tooltip. */
  point: string;
  /** Name of the point's value in the tooltip ("Mean"). */
  value: string;
  interval: string;
  intervalShort: string;
}

/** Group means with whiskers at ± 1 sample SD — Exaflow's ci_info "m-s"/"m+s" are mean ∓ SD, not a CI. */
export function buildMeanPlotChart(result: any): EChartsOption[] {
  const ciInfo = result?.ci_info;
  if (!ciInfo || !ciInfo.means || !ciInfo['m-s'] || !ciInfo['m+s']) return [];

  const data = Object.keys(ciInfo.means).map((group) => ({
    group,
    mean: ciInfo.means[group],
    low: ciInfo['m-s'][group],
    high: ciInfo['m+s'][group],
  }));

  return intervalPlot(data, {
    x: result?.anova_table?.x_label ?? 'Group',
    y: result?.anova_table?.y_label ?? 'Mean ± SD',
    point: 'Group mean',
    value: 'Mean',
    interval: '± 1 standard deviation',
    intervalShort: '± 1 SD',
  });
}

/**
 * Independent t-test: the mean difference (group A − group B) with its CI as one vertical
 * interval, value on the y axis, with a dashed zero line when the interval reaches it. The CI's
 * level is (1 − alpha) of the run, which the chart does not know; the key figure states it.
 */
export function buildTTestIntervalChart(result: any): EChartsOption[] {
  const [mean, low, high] = [result?.mean_diff, result?.ci_lower, result?.ci_upper].map(Number);
  if (![mean, low, high].every(Number.isFinite)) return [];
  const [option] = intervalPlot([{ group: 'Mean difference', mean, low, high }], {
    x: '',
    y: 'Difference in means',
    point: 'Mean difference',
    value: 'Difference',
    interval: 'Confidence interval',
    intervalShort: 'CI',
  }, 320);
  if (low <= 0 && high >= 0) {
    (option.series as any[])[0].markLine = {
      silent: true,
      symbol: 'none',
      label: { show: false },
      lineStyle: { color: '#94a3b8', type: 'dashed' },
      data: [{ yAxis: 0 }],
    };
  }
  return [option];
}

/** Points with vertical whiskers, one per category. */
function intervalPlot(data: IntervalPoint[], labels: IntervalLabels, height = 380): EChartsOption[] {
  const fmt = (v: number) =>
    Number.isFinite(v) ? groupThousands(v.toLocaleString('en-US', { maximumFractionDigits: 3 })) : 'N/A';

  const meanMap: Record<string, number> =
    Object.fromEntries(data.map(d => [d.group, d.mean]));
  const meanColor = '#2b33e9';
  const intervalColor = '#7f9ce8';
  const axisColor = '#64748b';
  const textColor = '#0f172a';

  const option: EChartsOption & { mipChartHeight: number } = {
    mipChartHeight: height,
    color: [meanColor, intervalColor],
    backgroundColor: 'transparent',
    legend: {
      top: 0,
      left: 'center',
      itemGap: 18,
      itemWidth: 18,
      itemHeight: 10,
      textStyle: {
        color: axisColor,
        fontSize: 12,
        fontWeight: 600,
      },
      data: [labels.point, labels.interval],
    },
    grid: { top: 44, right: 32, bottom: 64, left: 96 },
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
          return `${escapeHtml(group)}<br/>${labels.value}: <b>${fmt(mean)}</b>`;
        }
        if (p.seriesType === 'custom' && Array.isArray(p.value)) {
          const group = p.value[4];
          const low = p.value[1];
          const high = p.value[2];
          const mean = meanMap[group];
          return `${escapeHtml(group)}<br/>${labels.value}: <b>${fmt(mean)}</b><br/>${labels.intervalShort}: <b>${fmt(low)} – ${fmt(high)}</b>`;
        }
        return '';
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.group),
      name: labels.x,
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
      name: labels.y,
      nameLocation: 'middle',
      nameGap: 60,
      scale: true,
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
      },
      nameTextStyle: {
        color: axisColor,
        fontWeight: 700,
      },
    },
    series: [
      {
        name: labels.point,
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
        name: labels.interval,
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
