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
      mean_sq_error: { mean: 1.2, std: 0.1 },
      r_squared: { mean: 0.82, std: 0.03 },
      mean_abs_error: { mean: 0.7, std: 0.06 },
      f_stat: { mean: 9.5, std: 1.3 },
    });

    expect(charts.length).toBe(1);
    expect((charts[0] as any).title?.text).toBe('Cross-Validation Metric Summary');
    expect((charts[0] as any).series?.length).toBe(2);
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

  it('falls back to parallel coordinates for high-dimensional kmeans centers', () => {
    const charts = buildKMeansChart({
      centers: [
        [0.1, 0.2, 0.3, 0.4],
        [0.5, 0.6, 0.7, 0.8],
      ],
    });

    expect(charts.length).toBe(1);
    expect((charts[0] as any).title?.text).toContain('Parallel Coordinates');
    expect((charts[0] as any).series?.length).toBe(2);
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
