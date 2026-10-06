import { EChartsOption } from 'echarts';

function normalize(values: number[]): number[] {
  const safe = values.map((v) => (Number.isFinite(v) ? v : 0));
  const sum = safe.reduce((acc, v) => acc + v, 0);
  if (sum <= 0) return safe.map(() => 0);
  return safe.map((v) => v / sum);
}

export function buildNaiveBayesPriorsChart(result: any): EChartsOption[] {
  const classes: string[] = Array.isArray(result?.classes)
    ? result.classes.map((c: any) => String(c))
    : [];

  if (!classes.length) return [];

  let priors: number[] = [];
  if (Array.isArray(result?.class_prior)) {
    priors = normalize(result.class_prior.map((v: any) => Number(v)));
  } else if (Array.isArray(result?.class_log_prior)) {
    priors = normalize(result.class_log_prior.map((v: any) => Math.exp(Number(v))));
  }

  if (!priors.length || priors.length !== classes.length) return [];

  // One horizontal bar per class: a handful of shares does not need a 500px column chart.
  return [
    {
      mipChartHeight: 72 + 40 * classes.length,
      title: {
        text: 'Class Prior Probabilities',
        show: false,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const value = Number(p?.value);
          return `${p?.name}<br/>Prior: ${(value * 100).toFixed(2)}%`;
        },
      },
      grid: {
        top: 8,
        left: 8,
        right: 56,
        bottom: 28,
        containLabel: true,
      },
      yAxis: {
        type: 'category',
        data: classes,
        inverse: true,
        axisTick: { show: false },
        axisLabel: { color: '#475569', interval: 0 },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 1,
        axisLabel: { color: '#475569', formatter: (value: number) => `${Math.round(value * 100)}%` },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          type: 'bar',
          data: priors,
          barMaxWidth: 22,
          label: {
            show: true,
            position: 'right',
            color: '#0f172a',
            formatter: (p: any) => `${(Number(p.value) * 100).toFixed(1)}%`,
          },
          itemStyle: {
            color: '#2b33e9',
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    } as EChartsOption,
  ];
}
