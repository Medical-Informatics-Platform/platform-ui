import { TestBed } from '@angular/core/testing';
import { ChartBuilderService } from './chart-builder.service';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

describe('ChartBuilderService', () => {
  const experimentServiceStub = {
    algorithmAssignableVariables: () => [{ code: 'v1', label: 'Left hippocampus' }, { code: 'v2', label: 'Right hippocampus' }],
    algorithmX: () => [{ code: 'v1', label: 'Left hippocampus' }, { code: 'v2', label: 'Right hippocampus' }],
    selectedFilters: () => [],
    getDatasetLabelMap: () => ({ 'dataset-a': 'Dataset A' }),
  };

  let service: ChartBuilderService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ExperimentStudioService, useValue: experimentServiceStub }],
    });
    service = TestBed.inject(ChartBuilderService);
  });

  it('never sets an ECharts title; the card title travels as mipTitle', () => {
    const charts = service.getChartsForAlgorithm('linear_svm', { weights: [0.2, -0.1], intercept: 0.25 });

    expect(charts.length).toBe(1);
    expect(charts[0].title).toBeUndefined();
    expect(charts[0].mipTitle).toBe('Feature weights');
  });

  it('names SVM weights after the x covariates when the counts match', () => {
    const [chart] = service.getChartsForAlgorithm('linear_svm', { weights: [0.2, -0.5], intercept: 0 });

    expect((chart.yAxis as any).data).toEqual(['Right hippocampus', 'Left hippocampus']);
  });

  it('maps variable codes used as object keys, so Pearson axes show labels', () => {
    const matrix = { variables: ['v1', 'v2'], v1: [1, 0.25], v2: [0.25, 1] };
    const charts = service.getChartsForAlgorithm('pearson_correlation', {
      correlations: matrix,
      'p-values': { variables: ['v1', 'v2'], v1: [0, 0.01], v2: [0.01, 0] },
      low_confidence_intervals: matrix,
      high_confidence_intervals: matrix,
    });

    expect(charts.length).toBe(1);
    expect((charts[0].yAxis as any).data).toEqual(['R hippocampus']);
    expect((charts[0].series as any)[0].data[0].value).toEqual([0, 0, 0.25]);
  });

  it('builds a scree plot and a correlation circle for PCA', () => {
    const charts = service.getChartsForAlgorithm('pca', {
      eigenvectors: [[0.7, 0.2], [0.1, 0.9]],
      eigenvalues: [1.8, 0.9],
    });

    expect(charts.map((c) => c.mipTitle)).toEqual(['Scree plot', 'Correlation circle (PC1 × PC2)']);
  });

  it('renders describe box plots from featurewise rows, one per variable', () => {
    const charts = service.getChartsForAlgorithm('describe', {
      featurewise: [
        { variable: 'age', dataset: 'ds1', data: { min: 40, q1: 45, q2: 50, q3: 55, max: 60, mean: 51, num_dtps: 10 } },
        { variable: 'mmse', dataset: 'ds1', data: { min: 20, q1: 24, q2: 26, q3: 28, max: 30, mean: 26, num_dtps: 10 } },
      ],
    });

    expect(charts.map((c) => c.mipVariant)).toEqual(['age', 'mmse']);
  });

  it('leaves result fields alone even when a variable code matches a field name', () => {
    spyOn(experimentServiceStub, 'algorithmAssignableVariables').and.returnValue(
      [{ code: 'v1', label: 'Left hippocampus' }, { code: 'mean_diff', label: 'Clash' }]
    );
    const [chart] = service.getChartsForAlgorithm('ttest_independent', { mean_diff: 0.5, ci_lower: 0.1, ci_upper: 0.9, p_value: 0.01, cohens_d: 0.4 });

    expect(chart.mipCaption).toContain('0.50');
  });

  it('rebuilds with the app-level significance level', () => {
    const payload = { mean_diff: 0.5, ci_lower: 0.1, ci_upper: 0.9, p_value: 0.02, cohens_d: 0.4 };
    service.alpha.set(0.01);
    const [strict] = service.getChartsForAlgorithm('ttest_independent', payload);
    service.alpha.set(0.05);
    const [loose] = service.getChartsForAlgorithm('ttest_independent', payload);

    expect(strict.mipCaption).toContain('compatible with no difference');
    expect(loose.mipCaption).not.toContain('compatible with no difference');
  });
});

