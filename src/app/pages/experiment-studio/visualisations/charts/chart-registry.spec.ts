import { AlgorithmChartRegistry, tablesReplacedByCharts } from './chart-registry';

describe('AlgorithmChartRegistry', () => {
  it('contains canonical SVM key', () => {
    expect(AlgorithmChartRegistry['linear_svm']).toBeDefined();
  });

  it('renders chart options for linear_svm payload shape', () => {
    const charts = AlgorithmChartRegistry['linear_svm'].build({
      title: 'Federated Linear SVM (Averaged Parameters)',
      weights: [0.11, -0.2, 0.35, 0.02],
      intercept: 0.44,
    });

    expect(charts.length).toBe(1);
    expect((charts[0] as any).title?.text).toBe('SVM Support Vector Distribution');
  });

  it('replaces a table only when the chart that shows it rendered', () => {
    const chart = (text: string) => ({ title: { text } });

    expect(tablesReplacedByCharts('pca', [chart('Component weights')])).toEqual([{ title: 'Component weights' }]);
    expect(tablesReplacedByCharts('pca', [chart('Component weights'), chart('Variance explained')]))
      .toEqual([{ title: 'PCA Summary' }, { title: 'Component weights' }]);
    expect(tablesReplacedByCharts('kmeans', [chart('K-Means Centers')])).toEqual([]);
    expect(tablesReplacedByCharts('kmeans', [chart('Cluster centres')])).toEqual([{ title: 'Cluster Centers' }]);
    expect(tablesReplacedByCharts('naive_bayes_gaussian', [chart('Class profiles')])).toEqual([]);
    expect(tablesReplacedByCharts('naive_bayes_gaussian_cv', [chart('Confusion Matrix')])).toEqual([{ title: 'Confusion Matrix (Combined)' }]);
    expect(tablesReplacedByCharts('unknown', [chart('Confusion Matrix')])).toEqual([]);
  });
});
