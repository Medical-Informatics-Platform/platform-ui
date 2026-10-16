import { chiSquarePValue, formatPValue, formatRatio, ratioDigits } from '../result-format';
import { buildRegressionView } from './regression-view';

describe('result-format', () => {
  it('matches χ² upper-tail reference values', () => {
    expect(chiSquarePValue(3.841459, 1)).toBeCloseTo(0.05, 6);
    expect(chiSquarePValue(2, 2)).toBeCloseTo(Math.exp(-1), 10);
    expect(chiSquarePValue(18.307038, 10)).toBeCloseTo(0.05, 6);
    // df = 4 has a closed form: e^(-x/2) * (1 + x/2).
    expect(chiSquarePValue(0.5, 4)).toBeCloseTo(Math.exp(-0.25) * 1.25, 10);
    expect(chiSquarePValue(10948.8, 7)).toBe(0);
    expect(chiSquarePValue(0, 3)).toBe(1);
  });

  it('formats p-values APA style and ratios at 3 significant digits', () => {
    expect(formatPValue(1.1102230246251565e-16)).toBe('< 0.001');
    expect(formatPValue(0.8119)).toBe('0.812');
    expect(formatRatio(0.98999)).toBe('0.990');
    expect(formatRatio(903.51)).toBe('904');
    expect(formatRatio(1163.4)).toBe('1\u202f163');
    expect(ratioDigits(1.03513, 1.03648)).toBe(4);
    expect(ratioDigits(1.49, 1.75)).toBe(3);
  });
});

