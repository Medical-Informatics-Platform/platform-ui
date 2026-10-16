import { buildSummaryFigures } from './summary-figures';

const byLabel = (figures: { label: string; value: string; note?: string }[]) =>
  Object.fromEntries(figures.map((figure) => [figure.label, figure]));

describe('buildSummaryFigures', () => {
  it('summarises a t-test with the CI, the t statistic and the size of Cohen\'s d', () => {
    const figures = byLabel(buildSummaryFigures('ttest_independent', {
      t_stat: -739.928, df: 195004, p: 0, mean_diff: -3.454, ci_lower: -3.463, ci_upper: -3.4452, cohens_d: -3.756,
    })!);

    expect(figures['Mean difference'].note).toBe('95% CI −3.46 to −3.45');
    expect(figures['p-value'].value).toBe('< 0.001');
    expect(figures['p-value'].note).toBe('t(195\u202f004) = −739.93');
    expect(figures["Cohen's d"].note).toBe('Large effect');
  });

  it('derives Cramér\'s V and the sample size from the expected counts', () => {
    const figures = byLabel(buildSummaryFigures('chi_squared', {
      chi2: 1085.879, p_value: 3.87e-238, dof: 1,
      expected: [[16328.81, 3623.19], [6020.19, 1335.81]],
    })!);

    expect(figures["Cramér's V"].value).toBe('0.199');
    expect(figures['Observations'].value).toBe('27\u202f308');
  });

  it('reports eta squared for one-way ANOVA and partial eta squared per two-way term', () => {
    const oneWay = byLabel(buildSummaryFigures('anova_oneway', {
      anova_table: { n_obs: 100, y_label: 'Age', df_explained: 1, df_residual: 98, ss_explained: 10, ss_residual: 90, f_stat: 10.9, p_value: 0.0013 },
      ci_info: { means: { male: 70, female: 74 } },
    })!);
    expect(oneWay['Eta squared'].value).toBe('0.100');
    expect(oneWay['Groups'].value).toBe('2');

    const twoWay = buildSummaryFigures('anova_twoway', {
      terms: ['Sex', 'Unit', 'Sex:Unit', 'Residuals'],
      sum_sq: [10, 30, 5, 90], df: [1, 2, 2, 94], f_stat: [10.4, 15.7, 2.6, null], f_pvalue: [0.002, 0.0000001, 0.08, null],
    })!;
    expect(twoWay.map((figure) => figure.label)).toEqual(['Sex', 'Unit', 'Sex × Unit']);
    expect(twoWay[2].value).toBe('0.080');
    expect(twoWay[0].note).toBe('F(1, 94) = 10.40 · partial η² 0.100');
  });

  it('returns null for algorithms without a test summary', () => {
    expect(buildSummaryFigures('kmeans', { clusters: [] })).toBeNull();
    expect(buildSummaryFigures('ttest_independent', {})).toBeNull();
  });

  it('sets CV accuracy against the majority baseline and class-balanced scores', () => {
    const figures = byLabel(buildSummaryFigures('naive_bayes_gaussian_cv', {
      confusion_matrix: { data: [[18159, 19207, 0], [7414, 95038, 0], [0, 0, 0]], labels: ['no', 'yes', 'unknown'] },
      classification_summary: {
        accuracy: { no: { fold0: 0.82, fold1: 0.80, average: 0.81, stdev: 0.0089 } },
      },
    })!);

    expect(figures['Accuracy'].value).toBe('81.0%');
    expect(figures['Accuracy'].note).toBe('± 0.9 pts across 2 folds · +7.7 pts over the baseline');
    expect(figures['Majority baseline'].value).toBe('73.3%');
    expect(figures['Majority baseline'].note).toBe('Accuracy of always predicting yes');
    expect(figures['Balanced accuracy'].value).toBe('70.7%');
  });

  it('reports linear regression CV error from [mean, sd] pairs and skips undefined metrics', () => {
    const figures = byLabel(buildSummaryFigures('linear_regression_cv', {
      dependent_var: 'Age',
      n_obs: [199461, 199462, 199463],
      root_mean_sq_error: [13.4115, 0.1331],
      r_squared: [null, null],
      mean_abs_error: { mean: 10.65, std: 0.027 },
      f_stat: [3903.46, 325.48],
    })!);

    expect(Object.keys(figures)).toEqual(['RMSE', 'MAE', 'Folds']);
    expect(figures['RMSE'].value).toBe('13.41');
    expect(figures['RMSE'].note).toBe('Age units, ± 0.13 across folds');
    expect(figures['Folds'].note).toBe('~199\u202f462 training rows each');
  });

  it('reads RMSE from the legacy mean_sq_error field', () => {
    const figures = buildSummaryFigures('linear_regression_cv', { mean_sq_error: [1.2, 0.1] })!;
    expect(figures[0].label).toBe('RMSE');
  });

  it('names the compared groups when the run parameters are known', () => {
    const context = { groupA: 'yes', groupB: 'no' };
    const ttest = byLabel(buildSummaryFigures('ttest_independent', { mean_diff: -3.45, ci_lower: -3.46, ci_upper: -3.44, p: 0 }, context)!);
    expect(ttest['Mean difference'].note).toBe('yes − no · 95% CI −3.46 to −3.44');
  });
});
