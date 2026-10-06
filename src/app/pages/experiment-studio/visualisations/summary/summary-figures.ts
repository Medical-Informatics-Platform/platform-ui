import { formatInteger, formatPValue, formatRatio, formatSignedNumber, formatSummaryNumber, toFiniteNumber } from '../result-format';
import { readConfusionMatrix } from '../charts/renderers/confusion-matrix-chart';
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

/** Vargha–Delaney A: 0.56 small, 0.64 medium, 0.71 large, symmetric around 0.5. */
function probabilityMagnitude(value: number): string {
  const distance = Math.abs(value - 0.5);
  if (distance < 0.06) return 'Negligible';
  if (distance < 0.14) return 'Small';
  if (distance < 0.21) return 'Medium';
  return 'Large';
}

const first = (result: any, keys: string[]): number | null => {
  for (const key of keys) {
    const value = toFiniteNumber(result?.[key]);
    if (value !== null) return value;
  }
  return null;
};

function ttestFigures(result: any): KeyFigure[] {
  const figures: KeyFigure[] = [];
  const meanDiff = first(result, ['mean_diff']);
  const lower = first(result, ['ci_lower']);
  const upper = first(result, ['ci_upper']);
  const t = first(result, ['t_stat']);
  const df = first(result, ['df', 'dof']);
  const p = first(result, ['p', 'p_value']);
  const d = first(result, ['cohens_d', 'cohen_d']);
  const nObs = first(result, ['n_obs']);

  if (meanDiff !== null) {
    figures.push({
      label: 'Mean difference',
      value: formatSignedNumber(meanDiff),
      note: lower !== null && upper !== null ? `95% CI ${formatSignedNumber(lower)} to ${formatSignedNumber(upper)}` : undefined,
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
    figures.push({ label: 'Observations', value: formatInteger(nObs), note: 'Rows in the test' });
  }
  return figures;
}

function mannWhitneyFigures(result: any): KeyFigure[] {
  const figures: KeyFigure[] = [];
  const u = first(result, ['u_stat']);
  const z = first(result, ['z_score']);
  const p = first(result, ['p_value']);
  const n1 = first(result, ['n1']);
  const n2 = first(result, ['n2']);

  if (p !== null) {
    const parts = [u === null ? '' : `U = ${formatSummaryNumber(u)}`, z === null ? '' : `z = ${formatSignedNumber(z)}`];
    figures.push({ label: 'p-value', value: formatPValue(p), note: parts.filter(Boolean).join(', ') || undefined });
  }
  // Exaflow reports U for group A, so U / (n1·n2) is the chance a group A value outranks a group B value.
  if (u !== null && n1 && n2) {
    const probability = u / (n1 * n2);
    figures.push({
      label: 'P(A > B)',
      value: probability.toFixed(2),
      note: `${probabilityMagnitude(probability)} effect · chance a group A value ranks above group B, ties half`,
    });
  }
  if (n1 !== null && n2 !== null) {
    figures.push({ label: 'Group sizes', value: `${formatInteger(n1)} · ${formatInteger(n2)}`, note: 'Group A · group B' });
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

/**
 * Cross-validated classifiers: fold accuracy next to the majority-class baseline it has to beat,
 * then balanced accuracy and macro F1 from the pooled confusion matrix (both weigh every class
 * equally, so a large majority class cannot carry them), and the mean ROC AUC when folds report one.
 */
function classificationCvFigures(result: any): KeyFigure[] {
  const figures: KeyFigure[] = [];
  const accuracy = foldAccuracy(result);
  const confusion = readConfusionMatrix(result?.confusion_matrix);

  if (accuracy) {
    const spread = accuracy.sd === null ? '' : `± ${(accuracy.sd * 100).toFixed(1)} pts`;
    const folds = accuracy.folds ? `across ${accuracy.folds} folds` : '';
    figures.push({ label: 'Accuracy', value: percent(accuracy.mean), note: [spread, folds].filter(Boolean).join(' ') || undefined });
  }

  if (confusion) {
    const { labels, matrix } = confusion;
    const rowTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
    const colTotals = labels.map((_, j) => matrix.reduce((sum, row) => sum + row[j], 0));
    const total = rowTotals.reduce((sum, value) => sum + value, 0);
    const supported = labels.map((_, i) => i).filter((i) => rowTotals[i] > 0);

    if (total > 0) {
      const majority = supported.reduce((best, i) => (rowTotals[i] > rowTotals[best] ? i : best), supported[0]);
      figures.push({
        label: 'Majority baseline',
        value: percent(rowTotals[majority] / total),
        note: `Accuracy of always predicting ${labels[majority]}`,
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

const BUILDERS: Record<string, (result: any) => KeyFigure[]> = {
  linear_regression_cv: linearRegressionCvFigures,
  naive_bayes_gaussian_cv: classificationCvFigures,
  naive_bayes_categorical_cv: classificationCvFigures,
  logistic_regression_cv: classificationCvFigures,
  ttest_independent: ttestFigures,
  ttest_paired: ttestFigures,
  ttest_onesample: ttestFigures,
  binned_mann_whitney_u_test: mannWhitneyFigures,
  chi_squared: chiSquaredFigures,
  fisher_exact: fisherFigures,
  anova_oneway: anovaOneWayFigures,
  anova_twoway: anovaTwoWayFigures,
  standardized_mean_difference: smdFigures,
};

/** Headline figures for a result (hypothesis tests, cross-validated classifiers), or null when the algorithm has none. */
export function buildSummaryFigures(algorithm: string | null, result: any): KeyFigure[] | null {
  const builder = algorithm ? BUILDERS[algorithm] : undefined;
  if (!builder || !result || typeof result !== 'object') return null;
  const figures = builder(result);
  return figures.length ? figures : null;
}
