import { buildTestSummary } from './test-summary';

const byLabel = (figures: { label: string; value: string; note?: string }[]) =>
  Object.fromEntries(figures.map((figure) => [figure.label, figure]));

describe('buildTestSummary', () => {
  it('summarises a t-test with the CI, the t statistic and the size of Cohen\'s d', () => {
    const figures = byLabel(buildTestSummary('ttest_independent', {
      t_stat: -739.928, df: 195004, p: 0, mean_diff: -3.454, ci_lower: -3.463, ci_upper: -3.4452, cohens_d: -3.756,
    })!);

    expect(figures['Mean difference'].note).toBe('95% CI −3.46 to −3.45');
    expect(figures['p-value'].value).toBe('< 0.001');
    expect(figures['p-value'].note).toBe('t(195,004) = −739.93');
    expect(figures["Cohen's d"].note).toBe('Large effect');
  });

  it('derives Cramér\'s V and the sample size from the expected counts', () => {
    const figures = byLabel(buildTestSummary('chi_squared', {
      chi2: 1085.879, p_value: 3.87e-238, dof: 1,
      expected: [[16328.81, 3623.19], [6020.19, 1335.81]],
    })!);

    expect(figures["Cramér's V"].value).toBe('0.199');
    expect(figures['Observations'].value).toBe('27,308');
  });

  it('reads U for group A as the probability that A outranks B', () => {
    const figures = byLabel(buildTestSummary('binned_mann_whitney_u_test', {
      u_stat: 103023104.5, p_value: 0, z_score: 51.52, n1: 19952, n2: 7356,
    })!);

    expect(figures['P(A > B)'].value).toBe('0.70');
    expect(figures['Group sizes'].value).toBe('19,952 · 7,356');
  });

  it('reports eta squared for one-way ANOVA and partial eta squared per two-way term', () => {
    const oneWay = byLabel(buildTestSummary('anova_oneway', {
      anova_table: { n_obs: 100, y_label: 'Age', df_explained: 1, df_residual: 98, ss_explained: 10, ss_residual: 90, f_stat: 10.9, p_value: 0.0013 },
      ci_info: { means: { male: 70, female: 74 } },
    })!);
    expect(oneWay['Eta squared'].value).toBe('0.100');
    expect(oneWay['Groups'].value).toBe('2');

    const twoWay = buildTestSummary('anova_twoway', {
      terms: ['Sex', 'Unit', 'Sex:Unit', 'Residuals'],
      sum_sq: [10, 30, 5, 90], df: [1, 2, 2, 94], f_stat: [10.4, 15.7, 2.6, null], f_pvalue: [0.002, 0.0000001, 0.08, null],
    })!;
    expect(twoWay.map((figure) => figure.label)).toEqual(['Sex', 'Unit', 'Sex × Unit']);
    expect(twoWay[2].value).toBe('0.080');
    expect(twoWay[0].note).toBe('F(1, 94) = 10.40 · partial η² 0.100');
  });

  it('returns null for algorithms without a test summary', () => {
    expect(buildTestSummary('kmeans', { clusters: [] })).toBeNull();
    expect(buildTestSummary('ttest_independent', {})).toBeNull();
  });
});
