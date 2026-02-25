import { AlgorithmChartRegistry } from './chart-registry';

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

});
