import { AlgorithmChartRegistry } from './chart-registry';
import { MipChart } from './chart-theme';
import { EXAFLOW_EXPECTED_OUTPUTS } from './exaflow-expected-outputs.fixture.spec';
import { qtukey } from './studentized-range';

/**
 * Contract tests: one payload per algorithm, shaped like exaflow's *_expected.json outputs
 * (tests/prod_env_tests/expected) or its pydantic result models. Each must build at least
 * one chart with a card title, a caption and no ECharts title.
 */
const PAYLOADS: Record<string, unknown> = {
  linear_regression: {
    dependent_var: 'leftcocentraloperculum', n_obs: 289, r_squared: 0.528, r_squared_adjusted: 0.522,
    indep_vars: ['Intercept', 'lefttmptemporalpole', 'rightprgprecentralgyrus'],
    coefficients: [0.32, 0.06, 0.13], lower_ci: [-0.13, -0.007, 0.09], upper_ci: [0.78, 0.14, 0.17], pvalues: [0.16, 0.076, 8e-11],
  },
  logistic_regression: {
    dependent_var: 'alzheimerbroadcategory', indep_vars: ['Intercept', 'righthippocampus', '_4thventricle'],
    summary: { n_obs: 1276, coefficients: [-4.19, 1.03, -0.21], lower_ci: [-5.4, 0.62, -0.44], upper_ci: [-2.96, 1.43, 0.03], pvalues: [2e-11, 7e-7, 0.084], r_squared_mcf: 0.035 },
  },
  logistic_regression_cv: {
    dependent_var: 'y', indep_vars: ['a'],
    summary: { row_names: ['fold_1', 'fold_2', 'fold_3', 'average', 'stdev'], n_obs: [70, 70, 71, null, null], accuracy: [0.83, 0.69, 0.73, 0.75, 0.06], precision: [0.78, 0.57, 0.67, 0.67, 0.09], recall: [0.72, 0.33, 0.42, 0.49, 0.17], fscore: [0.75, 0.42, 0.51, 0.56, 0.14] },
    confusion_matrix: { tp: 5, fp: 1, fn: 2, tn: 7 },
    roc_curves: [{ name: 'fold_1', fpr: [0, 0.2, 1], tpr: [0, 0.7, 1], auc: 0.86 }, { name: 'fold_2', fpr: [0, 0.3, 1], tpr: [0, 0.6, 1], auc: 0.78 }],
  },
  linear_regression_cv: {
    dependent_var: 'y', indep_vars: ['a'], n_obs: [100, 95],
    mean_sq_error: { mean: 1.2, std: 0.1 }, r_squared: [0.82, 0.03], mean_abs_error: { mean: 0.7, std: 0.06 }, f_stat: { mean: 9.5, std: 1.3 },
  },
  glmm_binary: {
    dependent_var: 'y', grouping_var: ['dataset'], indep_vars: ['Intercept', 'age'], n_obs: 500, n_groups: 5,
    coefficients: [0.1, 0.4], lower_ci: [-0.2, 0.1], upper_ci: [0.4, 0.7], pvalues: [0.5, 0.01], sigma_u2: 0.3,
  },
  lmm: {
    dependent_var: 'mmse', grouping_var: ['dataset'], indep_vars: ['Intercept', 'age', 'sex[F]'], n_obs: 500, n_groups: 5,
    coefficients: [25, -1.1, 0.2], lower_ci: [24, -1.5, -0.3], upper_ci: [26, -0.7, 0.7], pvalues: [0, 1e-5, 0.42], sigma2: 9.6, sigma_u2: 2.4,
  },
  glmm_ordinal: {
    dependent_var: 'stage', grouping_var: ['dataset'], indep_vars: ['age'], n_obs: 300, n_groups: 4,
    coefficients: [0.5], lower_ci: [0.2], upper_ci: [0.8], pvalues: [0.001], cutpoints: [-1, 1], category_order: ['mild', 'moderate', 'severe'], sigma_u2: 0.4,
  },
  cox_regression_classical: {
    dependent_var: 't', event_var: 'conversion', indep_vars: ['Intercept', 'Age', 'Sex[female]'],
    summary: { n_obs: 400, n_events: 90, converged: true, hazard_ratios: [1, 1.42, 0.96], hr_lower_ci: [1, 1.21, 0.27], hr_upper_ci: [1, 1.67, 3.41], pvalues: [1, 2e-5, 0.95] },
  },
  ttest_independent: { statistic: -0.24, p_value: 0.41, df: 116, mean_diff: -0.0098, ci_upper: -0.017, ci_lower: null, cohens_d: -0.047 },
  ttest_paired: { t_stat: -66.6, p_value: 0, df: 711, mean_diff: -0.546, ci_upper: -0.53, ci_lower: -0.56, cohens_d: -2.49 },
  anova_oneway: {
    anova_table: { x_label: 'Diagnosis', y_label: 'MMSE', p_value: 0.15, f_stat: 1.93, df_residual: 77 },
    tuckey_test: [{ groupA: 'GENPD', groupB: 'HC', diff: -0.65, se: 0.66, p_tuckey: 0.58 }],
    ci_info: { means: { GENPD: 18.2, HC: 18.9 }, 'm-s': { GENPD: 17.5, HC: 18.1 }, 'm+s': { GENPD: 18.9, HC: 19.7 } },
  },
  anova_twoway: {
    sum_sq: { dataset: 0.013, dx: 0.125, 'dataset:dx': 0.229, Residuals: 5.47 },
    df: { dataset: 2, dx: 1, 'dataset:dx': 2, Residuals: 146 },
    f_stat: { dataset: 0.17, dx: 3.34, 'dataset:dx': 3.06, Residuals: 0 },
    f_pvalue: { dataset: 0.84, dx: 0.07, 'dataset:dx': 0.0499, Residuals: 0 },
  },
  binned_mann_whitney_u_test: { u_stat: 163.5, p_value: 8.4e-6, z_score: 4.45, n1: 15, n2: 80 },
  standardized_mean_difference: { comparisons: [{ group1: 'a', group2: 'b', smd: 0.67 }, { group1: 'a', group2: 'c', smd: -0.05 }] },
  pearson_correlation: {
    n_obs: 100,
    correlations: { variables: ['a', 'b', 'c'], a: [1, 0.6, 0.2], b: [0.6, 1, 0.9], c: [0.2, 0.9, 1] },
    'p-values': { variables: ['a', 'b', 'c'], a: [0, 0.001, 0.2], b: [0.001, 0, 0], c: [0.2, 0, 0] },
  },
  pca: { n_obs: 1409, eigen_vals: [3.5, 0.8, 0.6], eigen_vecs: [[-0.5, -0.6, -0.6], [0.1, 0.1, -0.9], [0.8, -0.5, 0.2]] },
  kmeans: {
    variables: ['a', 'b'], n_obs_interval: '100-109',
    clusters: [{ label: 'Cluster 1', size_interval: '40-49', center: { a: 1, b: 2 } }, { label: 'Cluster 2', size_interval: '<10', center: { a: 3, b: 1 } }],
    elbow: { selected_k: 2, inertia_by_k: { '1': 100, '2': 40, '3': 35 } },
  },
  naive_bayes_gaussian: {
    classes: ['A', 'B'], class_count: [30, 70], class_prior: [0.3, 0.7], feature_names: ['f1', 'f2'],
    theta: [[1, 2], [1.5, 2.1]], var: [[0.2, 0.3], [0.25, 0.3]],
  },
  naive_bayes_categorical: {
    classes: ['Female', 'Male'], class_count: [26, 54], class_log_prior: [-1.1, -0.4], feature_names: ['agegroup'],
    categories: { agegroup: ['<50y', '50–59y'] }, category_count: { agegroup: [[3, 23], [20, 34]] }, category_log_prob: {},
  },
  naive_bayes_gaussian_cv: { confusion_matrix: { data: [[8, 2], [1, 9]], labels: ['AD', 'CN'] }, classification_summary: {} },
  linear_svm: { title: 'SVM', n_obs: 1296, weights: [0.11, -0.2, 0.35], intercept: 0.44 },
  describe: { featurewise: [{ variable: 'age', dataset: 'edsd0', data: { num_dtps: 15, num_na: 0, mean: 1.57, min: 1.27, q1: 1.52, q2: 1.57, q3: 1.65, max: 1.75 } }] },
  histogram: {
    histogram: [
      { var: 'csf', grouping_var: null, grouping_enum: null, bins: [0, 1, 2, 3], counts: [5, 10, null] },
      { var: 'csf', grouping_var: 'dx', grouping_enum: 'AD', bins: [0, 1, 2, 3], counts: [1, 4, 2] },
      { var: 'csf', grouping_var: 'dx', grouping_enum: 'HD', bins: [0, 1, 2, 3], counts: [null, null, null] },
    ],
  },
  chi_squared: {
    chi2: 30.2, p_value: 1e-5, dof: 4, x_labels: ['0 alleles', '1 allele', '2 alleles'], y_labels: ['AD', 'MCI', 'CN'],
    expected: [[97, 83, 230], [59, 51, 140], [15.4, 13.2, 36.4]], observed: [[60, 110, 240], [95, 85, 70], [40, 15, 10]],
  },
  fisher_exact: { odds_ratio: 2.51, p_value: 0.0012, x_labels: ['carrier', 'non-carrier'], y_labels: ['AD', 'CN'], observed: [[48, 52], [35, 95]] },
  outlier_report: {
    featurewise: [{ variable: 'lefthippocampus', dataset: 'edsd3', data: { strategy: 'iqr', tail: 'both', fold: 1.5, lower_outlier_count: 2, upper_outlier_count: 5, total_outlier_percentage: 13.2 } }],
  },
};

