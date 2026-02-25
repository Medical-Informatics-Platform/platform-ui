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

  return [
    {
      title: {
        text: 'Class Prior Probabilities',
        left: 'center',
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
        top: 56,
        left: 56,
        right: 28,
        bottom: 56,
      },
      xAxis: {
        type: 'category',
        data: classes,
        axisLabel: {
          interval: 0,
          rotate: classes.length > 6 ? 25 : 0,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Probability',
        min: 0,
        max: 1,
      },
      series: [
        {
          type: 'bar',
          data: priors,
          barMaxWidth: 48,
          label: {
            show: true,
            position: 'top',
            formatter: (p: any) => `${(Number(p.value) * 100).toFixed(1)}%`,
          },
          itemStyle: {
            color: '#2b33e9',
          },
        },
      ],
    },
  ];
}
