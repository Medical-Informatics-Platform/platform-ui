import { buildConfusionMatrixChart, readConfusionMatrix } from './confusion-matrix-chart';
import { buildKMeansChart } from './k-means-chart';
import { buildTTestIntervalChart } from './mean-plot-chart';
import { buildNaiveBayesPriorsChart, buildNaiveBayesProfileChart } from './naive-bayes-priors-chart';
import { buildBoxPlotChart } from './box-plot-chart';
import * as echarts from 'echarts';

describe('Chart renderers regressions', () => {
  it('draws the t-test mean difference as a vertical interval, value on the y axis', () => {
    const [chart] = buildTTestIntervalChart({ mean_diff: -3.454, ci_lower: -3.463, ci_upper: -3.445 }) as any[];

    expect(chart.xAxis.type).toBe('category');
    expect(chart.xAxis.data).toEqual(['Mean difference']);
    expect(chart.yAxis.type).toBe('value');
    expect(chart.series[0].data[0].value).toEqual(['Mean difference', -3.454]);
    expect(chart.series[1].data[0].slice(1, 3)).toEqual([-3.463, -3.445]);
    // Zero is far outside this interval, so no zero line stretches the axis.
    expect(chart.series[0].markLine).toBeUndefined();

    const [crossing] = buildTTestIntervalChart({ mean_diff: 0.2, ci_lower: -0.1, ci_upper: 0.5 }) as any[];
    expect(crossing.series[0].markLine.data).toEqual([{ yAxis: 0 }]);
    expect(buildTTestIntervalChart({ mean_diff: 1 })).toEqual([]);
  });

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
