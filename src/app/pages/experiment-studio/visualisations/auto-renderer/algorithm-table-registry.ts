import {
  AnovaResult, AnovaTwoWayResult, TTestResult,
  LinearRegressionResult, LinearRegressionCVResult,
  LogisticRegressionResult, CVLogisticRegressionResult,
  NaiveBayesGaussianResult, NaiveBayesCategoricalResult, NaiveBayesCVResult,
  KMeansResult, PCAResult, PearsonResult,
  HistogramResult, DescriptiveStatsResult,
  VariableStats, NominalDescriptiveStats, NumericalDescriptiveStats
} from '../../../../models/algorithm-results.model';
import { getFeaturewiseDescribeRows } from '../../../../core/describe-result.utils';

export interface TableSpec {
  title?: string;
  columns: string[];
  rows: any[][];
  layout?: 'compact' | 'full';
}

export type TableBuilder = (result: any) => TableSpec[];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDecimal(value: any): string {
  if (typeof value !== 'number' || isNaN(value)) return value ?? '';

  const abs = Math.abs(value);
  if (abs === 0) return '0';

  // Too small or too big numbers -> scientific
  if (abs < 1e-4 || abs >= 1_000_000) {
    return value.toExponential(3);
  }

  const decimals = abs < 1 ? 4 : 3;
  let formatted = value.toFixed(decimals);

  formatted = formatted
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '');

  if (formatted === '-0') formatted = '0';

  return formatted;
}