describe('AlgorithmChartRegistry contracts', () => {
  Object.entries(PAYLOADS).forEach(([algorithm, payload]) => {
    it(`builds titled, captioned charts for ${algorithm}`, () => {
      const charts: MipChart[] = AlgorithmChartRegistry[algorithm].build(payload);

      expect(charts.length).withContext(algorithm).toBeGreaterThan(0);
      for (const chart of charts) {
        expect(chart.title).withContext(algorithm).toBeUndefined();
        expect(chart.mipTitle).withContext(algorithm).toBeTruthy();
        expect(chart.mipCaption).withContext(algorithm).toBeTruthy();
        expect(chart.mipChartHeight).withContext(algorithm).toBeGreaterThan(0);
      }
    });
  });

  it('returns no charts for payloads it cannot read', () => {
    Object.keys(PAYLOADS).forEach((algorithm) => {
      expect(AlgorithmChartRegistry[algorithm].build({})).withContext(algorithm).toEqual([]);
    });
  });

  it('reads p_value for t-tests (the backend never sends p)', () => {
    const [chart] = AlgorithmChartRegistry['ttest_paired'].build(PAYLOADS['ttest_paired']);
    expect(chart.mipCaption).toContain('p < 0.001');
  });

  it('drops the intercept and sizes forests to their rows', () => {
    const [chart] = AlgorithmChartRegistry['cox_regression_classical'].build(PAYLOADS['cox_regression_classical']);
    expect((chart.yAxis as any)[0].data).toEqual(['Age', 'Sex · female']);
    expect(chart.mipChartHeight).toBe(2 * 40 + 90);
  });

  it('computes partial eta squared from dict-keyed two-way ANOVA output', () => {
    const [chart] = AlgorithmChartRegistry['anova_twoway'].build(PAYLOADS['anova_twoway']);
    const eta = (chart.series as any)[0].data.map((d: any) => d.value);
    expect(eta[1]).toBeCloseTo(0.125 / (0.125 + 5.47), 4);
    expect((chart.yAxis as any)[0].data).toContain('dataset × dx');
  });

  it('greys non-significant Pearson cells', () => {
    const [chart] = AlgorithmChartRegistry['pearson_correlation'].build(PAYLOADS['pearson_correlation']);
    const cells = (chart.series as any)[0].data;
    const ac = cells.find((c: any) => c.value[0] === 0 && c.value[1] === 1);
    expect(ac.itemStyle.color).toBe('#F8FAFC');
  });

  it('turns a tp/fp/fn/tn matrix into row percentages with recall and precision', () => {
    const [cm] = AlgorithmChartRegistry['logistic_regression_cv'].build(PAYLOADS['logistic_regression_cv']);
    const data = (cm.series as any)[0].data;
    expect(data.find((d: any) => d.value[0] === 0 && d.value[1] === 0).n).toBe(5);
    expect(data.find((d: any) => d.meta === 'Recall' && d.value[1] === 0).value[2]).toBeCloseTo(5 / 7, 4);
  });

  it('lists empty histogram groups in the caption instead of drawing them', () => {
    const charts = AlgorithmChartRegistry['histogram'].build(PAYLOADS['histogram']);
    expect(charts.length).toBe(2);
    expect(charts[1].mipCaption).toContain('HD has no data');
  });

  it('computes Tukey simultaneous intervals from q(0.95; k, df)', () => {
    const [, tukey] = AlgorithmChartRegistry['anova_oneway'].build(PAYLOADS['anova_oneway']);
    const half = (qtukey(0.95, 2, 77) / Math.SQRT2) * 0.66;
    const row = (tukey.series as any)[0].data[0];
    expect(row[1]).toBeCloseTo(-0.65 - half, 6);
    expect(row[2]).toBeCloseTo(-0.65 + half, 6);
  });

  it('shows chi-squared residuals and Fisher shares only when the observed table is present', () => {
    const { observed: _o, ...chiWithout } = PAYLOADS['chi_squared'] as any;
    expect(AlgorithmChartRegistry['chi_squared'].build(chiWithout)).toEqual([]);
    const [chi] = AlgorithmChartRegistry['chi_squared'].build(PAYLOADS['chi_squared']);
    const cell = (chi.series as any)[0].data.find((d: any) => d.value[0] === 0 && d.value[1] === 2);
    expect(cell.value[2]).toBeCloseTo((40 - 15.4) / Math.sqrt(15.4), 6);

    const [fisher] = AlgorithmChartRegistry['fisher_exact'].build(PAYLOADS['fisher_exact']);
    expect((fisher.series as any)[0].data[0].value).toBeCloseTo(0.48, 6);
  });

  it('standardises K-Means centres against the overall mean and SD when exaflow sends them', () => {
    const [profile] = AlgorithmChartRegistry['kmeans'].build({
      ...(PAYLOADS['kmeans'] as any), overall_mean: { a: 2, b: 1.5 }, overall_std: { a: 0.5, b: 1 },
    });
    expect((profile.series as any)[0].data[0].value[2]).toBeCloseTo((1 - 2) / 0.5, 6);
    expect(profile.mipCaption).toContain('the overall mean');
  });

  it('draws ordinal cutpoints on their own strip', () => {
    const [chart] = AlgorithmChartRegistry['glmm_ordinal'].build(PAYLOADS['glmm_ordinal']);
    const cuts = (chart.series as any[]).find((x) => x.type === 'scatter');
    expect(cuts.data.map((d: any) => d.name)).toEqual(['mild | moderate', 'moderate | severe']);
  });

  it('counts categories for nominal histograms instead of reading labels as bin edges', () => {
    const [chart] = AlgorithmChartRegistry['histogram'].build({
      histogram: [{ var: 'territory', grouping_var: null, grouping_enum: null, bins: ['ACS', 'PCS', 'other'], counts: [19952, 7356, null] }],
    });
    expect(chart.mipTitle).toBe('Counts · territory');
    expect(chart.mipCaption).toContain('ACS is the most common category (73%)');
    expect(chart.mipCaption).toContain('other has no data');
  });

  it('reads dummy-coded odds ratios against the reference level', () => {
    const [chart] = AlgorithmChartRegistry['logistic_regression'].build({
      dependent_var: 'gender', indep_vars: ['Intercept', 'agegroup[-50y]'],
      summary: { n_obs: 100, coefficients: [0.1, 0.94], lower_ci: [0, 0.57], upper_ci: [0.2, 1.31], pvalues: [0.5, 1e-6] },
    });
    expect(chart.mipCaption).toContain('agegroup · -50y has 2.56 times the odds of the reference level');
  });

  it('labels the one-way ANOVA whiskers as ± 1 SD, which is what ci_info holds', () => {
    const [means] = AlgorithmChartRegistry['anova_oneway'].build(PAYLOADS['anova_oneway']);
    expect(means.mipTitle).toBe('Group means (± 1 SD)');
  });

  it('follows the significance level passed by the caller', () => {
    const [loose] = AlgorithmChartRegistry['ttest_independent'].build(PAYLOADS['ttest_independent'], 0.5);
    const [strict] = AlgorithmChartRegistry['ttest_independent'].build(PAYLOADS['ttest_independent'], 0.05);
    expect(loose.mipCaption).not.toContain('compatible with no difference');
    expect(strict.mipCaption).toContain('compatible with no difference');
  });
});

/**
 * One case per exaflow *_expected.json (fix 06). These are reference-implementation shapes, so a few
 * carry no chartable fields: they must degrade to no chart rather than throw.
 */
describe('AlgorithmChartRegistry on exaflow expected outputs', () => {
  const NO_CHART: Record<string, string> = {
    chi_squared: 'no observed table',
    fisher_exact: 'no observed table',
    outlier_report: 'records carry settings but no counts',
    linear_svm: 'scikit `coeff`, not the API `weights`',
    logistic_regression: 'no indep_vars to label the rows',
  };

  Object.entries(EXAFLOW_EXPECTED_OUTPUTS).forEach(([algorithm, output]) => {
    it(`${algorithm}: ${NO_CHART[algorithm] ? `no chart (${NO_CHART[algorithm]})` : 'builds a captioned chart'}`, () => {
      const charts = AlgorithmChartRegistry[algorithm].build(output);
      if (NO_CHART[algorithm]) {
        expect(charts).withContext(algorithm).toEqual([]);
        return;
      }
      expect(charts.length).withContext(algorithm).toBeGreaterThan(0);
      charts.forEach((c) => expect(c.mipCaption).withContext(algorithm).toBeTruthy());
    });
  });
});

