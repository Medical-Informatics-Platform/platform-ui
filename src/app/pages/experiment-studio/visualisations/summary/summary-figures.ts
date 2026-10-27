import { formatInteger, formatPValue, formatRatio, formatSignedNumber, formatSummaryNumber, toFiniteNumber } from '../result-format';
import { readConfusionMatrix } from '../charts/renderers/confusion-matrix-chart';
import { formatTTestKey, TableTrim } from '../auto-renderer/algorithm-table-registry';
import { KeyFigure } from './key-figures.component';

/** Cohen's conventions for d / SMD: 0.2 small, 0.5 medium, 0.8 large. */
function standardizedMagnitude(value: number): string {
  const abs = Math.abs(value);
  if (abs < 0.2) return 'Negligible';
  if (abs < 0.5) return 'Small';
  if (abs < 0.8) return 'Medium';
  return 'Large';
}

/** Cohen's conventions for η²: 0.01 small, 0.06 medium, 0.14 large. */
function etaMagnitude(value: number): string {
  if (value < 0.01) return 'Negligible';
  if (value < 0.06) return 'Small';
  if (value < 0.14) return 'Medium';
  return 'Large';
}

/** Cohen's w thresholds (0.1 / 0.3 / 0.5) scaled by √(min(r, c) − 1), as for Cramér's V. */
function cramerMagnitude(value: number, dfStar: number): string {
  const scale = Math.sqrt(Math.max(1, dfStar));
  if (value < 0.1 / scale) return 'Negligible';
  if (value < 0.3 / scale) return 'Small';
  if (value < 0.5 / scale) return 'Medium';
  return 'Large';
}

const first = (result: any, keys: string[]): number | null => {
  for (const key of keys) {
    const value = toFiniteNumber(result?.[key]);
    if (value !== null) return value;
  }
  return null;
};

/** What the caller knows of the run: the groups a two-group test compared, the paired
 *  measurements, and the alpha and alternative that set the confidence interval. */
export interface SummaryContext {
  groupA: string | null;
  groupB: string | null;
  /** Paired t-test: Exaflow reports mean(x − y), measurement 1 (x) minus measurement 2 (y). */
  measurement1?: string | null;
  measurement2?: string | null;
  alpha?: number | null;
  alternative?: string | null;
}

/** "Infinity" / "-Infinity" (how Exaflow sends an open CI side) or a numeric infinity, as its sign. */
function infiniteSign(value: unknown): 1 | -1 | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return numeric === Infinity ? 1 : numeric === -Infinity ? -1 : null;
}

/** The CI level as a percentage: (1 − alpha) when alpha is a usable significance level, else 95. */
function confidenceLevel(alpha: number | null | undefined): string {
  if (typeof alpha !== 'number' || !(alpha > 0 && alpha < 1)) return '95';
  return String(Number(((1 - alpha) * 100).toFixed(2)));
}

/** The t-test CI as a note: two-sided "95% CI a to b", one-sided "95% one-sided CI ≥ a" (greater)
 *  or "≤ b" (less). Exaflow (PR #656) reports a one-sided (1 − alpha) bound with the other side
 *  open, so the open side is read from the result and the run's alternative alike. */
function ttestCiNote(result: any, context?: SummaryContext): string {
  const lower = toFiniteNumber(result?.ci_lower);
  const upper = toFiniteNumber(result?.ci_upper);
  const level = confidenceLevel(context?.alpha);
  const alternative = context?.alternative;
  if (lower !== null && (infiniteSign(result?.ci_upper) === 1 || (upper === null && alternative === 'greater'))) {
    return `${level}% one-sided CI ≥ ${formatSignedNumber(lower)}`;
  }
  if (upper !== null && (infiniteSign(result?.ci_lower) === -1 || (lower === null && alternative === 'less'))) {
    return `${level}% one-sided CI ≤ ${formatSignedNumber(upper)}`;
  }
  return lower !== null && upper !== null ? `${level}% CI ${formatSignedNumber(lower)} to ${formatSignedNumber(upper)}` : '';
}