describe('buildRegressionView', () => {
  const logistic = {
    dependent_var: '3m mRS good outcome',
    indep_vars: ['Intercept', 'IVT[yes]', 'Age'],
    summary: {
      n_obs: 27308,
      coefficients: [7.0586, 0.4794, -0.063],
      stderr: [0.1287, 0.0405, 0.0016],
      lower_ci: [6.8063, 0.4, -0.0662],
      upper_ci: [7.311, 0.5587, -0.0599],
      z_scores: [54.82, 11.84, -39.52],
      pvalues: [0, 2.3e-32, 0],
      df_model: 2,
      df_resid: 27305,
      r_squared_cs: 0.33,
      r_squared_mcf: 0.3327,
      ll0: -16452.2,
      ll: -10977.8,
      aic: 21971.6,
      bic: 22037.3,
    },
  };

  it('reports logistic coefficients as odds ratios, sorted by log-odds size', () => {
    const view = buildRegressionView('logistic_regression', logistic, null)!;

    expect(view.estimateLabel).toBe('Odds ratio');
    expect(view.nullValue).toBe(1);
    // Key columns read like a model printout; the odds ratio, its CI and the sketch wait for all columns.
    expect(view.coefficientLabel).toBe('Estimate');
    expect(view.keyColumns).toEqual(['coefficient', 'stdErr', 'stat', 'p']);
    expect(view.allColumns).toEqual(['coefficient', 'stdErr', 'stat', 'estimate', 'ci', 'interval', 'p']);
    expect(view.rows.map((row) => row.variable)).toEqual(['IVT[yes]', 'Age', 'Intercept']);
    const ivt = view.rows[0];
    expect([ivt.term, ivt.level]).toEqual(['IVT', 'yes']);
    expect(view.rows[1].level).toBeNull();
    expect(ivt.estimate).toBeCloseTo(Math.exp(0.4794), 10);
    expect(ivt.coefficient).toBe(0.4794);
    expect(ivt.ciText).toBe('1.49 to 1.75');
    // Plot sits on the log-odds scale: a positive coefficient lands right of the null line.
    expect(ivt.markerLeft).toBeGreaterThan(50);
    expect(view.rows[1].markerLeft).toBeLessThan(50);
  });

  it('reads created-column dummy codes as words', () => {
    const view = buildRegressionView('linear_regression', {
      indep_vars: ['Intercept', 'kmeans_cluster[cluster_2]', 'stroke_territory_cohort[PCS]'],
      coefficients: [80, -46, 1],
    }, null)!;

    expect(view.rows.map((row) => [row.term, row.level])).toEqual([
      ['K-means cluster', 'Cluster 2'],
      ['Stroke territory cohort', 'PCS'],
      ['Intercept', null],
    ]);
  });

  it('names the positive class in the logistic subtitle when the run gives it', () => {
    expect(buildRegressionView('logistic_regression', logistic, null, 'yes')!.subtitle)
      .toBe('Effect on the odds that 3m mRS good outcome is yes, other predictors held constant');
    expect(buildRegressionView('logistic_regression', logistic, null)!.subtitle)
      .toBe('Effect on the odds of 3m mRS good outcome, other predictors held constant');
  });

  it('derives the model likelihood-ratio test from ll and ll0', () => {
    const view = buildRegressionView('logistic_regression', logistic, null)!;
    const test = view.figures.find((figure) => figure.label === 'Model LR test')!;

    expect(test.value).toBe('< 0.001');
    expect(test.note).toBe('χ²(2) = 10\u202f949');
    expect(view.fitMetrics.map((metric) => metric.label)).toContain('Null log-likelihood');
  });

  it('summarises a linear mixed model with the ICC from its variance components', () => {
    const view = buildRegressionView('lmm', {
      dependent_var: '3m mRS',
      grouping_var: ['Unit'],
      indep_vars: ['Intercept', 'Age'],
      n_obs: 1000,
      n_groups: 14,
      coefficients: [-1.1, 0.031],
      std_err: [0.08, 0.0003],
      t_stats: [-13.5, 101.8],
      pvalues: [1e-41, 0],
      lower_ci: [-1.27, 0.0305],
      upper_ci: [-0.95, 0.0317],
      sigma2: 3,
      sigma_u2: 1,
      converged: true,
    }, null)!;

    expect(view.estimateLabel).toBe('Estimate');
    expect(view.keyColumns).toEqual(['estimate', 'stdErr', 'interval', 'p']);
    expect(view.figures[0]).toEqual({ label: 'ICC', value: '0.250', note: '25.0% of the variance lies between groups' });
    expect(view.figures.some((figure) => figure.label === 'Converged')).toBe(false);
  });

  it('reports a binary GLMM as odds ratios and leads with non-convergence', () => {
    const view = buildRegressionView('glmm_binary', {
      dependent_var: 'Good outcome',
      grouping_var: 'Unit',
      indep_vars: ['Intercept', 'Age'],
      coefficients: [5.36, -0.0616],
      z_stats: [121.4, -111.1],
      pvalues: [0, 0],
      lower_ci: [5.27, -0.0627],
      upper_ci: [5.44, -0.0605],
      sigma_u2: Math.PI * Math.PI / 3,
      converged: false,
      n_iter: 50,
    }, null)!;

    expect(view.estimateLabel).toBe('Odds ratio');
    expect(view.figures[0].label).toBe('Converged');
    expect(view.figures[0].note).toBe('Stopped after 50 iterations; treat estimates with caution');
    // Latent-scale ICC: σu² / (σu² + π²/3).
    expect(view.figures[1].value).toBe('0.500');
  });

  it('reads the ordinal GLMM as odds of a higher category and lists its order and cutpoints', () => {
    const view = buildRegressionView('glmm_ordinal', {
      dependent_var: '3m mRS',
      grouping_var: ['Unit'],
      indep_vars: ['Intercept', 'Age'],
      category_order: ['0.0', '1.0', '2.0'],
      coefficients: [-2.39, 0.0352],
      z_stats: [-23.2, 105.7],
      pvalues: [1e-119, 0],
      lower_ci: [-2.59, 0.0345],
      upper_ci: [-2.19, 0.0358],
      cutpoints: [0, 1.1058],
      sigma_u2: 0.1377,
      converged: true,
    }, null)!;

    expect(view.estimateLabel).toBe('Odds ratio');
    expect(view.subtitle).toContain('odds of a higher 3m mRS category');
    const fit = Object.fromEntries(view.fitMetrics.map((metric) => [metric.label, metric.value]));
    expect(fit['Category order']).toBe('0 < 1 < 2');
    expect(fit['Cutpoints']).toBe('0.000, 1.11');
  });

  it('reports Cox hazard ratios and leads with events per covariate', () => {
    const view = buildRegressionView('cox_regression_classical', {
      dependent_var: 'Days to follow-up',
      event_var: 'Death',
      indep_vars: ['Sex[female]', 'Age'],
      summary: {
        n_obs: 582, n_events: 18, n_covariates: 3, converged: true,
        coefficients: [0.154, 0.0387], std_err: [0.283, 0.0133], z_scores: [0.54, 2.91], pvalues: [0.586, 0.0037],
        lower_ci: [-0.401, 0.0126], upper_ci: [0.709, 0.0647],
      },
    }, null)!;

    expect(view.estimateLabel).toBe('Hazard ratio');
    expect(view.rows.map((row) => row.term)).toEqual(['Sex', 'Age']);
    expect(view.rows[0].estimate).toBeCloseTo(Math.exp(0.154), 10);
    const figures = Object.fromEntries(view.figures.map((figure) => [figure.label, figure]));
    expect(figures['Events'].note).toBe('3.1% of 582 participants');
    expect(figures['Events per covariate'].note).toBe('Below the usual 10; estimates may be unstable');
    const fit = Object.fromEntries(view.fitMetrics.map((metric) => [metric.label, metric.value]));
    expect(fit['Follow-up time']).toBe('Days to follow-up');
    expect(fit['Event indicator']).toBe('Death');
  });

  it('returns null for algorithms without a coefficient view or incomplete payloads', () => {
    expect(buildRegressionView('kmeans', logistic, null)).toBeNull();
    expect(buildRegressionView('logistic_regression', { indep_vars: ['Intercept'] }, null)).toBeNull();
  });
});
