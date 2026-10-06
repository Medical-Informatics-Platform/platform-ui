import {
  AnovaResult, AnovaTwoWayResult, TTestResult,
  LinearRegressionResult, LinearRegressionCVResult, LMMResult,
  LogisticRegressionResult, CVLogisticRegressionResult,
  CoxRegressionResult, ClassicalCoxRegressionSummary, StackedCoxRegressionSummary,
  NaiveBayesGaussianResult, NaiveBayesCategoricalResult, NaiveBayesCVResult,
  KMeansResult, PCAResult, PearsonResult,
  HistogramResult, DescriptiveStatsResult,
  VariableStats, NominalDescriptiveStats, NumericalDescriptiveStats,
  QuartilesResult, BinnedMannWhitneyUTestResult, StandardizedMeanDifferenceResult
} from '../../../../models/algorithm-results.model';
import { getFeaturewiseDescribeRows } from '../../../../core/describe-result.utils';
import { prettifyLabel } from '../../../../core/algorithm-mappers';
import { formatPValue, readable } from '../result-format';
import { readConfusionMatrix } from '../charts/renderers/confusion-matrix-chart';

export interface TableSpec {
  title?: string;
  columns: string[];
  rows: any[][];
  layout?: 'compact' | 'full';
}

/**
 * What a summary above a result already shows of one of its tables: the whole table, or some of
 * its columns (by header) or rows (by first cell). Used on screen only; exports keep every table.
 */
export interface TableTrim {
  title: string;
  columns?: string[];
  rows?: string[];
}

/** The table without what the summary above shows; null when nothing of it is left to read. */
export function trimTable(table: TableSpec, trim: TableTrim): TableSpec | null {
  if (!trim.columns?.length && !trim.rows?.length) return null;
  const dropColumns = new Set(trim.columns ?? []);
  const dropRows = new Set(trim.rows ?? []);
  const keep = table.columns.map((_, i) => i).filter((i) => !dropColumns.has(table.columns[i]));
  const rows = table.rows
    .filter((row) => !dropRows.has(String(row?.[0] ?? '')))
    .map((row) => keep.map((i) => row[i]));
  if (keep.length <= 1 || !rows.length) return null;
  return { ...table, columns: keep.map((i) => table.columns[i]), rows };
}

type TableBuilder = (result: any) => TableSpec[];

function formatDecimal(value: any): string {
  if (typeof value !== 'number' || isNaN(value)) return value ?? '';

  const abs = Math.abs(value);
  if (abs === 0) return '0';

  // Too small numbers -> scientific. Large ones stay whole: 1065587, not 1.066e+6 (four digits lost).
  if (abs < 1e-4) {
    return value.toExponential(3);
  }
  if (abs >= 1_000_000) {
    return value.toFixed(0);
  }

  const decimals = abs < 1 ? 4 : 3;
  let formatted = value.toFixed(decimals);

  formatted = formatted
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '');

  if (formatted === '-0') formatted = '0';

  return formatted;
}

function formatAnovaMetric(value: any): string {
  if (typeof value !== 'number' || isNaN(value)) return value ?? '';
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(3);
}


function formatNullableOutlierValue(value: any): string {
  if (value === null || value === undefined) return 'Unavailable';
  return formatDecimal(value);
}

/** One p-value style across every result table: `< 0.001` below that, three decimals above —
 *  0, 1.11e-16 and 3.9e-238 are all float noise at that size. Blank when missing. */
function formatTableP(value: unknown): string {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? formatPValue(numeric) : '';
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
  return prettifyLabel(key);
}

function buildTTestRows(
  result: Record<string, any>,
  valueFormatter: (value: any) => string = formatDecimal
): any[][] {
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
    .map(([k, v]) => [formatTTestKey(k), k === 'p' || k === 'p_value' ? formatTableP(v) : valueFormatter(v)]);
}

function buildMetricRows(result: Record<string, any>, labels: Record<string, string>, keys: string[]): any[][] {
  return keys
    .filter((key) => result?.[key] !== undefined && result?.[key] !== null)
    .map((key) => [labels[key] ?? key, key === 'p_value' ? formatTableP(result[key]) : formatDecimal(result[key])]);
}

interface ContingencyContext {
  __labelMap__?: Record<string, string>;
  __xVar__?: string | null;
  __yVar__?: string | null;
}