/** What the mean difference is the difference of, when the run says. */
function ttestDifferenceNote(context?: SummaryContext): string {
  // Exaflow's independent t-test reports mean(group A) − mean(group B).
  if (context?.groupA && context?.groupB) return `${context.groupA} − ${context.groupB}`;
  if (context?.measurement1 && context?.measurement2) return `${context.measurement1} − ${context.measurement2}`;
  return '';
}

function ttestFigures(result: any, context?: SummaryContext): KeyFigure[] {
  const figures: KeyFigure[] = [];
  const meanDiff = first(result, ['mean_diff']);
  const t = first(result, ['t_stat']);
  const df = first(result, ['df', 'dof']);
  const p = first(result, ['p', 'p_value']);
  const d = first(result, ['cohens_d', 'cohen_d']);
  const nObs = first(result, ['n_obs']);
  const se = first(result, ['se_diff', 'se_difference', 'std_err_diff']);
  const sd = first(result, ['std']);

  if (meanDiff !== null) {
    figures.push({
      label: 'Mean difference',
      value: formatSignedNumber(meanDiff),
      note: [ttestDifferenceNote(context), ttestCiNote(result, context), se === null ? '' : `SE ${se.toPrecision(2)}`]
        .filter(Boolean).join(' · ') || undefined,
    });
  }
  if (p !== null) {
    const stat = t === null ? '' : `t${df === null ? '' : `(${formatInteger(df)})`} = ${formatSummaryNumber(t)}`;
    figures.push({ label: 'p-value', value: formatPValue(p), note: stat || undefined });
  }
  if (d !== null) {
    figures.push({ label: "Cohen's d", value: formatSignedNumber(d), note: `${standardizedMagnitude(d)} effect` });
  }
  if (nObs !== null) {
    figures.push({ label: 'Observations', value: formatInteger(nObs), note: sd === null ? 'Rows in the test' : `Rows in the test · SD ${formatSignedNumber(sd)}` });
  }
  return figures;
}

function chiSquaredFigures(result: any): KeyFigure[] {
  const figures: KeyFigure[] = [];
  const chi2 = first(result, ['chi2']);
  const dof = first(result, ['dof']);
  const p = first(result, ['p_value']);
  const expected: unknown[][] = Array.isArray(result?.expected) ? result.expected : [];
  // Expected counts keep the observed margins, so their sum is the sample size.
  const n = expected.flat().reduce<number>((sum, cell) => sum + (toFiniteNumber(cell) ?? 0), 0);
  const rows = expected.length;
  const cols = Array.isArray(expected[0]) ? expected[0].length : 0;

  if (p !== null) {
    const stat = chi2 === null ? undefined : `χ²${dof === null ? '' : `(${formatInteger(dof)})`} = ${formatSummaryNumber(chi2)}`;
    figures.push({ label: 'p-value', value: formatPValue(p), note: stat });
  }
  if (chi2 !== null && n > 0 && rows > 1 && cols > 1) {
    const dfStar = Math.min(rows, cols) - 1;
    const v = Math.sqrt(chi2 / (n * dfStar));
    figures.push({ label: "Cramér's V", value: v.toFixed(3), note: `${cramerMagnitude(v, dfStar)} association` });
  }
  if (n > 0) {
    figures.push({ label: 'Observations', value: formatInteger(Math.round(n)), note: `${rows} × ${cols} table` });
  }
  return figures;
}

function fisherFigures(result: any): KeyFigure[] {
  const figures: KeyFigure[] = [];
  const p = first(result, ['p_value']);
  const oddsRatio = first(result, ['odds_ratio']);
  if (p !== null) figures.push({ label: 'p-value', value: formatPValue(p), note: "Fisher's exact test" });
  if (oddsRatio !== null) figures.push({ label: 'Odds ratio', value: formatRatio(oddsRatio), note: 'Sample odds ratio of the 2 × 2 table' });
  return figures;
}

