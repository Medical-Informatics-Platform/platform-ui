import { buildConfusionMatrixChart } from './confusion-matrix-chart';
import { buildCVMetricsChart } from './cv-metrics-chart';
import { buildTTestChart } from './t-test-chart';
import { buildKMeansChart } from './k-means-chart';
import { buildNaiveBayesPriorsChart } from './naive-bayes-priors-chart';
import { buildBoxPlotChart } from './box-plot-chart';
import * as echarts from 'echarts';

describe('Chart renderers regressions', () => {
  it('fades the other box plot datasets as a whole while one is hovered', async () => {
    const stats = { min: 40, q1: 45, q2: 50, q3: 55, max: 60, mean: 51, std: 4.5 };
    const [option] = buildBoxPlotChart({
      featurewise: [
        { variable: 'age', dataset: 'ds1', data: stats },
        { variable: 'age', dataset: 'ds2', data: stats },
      ],
    });
    const host = document.createElement('div');
    host.style.cssText = 'width: 700px; height: 400px';
    document.body.appendChild(host);
    const chart = echarts.init(host);
    chart.setOption(option);

    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: 0 });
    // ECharts applies highlight states on its next render frame.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const data = (chart as any).getModel().getSeriesByIndex(0).getData();
    const blurred = (i: number) =>
      data.getItemGraphicEl(i).children().map((c: any) => c.currentStates.includes('blur'));

    expect(blurred(0).length, 'box, whiskers, median and mean drawn together').toBeGreaterThan(6);
    expect(blurred(0).every((b: boolean) => !b)).toBe(true);
    expect(blurred(1).every((b: boolean) => b)).toBe(true);

    chart.dispose();
    host.remove();
  });

  it('keeps the pooled All datasets band fully visible while a dataset is hovered', async () => {
    const stats = { min: 40, q1: 45, q2: 50, q3: 55, max: 60, mean: 51, std: 4.5 };
    const [option] = buildBoxPlotChart({
      featurewise: [
        { variable: 'age', dataset: 'ds1', data: stats },
        { variable: 'age', dataset: 'ds2', data: stats },
        {
          variable: 'age',
          dataset: 'all datasets',
          data: { min: 38, q1: 42, q2: 74, q3: 80, max: 90, mean: 62, std: 8 },
        },
      ],
    });
    (option as any).animation = false;
    (option as any).stateAnimation = { duration: 0 };
    const host = document.createElement('div');
    host.style.cssText = 'width: 700px; height: 400px';
    document.body.appendChild(host);
    const chart = echarts.init(host);
    chart.setOption(option);

    const boxIndex = (option.series as any[]).findIndex((s: any) => s.name === 'Q1–Q3 box · min–max whiskers');
    const pooledIndex = (option.series as any[]).findIndex((s: any) => s.name === 'All datasets · Q1–Q3');
    chart.dispatchAction({ type: 'highlight', seriesIndex: boxIndex, dataIndex: 0 });
    // ECharts applies highlight states on its next render frame.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const model = (chart as any).getModel();
    const boxData = model.getSeriesByIndex(boxIndex).getData();
    expect(boxData.getItemGraphicEl(1).children().every((c: any) => c.currentStates.includes('blur'))).toBe(true);

    const band = model.getSeriesByIndex(pooledIndex).getData().getItemGraphicEl(0);
    const displayables: any[] = [];
    band.traverse((child: any) => {
      if (!child.isGroup) displayables.push(child);
    });
    expect(displayables.length).toBeGreaterThan(3);
    expect(displayables.every((el: any) => el.currentStates.includes('blur'))).toBe(true);
    expect(displayables.every((el: any) => (el.style?.opacity ?? 1) === 1)).toBe(true);

    chart.dispose();
    host.remove();
  });

  it('maps tp/fp/fn/tn confusion matrix with rows=actual and cols=predicted', () => {
    const charts = buildConfusionMatrixChart({
      confusion_matrix: { tp: 5, fp: 1, fn: 2, tn: 7 },
    });

    expect(charts.length).toBe(1);
    const heatmap = (charts[0] as any).series?.[0]?.data ?? [];

    expect(heatmap).toContainEqual([0, 0, 5]); // TP
    expect(heatmap).toContainEqual([1, 0, 2]); // FN
    expect(heatmap).toContainEqual([0, 1, 1]); // FP
    expect(heatmap).toContainEqual([1, 1, 7]); // TN
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