function resolveVariableDisplayLabel(
  code: string | null | undefined,
  labelMap?: Record<string, string> | null,
): string {
  if (!code) return '';
  const trimmed = String(code).trim();
  if (!trimmed) return '';
  // A created column has no data-model label; its code still reads as words.
  return labelMap?.[trimmed] ?? readable(trimmed);
}

function buildContingencyCategoryTable(
  xLabels: string[],
  yLabels: string[],
  ctx: ContingencyContext,
): TableSpec | null {
  if (!xLabels.length && !yLabels.length) return null;

  const factorVariable = resolveVariableDisplayLabel(ctx.__xVar__, ctx.__labelMap__) || '—';
  const outcomeVariable = resolveVariableDisplayLabel(ctx.__yVar__, ctx.__labelMap__) || '—';

  return {
    title: 'Contingency Table Categories',
    columns: ['Role', 'Variable', 'Categories'],
    rows: [
      ['Factor', factorVariable, xLabels.join(', ')],
      ['Outcome', outcomeVariable, yLabels.join(', ')],
    ],
    layout: 'full',
  };
}

function buildContingencyCornerLabel(ctx: ContingencyContext): string {
  const factor = resolveVariableDisplayLabel(ctx.__xVar__, ctx.__labelMap__);
  const outcome = resolveVariableDisplayLabel(ctx.__yVar__, ctx.__labelMap__);
  if (factor && outcome) {
    return `${factor} \\ ${outcome}`;
  }
  return 'Factor \\ Outcome';
}

interface CoefficientColumnSpec {
  key: string;
  label: string;
  displayKey?: string;
  format?: 'decimal' | 'text';
}

function formatCoefficientCell(
  result: Record<string, unknown>,
  column: CoefficientColumnSpec,
  index: number
): string {
  const displayKey = column.displayKey;
  if (displayKey) {
    const displaySource = Array.isArray(result[displayKey]) ? result[displayKey] : [];
    const display = displaySource[index];
    if (display !== null && display !== undefined && String(display).trim() !== '') {
      return String(display);
    }
  }

  const source: unknown[] = Array.isArray(result[column.key])
    ? (result[column.key] as unknown[])
    : [];
  const value = source[index];
  if (column.format === 'text') {
    return value === null || value === undefined ? '' : String(value);
  }
  return formatDecimal(value);
}

function buildCoefficientRows(
  result: Record<string, unknown>,
  values: CoefficientColumnSpec[]
): unknown[][] {
  const variables = Array.isArray(result['indep_vars']) ? result['indep_vars'] : [];
  if (!variables.length) return [];

  return variables.map((variable, index) => [
    variable,
    ...values.map((column) => formatCoefficientCell(result, column, index)),
  ]);
}

function formatLinearRegressionSummaryMetric(key: string, result: LinearRegressionResult): string {
  if (key === 'f_stat') {
    const display = result.f_stat_display;
    if (typeof display === 'string' && display.trim()) return display;
  }
  if (key === 'f_pvalue') {
    const display = result.f_pvalue_display;
    if (typeof display === 'string' && display.trim()) return display;
  }
  return formatDecimal(result[key as keyof LinearRegressionResult]);
}

function isClassicalCoxSummary(
  summary: ClassicalCoxRegressionSummary | StackedCoxRegressionSummary
): summary is ClassicalCoxRegressionSummary {
  return typeof (summary as ClassicalCoxRegressionSummary).n_unique_event_times === 'number';
}

function isCoxInterceptTerm(name: string): boolean {
  return String(name).trim().toLowerCase() === 'intercept';
}

function formatCoxHazardRatio(value: number | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (numeric >= 100) return numeric.toFixed(1);
  if (numeric >= 10) return numeric.toFixed(2);
  return numeric.toFixed(3);
}

/** Tukey p comes from statsmodels' psturng, which clips to [0.001, 0.9]: the ends are bounds, not values. */
function formatTukeyP(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  if (numeric <= 0.001) return '≤ 0.001';
  if (numeric >= 0.9) return '≥ 0.900';
  return numeric.toFixed(3);
}

function formatCoxPValue(value: number | undefined): string {
  return formatTableP(value) || '—';
}

function formatCoxHazardRatioCi(lower: number | undefined, upper: number | undefined): string {
  const low = Number(lower);
  const high = Number(upper);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return '—';
  return `${formatCoxHazardRatio(low)} – ${formatCoxHazardRatio(high)}`;
}

