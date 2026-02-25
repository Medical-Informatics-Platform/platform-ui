import { AlgorithmTableRegistry } from './algorithm-table-registry';

describe('AlgorithmTableRegistry', () => {
  it('supports linear_regression_cv metrics provided as mean/std objects', () => {
    const tables = AlgorithmTableRegistry['linear_regression_cv']({
      dependent_var: 'y',
      indep_vars: ['x1', 'x2'],
      n_obs: [100, 101, 99],
      mean_sq_error: { mean: 1.25, std: 0.2 },
      r_squared: { mean: 0.91, std: 0.03 },
      mean_abs_error: { mean: 0.72, std: 0.11 },
      f_stat: { mean: 12.3, std: 1.1 },
    });

    expect(tables.length).toBe(2);
    expect(tables[0].title).toBe('Training set sample sizes');
    expect(tables[1].title).toBe('Error metrics');
    expect(tables[1].rows[0][1]).toBe(1.25);
    expect(tables[1].rows[0][2]).toBe(0.2);
  });

  it('supports logistic_regression stderr field mapping', () => {
    const tables = AlgorithmTableRegistry['logistic_regression']({
      dependent_var: 'outcome',
      indep_vars: ['Intercept', 'x1'],
      summary: {
        coefficients: [0.5, -1.2],
        stderr: [0.05, 0.2],
        z_scores: [10, -6],
        pvalues: [0.0001, 0.0002],
        lower_ci: [0.4, -1.6],
        upper_ci: [0.6, -0.8],
        n_obs: 500,
      },
    });

    expect(tables.length).toBe(2);
    expect(tables[0].title).toBe('Logistic Regression Coefficients');
    // Std.Err. column for first row should be populated from "stderr"
    expect(tables[0].rows[0][2]).toBe('0.05');
  });

  it('includes ll/aic/bic and dependent variable in linear_regression summary', () => {
    const tables = AlgorithmTableRegistry['linear_regression']({
      dependent_var: 'target',
      indep_vars: ['Intercept', 'x1'],
      coefficients: [1.5, -0.2],
      std_err: [0.1, 0.04],
      t_stats: [15, -5],
      pvalues: [0.0001, 0.0002],
      lower_ci: [1.2, -0.28],
      upper_ci: [1.8, -0.12],
      ll: -123.45,
      aic: 260.1,
      bic: 275.3,
    });

    expect(tables.length).toBe(2);
    const summaryRows = tables[1].rows.map((row) => row[0]);
    expect(summaryRows).toContain('Dependent variable');
    expect(summaryRows).toContain('Log-likelihood');
    expect(summaryRows).toContain('AIC');
    expect(summaryRows).toContain('BIC');
  });

  it('renders anova_twoway table', () => {
    const payload = {
      terms: ['A', 'B', 'A:B', 'Residual'],
      df: [1, 1, 1, 96],
      sum_sq: [10.5, 8.2, 1.1, 40.0],
      f_stat: [25.2, 19.7, 2.6, null],
      f_pvalue: [0.0001, 0.0002, 0.11, null],
    };

    const canonical = AlgorithmTableRegistry['anova_twoway'](payload);
    expect(canonical.length).toBe(1);
    expect(canonical[0].rows.length).toBe(4);
  });

  it('renders anova_oneway min/max per group table when provided', () => {
    const tables = AlgorithmTableRegistry['anova_oneway']({
      anova_table: {
        x_label: 'group',
        df_explained: 2,
        ss_explained: 12.4,
        ms_explained: 6.2,
        f_stat: 3.8,
        p_value: 0.02,
        df_residual: 100,
        ss_residual: 50.1,
        ms_residual: 0.501,
      },
      tuckey_test: [{ groupA: 'A', groupB: 'B', diff: 0.2 }],
      min_max_per_group: {
        categories: ['A', 'B'],
        min: [1.1, 1.4],
        max: [4.5, 5.2],
      },
    });

    expect(tables.some((t) => t.title === 'Group Min/Max')).toBeTrue();
  });

  it('renders linear_svm via canonical key', () => {
    const payload = {
      title: 'Federated Linear SVM (Averaged Parameters)',
      n_obs: 240,
      weights: [0.12, -0.48, 0.09],
      intercept: 0.31,
    };

    const canonical = AlgorithmTableRegistry['linear_svm'](payload);
    expect(canonical.length).toBeGreaterThan(0);
    expect(canonical[0].rows.some((row) => row[0] === 'Intercept')).toBeTrue();
  });

  it('renders category_log_prob tables for naive_bayes_categorical', () => {
    const tables = AlgorithmTableRegistry['naive_bayes_categorical']({
      classes: ['0', '1'],
      class_count: [50, 60],
      class_log_prior: [-0.7, -0.6],
      feature_names: ['sex'],
      categories: { sex: ['0', '1'] },
      category_count: { sex: [[25, 25], [30, 30]] },
      category_log_prob: { sex: [[-0.69, -0.69], [-0.65, -0.65]] },
    });

    expect(tables.some((t) => t.title?.startsWith('Category Log Probabilities'))).toBeTrue();
  });

  it('renders pca summary and keeps pca_with_transformation alias', () => {
    const payload = {
      title: 'Eigenvalues and Eigenvectors',
      n_obs: 120,
      eigenvalues: [3.1, 1.2, 0.7],
    };
    const base = AlgorithmTableRegistry['pca'](payload);
    const transformed = AlgorithmTableRegistry['pca_with_transformation'](payload);

    expect(base.length).toBe(1);
    expect(base[0].title).toBe('PCA Summary');
    expect(transformed).toEqual(base);
  });

  it('renders describe tables for both numeric and nominal entries', () => {
    const tables = AlgorithmTableRegistry['describe']({
      variable_based: [
        {
          variable: 'age',
          dataset: 'ds1',
          data: { num_dtps: 10, num_na: 1, num_total: 11, mean: 52.1, std: 4.2, min: 40, q1: 49, q2: 52, q3: 55, max: 60 },
        },
        {
          variable: 'sex',
          dataset: 'ds1',
          data: { num_dtps: 10, num_na: 1, num_total: 11, counts: { M: 6, F: 4 } },
        },
      ],
      model_based: [],
    });

    expect(tables.some((t) => t.title === 'Variable-based Summary — Numeric')).toBeTrue();
    expect(tables.some((t) => t.title === 'Variable-based Summary — Nominal')).toBeTrue();
  });

  it('filters frontend metadata keys from ttest results', () => {
    const tables = AlgorithmTableRegistry['ttest_independent']({
      t_stat: 3.888283695725533,
      df: 7739,
      p: 1.017999869046271e-4,
      mean_diff: 0.06754973386270802,
      se_diff: 0.01737263511326778,
      ci_upper: 0.10160479913374154,
      ci_lower: 0.033494668591674485,
      cohens_d: 0.09578463577457333,
      labelMap: { a: 'A' },
      enumMaps: { a: { '1': 'Yes' } },
      yVar: 'blood_cholest_ldl',
    });

    expect(tables.length).toBe(1);
    expect(tables[0].columns).toEqual(['Metric', 'Value']);
    const rowNames = tables[0].rows.map((row) => row[0]);
    expect(rowNames).toContain('T-statistic');
    expect(rowNames).toContain('Degrees of Freedom');
    expect(rowNames).toContain('p-value');
    expect(rowNames).toContain('Std. Error of Difference');
    expect(rowNames).toContain("Cohen's d");
    expect(rowNames).not.toContain('labelMap');
    expect(rowNames).not.toContain('enumMaps');
    expect(rowNames).not.toContain('yVar');
  });
});
