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
  const counts: unknown[] = Array.isArray(result?.class_count) ? result.class_count : [];

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
        right: 120,
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
            // Prior and training count together, so the class summary table is not needed on screen.
            formatter: (p: any) => {
              const count = Number(counts[p.dataIndex]);
              const share = `${(Number(p.value) * 100).toFixed(1)}%`;
              return Number.isFinite(count) ? `${share} · ${count.toLocaleString('en-US')} rows` : share;
            },
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

/**
 * Gaussian naive Bayes class profiles: for each feature, each class's mean expressed in pooled
 * within-class SDs from the overall mean, (θ_c − μ) / s_pooled. One shared scale makes features
 * in different units comparable and shows which ones separate the classes.
 */
export function buildNaiveBayesProfileChart(result: any): EChartsOption[] {
  const classes: string[] = Array.isArray(result?.classes) ? result.classes.map(String) : [];
  const features: string[] = Array.isArray(result?.feature_names) ? result.feature_names.map(String) : [];
  const theta: number[][] = Array.isArray(result?.theta) ? result.theta : [];
  const variance: number[][] = Array.isArray(result?.var) ? result.var : [];
  const counts: number[] = Array.isArray(result?.class_count) ? result.class_count.map(Number) : [];
  if (!classes.length || !features.length || theta.length !== classes.length || variance.length !== classes.length) return [];

  const total = counts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  const weight = (c: number) => (total > 0 ? counts[c] / total : 1 / classes.length);
  const standardized = features.map((_, f) => {
    const mean = classes.reduce((sum, _c, c) => sum + weight(c) * Number(theta[c][f]), 0);
    const pooledSd = Math.sqrt(classes.reduce((sum, _c, c) => sum + weight(c) * Number(variance[c][f]), 0));
    return classes.map((_c, c) => (pooledSd > 0 ? (Number(theta[c][f]) - mean) / pooledSd : 0));
  });
  if (standardized.flat().some((value) => !Number.isFinite(value))) return [];

  return [
    {
      mipChartHeight: 96 + 44 * features.length,
      title: {
        text: 'Class profiles',
        subtext: 'Class mean minus overall mean, in pooled within-class SDs',
        left: 'center',
      },
      legend: { bottom: 0, textStyle: { color: '#475569' } },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const f = p.dataIndex;
          const c = p.seriesIndex;
          return `${features[f]} · ${classes[c]}<br/>Mean: <b>${Number(theta[c][f]).toFixed(2)}</b> (SD ${Math.sqrt(Number(variance[c][f])).toFixed(2)})<br/>${p.value[0] >= 0 ? '+' : '−'}${Math.abs(p.value[0]).toFixed(2)} SD from the overall mean`;
        },
      },
      grid: { top: 56, left: 8, right: 24, bottom: 36, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#475569', formatter: (v: number) => `${v > 0 ? '+' : ''}${v}` },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'category',
        data: features,
        inverse: true,
        axisTick: { show: false },
        axisLabel: { color: '#475569' },
        splitLine: { show: true, lineStyle: { color: '#f1f5f9' } },
      },
      series: classes.map((name, c) => ({
        name,
        type: 'scatter',
        symbolSize: 12,
        itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        data: features.map((_, f) => [standardized[f][c], f]),
        ...(c === 0
          ? { markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: '#94a3b8', type: 'dashed' }, data: [{ xAxis: 0 }] } }
          : {}),
      })),
    } as EChartsOption,
  ];
}
