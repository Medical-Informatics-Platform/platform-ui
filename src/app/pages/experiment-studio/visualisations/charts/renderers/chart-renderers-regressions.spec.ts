import { buildConfusionMatrixChart, readConfusionMatrix } from './confusion-matrix-chart';
import { buildKMeansChart } from './k-means-chart';
import { buildNaiveBayesPriorsChart } from './naive-bayes-priors-chart';

describe('Chart renderers regressions', () => {
  it('maps tp/fp/fn/tn confusion matrix with rows=actual and cols=predicted', () => {
    const charts = buildConfusionMatrixChart({
      confusion_matrix: { tp: 5, fp: 1, fn: 2, tn: 7 },
    });

    expect(charts.length).toBe(1);
    const cells = ((charts[0] as any).series?.[0]?.data ?? []).map((cell: any) => [cell.value[0], cell.value[1], cell.count]);

    expect(cells).toContainEqual([0, 0, 5]); // TP
    expect(cells).toContainEqual([1, 0, 2]); // FN
    expect(cells).toContainEqual([0, 1, 1]); // FP
    expect(cells).toContainEqual([1, 1, 7]); // TN
  });

  it('drops classes absent from both sides and shades by share of the actual class', () => {
    const confusion = readConfusionMatrix({ data: [[3, 1, 0], [2, 6, 0], [0, 0, 0]], labels: ['no', 'yes', 'unknown'] })!;
    expect(confusion.labels).toEqual(['no', 'yes']);

    const charts = buildConfusionMatrixChart({ confusion_matrix: { data: [[3, 1, 0], [2, 6, 0], [0, 0, 0]], labels: ['no', 'yes', 'unknown'] } });
    const shares = ((charts[0] as any).series[0].data).map((cell: any) => cell.value[2]);
    expect(shares).toEqual([0.75, 0.25, 0.25, 0.75]);
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

  it('sizes two-variable kmeans bubbles by the midpoint of each size interval', () => {
    const charts = buildKMeansChart({
      variables: ['Age', 'Score'],
      clusters: [
        { label: 'Cluster 0', size_interval: '90-110', center: { Age: 70, Score: 3 } },
        { label: 'Cluster 1', size_interval: '20-30', center: { Age: 50, Score: 4 } },
      ],
      elbow: null,
    });

    const series = (charts[0] as any).series;
    expect(series.map((s: any) => s.data[0])).toEqual([[70, 3], [50, 4]]);
    // Area proportional to size: the largest cluster gets the full radius.
    expect(series[0].symbolSize).toBe(48);
    expect(series[1].symbolSize).toBeCloseTo(12 + 36 * Math.sqrt(25 / 100), 6);
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
