import { EChartsOption } from 'echarts';

export function buildCVMetricsChart(result: any): EChartsOption[] {
  // Supports:
  // 1) Per-fold arrays (e.g. classification CV summary)
  // 2) Mean/std objects (e.g. linear_regression_cv)
  const data = result?.summary || result;
  if (!data) return [];

  const metricDefs = [
    { key: 'mean_sq_error', label: 'MSE' },
    { key: 'r_squared', label: 'R²' },
    { key: 'mean_abs_error', label: 'MAE' },
    { key: 'f_stat', label: 'F-Stat' },
    { key: 'accuracy', label: 'Accuracy' },
    { key: 'precision', label: 'Precision' },
    { key: 'recall', label: 'Recall' },
    { key: 'fscore', label: 'F-Score' },
  ];

  const foldCount = Array.isArray(data.n_obs) ? data.n_obs.length : 0;
  const perFold = metricDefs
    .map((m) => ({ ...m, values: data[m.key] }))
    .filter((m) => Array.isArray(m.values) && m.values.length === foldCount) as Array<{
      key: string;
      label: string;
      values: number[];
    }>;

  if (perFold.length > 0 && foldCount > 0) {
    const folds = data.n_obs.map((_: any, i: number) => `Fold ${i + 1}`);
    return perFold.map((metric) => ({
      title: {
        text: `${metric.label} per Fold`,
        left: 'center',
      },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: folds,
        axisLabel: { interval: 0, rotate: 30 },
      },
      yAxis: { type: 'value', name: metric.label },
      series: [
        {
          type: 'line',
          data: metric.values,
          symbol: 'circle',
          symbolSize: 8,
          label: { show: true, position: 'top', formatter: (p: any) => Number(p.value).toFixed(3) },
        },
        {
          type: 'bar',
          data: metric.values,
          itemStyle: { opacity: 0.2 },
        },
      ],
    }));
  }

  const summaryMetrics = metricDefs
    .map((m) => {
      const raw = data[m.key];
      const mean = Number(raw?.mean);
      const std = Number(raw?.std);
      if (!Number.isFinite(mean) || !Number.isFinite(std)) return null;
      return { label: m.label, mean, std };
    })
    .filter((m): m is { label: string; mean: number; std: number } => m !== null);

  if (summaryMetrics.length === 0) return [];

  return [
    {
      title: {
        text: 'Cross-Validation Metric Summary',
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        top: 30,
      },
      grid: {
        top: 80,
        left: 60,
        right: 30,
        bottom: 60,
      },
      xAxis: {
        type: 'category',
        data: summaryMetrics.map((m) => m.label),
        axisLabel: { interval: 0, rotate: 20 },
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'Mean',
          type: 'bar',
          data: summaryMetrics.map((m) => m.mean),
          label: {
            show: true,
            position: 'top',
            formatter: (p: any) => Number(p.value).toFixed(3),
          },
        },
        {
          name: 'Std Dev',
          type: 'bar',
          data: summaryMetrics.map((m) => m.std),
          label: {
            show: true,
            position: 'top',
            formatter: (p: any) => Number(p.value).toFixed(3),
          },
        },
      ],
    },
  ];
}