function anovaOneWayFigures(result: any): KeyFigure[] {
  const table = result?.anova_table;
  if (!table || typeof table !== 'object') return [];
  const figures: KeyFigure[] = [];
  const f = first(table, ['f_stat']);
  const p = first(table, ['p_value']);
  const dfBetween = first(table, ['df_explained']);
  const dfWithin = first(table, ['df_residual']);
  const ssBetween = first(table, ['ss_explained']);
  const ssWithin = first(table, ['ss_residual']);
  const nObs = first(table, ['n_obs']);
  const groups = Object.keys(result?.ci_info?.means ?? {}).length;
  const outcome = typeof table.y_label === 'string' && table.y_label ? table.y_label : 'the outcome';

  if (p !== null) {
    const df = dfBetween !== null && dfWithin !== null ? `(${formatInteger(dfBetween)}, ${formatInteger(dfWithin)})` : '';
    figures.push({ label: 'p-value', value: formatPValue(p), note: f === null ? undefined : `F${df} = ${formatSummaryNumber(f)}` });
  }
  if (ssBetween !== null && ssWithin !== null && ssBetween + ssWithin > 0) {
    const eta = ssBetween / (ssBetween + ssWithin);
    figures.push({
      // Spelled out: the uppercase label style turns η into Η.
      label: 'Eta squared',
      value: eta.toFixed(3),
      note: `η², ${etaMagnitude(eta).toLowerCase()} effect · ${(eta * 100).toFixed(1)}% of the variance in ${outcome} lies between groups`,
    });
  }
  if (groups) figures.push({ label: 'Groups', value: formatInteger(groups), note: 'Compared in the test' });
  if (nObs !== null) figures.push({ label: 'Observations', value: formatInteger(nObs), note: 'Rows in the test' });
  return figures;
}

/** One cell per model term: its p-value, F and partial η² against the residual. */
function anovaTwoWayFigures(result: any): KeyFigure[] {
  const terms: unknown[] = Array.isArray(result?.terms) ? result.terms : [];
  const at = (key: string, index: number) => toFiniteNumber(Array.isArray(result?.[key]) ? result[key][index] : null);
  const residualIndex = terms.findIndex((term) => /^residuals?$/i.test(String(term)));
  const ssResidual = residualIndex >= 0 ? at('sum_sq', residualIndex) : null;
  const dfResidual = residualIndex >= 0 ? at('df', residualIndex) : null;

  return terms.flatMap((term, index) => {
    if (index === residualIndex) return [];
    const p = at('f_pvalue', index);
    if (p === null) return [];
    const f = at('f_stat', index);
    const df = at('df', index);
    const ss = at('sum_sq', index);
    const parts = [
      f === null ? '' : `F${df !== null && dfResidual !== null ? `(${formatInteger(df)}, ${formatInteger(dfResidual)})` : ''} = ${formatSummaryNumber(f)}`,
      ss !== null && ssResidual !== null && ss + ssResidual > 0 ? `partial η² ${(ss / (ss + ssResidual)).toFixed(3)}` : '',
    ];
    return [{ label: String(term).replace(/:/g, ' × '), value: formatPValue(p), note: parts.filter(Boolean).join(' · ') || undefined }];
  });
}

