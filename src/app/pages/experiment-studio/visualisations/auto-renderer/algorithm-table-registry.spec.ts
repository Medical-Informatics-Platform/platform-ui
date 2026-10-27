import { cellText, exportTable, trimTable, AlgorithmTableRegistry } from './algorithm-table-registry';

/** The rows as the screen prints them. */
const shown = (rows: unknown[][]) => rows.map((row) => row.map(cellText));

describe('AlgorithmTableRegistry', () => {
  it('supports linear_regression_cv metrics provided as mean/std objects', () => {
    const tables = AlgorithmTableRegistry['linear_regression_cv']({
      dependent_var: 'y',
      indep_vars: ['x1', 'x2'],
      n_obs: [100, 101, 99],
      root_mean_sq_error: { mean: 1.25, std: 0.2 },
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

  it('shows undefined linear_regression_cv summaries from Exaflow [mean, std] arrays', () => {
    const tables = AlgorithmTableRegistry['linear_regression_cv']({
      dependent_var: 'y',
      indep_vars: ['Intercept'],
      n_obs: [80, 80],
      root_mean_sq_error: [1.25, 0.2],
      r_squared: [null, null],
      mean_abs_error: [0.72, 0.11],
      f_stat: [null, null],
    });

    expect(tables[1].rows).toEqual([
      ['Root mean squared error', 1.25, 0.2],
      ['R-squared', 'Undefined', 'Undefined'],
      ['Mean absolute error', 0.72, 0.11],
      ['F diagnostic', 'Undefined', 'Undefined'],
    ]);
  });

  it('reads RMSE from the legacy mean_sq_error field of stored linear_regression_cv results', () => {
    const tables = AlgorithmTableRegistry['linear_regression_cv']({
      dependent_var: 'y',
      indep_vars: ['x1'],
      n_obs: [100, 101],
      mean_sq_error: [1.5, 0.3],
      r_squared: [0.9, 0.02],
      mean_abs_error: [0.8, 0.1],
      f_stat: [10, 1],
    } as any);

    expect(tables[1].rows[0]).toEqual(['Root mean squared error', 1.5, 0.3]);
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

  it('uses Exaflow F-stat display fields in linear_regression summary', () => {
    const tables = AlgorithmTableRegistry['linear_regression']({
      dependent_var: 'target',
      indep_vars: ['Intercept', 'x1'],
      coefficients: [1.5, -0.2],
      std_err: [0.1, 0.04],
      t_stats: [15, -5],
      pvalues: [0.0001, 0.0002],
      lower_ci: [1.2, -0.28],
      upper_ci: [1.8, -0.12],
      f_stat: Number.POSITIVE_INFINITY,
      f_pvalue: 0,
      f_stat_display: 'Perfect fit',
      f_pvalue_display: '<0.001',
      f_stat_note: 'Residual sum of squares is zero.',
    } as any);

    const summary = tables[1].rows;
    expect(summary).toContainEqual(['F-statistic', 'Perfect fit']);
    expect(summary).toContainEqual(['p-value (F-stat)', '<0.001']);
    expect(summary).toContainEqual(['F-statistic note', 'Residual sum of squares is zero.']);
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

    expect(tables.some((t) => t.title === 'Group Min/Max')).toBe(true);
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
    expect(canonical[0].rows.some((row) => row[0] === 'Intercept')).toBe(true);
  });

  it('renders categorical naive Bayes counts with class-conditional shares', () => {
    const tables = AlgorithmTableRegistry['naive_bayes_categorical']({
      classes: ['0', '1'],
      class_count: [50, 60],
      class_log_prior: [-0.7, -0.6],
      feature_names: ['sex'],
      categories: { sex: ['0', '1'] },
      category_count: { sex: [[25, 25], [30, 30]] },
      category_log_prob: { sex: [[-0.69, -0.69], [-0.65, -0.65]] },
    });

    const sex = tables.find((t) => t.title === 'sex by class')!;
    expect(sex.columns).toEqual(['Category', '0', '1']);
    expect(sex.rows[0]).toEqual(['0', '25 · 50.2%', '30 · 52.2%']);
    expect(shown(tables[0].rows)[0]).toEqual(['0', '50', '49.7%']);
  });

  it('exports categorical naive Bayes counts, P(category | class) and priors exactly, one value per column', () => {
    const tables = AlgorithmTableRegistry['naive_bayes_categorical']({
      classes: ['0', '1'],
      class_count: [50, 60],
      class_log_prior: [-0.7, -0.6],
      feature_names: ['sex'],
      categories: { sex: ['0', '1'] },
      category_count: { sex: [[25, 25], [30, 30]] },
      category_log_prob: { sex: [[-0.69, -0.69], [-0.65, -0.65]] },
    });

    const sex = exportTable(tables.find((t) => t.title === 'sex by class')!);
    expect(sex.columns).toEqual(['Category', '0 count', '0 P(category | class)', '1 count', '1 P(category | class)']);
    expect(sex.rows[0]).toEqual(['0', 25, Math.exp(-0.69), 30, Math.exp(-0.65)]);
    expect(exportTable(tables[0]).rows[0]).toEqual(['0', '50', Math.exp(-0.7)]);
  });

  it('renders pca summary', () => {
    const payload = {
      title: 'Eigenvalues and Eigenvectors',
      n_obs: 120,
      eigenvalues: [3.1, 1.2, 0.7],
    };
    const base = AlgorithmTableRegistry['pca'](payload);

    expect(base.length).toBe(1);
    expect(base[0].title).toBe('PCA Summary');
  });

  it('names pca weight rows with the labels a caller supplies over the raw codes', () => {
    const tables = AlgorithmTableRegistry['pca']({
      title: 'Eigenvalues and Eigenvectors',
      n_obs: 120,
      eigenvalues: [1.2, 0.8],
      eigenvectors: [
        [0.7, 0.2],
        [0.1, 0.9],
      ],
      variables: ['age', 'bmi'],
      variable_names: ['Age', 'BMI'],
    } as any);

    const weights = tables.find((table) => table.title === 'Component weights')!;
    expect(weights.rows.map((row) => row[0])).toEqual(['Age', 'BMI']);
  });

  it('renders pca summary percentages from explained_variance_ratio', () => {
    const tables = AlgorithmTableRegistry['pca']({
      title: 'Eigenvalues and Eigenvectors',
      n_obs: 120,
      eigenvalues: [3.42, 0.58],
      eigenvectors: [
        [0.7, 0.2],
        [0.1, 0.9],
      ],
      variables: ['age', 'bmi'],
      components: [
        {
          component_id: 'PC1',
          explained_variance: 3.42,
          explained_variance_ratio: 0.855,
          cumulative_explained_variance: 0.855,
          loadings: { age: 0.7, bmi: 0.2 },
        },
        {
          component_id: 'PC2',
          explained_variance: 0.58,
          explained_variance_ratio: 0.145,
          cumulative_explained_variance: 1,
          loadings: { age: 0.1, bmi: 0.9 },
        },
      ],
      reusable_preprocessing: null,
    });

    expect(tables[0].columns).toEqual([
      'Component',
      'Eigenvalue',
      'Variance explained (%)',
      'Cumulative (%)',
    ]);
    expect(tables[0].rows[0]).toEqual(['PC1', '3.42', '85.5%', '85.5%']);
    expect(tables[0].rows[1]).toEqual(['PC2', '0.58', '14.5%', '100.0%']);
  });

  it('renders quartiles tables and preserves unavailable quantile values', () => {
    const tables = AlgorithmTableRegistry['quartiles']({
      quantiles: [
        { q: 0.25, value: 2.8124, actual_q: 0.2535211267605634 },
        { q: 0.5, value: null, actual_q: null },
        { q: 0.75, value: 3.3067, actual_q: 0.7549295774647887 },
      ],
    });

    expect(tables.length).toBe(1);
    expect(tables[0].columns).toEqual(['Quantile', 'Value', 'Actual quantile']);
    expect(tables[0].rows.length).toBe(3);
    expect(tables[0].rows[1]).toEqual(['0.5', '', '']);
  });

  it('renders binned Mann-Whitney U test metrics', () => {
    const tables = AlgorithmTableRegistry['binned_mann_whitney_u_test']({
      u_stat: 163.5,
      p_value: 8.436804884099734e-6,
      z_score: 4.4537889144455,
      n1: 15,
      n2: 80,
    });

    expect(tables.length).toBe(1);
    const rows = shown(tables[0].rows);
    expect(rows).toContainEqual(['U statistic', '163.5']);
    expect(rows).toContainEqual(['p-value', '< 0.001']);
    expect(rows).toContainEqual(['z-score', '4.454']);
    expect(rows).toContainEqual(['P(A > B)', '0.14']);
    expect(rows).toContainEqual(['Group A sample size', '15']);
    expect(rows).toContainEqual(['Group B sample size', '80']);
    // Exports carry what the screen rounds.
    const exported = exportTable(tables[0]).rows;
    expect(exported).toContainEqual(['p-value', 8.436804884099734e-6]);
    expect(exported).toContainEqual(['P(A > B)', 163.5 / (15 * 80)]);
  });

  it('prints p = 0 as < 0.001 and leaves P(A > B) out without group sizes', () => {
    const tables = AlgorithmTableRegistry['binned_mann_whitney_u_test']({ u_stat: 70, p_value: 0, z_score: 9 } as any);

    expect(shown(tables[0].rows)).toContainEqual(['p-value', '< 0.001']);
    expect(tables[0].rows.map((row) => row[0])).not.toContain('P(A > B)');
  });

  it('renders standardized mean difference comparisons', () => {
    const tables = AlgorithmTableRegistry['standardized_mean_difference']({
      comparisons: [
        { group1: 'edsd0', group2: 'ppmi3', smd: -1.502242948685167 },
        { group1: 1, group2: 2, smd: 0.25 },
      ],
    });

    expect(tables.length).toBe(1);
    expect(tables[0].title).toBe('Standardized Mean Difference');
    expect(tables[0].columns).toEqual(['Group 1', 'Group 2', 'SMD']);
    expect(tables[0].rows.length).toBe(2);
    expect(tables[0].rows[0][0]).toBe('edsd0');
    expect(tables[0].rows[0][1]).toBe('ppmi3');
    expect(tables[0].rows[0][2]).toBe('-1.502');
    expect(tables[0].rows[1][0]).toBe('1');
  });

  it('renders an empty standardized mean difference table when no pair is eligible', () => {
    const tables = AlgorithmTableRegistry['standardized_mean_difference']({ comparisons: [] });

    expect(tables.length).toBe(1);
    expect(tables[0].rows.length).toBe(0);
  });

  it('renders describe tables for both numeric and nominal entries', () => {
    const tables = AlgorithmTableRegistry['describe']({
      featurewise: [
        {
          variable: 'age',
          dataset: 'all datasets',
          data: { num_dtps: 10, num_na: 1, num_total: 11, mean: 52.1, std: 4.2, min: 40, q1: 49, q2: 52, q3: 55, median: 52.5, max: 60 },
        },
        {
          variable: 'height',
          dataset: 'ds1',
          data: { num_dtps: 8, num_na: 0, num_total: 8, mean: 170, std: 5, min: 160, q1: 166, q2: 171, q3: 174, max: 180 },
        },
        {
          variable: 'sex',
          dataset: 'ds1',
          data: { num_dtps: 10, num_na: 1, num_total: 11, counts: { M: 6, F: 4 } },
        },
      ],
    });

    expect(tables.some((t) => t.title === 'Featurewise Summary — Numeric')).toBe(true);
    expect(tables.some((t) => t.title === 'Featurewise Summary — Nominal')).toBe(true);
    expect(tables.some((t) => t.title?.includes('Model-based'))).toBe(false);
    const numericRows = tables.find((t) => t.title === 'Featurewise Summary — Numeric')?.rows ?? [];
    expect(numericRows[0][9]).toBe('52.5');
    expect(numericRows[1][9]).toBe('171');
  });

  it('renders outlier_report and preserves zero counts separately from null values', () => {
    const tables = AlgorithmTableRegistry['outlier_report']({
      featurewise: [
        {
          variable: 'age',
          dataset: 'ds1',
          data: {
            strategy: 'iqr',
            tail: 'both',
            fold: 1.5,
            lower_bound: null,
            upper_bound: 90,
            lower_outlier_count: 0,
            upper_outlier_count: null,
            total_outlier_count: 0,
            total_outlier_percentage: 0,
          },
        },
      ],
    });

    expect(tables.length).toBe(1);
    expect(tables[0].columns).toEqual(['Variable', 'Dataset', 'Rule', 'Kept range', 'Below', 'Above', 'Outliers', 'Share']);
    expect(tables[0].rows[0][2]).toBe('IQR × 1.5, both tails');
    expect(tables[0].rows[0][3]).toBe('— to 90');
    expect(tables[0].rows[0][4]).toBe('0');
    expect(tables[0].rows[0][5]).toBe('Unavailable');
    expect(tables[0].rows[0][6]).toBe('0');
    expect(tables[0].rows[0][7]).toBe('0.0%');
  });

  it('exports the outlier report with separate exact bounds and share', () => {
    const tables = AlgorithmTableRegistry['outlier_report']({
      featurewise: [
        {
          variable: 'age',
          dataset: 'ds1',
          data: {
            strategy: 'gaussian', tail: 'both', fold: 3,
            lower_bound: 12.345678, upper_bound: 90.123456,
            lower_outlier_count: 2, upper_outlier_count: 7, total_outlier_count: 9, total_outlier_percentage: 8.91734,
          },
        },
      ],
    });

    expect(tables[0].rows[0][3]).toBe('12.346 to 90.123');
    const exported = exportTable(tables[0]);
    expect(exported.columns).toEqual(['Variable', 'Dataset', 'Rule', 'Lower bound', 'Upper bound', 'Below', 'Above', 'Outliers', 'Share (%)']);
    expect(exported.rows[0]).toEqual(['age', 'ds1', 'Mean ± SD × 3, both tails', 12.345678, 90.123456, 2, 7, 9, 8.91734]);
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

  it('formats paired t-test metrics with three digits', () => {
    const tables = AlgorithmTableRegistry['ttest_paired']({
      t_stat: 3.888283695725533,
      df: 12,
      p: 1.017999869046271e-4,
      mean_diff: 0.06754973386270802,
      se_diff: 0.01737263511326778,
      ci_upper: 0.10160479913374154,
      ci_lower: 0.033494668591674485,
    });

    const rows = shown(tables[0].rows);
    expect(rows).toContainEqual(['T-statistic', '3.888']);
    expect(rows).toContainEqual(['Degrees of Freedom', '12.000']);
    expect(rows).toContainEqual(['p-value', '< 0.001']);
    expect(rows).toContainEqual(['Mean Difference', '0.068']);
    expect(exportTable(tables[0]).rows).toContainEqual(['p-value', 1.017999869046271e-4]);
  });

  it('renders classical Cox regression coefficients and summary', () => {
    const tables = AlgorithmTableRegistry['cox_regression_classical']({
      dependent_var: 'Days to follow-up',
      event_var: 'Death',
      indep_vars: ['Intercept', 'Age'],
      summary: {
        n_obs: 200,
        n_events: 80,
        n_covariates: 1,
        n_unique_event_times: 45,
        coefficients: [0.1, -0.3],
        hazard_ratios: [1.105, 0.741],
        std_err: [0.05, 0.1],
        lower_ci: [0.002, -0.496],
        upper_ci: [0.198, -0.104],
        hr_lower_ci: [1.002, 0.609],
        hr_upper_ci: [1.219, 0.901],
        z_scores: [2, -3],
        pvalues: [0.045, 0.002],
        df_model: 1,
        df_resid: 198,
        ll: -120.5,
        ties: 'breslow',
        n_iter: 6,
        converged: true,
        score_norm: 0.001,
        step_norm: 0.02,
        method: 'classical_cox_partial_likelihood',
      },
    });

    expect(tables.length).toBe(2);
    expect(tables[0].title).toBe('Factor estimates (table)');
    expect(tables[0].columns).toEqual(['Factor', 'Hazard ratio', '95% CI', 'p-value']);
    expect(tables[0].rows.length).toBe(1);
    expect(tables[0].rows[0][0]).toBe('Age');
    expect(tables[0].rows[0][1]).toBe('0.741');
    expect(cellText(tables[0].rows[0][3])).toBe('0.002');
    expect(exportTable(tables[0]).rows[0][3]).toBe(0.002);
    expect(tables[1].rows).toContainEqual(['Follow-up time', 'Days to follow-up']);
    expect(tables[1].rows).toContainEqual(['Event indicator', 'Death']);
    expect(tables[1].rows).toContainEqual(['Tied events handling', 'breslow']);
    expect(tables[1].rows).toContainEqual(['Model converged', 'Yes']);
  });

  it('renders stacked Cox regression summary metrics', () => {
    const tables = AlgorithmTableRegistry['cox_regression_stacked']({
      dependent_var: 'Follow-up time',
      event_var: 'Diagnosis',
      indep_vars: ['Intercept', 'Gender[Male]'],
      summary: {
        n_obs: 150,
        n_events: 60,
        n_stacked_rows: 900,
        n_covariates: 1,
        coefficients: [0.2, 0.4],
        hazard_ratios: [1.221, 1.492],
        std_err: [0.08, 0.12],
        lower_ci: [0.04, 0.16],
        upper_ci: [0.36, 0.64],
        hr_lower_ci: [1.041, 1.174],
        hr_upper_ci: [1.433, 1.896],
        z_scores: [2.5, 3.3],
        pvalues: [0.01, 0.001],
        df_model: 1,
        df_resid: 148,
        ll: -95,
        ll0: -110,
        r_squared_cs: 0.12,
        r_squared_mcf: 0.09,
        aic: 194,
        bic: 205,
        time_grid_strategy: 'distinct_event_times',
        n_time_bins_used: 40,
        method: 'stacked_cox',
      },
    });

    expect(tables.length).toBe(2);
    expect(tables[0].rows.length).toBe(1);
    expect(tables[0].rows[0][0]).toBe('Gender[Male]');
    expect(tables[1].rows).toContainEqual(['Analysis rows', '900']);
    expect(tables[1].rows).toContainEqual(['AIC', '194']);
  });

  it('renders LMM fixed effects and model summary', () => {
    const tables = AlgorithmTableRegistry['lmm']({
      dependent_var: 'Right hippocampus',
      grouping_var: 'Dataset',
      indep_vars: ['Intercept', 'Age'],
      coefficients: [1.2, -0.4],
      std_err: [0.1, 0.05],
      t_stats: [12, -8],
      pvalue_label: 'P(>|t|)',
      pvalues: [0.0001, 0.002],
      pvalues_display: ['<0.001', '0.002'],
      lower_ci: [1.0, -0.5],
      upper_ci: [1.4, -0.3],
      n_obs: 100,
      n_groups: 3,
      df_model: 2,
      df_resid: 97,
      sigma2: 0.8,
      sigma_u2: 0.2,
      ll_reml: -120,
      aic: 250,
      bic: 260,
      converged: true,
      n_iter: 8,
    });

    expect(tables.length).toBeGreaterThan(1);
    expect(tables[0].title).toBe('Fixed Effects');
    expect(tables[0].columns).toContain('P(>|t|)');
    expect(tables[0].rows[0][0]).toBe('Intercept');
    expect(tables[0].rows[0][4]).toBe('<0.001');
    expect(tables[0].rows[1][4]).toBe('0.002');
    expect(tables.some(table => table.title === 'Model Summary')).toBe(true);
  });

  it('falls back to formatted LMM p-values when display values are absent', () => {
    const tables = AlgorithmTableRegistry['lmm']({
      dependent_var: 'age',
      grouping_var: 'dataset',
      indep_vars: ['Intercept'],
      coefficients: [1],
      std_err: [0.1],
      t_stats: [10],
      pvalues: [0.045],
      lower_ci: [0.8],
      upper_ci: [1.2],
      n_obs: 50,
      n_groups: 2,
      df_model: 1,
      df_resid: 48,
      sigma2: 1,
      sigma_u2: 0.1,
      ll_reml: -60,
      aic: 120,
      bic: 125,
      converged: true,
      n_iter: 5,
    } as any);

    expect(tables[0].rows[0][4]).toBe('0.045');
  });

  it('renders binary and ordinal GLMM result contracts', () => {
    const binary = AlgorithmTableRegistry['glmm_binary']({
      dependent_var: 'Gender',
      grouping_var: 'Dataset',
      indep_vars: ['Intercept', 'Age'],
      coefficients: [0.3, -0.2],
      n_obs: 100,
      n_groups: 3,
      sigma_u2: 0.4,
      converged: true,
    });

    const ordinal = AlgorithmTableRegistry['glmm_ordinal']({
      dependent_var: 'Age group',
      grouping_var: 'Dataset',
      indep_vars: ['Intercept', 'Gender[Male]'],
      coefficients: [0.5, 0.1],
      category_order: ['Under 50', '50-59', '60-69'],
      cutpoints: [-1.2, 0.8],
      n_obs: 90,
      n_groups: 3,
      sigma_u2: 0.3,
      converged: true,
    });

    expect(binary.some(table => table.title === 'Fixed Effects')).toBe(true);
    expect(ordinal.some(table => table.title === 'Ordinal Category Order')).toBe(true);
    expect(ordinal.some(table => table.title === 'Cutpoints')).toBe(true);
  });

  it('renders chi-squared and fisher exact tables', () => {
    const chiSquared = AlgorithmTableRegistry['chi_squared']({
      chi2: 3.14,
      p_value: 0.04,
      dof: 1,
      expected: [[5.5, 4.5], [3.5, 6.5]],
      x_labels: ['AD', 'Other'],
      y_labels: ['Female', 'Male'],
    });

    const fisher = AlgorithmTableRegistry['fisher_exact']({
      odds_ratio: 1.48,
      p_value: 0.56,
      x_labels: ['no', 'yes'],
      y_labels: ['no', 'yes'],
      __xVar__: 'intra_arterial_urokinase',
      __yVar__: 'aspiration',
      __labelMap__: {
        intra_arterial_urokinase: 'Intra-arterial urokinase',
        aspiration: 'Aspiration',
      },
    });

    expect(chiSquared.some(table => table.title === 'Expected Frequencies')).toBe(true);
    expect(chiSquared.some(table => table.title === 'Contingency Table Categories')).toBe(true);
    expect(fisher.some(table => table.title === "Fisher's Exact Test Summary")).toBe(true);

    const fisherCategories = fisher.find(table => table.title === 'Contingency Table Categories');
    expect(fisherCategories?.columns).toEqual(['Role', 'Variable', 'Categories']);
    expect(fisherCategories?.rows).toEqual([
      ['Factor', 'Intra-arterial urokinase', 'no, yes'],
      ['Outcome', 'Aspiration', 'no, yes'],
    ]);
  });

  it('renders kmeans summary, centers, profiles, and notes', () => {
    const tables = AlgorithmTableRegistry['kmeans']({
      title: 'K-Means',
      variables: ['a', 'b'],
      k_selection: 'manual',
      selected_k: 2,
      initialization_method: 'k-means++',
      n_init: 10,
      n_obs_interval: '100-200',
      center_definition: 'Centers are cluster means.',
      intended_use: ['u1'],
      privacy_note: 'Cluster values are binned.',
      clusters: [
        {
          cluster_id: '0',
          label: 'Cluster 0',
          size_interval: '10-20',
          center: { a: 1, b: 2 },
          profile: ['p0'],
          interpretation: 'i0',
          quality: { compactness: null },
        },
        {
          cluster_id: '1',
          label: 'Cluster 1',
          size_interval: '20-30',
          center: { a: 3, b: 4 },
          profile: ['p1'],
          interpretation: 'i1',
          quality: { compactness: 'high' },
        },
      ],
      elbow: null,
      converged: true,
      n_iter: 5,
      warnings: ['w1'],
      limitations: ['l1'],
    });

    expect(tables.map(table => table.title)).toEqual([
      'K-Means Summary',
      'Cluster Centers',
      'Cluster Profiles',
      'Notes',
    ]);
    expect(tables[1].columns).toEqual(['Cluster', 'Size', 'a', 'b']);
    expect(tables[2].columns).toEqual(['Cluster', 'Compactness', 'Profile']);
    expect(tables[0].rows).toContainEqual(['Observations', '100-200']);
    expect(tables[3].rows).toContainEqual(['Warning', 'w1']);
    expect(tables[3].rows).toContainEqual(['Limitation', 'l1']);
  });

  it('returns no kmeans tables without clusters', () => {
    expect(AlgorithmTableRegistry['kmeans']({ clusters: [] })).toEqual([]);
  });

  it('formats every table p-value APA style and marks the Tukey clip bounds', () => {
    const anova = AlgorithmTableRegistry['anova_oneway']({
      anova_table: { df_explained: 1, df_residual: 98, ss_explained: 10, ss_residual: 90, ms_explained: 10, ms_residual: 0.9, f_stat: 10.9, p_value: 1.1102230246251565e-16 },
      tuckey_test: [{ groupA: 'a', groupB: 'b', meanA: 1, meanB: 2, diff: -1, se: 0.1, t_stat: -10, p_tuckey: 0.001 }],
      min_max_per_group: { categories: [], min: [], max: [] },
    } as any);

    expect(cellText(anova[0].rows[0][5])).toBe('< 0.001');
    expect(cellText(anova[1].rows[0][7])).toBe('≤ 0.001');
    expect(exportTable(anova[0]).rows[0][5]).toBe(1.1102230246251565e-16);
    expect(exportTable(anova[1]).rows[0][7]).toBe(0.001);
  });

  it('trims covered columns and rows, and drops a table with nothing left', () => {
    const table = { title: 'T', columns: ['Source', 'df', 'Sum Sq', 'F'], rows: [['A', 1, 10, 5], ['Residual', 98, 90, ''], ['average', 0, 0, 0]] };

    expect(trimTable(table, { title: 'T', columns: ['df', 'F'], rows: ['average'] })).toEqual({
      title: 'T', columns: ['Source', 'Sum Sq'], rows: [['A', 10], ['Residual', 90]],
    });
    expect(trimTable(table, { title: 'T' })).toBeNull();
    expect(trimTable(table, { title: 'T', columns: ['df', 'Sum Sq', 'F'] })).toBeNull();
  });
});