function formatTTestKey(key: string): string {
  const map: Record<string, string> = {
    mean_diff: 'Mean Difference',
    se_diff: 'Std. Error of Difference',
    se_difference: 'Std. Error of Difference',
    std_err_diff: 'Std. Error of Difference',
    ci_upper: '95% CI Upper',
    ci_lower: '95% CI Lower',
    t_stat: 'T-statistic',
    p: 'p-value',
    p_value: 'p-value',
    df: 'Degrees of Freedom',
    dof: 'Degrees of Freedom',
    cohens_d: "Cohen's d",
    cohen_d: "Cohen's d",
  };
  if (map[key]) return map[key];

  // Fallback for unknown keys
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildTTestRows(result: Record<string, any>): any[][] {
  const ignoredKeys = new Set([
    'title',
    'labelMap',
    'enumMaps',
    'yVar',
    'xVar',
    '__labelMap__',
    '__enumMaps__',
    '__yVar__',
    '__xVar__',
  ]);

  return Object.entries(result)
    .filter(([key, value]) => {
      if (ignoredKeys.has(key) || key.startsWith('__')) return false;
      if (Array.isArray(value)) return false;
      if (value !== null && typeof value === 'object') return false;
      return true;
    })
    .map(([k, v]) => [formatTTestKey(k), formatDecimal(v)]);
}

export const AlgorithmTableRegistry: Record<string, TableBuilder> = {
  kmeans: (result: KMeansResult) => {
    const centers = result?.centers;
    if (!Array.isArray(centers) || centers.length === 0) return [];
    const dims = centers[0]?.length || 0;
    const columns = [...Array(dims)].map((_, i) => ['x', 'y', 'z'][i] || `dim${i + 1}`);
    const rows = centers.map((row: number[]) => row.map(v => Number(v.toFixed(3))));
    return [{ title: 'K-Means Centers', columns, rows }];
  },

  linear_regression: (result: LinearRegressionResult) => {
    if (!result) return [];

    const indepVars = result.indep_vars || [];
    const coefficients = result.coefficients || [];
    const stdErr = result.std_err || [];
    const tStats = result.t_stats || [];
    const pValues = result.pvalues || [];
    const lowerCi = result.lower_ci || [];
    const upperCi = result.upper_ci || [];

    if (indepVars.length && coefficients.length) {
      const coefRows = indepVars.map((variable, idx) => [
        variable,
        formatDecimal(coefficients[idx]),
        formatDecimal(stdErr[idx]),
        formatDecimal(tStats[idx]),
        formatDecimal(pValues[idx]),
        formatDecimal(lowerCi[idx]),
        formatDecimal(upperCi[idx]),
      ]);

      const infoKeys: Array<keyof LinearRegressionResult> = [
        'dependent_var',
        'n_obs',
        'df_model',
        'df_resid',
        'r_squared',
        'r_squared_adjusted',
        'f_stat',
        'f_pvalue',
        'rse',
        'll',
        'aic',
        'bic',
      ];

      const labelMap: Record<string, string> = {
        dependent_var: 'Dependent variable',
        n_obs: 'Observations',
        df_model: 'Degrees of Freedom (Model)',
        df_resid: 'Degrees of Freedom (Residual)',
        r_squared: 'R² Score',
        r_squared_adjusted: 'Adjusted R²',
        f_stat: 'F-statistic',
        f_pvalue: 'p-value (F-stat)',
        rse: 'Residual Std. Error',
        ll: 'Log-likelihood',
        aic: 'AIC',
        bic: 'BIC'
      };

      const infoRows = infoKeys
        .filter((key) => result[key] !== undefined && result[key] !== null)
        .map((key) => [labelMap[key] || key, formatDecimal(result[key])]);

      return [
        {
          title: 'Coefficients',
          columns: ['Independent variables', 'Coefficients', 'Std.Err.', 't-stats', 'P(>|t|)', 'Lower 95% c.i.', 'Upper 95% c.i.'],
          rows: coefRows,
        },
        {
          title: 'Model Summary',
          columns: ['Name', 'Value'],
          rows: infoRows,
          layout: 'full',
        },
      ];
    }
    return [];
  },

  linear_regression_cv: (result: LinearRegressionCVResult) => {
    if (!result) return [];

    // Training set sample sizes
    const nObs = result.n_obs;
    const sampleSizeRows = Array.isArray(nObs)
      ? nObs.map((val: number, i: number) => [`Fold ${i + 1}`, val])
      : [];

    const normalizeStat = (value: any): { mean: number | null; std: number | null } => {
      if (!value) return { mean: null, std: null };
      if (Array.isArray(value)) {
        return {
          mean: typeof value[0] === 'number' && !isNaN(value[0]) ? value[0] : null,
          std: typeof value[1] === 'number' && !isNaN(value[1]) ? value[1] : null
        };
      }
      if (typeof value === 'object') {
        const mean = typeof value.mean === 'number' && !isNaN(value.mean) ? value.mean : null;
        const std = typeof value.std === 'number' && !isNaN(value.std) ? value.std : null;
        return { mean, std };
      }
      return { mean: null, std: null };
    };

    const candidates: Array<{ label: string; stat: { mean: number | null; std: number | null } }> = [
      { label: 'Root mean squared error', stat: normalizeStat((result as any).mean_sq_error) },
      { label: 'R-squared', stat: normalizeStat((result as any).r_squared) },
      { label: 'Mean absolute error', stat: normalizeStat((result as any).mean_abs_error) },
      { label: 'F-statistic', stat: normalizeStat((result as any).f_stat) },
    ];

    const statsRows = candidates
      .filter(({ stat }) => stat.mean !== null || stat.std !== null)
      .map(({ label, stat }) => [label, stat.mean ?? '', stat.std ?? '']);

    return [
      {
        title: 'Training set sample sizes',
        columns: ['Fold', 'Training Set Sample Sizes'],
        rows: sampleSizeRows,
      },
      {
        title: 'Error metrics',
        columns: ['Metric', 'Mean', 'Standard Deviation'],
        rows: statsRows,
      }
    ];
  },

  naive_bayes_gaussian: (result: NaiveBayesGaussianResult & { __labelMap__?: Record<string, string>, __enumMaps__?: any, __yVar__?: string }) => {
    if (!result) return [];

    // Extract metadata
    const labelMap = result.__labelMap__ || {};
    const enumMaps = result.__enumMaps__ || {};
    const yVar = result.__yVar__;

    // Helpers
    const getLabel = (code: string) => labelMap[code] || code;
    const getEnumLabel = (varCode: string, val: string) => enumMaps[varCode]?.[val] ?? val;

    const tables: TableSpec[] = [];

    const rawClasses = result.classes || [];
    const rawFeatureNames = result.feature_names || [];

    // Map labels
    const classLabels = rawClasses.map(c => yVar ? getEnumLabel(yVar, String(c)) : String(c));
    const featureLabels = rawFeatureNames.map(f => getLabel(f));

    // Class summary
    if (rawClasses.length > 0) {
      tables.push({
        title: 'Class Summary',
        columns: ['Class', 'Count', 'Prior'],
        rows: rawClasses.map((cls, i) => [
          classLabels[i],
          formatDecimal(result.class_count?.[i]),
          formatDecimal(result.class_prior?.[i]),
        ]),
        layout: 'full',
      });
    }

    // Theta (Means)
    if (result.theta && result.theta.length > 0) {
      const columns = ['Class', ...featureLabels];
      const rows = result.theta.map((row, i) => [
        classLabels[i] ?? `Class ${i}`,
        ...row.map((v) => formatDecimal(v)),
      ]);
      tables.push({ title: 'Feature Means per Class (θ)', columns, rows, layout: 'full' });
    }

    // Variance
    if (result.var && result.var.length > 0) {
      const columns = ['Class', ...featureLabels];
      const rows = result.var.map((row, i) => [
        classLabels[i] ?? `Class ${i}`,
        ...row.map((v) => formatDecimal(v)),
      ]);
      tables.push({ title: 'Feature Variances per Class (σ²)', columns, rows, layout: 'full' });
    }

    return tables;
  },

  naive_bayes_gaussian_cv: (result: NaiveBayesCVResult) => {
    const summary = result?.classification_summary;
    if (!summary) return [];

    const metrics = ['accuracy', 'precision', 'recall', 'fscore'] as const;
    if (!summary.accuracy) return [];

    const classes = Object.keys(summary.accuracy);
    if (!classes.length) return [];

    const folds = Object.keys(summary.accuracy[classes[0]]).filter(k => k !== 'average' && k !== 'stdev');

    const rows = [...folds, 'average', 'stdev'].map(fold => {
      const row: any[] = [fold];
      for (const metric of metrics) {
        for (const cls of classes) {
          row.push(formatDecimal(summary[metric][cls]?.[fold]));
        }
      }
      const nObsVal = summary.n_obs?.[fold] ?? 0;
      row.push(formatDecimal(nObsVal));
      return row;
    });

    const columns = ['Fold'];
    for (const metric of metrics) {
      for (const cls of classes) {
        const name = `${capitalize(metric)} (${cls})`;
        columns.push(name);
      }
    }
    columns.push('Number of observations');

    const tables: TableSpec[] = [
      {
        title: 'Classification Metrics per Fold',
        columns,
        rows,
        layout: 'full'
      }
    ];

    if (result.confusion_matrix) {
      tables.push({
        title: 'Confusion Matrix (Combined)',
        columns: ['Actual \\ Predicted', ...result.confusion_matrix.labels],
        rows: result.confusion_matrix.data.map((row, i) => [
          result.confusion_matrix.labels[i],
          ...row.map(v => formatDecimal(v))
        ])
      });
    }

    return tables;
  },

  logistic_regression: (result: LogisticRegressionResult) => {
    if (!result) return [];

    const s = result.summary;
    const coefRows = result.indep_vars.map((v, i) => [
      v,
      formatDecimal(s.coefficients[i]),
      formatDecimal(s.stderr[i]),
      formatDecimal(s.z_scores[i]),
      formatDecimal(s.pvalues[i]),
      formatDecimal(s.lower_ci[i]),
      formatDecimal(s.upper_ci[i]),
    ]);

    const modelInfoRows = [
      ['Dependent Variable', result.dependent_var],
      ['Observations', formatDecimal(s.n_obs)],
      ['DF Model', formatDecimal(s.df_model)],
      ['DF Residual', formatDecimal(s.df_resid)],
      ['AIC', formatDecimal(s.aic)],
      ['BIC', formatDecimal(s.bic)],
      ['Log Likelihood', formatDecimal(s.ll)],
      ['Pseudo R-squared (CS)', formatDecimal(s.r_squared_cs)],
      ['Pseudo R-squared (McF)', formatDecimal(s.r_squared_mcf)],
    ];

    return [
      {
        title: 'Logistic Regression Coefficients',
        columns: ['Variable', 'Coefficient', 'Std.Err.', 'z', 'P(>|z|)', 'Lower 95% CI', 'Upper 95% CI'],
        rows: coefRows,
      },
      {
        title: 'Model Summary',
        columns: ['Metric', 'Value'],
        rows: modelInfoRows,
        layout: 'full',
      },
    ];
  },

  logistic_regression_cv: (result: CVLogisticRegressionResult) => {
    if (!result) return [];
    const s = result.summary;

    const n = s.n_obs.length;
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push([
        s.row_names[i],
        formatDecimal(s.n_obs[i]),
        formatDecimal(s.accuracy[i]),
        formatDecimal(s.precision[i]),
        formatDecimal(s.recall[i]),
        formatDecimal(s.fscore[i])
      ]);
    }

    return [{
      title: 'Logistic Regression CV Summary',
      columns: ['Fold', 'Observations', 'Accuracy', 'Precision', 'Recall', 'F-Score'],
      rows
    }];
  },

  naive_bayes_categorical: (result: NaiveBayesCategoricalResult & { __labelMap__?: Record<string, string>, __enumMaps__?: any, __yVar__?: string }) => {
    if (!result) return [];
    const tables: TableSpec[] = [];

    // Extract metadata injected by AutoRenderer
    const labelMap = result.__labelMap__ || {};
    const enumMaps = result.__enumMaps__ || {};
    const yVar = result.__yVar__;

    // Helpers
    const getLabel = (code: string) => labelMap[code] || code;
    const getEnumLabel = (varCode: string, val: string) => enumMaps[varCode]?.[val] ?? val;

    const rawClasses = result.classes;
    // Map class codes to labels
    const classLabels = rawClasses.map(c => yVar ? getEnumLabel(yVar, String(c)) : String(c));

    // Class summary
    if (rawClasses.length > 0) {
      tables.push({
        title: 'Class Summary',
        columns: ['Class', 'Count', 'Log Prior'],
        rows: rawClasses.map((cls, i) => [
          classLabels[i],
          formatDecimal(result.class_count[i]),
          formatDecimal(result.class_log_prior[i]),
        ]),
        layout: 'full',
      });
    }

    // Category tables
    for (const feature of result.feature_names) {
      const counts = result.category_count[feature];
      const logProbs = result.category_log_prob[feature];
      const categories = result.categories[feature];

      const featureLabel = getLabel(feature);

      if (!counts || !categories) continue;

      const numCats = categories.length;
      const countRows = [];
      const logProbRows = [];

      for (let c = 0; c < numCats; c++) {
        const catVal = String(categories[c]);
        const catLabel = getEnumLabel(feature, catVal);

        const countRow = [catLabel];
        const logRow = [catLabel];

        for (let i = 0; i < rawClasses.length; i++) {
          countRow.push(formatDecimal(counts[i][c]));
          if (logProbs) logRow.push(formatDecimal(logProbs[i][c]));
        }
        countRows.push(countRow);
        logProbRows.push(logRow);
      }

      const colHeaders = ['Category', ...classLabels];

      tables.push({
        title: `Category Counts: ${featureLabel}`,
        columns: colHeaders,
        rows: countRows,
        layout: 'full'
      });

      if (logProbs) {
        tables.push({
          title: `Category Log Probabilities: ${featureLabel}`,
          columns: colHeaders,
          rows: logProbRows,
          layout: 'full'
        });
      }
    }

    return tables;
  },

  naive_bayes_categorical_cv: (result: NaiveBayesCVResult) => {
    // Same as Gaussian CV
    return AlgorithmTableRegistry['naive_bayes_gaussian_cv'](result);
  },

  pca: (result: PCAResult) => {
    if (!result) return [];
    const tables: TableSpec[] = [];

    // Eigenvalues
    if (result.eigenvalues && result.eigenvalues.length) {
      tables.push({
        title: 'PCA Summary',
        columns: ['Component', 'Eigenvalue'],
        rows: result.eigenvalues.map((v, i) => [`PC${i + 1}`, formatDecimal(v)])
      });
    }

    return tables;
  },

  pca_with_transformation: (result: PCAResult) => {
    return AlgorithmTableRegistry['pca'](result);
  },

  describe: (result: DescriptiveStatsResult) => {
    if (!result) return [];
    const tables: TableSpec[] = [];

    const buildTables = (stats: VariableStats[], titleProp: string) => {
      const numRows: any[][] = [];
      const nomRows: any[][] = [];

      for (const stat of stats) {
        if (!stat.data) continue;
        // Check if nominal
        if ('counts' in stat.data) {
          const d = stat.data as NominalDescriptiveStats;
          const countsStr = Object.entries(d.counts).map(([k, v]) => `${k}: ${v}`).join(', ');
          nomRows.push([
            stat.variable,
            stat.dataset,
            formatDecimal(d.num_dtps),
            formatDecimal(d.num_na),
            formatDecimal(d.num_total),
            countsStr
          ]);
        } else {
          const d = stat.data as NumericalDescriptiveStats;
          numRows.push([
            stat.variable,
            stat.dataset,
            formatDecimal(d.num_dtps),
            formatDecimal(d.num_na),
            formatDecimal(d.num_total),
            formatDecimal(d.mean),
            formatDecimal(d.std),
            formatDecimal(d.min),
            formatDecimal(d.q1),
            formatDecimal(d.q2),
            formatDecimal(d.q3),
            formatDecimal(d.max)
          ]);
        }
      }

      if (numRows.length) {
        tables.push({
          title: `${titleProp} Summary — Numeric`,
          columns: ['Variable', 'Dataset', 'N', 'Missing', 'Total', 'Mean', 'Std', 'Min', 'Q1', 'Median', 'Q3', 'Max'],
          rows: numRows,
          layout: 'full'
        });
      }
      if (nomRows.length) {
        tables.push({
          title: `${titleProp} Summary — Nominal`,
          columns: ['Variable', 'Dataset', 'N', 'Missing', 'Total', 'Counts'],
          rows: nomRows,
          layout: 'full'
        });
      }
    };

    buildTables(getFeaturewiseDescribeRows(result), 'Featurewise');

    return tables;
  },

  anova_oneway: (result: AnovaResult) => {
    // Two tables: ANOVA Table and Tukey Test
    const t1: TableSpec = {
      title: 'ANOVA Summary',
      columns: ['Source', 'df', 'Sum Sq', 'Mean Sq', 'F', 'Prob>F'],
      rows: [
        ['Explained', formatDecimal(result.anova_table.df_explained), formatDecimal(result.anova_table.ss_explained), formatDecimal(result.anova_table.ms_explained), formatDecimal(result.anova_table.f_stat), formatDecimal(result.anova_table.p_value)],
        ['Residual', formatDecimal(result.anova_table.df_residual), formatDecimal(result.anova_table.ss_residual), formatDecimal(result.anova_table.ms_residual), '', '']
      ]
    };

    const tables = [t1];

    if (result.tuckey_test && result.tuckey_test.length) {
      tables.push({
        title: 'Tukey Post-hoc Test',
        columns: ['Group A', 'Group B', 'Mean A', 'Mean B', 'Diff', 'SE', 't-stat', 'p-value'],
        rows: result.tuckey_test.map(r => [
          r.groupA, r.groupB,
          formatDecimal(r.meanA), formatDecimal(r.meanB),
          formatDecimal(r.diff), formatDecimal(r.se),
          formatDecimal(r.t_stat), formatDecimal(r.p_tuckey)
        ])
      });
    }

    if (result.min_max_per_group && Array.isArray(result.min_max_per_group.categories)) {
      const categories = result.min_max_per_group.categories;
      const minValues = Array.isArray(result.min_max_per_group.min) ? result.min_max_per_group.min : [];
      const maxValues = Array.isArray(result.min_max_per_group.max) ? result.min_max_per_group.max : [];
      const rows = categories.map((category, index) => [
        category,
        formatDecimal(minValues[index]),
        formatDecimal(maxValues[index])
      ]);
      tables.push({
        title: 'Group Min/Max',
        columns: ['Group', 'Min', 'Max'],
        rows
      });
    }

    return tables;
  },

  anova_twoway: (result: AnovaTwoWayResult) => {
    const rows = result.terms.map((term, i) => [
      term,
      formatDecimal(result.sum_sq[i]),
      formatDecimal(result.df[i]),
      formatDecimal(result.f_stat[i]),
      formatDecimal(result.f_pvalue[i])
    ]);

    return [{
      title: 'Two-Way ANOVA',
      columns: ['Term', 'Sum Sq', 'df', 'F', 'Prob>F'],
      rows
    }];
  },

  pearson_correlation: (result: PearsonResult) => {
    // Guide says "Correlation Heatmap" is primary.
    // We can return a small summary if needed, e.g. number of observations?
    const tables: TableSpec[] = [];
    if (typeof result.n_obs === 'number') {
      tables.push({
        title: 'Number of Observations',
        columns: ['Metric', 'Value'],
        rows: [['Number of Observations', formatDecimal(result.n_obs)]],
        layout: 'compact'
      });
    }
    return tables;
  },

  histogram: (result: HistogramResult) => {
    // Primary is chart. Table could be bin counts.
    const tables: TableSpec[] = [];
    for (const item of result.histogram) {
      const rows = [];
      for (let i = 0; i < item.counts.length; i++) {
        if (item.counts[i] === null) continue;
        rows.push([item.bins[i], item.counts[i]]);
      }
      tables.push({
        title: `Histogram Data: ${item.var}` + (item.grouping_var ? ` (${item.grouping_enum})` : ''),
        columns: ['Bin', 'Count'],
        rows
      });
    }
    return tables;
  },

  ttest_independent: (result: TTestResult) => {
    return [{
      title: 'Independent T-Test',
      columns: ['Metric', 'Value'],
      rows: buildTTestRows(result as Record<string, any>)
    }];
  },

  ttest_paired: (result: TTestResult) => {
    return [{
      title: 'Paired T-Test',
      columns: ['Metric', 'Value'],
      rows: buildTTestRows(result as Record<string, any>)
    }];
  },

  ttest_onesample: (result: TTestResult) => {
    return [{
      title: 'One-Sample T-Test',
      columns: ['Metric', 'Value'],
      rows: buildTTestRows(result as Record<string, any>)
    }];
  },

  // Legacy/Aliases
  logistic_regression_cv_fedaverage: (result) => AlgorithmTableRegistry['logistic_regression_cv'](result),
  linear_svm: (result) => {
    if (!result) return [];

    const rows: any[][] = [];
    if (result.n_obs !== undefined && result.n_obs !== null) {
      rows.push(['Observations', formatDecimal(result.n_obs)]);
    }
    if (result.intercept !== undefined && result.intercept !== null) {
      rows.push(['Intercept', formatDecimal(result.intercept)]);
    }

    if (Array.isArray(result.weights) && result.weights.length) {
      result.weights.forEach((w: any, i: number) => {
        rows.push([`Weight ${i + 1}`, formatDecimal(w)]);
      });
    }

    if (!rows.length) return [];

    return [{
      title: 'Linear SVM Summary',
      columns: ['Metric', 'Value'],
      rows,
    }];
  },

  // Default fallback
  default: () => []
};
