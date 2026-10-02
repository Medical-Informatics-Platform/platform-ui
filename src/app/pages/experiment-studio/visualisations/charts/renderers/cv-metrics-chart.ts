import { EChartsOption } from 'echarts';

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function buildCVMetricsChart(result: any): EChartsOption[] {
  // linear_regression_cv summaries arrive as [mean, std] (or { mean, std }).
  // Exaflow sends [null, null] for undefined metrics; those are left out of the chart.
  if (!result) return [];

  const metricDefs = [
    // mean_sq_error is the pre-rename name of the same RMSE value in stored experiments.
    { label: 'RMSE', raw: result.root_mean_sq_error ?? result.mean_sq_error },
    { label: 'R²', raw: result.r_squared },
    { label: 'MAE', raw: result.mean_abs_error },
    { label: 'F diagnostic', raw: result.f_stat },
  ];

  const summaryMetrics = metricDefs
    .map(({ label, raw }) => {
      const [mean, std] = (Array.isArray(raw) ? raw : [raw?.mean, raw?.std]).map(finite);
      if (mean === null || std === null) return null;
      return { label, mean, std };
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
