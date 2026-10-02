import { buildConfusionMatrixChart } from './confusion-matrix-chart';
import { buildCVMetricsChart } from './cv-metrics-chart';
import { buildTTestChart } from './t-test-chart';
import { buildKMeansChart } from './k-means-chart';
import { buildNaiveBayesPriorsChart } from './naive-bayes-priors-chart';

describe('Chart renderers regressions', () => {
  it('maps tp/fp/fn/tn confusion matrix with rows=actual and cols=predicted', () => {
    const charts = buildConfusionMatrixChart({
      confusion_matrix: { tp: 5, fp: 1, fn: 2, tn: 7 },
    });

    expect(charts.length).toBe(1);
    const heatmap = (charts[0] as any).series?.[0]?.data ?? [];

    expect(heatmap).toContain([0, 0, 5]); // TP
    expect(heatmap).toContain([1, 0, 2]); // FN
    expect(heatmap).toContain([0, 1, 1]); // FP
    expect(heatmap).toContain([1, 1, 7]); // TN
  });

  it('renders linear regression CV metrics when payload uses mean/std objects', () => {
    const charts = buildCVMetricsChart({
      n_obs: [100, 95, 98, 101, 97],
      root_mean_sq_error: { mean: 1.2, std: 0.1 },
      r_squared: { mean: 0.82, std: 0.03 },
      mean_abs_error: { mean: 0.7, std: 0.06 },
      f_stat: { mean: 9.5, std: 1.3 },
    });

    expect(charts.length).toBe(1);
    expect((charts[0] as any).title?.text).toBe('Cross-Validation Metric Summary');
    expect((charts[0] as any).series?.length).toBe(2);
  });

  it('charts Exaflow [mean, std] CV summaries and skips [null, null] metrics', () => {
    const charts = buildCVMetricsChart({
      n_obs: [100, 95],
      root_mean_sq_error: [1.2, 0.1],
      r_squared: [null, null],
      mean_abs_error: [0.7, 0.06],
      f_stat: [null, null],
    });

    expect(charts.length).toBe(1);
    expect((charts[0] as any).xAxis.data).toEqual(['RMSE', 'MAE']);
    expect((charts[0] as any).series[0].data).toEqual([1.2, 0.7]);
  });

  it('charts RMSE from the legacy mean_sq_error field', () => {
    const charts = buildCVMetricsChart({ n_obs: [100, 95], mean_sq_error: [1.2, 0.1] });

    expect((charts[0] as any).xAxis.data).toEqual(['RMSE']);
  });

  it('accepts numeric strings in t-test CI bounds', () => {
    const charts = buildTTestChart({
      mean_diff: 0.5,
      ci_lower: '-0.1',
      ci_upper: '1.2',
      p: 0.03,
    });

    expect(charts.length).toBe(1);
  });

  it('falls back to parallel coordinates for high-dimensional kmeans clusters', () => {
    const charts = buildKMeansChart({
      variables: ['v1', 'v2', 'v3', 'v4'],
      clusters: [
        { label: 'Cluster 0', center: { v1: 0.1, v2: 0.2, v3: 0.3, v4: 0.4 } },
        { label: 'Cluster 1', center: { v1: 0.5, v2: 0.6, v3: 0.7, v4: 0.8 } },
      ],
      elbow: null,
    });

    expect(charts.length).toBe(1);
    expect((charts[0] as any).title?.text).toContain('Parallel Coordinates');
    expect((charts[0] as any).series?.length).toBe(2);
    expect((charts[0] as any).parallelAxis.map((a: any) => a.name)).toEqual(['v1', 'v2', 'v3', 'v4']);
    expect((charts[0] as any).series?.[0]?.name).toBe('Cluster 0');
  });

  it('appends an elbow curve when kmeans used elbow selection', () => {
    const charts = buildKMeansChart({
      variables: ['v1', 'v2'],
      clusters: [
        { label: 'Cluster 0', center: { v1: 0.1, v2: 0.2 } },
        { label: 'Cluster 1', center: { v1: 0.5, v2: 0.6 } },
      ],
      elbow: { k_min: 2, k_max: 4, selected_k: 3, inertia_by_k: { '4': 10, '2': 30, '3': 15 }, warning: null },
    });

    expect(charts.length).toBe(2);
    expect((charts[1] as any).title?.text).toBe('Elbow Curve');
    expect((charts[1] as any).xAxis?.data).toEqual(['2', '3', '4']);
    expect((charts[1] as any).series?.[0]?.data).toEqual([30, 15, 10]);
  });

  it('builds class prior probabilities from Naive Bayes log priors', () => {
    const charts = buildNaiveBayesPriorsChart({
      classes: ['A', 'B'],
      class_log_prior: [Math.log(0.2), Math.log(0.8)],
    });

    expect(charts.length).toBe(1);
    const data = (charts[0] as any).series?.[0]?.data ?? [];
    expect(data.length).toBe(2);
    expect(data[0]).toBeCloseTo(0.2, 3);
    expect(data[1]).toBeCloseTo(0.8, 3);
  });
});
