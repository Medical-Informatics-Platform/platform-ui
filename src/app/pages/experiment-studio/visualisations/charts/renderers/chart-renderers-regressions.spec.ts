import { buildConfusionMatrixChart, readConfusionMatrix } from './confusion-matrix-chart';
import { buildKMeansChart } from './k-means-chart';
import { buildNaiveBayesPriorsChart, buildNaiveBayesProfileChart } from './naive-bayes-priors-chart';

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

  it('names a binary matrix after the positive class when the run gives it', () => {
    expect(readConfusionMatrix({ tp: 5, fp: 1, fn: 2, tn: 7, positive_label: 'yes' })!.labels).toEqual(['yes', 'not yes']);
    expect(readConfusionMatrix({ tp: 5, fp: 1, fn: 2, tn: 7 })!.labels).toEqual(['Positive', 'Negative']);
  });

  it('drops classes absent from both sides and shades by share of the actual class', () => {
    const confusion = readConfusionMatrix({ data: [[3, 1, 0], [2, 6, 0], [0, 0, 0]], labels: ['no', 'yes', 'unknown'] })!;
    expect(confusion.labels).toEqual(['no', 'yes']);

    const charts = buildConfusionMatrixChart({ confusion_matrix: { data: [[3, 1, 0], [2, 6, 0], [0, 0, 0]], labels: ['no', 'yes', 'unknown'] } });
    const shares = ((charts[0] as any).series[0].data).map((cell: any) => cell.value[2]);
    expect(shares).toEqual([0.75, 0.25, 0.25, 0.75]);
  });

  it('draws three or more kmeans variables as a centres heatmap shaded around the size-weighted mean', () => {
    const charts = buildKMeansChart({
      variables: ['v1', 'v2', 'v3'],
      clusters: [
        { label: 'Cluster 0', size_interval: '30-30', center: { v1: 10, v2: 1, v3: 5 } },
        { label: 'Cluster 1', size_interval: '10-10', center: { v1: 50, v2: 1, v3: 1 } },
      ],
      elbow: null,
    });

    expect(charts.length).toBe(1);
    const chart = charts[0] as any;
    expect(chart.xAxis.data).toEqual(['v1', 'v2', 'v3']);
    expect(chart.yAxis.data).toEqual(['Cluster 0 · ~30', 'Cluster 1 · ~10']);
    // v1 overall mean (3·10 + 1·50) / 4 = 20: deviations −10 and +30, scaled by the larger.
    const cells = chart.series[0].data.map((cell: any) => cell.value);
    expect(cells[0]).toEqual([0, 0, -1 / 3, 10]);
    expect(cells[3]).toEqual([0, 1, 1, 50]);
    // A variable equal in every cluster sits at the mean.
    expect(cells[1][2]).toBe(0);
    // White text only on the deep blue end; ink reads better on the whole red half.
    const labelColors = chart.series[0].data.map((cell: any) => cell.label.color);
    expect(cells[5][2]).toBe(-1);
    expect(labelColors[5]).toBe('#0f172a');
    expect(labelColors[3]).toBe('#ffffff');
  });

  it('escapes labels in chart tooltips, which ECharts renders as HTML', () => {
    const chart = buildKMeansChart({
      variables: ['<img src=x onerror=alert(1)>', 'v2', 'v3'],
      clusters: [{ label: 'Cluster 0', size_interval: '<10', center: { '<img src=x onerror=alert(1)>': 1, v2: 1, v3: 1 } }],
      elbow: null,
    })[0] as any;

    const html = chart.tooltip.formatter({ value: [0, 0, 0, 1] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Cluster 0 · &lt;10');
  });

  it('weights a kmeans cluster under the privacy threshold by half the threshold', () => {
    const chart = buildKMeansChart({
      variables: ['v1', 'v2', 'v3'],
      clusters: [
        { label: 'Cluster 0', size_interval: '30-30', center: { v1: 0, v2: 1, v3: 1 } },
        { label: 'Cluster 1', size_interval: '<10', center: { v1: 70, v2: 1, v3: 1 } },
      ],
      elbow: null,
    })[0] as any;

    expect(chart.yAxis.data).toEqual(['Cluster 0 · ~30', 'Cluster 1 · <10']);
    // Weights 30 and 5: v1 mean (30·0 + 5·70) / 35 = 10, so deviations −10 and +60.
    const cells = chart.series[0].data.map((cell: any) => cell.value);
    expect(cells[0][2]).toBeCloseTo(-1 / 6, 10);
    expect(cells[3][2]).toBe(1);
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

  it('places Gaussian naive Bayes class means in pooled SDs from the overall mean', () => {
    const charts = buildNaiveBayesProfileChart({
      classes: ['no', 'yes'],
      class_count: [1, 3],
      feature_names: ['Score'],
      theta: [[8], [4]],
      var: [[4], [4]],
    });

    // Overall mean 5, pooled SD 2: "no" sits +1.5 SD, "yes" −0.5 SD.
    const series = (charts[0] as any).series;
    expect(series[0].data).toEqual([[1.5, 0]]);
    expect(series[1].data).toEqual([[-0.5, 0]]);
  });
});