function smdFigures(result: any): KeyFigure[] {
  const comparisons: any[] = Array.isArray(result?.comparisons) ? result.comparisons : [];
  return comparisons.flatMap((comparison) => {
    const smd = toFiniteNumber(comparison?.smd);
    if (smd === null) return [];
    return [{
      label: `${comparison.group1 ?? 'Group 1'} vs ${comparison.group2 ?? 'Group 2'}`,
      value: formatSignedNumber(smd),
      note: `${standardizedMagnitude(smd)} difference${Math.abs(smd) >= 0.1 ? ' · above the 0.1 balance threshold' : ''}`,
    }];
  });
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Fold-average accuracy (and its SD) from either CV summary shape:
 *  naive Bayes `classification_summary.accuracy[class].{average, stdev, fold*}`,
 *  logistic regression `summary.{row_names, accuracy[]}`. */
function foldAccuracy(result: any): { mean: number; sd: number | null; folds: number } | null {
  const perClass = result?.classification_summary?.accuracy;
  if (perClass && typeof perClass === 'object') {
    const first = Object.values(perClass)[0] as any;
    const mean = toFiniteNumber(first?.average);
    if (mean === null) return null;
    return { mean, sd: toFiniteNumber(first?.stdev), folds: Object.keys(first).filter((key) => key.startsWith('fold')).length };
  }
  const rows: unknown[] = Array.isArray(result?.summary?.row_names) ? result.summary.row_names : [];
  const accuracy: unknown[] = Array.isArray(result?.summary?.accuracy) ? result.summary.accuracy : [];
  const mean = toFiniteNumber(accuracy[rows.indexOf('average')]);
  if (mean === null) return null;
  return {
    mean,
    sd: toFiniteNumber(accuracy[rows.indexOf('stdev')]),
    folds: rows.filter((row) => String(row).startsWith('fold')).length,
  };
}

/** The largest actual class of a pooled confusion matrix and its share: what always guessing it would score. */
function majorityClass(confusion: { labels: string[]; matrix: number[][] }): { label: string; share: number } | null {
  const totals = confusion.matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const total = totals.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return null;
  const index = totals.reduce((best, value, i) => (value > totals[best] ? i : best), 0);
  return { label: confusion.labels[index], share: totals[index] / total };
}

/**
 * Cross-validated classifiers: fold accuracy next to the majority-class baseline it has to beat,
 * then balanced accuracy and macro F1 from the pooled confusion matrix (both weigh every class
 * equally, so a large majority class cannot carry them), and the mean ROC AUC when folds report one.
 */
function classificationCvFigures(result: any): KeyFigure[] {
  const figures: KeyFigure[] = [];
  const accuracy = foldAccuracy(result);
  const confusion = readConfusionMatrix(result?.confusion_matrix);

  const majority = confusion ? majorityClass(confusion) : null;
  const baseline = majority?.share ?? null;

  if (accuracy) {
    const spread = accuracy.sd === null ? '' : `± ${(accuracy.sd * 100).toFixed(1)} pts`;
    const folds = accuracy.folds ? `across ${accuracy.folds} folds` : '';
    const gain = baseline === null ? '' : `${accuracy.mean >= baseline ? '+' : '−'}${(Math.abs(accuracy.mean - baseline) * 100).toFixed(1)} pts over the baseline`;
    figures.push({
      label: 'Accuracy',
      value: percent(accuracy.mean),
      note: [[spread, folds].filter(Boolean).join(' '), gain].filter(Boolean).join(' · ') || undefined,
    });
  }

  if (confusion) {
    const { labels, matrix } = confusion;
    const rowTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
    const colTotals = labels.map((_, j) => matrix.reduce((sum, row) => sum + row[j], 0));
    const supported = labels.map((_, i) => i).filter((i) => rowTotals[i] > 0);

    if (majority) {
      figures.push({
        label: 'Majority baseline',
        value: percent(majority.share),
        note: `Accuracy of always predicting ${majority.label}`,
      });
    }
    if (supported.length > 1) {
      const recall = supported.map((i) => matrix[i][i] / rowTotals[i]);
      const f1 = supported.map((i, k) => {
        const precision = colTotals[i] > 0 ? matrix[i][i] / colTotals[i] : 0;
        return precision + recall[k] > 0 ? (2 * precision * recall[k]) / (precision + recall[k]) : 0;
      });
      const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
      figures.push({ label: 'Balanced accuracy', value: percent(mean(recall)), note: 'Mean recall over classes, pooled folds' });
      figures.push({ label: 'Macro F1', value: mean(f1).toFixed(3), note: 'Mean F1 over classes, pooled folds' });
    }
  }

  // Logistic regression's positive-class precision, recall and F1 stay in its fold table
  // (with their mean and SD rows): a sixth figure wraps the strip onto a second line.
  const aucs = (Array.isArray(result?.roc_curves) ? result.roc_curves : [])
    .map((curve: any) => toFiniteNumber(curve?.auc))
    .filter((auc: number | null): auc is number => auc !== null);
  if (aucs.length) {
    const mean = aucs.reduce((sum: number, auc: number) => sum + auc, 0) / aucs.length;
    figures.push({ label: 'ROC AUC', value: mean.toFixed(3), note: `Mean over ${aucs.length} folds` });
  }

  return figures;
}

/**
 * Out-of-fold error for linear regression CV. Exaflow sends each metric as [mean, sd]
 * (older runs { mean, std }; [null, null] when undefined). The F statistic is left out:
 * it describes each training fit, not how well the model predicts held-out rows.
 */
function linearRegressionCvFigures(result: any): KeyFigure[] {
  const meanSd = (raw: any): [number, number | null] | null => {
    const [mean, sd] = (Array.isArray(raw) ? raw : [raw?.mean, raw?.std]).map(toFiniteNumber);
    return mean === null ? null : [mean, sd];
  };
  const spread = (sd: number | null, digits: number) => (sd === null ? undefined : `± ${sd.toFixed(digits)} across folds`);
  const outcome = typeof result?.dependent_var === 'string' ? result.dependent_var : 'outcome';
  const figures: KeyFigure[] = [];

  // mean_sq_error is the pre-rename name of the same RMSE value in stored experiments.
  const rmse = meanSd(result?.root_mean_sq_error ?? result?.mean_sq_error);
  if (rmse) figures.push({ label: 'RMSE', value: formatSummaryNumber(rmse[0]), note: `${outcome} units, ${spread(rmse[1], 2) ?? 'held-out rows'}` });
  const mae = meanSd(result?.mean_abs_error);
  if (mae) figures.push({ label: 'MAE', value: formatSummaryNumber(mae[0]), note: `${outcome} units, ${spread(mae[1], 2) ?? 'held-out rows'}` });
  const r2 = meanSd(result?.r_squared);
  if (r2) {
    figures.push({
      label: 'Out-of-fold R²',
      value: r2[0].toFixed(3),
      note: `${(r2[0] * 100).toFixed(1)}% of the variance in held-out rows${r2[1] === null ? '' : `, ± ${r2[1].toFixed(3)}`}`,
    });
  }
  const folds: unknown[] = Array.isArray(result?.n_obs) ? result.n_obs : [];
  const sizes = folds.map(toFiniteNumber).filter((n): n is number => n !== null);
  if (sizes.length) {
    const mean = sizes.reduce((sum, n) => sum + n, 0) / sizes.length;
    figures.push({ label: 'Folds', value: formatInteger(sizes.length), note: `~${formatInteger(Math.round(mean))} training rows each` });
  }
  return figures;
}

const BUILDERS: Record<string, (result: any, context?: SummaryContext) => KeyFigure[]> = {
  linear_regression_cv: linearRegressionCvFigures,
  naive_bayes_gaussian_cv: classificationCvFigures,
  naive_bayes_categorical_cv: classificationCvFigures,
  logistic_regression_cv: classificationCvFigures,
  ttest_independent: (result, context) => ttestFigures(result, context && { ...context, measurement1: null, measurement2: null }),
  ttest_paired: (result, context) => ttestFigures(result, context && { ...context, groupA: null, groupB: null }),
  ttest_onesample: (result, context) => ttestFigures(result, context && { ...context, groupA: null, groupB: null, measurement1: null, measurement2: null }),
  chi_squared: chiSquaredFigures,
  fisher_exact: fisherFigures,
  anova_oneway: anovaOneWayFigures,
  anova_twoway: anovaTwoWayFigures,
  standardized_mean_difference: smdFigures,
};

/** What a figure means, in plain language, for figures a reader may not know; shown under them. */
export const FIGURE_NOTES: Record<string, string> = {
  linear_regression_cv:
    'RMSE (root mean squared error) is the typical size of a prediction error on rows the model did not see, in the outcome\'s units; ' +
    'squaring makes large misses count more. MAE (mean absolute error) is the average size of that error, so an RMSE well above the MAE points to a few large misses.',
};

/** The t-test rows the figures show: each key only when its figure (or that figure's note) prints it. */
function ttestShownRows(result: any): string[] {
  const has = (key: string) => toFiniteNumber(result?.[key]) !== null;
  const firstKey = (keys: string[]) => keys.find(has) ?? null;
  const meanDiff = has('mean_diff');
  const p = firstKey(['p', 'p_value']);
  const t = has('t_stat');
  const df = firstKey(['df', 'dof']);
  const d = firstKey(['cohens_d', 'cohen_d']);
  const nObs = has('n_obs');
  const se = firstKey(['se_diff', 'se_difference', 'std_err_diff']);
  const keys = [
    ...(meanDiff ? ['mean_diff'] : []),
    // A one-sided CI's figure prints its finite bound, which implies the open side.
    ...(meanDiff && ttestCiNote(result) ? ['ci_lower', 'ci_upper'] : []),
    ...(meanDiff && se ? [se] : []),
    ...(p ? [p] : []),
    ...(p && t ? ['t_stat'] : []),
    ...(p && t && df ? [df] : []),
    ...(d ? [d] : []),
    ...(nObs ? ['n_obs'] : []),
    ...(nObs && has('std') ? ['std'] : []),
  ];
  return keys.map(formatTTestKey);
}

/** One summary table's rows the figures show, by label, each only when its value is a finite number. */
function metricRows(result: any, rows: Array<[label: string, key: string, shown: boolean]>): string[] {
  return rows.filter(([, key, shown]) => shown && toFiniteNumber(result?.[key]) !== null).map(([label]) => label);
}

/** Linear regression CV: an error metric's row once its figure shows both the mean and the SD.
 *  The F diagnostic has no figure, and an undefined metric ([null, null]) keeps its row. */
function linearRegressionCvShownRows(result: any): string[] {
  const known = (raw: any) => {
    const [mean, sd] = (Array.isArray(raw) ? raw : [raw?.mean, raw?.std]).map(toFiniteNumber);
    return mean !== null && sd !== null;
  };
  return [
    ...(known(result?.root_mean_sq_error ?? result?.mean_sq_error) ? ['Root mean squared error'] : []),
    ...(known(result?.mean_abs_error) ? ['Mean absolute error'] : []),
    ...(known(result?.r_squared) ? ['R-squared'] : []),
  ];
}

/** ANOVA columns the figures show: p, F and both degrees of freedom of every model term, or none. */
function anovaTwoWayShownColumns(result: any): string[] {
  const terms: unknown[] = Array.isArray(result?.terms) ? result.terms : [];
  const at = (key: string, index: number) => toFiniteNumber(Array.isArray(result?.[key]) ? result[key][index] : null);
  const residual = terms.findIndex((term) => /^residuals?$/i.test(String(term)));
  const modelTerms = terms.map((_, i) => i).filter((i) => i !== residual);
  const complete = residual >= 0 && at('df', residual) !== null && modelTerms.length > 0 &&
    modelTerms.every((i) => at('f_pvalue', i) !== null && at('f_stat', i) !== null && at('df', i) !== null);
  return complete ? ['df', 'F', 'Prob>F'] : [];
}

function anovaOneWayShownColumns(result: any): string[] {
  const table = result?.anova_table;
  const has = (key: string) => toFiniteNumber(table?.[key]) !== null;
  if (!has('p_value')) return [];
  return ['Prob>F', ...(has('f_stat') ? ['F'] : []), ...(has('f_stat') && has('df_explained') && has('df_residual') ? ['df'] : [])];
}

function rowsTrim(title: string, rows: string[]): TableTrim[] {
  return rows.length ? [{ title, rows }] : [];
}

function columnsTrim(title: string, columns: string[]): TableTrim[] {
  return columns.length ? [{ title, columns }] : [];
}

/**
 * What the figures show of each result's tables, so the result view does not repeat it on screen
 * (exports keep every table). Worked out from the result itself: a row or column is covered only
 * when the figures print its value, so nothing a figure leaves out is hidden with it.
 */
const SHOWN_AS_FIGURES: Record<string, (result: any) => TableTrim[]> = {
  ttest_independent: (result) => rowsTrim('Independent T-Test', ttestShownRows(result)),
  ttest_paired: (result) => rowsTrim('Paired T-Test', ttestShownRows(result)),
  ttest_onesample: (result) => rowsTrim('One-Sample T-Test', ttestShownRows(result)),
  chi_squared: (result) => {
    const p = toFiniteNumber(result?.p_value) !== null;
    const chi2 = p && toFiniteNumber(result?.chi2) !== null;
    return rowsTrim('Chi-Squared Test Summary', metricRows(result, [
      ['p-value', 'p_value', p],
      ['Chi-Squared statistic', 'chi2', chi2],
      ['Degrees of freedom', 'dof', chi2],
    ]));
  },
  fisher_exact: (result) => rowsTrim("Fisher's Exact Test Summary", metricRows(result, [
    ['p-value', 'p_value', true],
    ['Odds ratio', 'odds_ratio', true],
  ])),
  // One figure per comparison: the table goes only when every comparison has its figure.
  standardized_mean_difference: (result) => {
    const comparisons: any[] = Array.isArray(result?.comparisons) ? result.comparisons : [];
    return comparisons.length && comparisons.every((comparison) => toFiniteNumber(comparison?.smd) !== null)
      ? [{ title: 'Standardized Mean Difference' }]
      : [];
  },
  linear_regression_cv: (result) => rowsTrim('Error metrics', linearRegressionCvShownRows(result)),
  // F, its degrees of freedom and p are in the figures; the sums and mean squares stay.
  anova_oneway: (result) => columnsTrim('ANOVA Summary', anovaOneWayShownColumns(result)),
  anova_twoway: (result) => columnsTrim('Two-Way ANOVA', anovaTwoWayShownColumns(result)),
  // Fold mean and SD are in the accuracy figure; the per-fold rows stay.
  naive_bayes_gaussian_cv: (result) => rowsTrim('Accuracy per fold', foldAccuracy(result)?.sd != null ? ['Mean ± SD'] : []),
  naive_bayes_categorical_cv: (result) => rowsTrim('Accuracy per fold', foldAccuracy(result)?.sd != null ? ['Mean ± SD'] : []),
};

/** The parts of a result's tables its figures already show. */
export function tablesShownAsFigures(algorithm: string | null, result: any): TableTrim[] {
  const shown = algorithm ? SHOWN_AS_FIGURES[algorithm] : undefined;
  return shown && result && typeof result === 'object' ? shown(result) : [];
}

/** Headline figures for a result (hypothesis tests, cross-validated classifiers), or null when the algorithm has none. */
export function buildSummaryFigures(algorithm: string | null, result: any, context?: SummaryContext): KeyFigure[] | null {
  const builder = algorithm ? BUILDERS[algorithm] : undefined;
  if (!builder || !result || typeof result !== 'object') return null;
  const figures = builder(result, context);
  return figures.length ? figures : null;
}