function buildCoxRegressionTables(
  result: CoxRegressionResult,
  options: { coefficientsTitle: string; variant: 'classical' | 'stacked' }
): TableSpec[] {
  const summary = result?.summary;
  if (!summary) return [];

  const indepVars = result.indep_vars ?? [];
  const coefficients = summary.coefficients ?? [];
  if (!indepVars.length || !coefficients.length) return [];

  const coefRows = indepVars
    .map((variable, index) => {
      if (isCoxInterceptTerm(variable)) return null;
      return [
        variable,
        formatCoxHazardRatio(summary.hazard_ratios?.[index]),
        formatCoxHazardRatioCi(summary.hr_lower_ci?.[index], summary.hr_upper_ci?.[index]),
        formatCoxPValue(summary.pvalues?.[index]),
      ];
    })
    .filter((row): row is string[] => !!row);

  const tables: TableSpec[] = [{
    title: options.coefficientsTitle,
    columns: [
      'Factor',
      'Hazard ratio',
      '95% CI',
      'p-value',
    ],
    rows: coefRows,
    layout: 'full',
  }];

  const summaryRows: any[][] = [
    // Exaflow puts the follow-up time in y (dependent_var) and the event indicator in event_var.
    ['Follow-up time', result.dependent_var],
    ['Event indicator', result.event_var],
    ['Participants', formatDecimal(summary.n_obs)],
    ['Events', formatDecimal(summary.n_events)],
    ['Covariates in model', formatDecimal(summary.n_covariates)],
  ];

  if (options.variant === 'classical' && isClassicalCoxSummary(summary)) {
    summaryRows.push(
      ['Model converged', summary.converged ? 'Yes' : 'No'],
      ['Distinct event times', formatDecimal(summary.n_unique_event_times)],
      ['Tied events handling', summary.ties ?? ''],
    );
  } else if (options.variant === 'stacked') {
    const stacked = summary as StackedCoxRegressionSummary;
    summaryRows.push(
      ['Analysis rows', formatDecimal(stacked.n_stacked_rows)],
      ['Pseudo R² (CS)', formatDecimal(stacked.r_squared_cs)],
      ['Pseudo R² (McF)', formatDecimal(stacked.r_squared_mcf)],
      ['AIC', formatDecimal(stacked.aic)],
      ['BIC', formatDecimal(stacked.bic)],
    );
  }

  tables.push({
    title: 'Study and model summary',
    columns: ['Item', 'Value'],
    rows: summaryRows,
    layout: 'full',
  });

  return tables;
}

function buildMixedEffectsSummary(result: Record<string, any>, extraKeys: string[] = []): TableSpec {
  const labels: Record<string, string> = {
    dependent_var: 'Dependent variable',
    grouping_var: 'Grouping variable',
    n_obs: 'Observations',
    n_groups: 'Groups',
    df_model: 'DF Model',
    df_resid: 'DF Residual',
    sigma2: 'Residual variance',
    sigma_u2: 'Random intercept variance',
    ll_reml: 'REML log-likelihood',
    aic: 'AIC',
    bic: 'BIC',
    converged: 'Converged',
    n_iter: 'Iterations',
  };
  const keys = [
    'dependent_var',
    'grouping_var',
    'n_obs',
    'n_groups',
    ...extraKeys,
    'sigma2',
    'sigma_u2',
    'll_reml',
    'aic',
    'bic',
    'converged',
    'n_iter',
  ];
  return {
    title: 'Model Summary',
    columns: ['Metric', 'Value'],
    rows: buildMetricRows(result, labels, keys),
    layout: 'full',
  };
}

function buildHistogramTables(result: HistogramResult): TableSpec[] {
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
      rows,
    });
  }
  return tables;
}

export const AlgorithmTableRegistry: Record<string, TableBuilder> = {
  kmeans: (result: KMeansResult) => {
    if (!Array.isArray(result?.clusters) || result.clusters.length === 0) return [];

    const variables = result.variables ?? [];
    const clusters = result.clusters;
    const tables: TableSpec[] = [{
      title: 'K-Means Summary',
      columns: ['Metric', 'Value'],
      layout: 'compact',
      rows: [
        ['K selection', result.k_selection],
        ['Selected k', formatDecimal(result.selected_k)],
        ['Observations', result.n_obs_interval],
        ['Initialization method', result.initialization_method],
        ['Initializations', formatDecimal(result.n_init)],
        ['Converged', result.converged ? 'Yes' : 'No'],
        ['Iterations', formatDecimal(result.n_iter)],
      ],
    }, {
      title: 'Cluster Centers',
      columns: ['Cluster', 'Size', ...variables],
      rows: clusters.map(c => [c.label, c.size_interval, ...variables.map(v => formatDecimal(c.center[v]))]),
    }, {
      title: 'Cluster Profiles',
      columns: ['Cluster', 'Compactness', 'Profile', 'Interpretation'],
      rows: clusters.map(c => [c.label, c.quality?.compactness ?? '-', (c.profile ?? []).join('; '), c.interpretation]),
    }];

    const noteRows: any[][] = [];
    if (result.privacy_note) {
      noteRows.push(['Privacy', result.privacy_note]);
    }
    if (result.center_definition) {
      noteRows.push(['Centers', result.center_definition]);
    }
    for (const warning of result.warnings ?? []) {
      noteRows.push(['Warning', warning]);
    }
    if (result.elbow?.warning) {
      noteRows.push(['Warning', result.elbow.warning]);
    }
    for (const limitation of result.limitations ?? []) {
      noteRows.push(['Limitation', limitation]);
    }
    for (const use of result.intended_use ?? []) {
      noteRows.push(['Intended use', use]);
    }
    if (noteRows.length) {
      tables.push({ title: 'Notes', columns: ['Type', 'Note'], rows: noteRows });
    }

    return tables;
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
        formatTableP(pValues[idx]),
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
        .map((key) => [labelMap[key] || key, formatLinearRegressionSummaryMetric(key, result)]);

      if (typeof result.f_stat_note === 'string' && result.f_stat_note.trim()) {
        infoRows.push(['F-statistic note', result.f_stat_note.trim()]);
      }

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

  lmm: (result: LMMResult | null | undefined) => {
    if (!result) return [];

    const pvalueLabel =
      typeof result.pvalue_label === 'string' && result.pvalue_label.trim()
        ? result.pvalue_label.trim()
        : 'P(>|t|)';
    const coefficientColumns: CoefficientColumnSpec[] = [
      { key: 'coefficients', label: 'Coefficient' },
      { key: 'std_err', label: 'Std.Err.' },
      { key: 't_stats', label: 't-statistic' },
      {
        key: 'pvalues',
        label: pvalueLabel,
        displayKey: 'pvalues_display',
        format: 'text',
      },
      { key: 'lower_ci', label: 'Lower 95% CI' },
      { key: 'upper_ci', label: 'Upper 95% CI' },
    ];
    const coefRows = buildCoefficientRows(
      result as unknown as Record<string, unknown>,
      coefficientColumns
    );

    const tables: TableSpec[] = [];
    if (coefRows.length) {
      tables.push({
        title: 'Fixed Effects',
        columns: ['Variable', ...coefficientColumns.map(({ label }) => label)],
        rows: coefRows,
        layout: 'full',
      });
    }

    const summary = buildMixedEffectsSummary(result, ['df_model', 'df_resid']);
    if (summary.rows.length) tables.push(summary);

    return tables;
  },

  glmm_binary: (result: any) => {
    if (!result) return [];

    const coefficientColumns = [{ key: 'coefficients', label: 'Coefficient' }];
    const coefRows = buildCoefficientRows(result, coefficientColumns);
    const tables: TableSpec[] = [];

    if (coefRows.length) {
      tables.push({
        title: 'Fixed Effects',
        columns: ['Variable', ...coefficientColumns.map(({ label }) => label)],
        rows: coefRows,
        layout: 'full',
      });
    }

    const summary = buildMixedEffectsSummary(result);
    if (summary.rows.length) tables.push(summary);

    return tables;
  },

  glmm_ordinal: (result: any) => {
    if (!result) return [];

    const coefficientColumns = [{ key: 'coefficients', label: 'Coefficient' }];
    const coefRows = buildCoefficientRows(result, coefficientColumns);
    const tables: TableSpec[] = [];

    if (coefRows.length) {
      tables.push({
        title: 'Fixed Effects',
        columns: ['Variable', ...coefficientColumns.map(({ label }) => label)],
        rows: coefRows,
        layout: 'full',
      });
    }

    if (Array.isArray(result.cutpoints) && result.cutpoints.length) {
      tables.push({
        title: 'Cutpoints',
        columns: ['Boundary', 'Cutpoint'],
        rows: result.cutpoints.map((value: any, index: number) => [
          `Cutpoint ${index + 1}`,
          formatDecimal(value),
        ]),
      });
    }

    if (Array.isArray(result.category_order) && result.category_order.length) {
      tables.push({
        title: 'Ordinal Category Order',
        columns: ['Level', 'Category'],
        rows: result.category_order.map((category: any, index: number) => [
          index + 1,
          category,
        ]),
      });
    }

    const summary = buildMixedEffectsSummary(result);
    if (summary.rows.length) tables.push(summary);

    return tables;
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

    // mean_sq_error is the pre-rename name of the same RMSE value in stored experiments.
    const candidates: Array<{ label: string; value: unknown }> = [
      { label: 'Root mean squared error', value: result.root_mean_sq_error ?? result.mean_sq_error },
      { label: 'R-squared', value: result.r_squared },
      { label: 'Mean absolute error', value: result.mean_abs_error },
      { label: 'F diagnostic', value: result.f_stat },
    ];

    // Exaflow sends [null, null] when any fold is undefined or infinite; show that instead of hiding the metric.
    const statsRows = candidates
      .filter(({ value }) => value != null)
      .map(({ label, value }) => {
        const stat = normalizeStat(value);
        return [label, stat.mean ?? 'Undefined', stat.std ?? 'Undefined'];
      });

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
        rows: rawClasses.map((_cls, i) => [
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
    if (!summary?.accuracy) return [];

    const classes = Object.keys(summary.accuracy);
    if (!classes.length) return [];

    const confusion = readConfusionMatrix(result.confusion_matrix);
    const support = (cls: string): number | null => {
      const index = confusion?.labels.indexOf(cls) ?? -1;
      return confusion && index >= 0 ? confusion.matrix[index].reduce((sum, value) => sum + value, 0) : null;
    };
    // A class the confusion matrix never saw (an unused enumeration) has no metrics worth a row.
    const shown = confusion ? classes.filter((cls) => (support(cls) ?? 0) > 0) : classes;
    const meanSd = (block: Record<string, number> | undefined) =>
      block?.['average'] === undefined ? '' : `${formatDecimal(block['average'])} ± ${formatDecimal(block['stdev'] ?? 0)}`;

    const tables: TableSpec[] = [{
      title: 'Per-class metrics (mean ± SD over folds)',
      columns: ['Class', 'Precision', 'Recall', 'F1', 'Support'],
      rows: shown.map((cls) => [
        cls,
        meanSd(summary.precision?.[cls]),
        meanSd(summary.recall?.[cls]),
        meanSd(summary.fscore?.[cls]),
        formatDecimal(support(cls) ?? ''),
      ]),
    }];

    // Accuracy is one number per fold, repeated under every class key.
    const accuracy = summary.accuracy[classes[0]];
    const folds = Object.keys(accuracy).filter((key) => key !== 'average' && key !== 'stdev');
    tables.push({
      title: 'Accuracy per fold',
      columns: ['Fold', 'Accuracy', 'Observations'],
      layout: 'compact',
      rows: [
        ...folds.map((fold) => [fold.replace(/^fold(\d+)$/, (_, n) => `Fold ${Number(n) + 1}`), formatDecimal(accuracy[fold]), formatDecimal(summary.n_obs?.[fold] ?? '')]),
        ['Mean ± SD', meanSd(accuracy), ''],
      ],
    });

    if (confusion) {
      tables.push({
        title: 'Confusion Matrix (Combined)',
        columns: ['Actual \\ Predicted', ...confusion.labels],
        rows: confusion.matrix.map((row, i) => [confusion.labels[i], ...row.map((v) => formatDecimal(v))]),
      });
    }

    return tables;
  },

  cox_regression_classical: (result: CoxRegressionResult) =>
    buildCoxRegressionTables(result, {
      coefficientsTitle: 'Factor estimates (table)',
      variant: 'classical',
    }),

  cox_regression_stacked: (result: CoxRegressionResult) =>
    buildCoxRegressionTables(result, {
      coefficientsTitle: 'Factor estimates (table)',
      variant: 'stacked',
    }),

  logistic_regression: (result: LogisticRegressionResult) => {
    if (!result) return [];

    const s = result.summary;
    const coefRows = result.indep_vars.map((v, i) => [
      v,
      formatDecimal(s.coefficients[i]),
      formatDecimal(s.stderr[i]),
      formatDecimal(s.z_scores[i]),
      formatTableP(s.pvalues[i]),
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

    // Probabilities read as shares, not logs: exp(log prior) and exp(log P(category | class)).
    const share = (log: unknown) => {
      const value = Math.exp(Number(log));
      return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '';
    };

    // Class summary
    if (rawClasses.length > 0) {
      tables.push({
        title: 'Class Summary',
        columns: ['Class', 'Count', 'Prior'],
        rows: rawClasses.map((_cls, i) => [
          classLabels[i],
          formatDecimal(result.class_count[i]),
          share(result.class_log_prior[i]),
        ]),
        layout: 'full',
      });
    }

    // One table per feature: each cell is the count and the model's P(category | class).
    // A category no class ever had (an unused enumeration) is left out.
    for (const feature of result.feature_names) {
      const counts = result.category_count[feature];
      const logProbs = result.category_log_prob?.[feature];
      const categories = result.categories[feature];
      if (!counts || !categories) continue;

      const rows = categories
        .map((category, c) => ({ category, c }))
        .filter(({ c }) => rawClasses.some((_cls, i) => Number(counts[i]?.[c]) > 0))
        .map(({ category, c }) => [
          getEnumLabel(feature, String(category)),
          ...rawClasses.map((_cls, i) => {
            const count = Number(counts[i]?.[c]).toLocaleString('en-US');
            const probability = logProbs ? share(logProbs[i]?.[c]) : '';
            return probability ? `${count} · ${probability}` : count;
          }),
        ]);

      tables.push({
        title: `${getLabel(feature)} by class`,
        columns: ['Category', ...classLabels],
        rows,
        layout: 'full',
      });
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

    const eigenvalues = (result.eigenvalues ?? []).map(Number);
    const total = eigenvalues.reduce((sum, value) => sum + value, 0);
    if (eigenvalues.length) {
      let cumulative = 0;
      const percent = (value: number) => (total > 0 ? ((value / total) * 100).toFixed(1) : '');
      tables.push({
        title: 'PCA Summary',
        columns: ['Component', 'Eigenvalue', 'Variance explained (%)', 'Cumulative (%)'],
        rows: eigenvalues.map((value, i) => {
          cumulative += value;
          return [`PC${i + 1}`, formatDecimal(value), percent(value), percent(cumulative)];
        }),
      });
    }

    // Rows of eigenvectors are components; the table turns them so each variable reads across.
    const vectors = Array.isArray(result.eigenvectors) ? result.eigenvectors : [];
    const nVariables = vectors[0]?.length ?? 0;
    if (nVariables) {
      const names: unknown[] = Array.isArray((result as any).variable_names) ? (result as any).variable_names : [];
      tables.push({
        title: 'Loadings',
        columns: ['Variable', ...vectors.map((_, i) => `PC${i + 1}`)],
        rows: Array.from({ length: nVariables }, (_, j) => [
          String(names[j] ?? `Var${j + 1}`),
          ...vectors.map((row) => formatDecimal(row[j])),
        ]),
      });
    }

    return tables;
  },

  pca_with_transformation: (result: PCAResult) => {
    return AlgorithmTableRegistry['pca'](result);
  },

  quartiles: (result: QuartilesResult) => {
    if (!Array.isArray(result?.quantiles)) return [];
    return [{
      title: 'Quartiles',
      columns: ['Quantile', 'Value', 'Actual quantile'],
      rows: result.quantiles.map((item) => [
        formatDecimal(item.q),
        formatDecimal(item.value),
        formatDecimal(item.actual_q),
      ]),
    }];
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
            formatDecimal(d.median ?? d.q2),
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
        ['Explained', formatAnovaMetric(result.anova_table.df_explained), formatAnovaMetric(result.anova_table.ss_explained), formatAnovaMetric(result.anova_table.ms_explained), formatAnovaMetric(result.anova_table.f_stat), formatTableP(result.anova_table.p_value)],
        ['Residual', formatAnovaMetric(result.anova_table.df_residual), formatAnovaMetric(result.anova_table.ss_residual), formatAnovaMetric(result.anova_table.ms_residual), '', '']
      ]
    };

    const tables = [t1];

    if (result.tuckey_test && result.tuckey_test.length) {
      tables.push({
        title: 'Tukey Post-hoc Test',
        columns: ['Group A', 'Group B', 'Mean A', 'Mean B', 'Diff', 'SE', 't-stat', 'p-value'],
        rows: result.tuckey_test.map(r => [
          r.groupA, r.groupB,
          formatAnovaMetric(r.meanA), formatAnovaMetric(r.meanB),
          formatAnovaMetric(r.diff), formatAnovaMetric(r.se),
          formatAnovaMetric(r.t_stat), formatTukeyP(r.p_tuckey)
        ])
      });
    }

    if (result.min_max_per_group && Array.isArray(result.min_max_per_group.categories)) {
      const categories = result.min_max_per_group.categories;
      const minValues = Array.isArray(result.min_max_per_group.min) ? result.min_max_per_group.min : [];
      const maxValues = Array.isArray(result.min_max_per_group.max) ? result.min_max_per_group.max : [];
      const rows = categories.map((category, index) => [
        category,
        formatAnovaMetric(minValues[index]),
        formatAnovaMetric(maxValues[index])
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
      formatTableP(result.f_pvalue[i])
    ]);

    return [{
      title: 'Two-Way ANOVA',
      columns: ['Term', 'Sum Sq', 'df', 'F', 'Prob>F'],
      rows
    }];
  },

  pearson_correlation: (result: PearsonResult) => {
    const tables: TableSpec[] = [];
    const raw = result as any;
    const pick = (...keys: string[]): any => keys.map((key) => raw?.[key]).find((m) => m && typeof m === 'object' && !Array.isArray(m)) ?? null;
    const correlations = pick('correlations');
    // Backwards compatibility: saved Pearson results may use historical p-value and CI aliases.
    const pValues = pick('p_values', 'p-values', 'pvalues');
    const ciLower = pick('ci_lo', 'low_confidence_intervals');
    const ciUpper = pick('ci_hi', 'high_confidence_intervals');

    if (correlations) {
      const cols: string[] = correlations.variables ?? [];
      const rows = Object.keys(correlations).filter((key) => key !== 'variables');
      const square = rows.length === cols.length && rows.every((row) => cols.includes(row));
      const cell = (matrix: any, row: string, col: string): number | null => {
        const values = matrix?.[row];
        const index = (matrix?.variables ?? cols).indexOf(col);
        const value = Array.isArray(values) && index >= 0 ? Number(values[index]) : NaN;
        return Number.isFinite(value) ? value : null;
      };
      // Each pair once: in a square matrix keep the pairs below the diagonal.
      const pairs = rows.flatMap((row) => cols
        .filter((col) => !square || cols.indexOf(col) < cols.indexOf(row))
        .map((col) => ({ row, col, r: cell(correlations, row, col) }))
        .filter((pair): pair is { row: string; col: string; r: number } => pair.r !== null));
      pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

      if (pairs.length) {
        tables.push({
          title: 'Correlation pairs',
          columns: ['Variable A', 'Variable B', 'r', '95% CI lower', '95% CI upper', 'p'],
          rows: pairs.map(({ row, col, r }) => {
            const p = cell(pValues, row, col);
            return [row, col, formatDecimal(r), formatDecimal(cell(ciLower, row, col)), formatDecimal(cell(ciUpper, row, col)), p === null ? '' : formatPValue(p)];
          }),
        });
      }
    }

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

  chi_squared: (result: any) => {
    if (!result) return [];
    const tables: TableSpec[] = [];
    const ctx: ContingencyContext = {
      __labelMap__: result.__labelMap__,
      __xVar__: result.__xVar__,
      __yVar__: result.__yVar__,
    };

    const summaryRows = buildMetricRows(result, {
      chi2: 'Chi-Squared statistic',
      p_value: 'p-value',
      dof: 'Degrees of freedom',
    }, ['chi2', 'p_value', 'dof']);

    if (summaryRows.length) {
      tables.push({
        title: 'Chi-Squared Test Summary',
        columns: ['Metric', 'Value'],
        rows: summaryRows,
        layout: 'compact',
      });
    }

    const xLabels = Array.isArray(result.x_labels) ? result.x_labels : [];
    const yLabels = Array.isArray(result.y_labels) ? result.y_labels : [];
    const categoryTable = buildContingencyCategoryTable(xLabels, yLabels, ctx);
    if (categoryTable) {
      tables.push(categoryTable);
    }

    if (Array.isArray(result.expected) && result.expected.length) {
      tables.push({
        title: 'Expected Frequencies',
        columns: [buildContingencyCornerLabel(ctx), ...yLabels.map(String)],
        rows: result.expected.map((row: any[], index: number) => [
          xLabels[index] ?? `Row ${index + 1}`,
          ...(Array.isArray(row) ? row.map(value => formatDecimal(value)) : []),
        ]),
        layout: 'full',
      });
    }

    return tables;
  },

  fisher_exact: (result: any) => {
    if (!result) return [];
    const tables: TableSpec[] = [];
    const ctx: ContingencyContext = {
      __labelMap__: result.__labelMap__,
      __xVar__: result.__xVar__,
      __yVar__: result.__yVar__,
    };

    const summaryRows = buildMetricRows(result, {
      odds_ratio: 'Odds ratio',
      p_value: 'p-value',
    }, ['odds_ratio', 'p_value']);

    if (summaryRows.length) {
      tables.push({
        title: "Fisher's Exact Test Summary",
        columns: ['Metric', 'Value'],
        rows: summaryRows,
        layout: 'compact',
      });
    }

    const xLabels = Array.isArray(result.x_labels) ? result.x_labels : [];
    const yLabels = Array.isArray(result.y_labels) ? result.y_labels : [];
    const categoryTable = buildContingencyCategoryTable(xLabels, yLabels, ctx);
    if (categoryTable) {
      tables.push(categoryTable);
    }

    return tables;
  },

  outlier_report: (result: any) => {
    const featurewise = Array.isArray(result?.featurewise)
      ? result.featurewise
      : Array.isArray(result?.result?.featurewise)
        ? result.result.featurewise
        : [];
    if (!featurewise.length) return [];

    // One rule column and one kept-range column instead of strategy/tail/fold and two bounds,
    // and each variable's datasets kept together.
    const strategyLabels: Record<string, string> = { gaussian: 'Mean ± SD', iqr: 'IQR', mad: 'MAD', quantile: 'Quantile' };
    const tailLabels: Record<string, string> = { left: 'lower tail', right: 'upper tail', both: 'both tails' };
    const bound = (value: unknown) => (value === null || value === undefined ? '—' : formatDecimal(value));
    const rows = featurewise.filter((row: any) => String(row?.dataset ?? '').trim().toLowerCase() !== 'all datasets');
    const variableOrder = [...new Set(rows.map((row: any) => row?.variable))];
    rows.sort((a: any, b: any) => variableOrder.indexOf(a?.variable) - variableOrder.indexOf(b?.variable));

    return [{
      title: 'Outlier Report',
      columns: ['Variable', 'Dataset', 'Rule', 'Kept range', 'Below', 'Above', 'Outliers', 'Outlier %'],
      rows: rows.map((row: any) => {
        const data = row?.data ?? {};
        const strategy = data.strategy ? strategyLabels[data.strategy] ?? data.strategy : 'Unavailable';
        const fold = data.fold === null || data.fold === undefined ? '' : ` × ${formatDecimal(data.fold)}`;
        const tail = data.tail ? `, ${tailLabels[data.tail] ?? data.tail}` : '';
        return [
          row?.variable ?? '',
          row?.dataset ?? '',
          `${strategy}${fold}${tail}`,
          `${bound(data.lower_bound)} to ${bound(data.upper_bound)}`,
          formatNullableOutlierValue(data.lower_outlier_count),
          formatNullableOutlierValue(data.upper_outlier_count),
          formatNullableOutlierValue(data.total_outlier_count),
          formatNullableOutlierValue(data.total_outlier_percentage),
        ];
      }),
    }];
  },

  histogram: buildHistogramTables,

  binned_mann_whitney_u_test: (result: BinnedMannWhitneyUTestResult) => {
    if (!result) return [];
    return [{
      title: 'Binned Mann-Whitney U Test',
      columns: ['Metric', 'Value'],
      rows: [
        ['U statistic', formatDecimal(result.u_stat)],
        ['p-value', formatTableP(result.p_value)],
        ['z-score', formatDecimal(result.z_score)],
        ['Group A sample size', formatDecimal(result.n1)],
        ['Group B sample size', formatDecimal(result.n2)],
      ],
      layout: 'compact',
    }];
  },

  standardized_mean_difference: (result: StandardizedMeanDifferenceResult) => {
    if (!Array.isArray(result?.comparisons)) return [];
    return [{
      title: 'Standardized Mean Difference',
      columns: ['Group 1', 'Group 2', 'SMD'],
      rows: result.comparisons.map(comparison => [
        String(comparison.group1),
        String(comparison.group2),
        formatDecimal(comparison.smd),
      ]),
    }];
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
      rows: buildTTestRows(result as Record<string, any>, formatAnovaMetric)
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


/** Safe key lookup for callers holding an algorithm name from the backend. */
export function getAlgorithmTableBuilder(algorithmKey: string | null | undefined): TableBuilder | undefined {
  if (!algorithmKey) return undefined;
  const entry = Object.entries(AlgorithmTableRegistry).find(([key]) => key === algorithmKey);
  return entry?.[1];
}
