import {
  chiSquarePValue,
  formatInteger,
  formatPValue,
  formatRatio,
  formatSignedNumber,
  formatSummaryNumber,
  toFiniteNumber,
} from '../result-format';

export interface KeyFigure {
  label: string;
  value: string;
  note?: string;
}

export interface CoefficientRow {
  variable: string;
  estimateText: string;
  /** The model-scale coefficient when the estimate column shows a transform of it (log-odds behind an odds ratio). */
  coefficientText: string;
  stdErrText: string;
  statText: string;
  ciText: string;
  pText: string;
  pValue: number | null;
  /** Unrounded values for export; the *Text fields are display-only. */
  estimate: number | null;
  coefficient: number | null;
  stdErr: number | null;
  stat: number | null;
  lower: number | null;
  upper: number | null;
  significant: boolean;
  isIntercept: boolean;
  plotLeft: number;
  plotWidth: number;
  markerLeft: number;
}

export interface RegressionView {
  dependent: string;
  /** Header of the estimate column and its CSV column ("Estimate", "Odds ratio"). */
  estimateLabel: string;
  /** Header of the untransformed coefficient, shown with all columns; null when the estimate is the coefficient. */
  coefficientLabel: string | null;
  /** Where "no effect" sits on the estimate scale: 0 for a coefficient, 1 for a ratio. */
  nullValue: 0 | 1;
  /** Test statistic column ("t" for OLS, "z" for the logistic Wald test). */
  statLabel: string;
  subtitle: string;
  rows: CoefficientRow[];
  figures: KeyFigure[];
  fitMetrics: KeyFigure[];
  fitGlance: string;
}

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

interface CoefficientInput {
  variables: string[];
  estimates: unknown[];
  stdErr: unknown[];
  stats: unknown[];
  pValues: unknown[];
  lower: unknown[];
  upper: unknown[];
}

/**
 * Rows sorted by effect size with the intercept last. Each interval is drawn on its own scale around
 * zero on the model scale; `toEstimate` maps a coefficient and its CI bounds to the reported scale
 * (exp for odds ratios), so a ratio's plot is its log scale around 1.
 */
function buildRows(input: CoefficientInput, toEstimate?: (value: number) => number): CoefficientRow[] {
  const shown = (value: number | null) => (value === null || !toEstimate ? value : toEstimate(value));
  const formatShown = toEstimate ? formatRatio : formatSignedNumber;
  const rows = input.variables.map((variable, index) => {
    const coefficient = toFiniteNumber(input.estimates[index]);
    const lowerCoefficient = toFiniteNumber(input.lower[index]);
    const upperCoefficient = toFiniteNumber(input.upper[index]);
    const estimate = shown(coefficient);
    const lower = shown(lowerCoefficient);
    const upper = shown(upperCoefficient);
    const pValue = toFiniteNumber(input.pValues[index]);
    const stdErr = toFiniteNumber(input.stdErr[index]);
    const stat = toFiniteNumber(input.stats[index]);
    const scale =
      Math.max(Math.abs(coefficient ?? 0), Math.abs(lowerCoefficient ?? 0), Math.abs(upperCoefficient ?? 0)) * 1.15 || 1;
    const position = (value: number) => Math.max(0, Math.min(100, 50 + (value / scale) * 50));
    const left = lowerCoefficient === null ? 50 : position(lowerCoefficient);
    const right = upperCoefficient === null ? 50 : position(upperCoefficient);

    return {
      variable,
      estimateText: estimate === null ? '—' : formatShown(estimate),
      coefficientText: coefficient === null ? '—' : formatSignedNumber(coefficient),
      stdErrText: stdErr === null ? '—' : formatSignedNumber(stdErr),
      statText: stat === null ? '—' : formatSignedNumber(stat),
      ciText: lower === null || upper === null ? '—' : `${formatShown(lower)} to ${formatShown(upper)}`,
      pText: formatPValue(pValue),
      pValue,
      estimate,
      coefficient,
      stdErr,
      stat,
      lower,
      upper,
      significant: pValue !== null && pValue < 0.05,
      isIntercept: /^intercept$/i.test(variable),
      plotLeft: left,
      plotWidth: Math.max(1, right - left),
      markerLeft: coefficient === null ? 50 : position(coefficient),
    };
  });

  return rows.sort((a, b) => {
    if (a.isIntercept !== b.isIntercept) return a.isIntercept ? 1 : -1;
    return Math.abs(b.coefficient ?? 0) - Math.abs(a.coefficient ?? 0);
  });
}

/** Label/value pairs with blanks dropped, plus the AIC · BIC · log-likelihood glance line. */
function fitSummary(pairs: [string, string][]): Pick<RegressionView, 'fitMetrics' | 'fitGlance'> {
  const fitMetrics = pairs.filter(([, value]) => value !== '').map(([label, value]) => ({ label, value }));
  const fitGlance = fitMetrics
    .filter((metric) => ['AIC', 'BIC', 'Log-likelihood'].includes(metric.label))
    .map((metric) => `${metric.label.replace('Log-', 'log-')} ${metric.value}`)
    .join(' · ');
  return { fitMetrics, fitGlance };
}

const summary = (value: unknown) => {
  const number = toFiniteNumber(value);
  return number === null ? '' : formatSummaryNumber(number);
};

const integer = (value: number | null) => (value === null ? '' : formatInteger(value));

function linearView(result: any, yVar: string | null): RegressionView | null {
  const variables = arrayOf(result.indep_vars).map((entry) => String(entry ?? ''));
  const estimates = arrayOf(result.coefficients);
  if (!variables.length || !estimates.length) return null;

  const dependent = String(result.dependent_var ?? yVar ?? 'outcome');
  const rows = buildRows({
    variables,
    estimates,
    stdErr: arrayOf(result.std_err),
    stats: arrayOf(result.t_stats),
    pValues: arrayOf(result.pvalues),
    lower: arrayOf(result.lower_ci),
    upper: arrayOf(result.upper_ci),
  });

  const rSquared = toFiniteNumber(result.r_squared);
  const adjusted = toFiniteNumber(result.r_squared_adjusted);
  const fStat = toFiniteNumber(result.f_stat);
  const fPvalue = toFiniteNumber(result.f_pvalue);
  const rse = toFiniteNumber(result.rse);
  const nObs = toFiniteNumber(result.n_obs);
  const dfModel = toFiniteNumber(result.df_model);
  const dfResid = toFiniteNumber(result.df_resid);

  const figures: KeyFigure[] = [];
  if (rSquared !== null) {
    figures.push({
      label: 'R²',
      value: rSquared.toFixed(3),
      note: `${Math.round(rSquared * 100)}% of the variance in ${dependent} is explained`,
    });
  }
  if (adjusted !== null) {
    const predictorCount = rows.filter((row) => !row.isIntercept).length;
    figures.push({
      label: 'Adjusted R²',
      value: adjusted.toFixed(3),
      note: `Corrected for ${predictorCount} predictor${predictorCount === 1 ? '' : 's'}`,
    });
  }
  if (fPvalue !== null || fStat !== null) {
    const statText = fStat === null ? '' : formatSummaryNumber(fStat);
    const dfText = dfModel !== null && dfResid !== null ? `F(${formatInteger(dfModel)}, ${formatInteger(dfResid)})` : 'Model F';
    figures.push({
      label: 'Model F-test',
      value: fPvalue === null ? '—' : formatPValue(fPvalue),
      note: `${dfText}${statText ? ` = ${statText}` : ''}`,
    });
  }
  if (rse !== null) {
    figures.push({ label: 'Residual SE', value: formatSummaryNumber(rse), note: `${dependent} points, typical prediction error` });
  }
  if (nObs !== null) {
    figures.push({ label: 'Observations', value: formatInteger(nObs), note: 'Rows in the fitted model' });
  }

  return {
    dependent,
    estimateLabel: 'Estimate',
    coefficientLabel: null,
    nullValue: 0,
    statLabel: 't',
    subtitle: `Effect on ${dependent}, other predictors held constant`,
    rows,
    figures,
    ...fitSummary([
      ['Dependent variable', dependent],
      ['Observations', integer(nObs)],
      ['df (model)', integer(dfModel)],
      ['df (residual)', integer(dfResid)],
      ['R²', rSquared === null ? '' : rSquared.toFixed(3)],
      ['Adjusted R²', adjusted === null ? '' : adjusted.toFixed(3)],
      ['F-statistic', summary(fStat)],
      ['p-value (F)', fPvalue === null ? '' : formatPValue(fPvalue)],
      ['Residual std. error', summary(rse)],
      ['Log-likelihood', summary(result.ll)],
      ['AIC', summary(result.aic)],
      ['BIC', summary(result.bic)],
    ]),
  };
}

/** Exaflow nests the logistic fit under `summary`; indep_vars and dependent_var stay top-level. */
function logisticView(result: any, yVar: string | null): RegressionView | null {
  const fit = result.summary;
  const variables = arrayOf(result.indep_vars).map((entry) => String(entry ?? ''));
  const estimates = arrayOf(fit?.coefficients);
  if (!fit || !variables.length || !estimates.length) return null;

  const dependent = String(result.dependent_var ?? yVar ?? 'outcome');
  const rows = buildRows(
    {
      variables,
      estimates,
      stdErr: arrayOf(fit.stderr),
      stats: arrayOf(fit.z_scores),
      pValues: arrayOf(fit.pvalues),
      lower: arrayOf(fit.lower_ci),
      upper: arrayOf(fit.upper_ci),
    },
    Math.exp,
  );

  const mcFadden = toFiniteNumber(fit.r_squared_mcf);
  const coxSnell = toFiniteNumber(fit.r_squared_cs);
  const ll = toFiniteNumber(fit.ll);
  const ll0 = toFiniteNumber(fit.ll0);
  const nObs = toFiniteNumber(fit.n_obs);
  const dfModel = toFiniteNumber(fit.df_model);
  const dfResid = toFiniteNumber(fit.df_resid);
  const aic = toFiniteNumber(fit.aic);
  // Likelihood-ratio test of the fitted model against the intercept-only model.
  const lrStat = ll !== null && ll0 !== null ? 2 * (ll - ll0) : null;
  const lrPvalue = lrStat !== null && dfModel !== null && dfModel > 0 ? chiSquarePValue(lrStat, dfModel) : null;

  const figures: KeyFigure[] = [];
  if (mcFadden !== null) {
    figures.push({
      label: 'Pseudo R² (McFadden)',
      value: mcFadden.toFixed(3),
      note: 'Log-likelihood gained over the intercept-only model',
    });
  }
  if (lrPvalue !== null && lrStat !== null) {
    figures.push({
      label: 'Model LR test',
      value: formatPValue(lrPvalue),
      note: `χ²(${formatInteger(dfModel!)}) = ${formatSummaryNumber(lrStat)}`,
    });
  }
  if (aic !== null) {
    figures.push({ label: 'AIC', value: formatSummaryNumber(aic), note: 'Lower fits better when comparing models' });
  }
  if (nObs !== null) {
    figures.push({ label: 'Observations', value: formatInteger(nObs), note: 'Rows in the fitted model' });
  }

  return {
    dependent,
    estimateLabel: 'Odds ratio',
    coefficientLabel: 'Log-odds',
    nullValue: 1,
    statLabel: 'z',
    subtitle: `Effect on the odds of ${dependent}, other predictors held constant`,
    rows,
    figures,
    ...fitSummary([
      ['Dependent variable', dependent],
      ['Observations', integer(nObs)],
      ['df (model)', integer(dfModel)],
      ['df (residual)', integer(dfResid)],
      ['Pseudo R² (McFadden)', mcFadden === null ? '' : mcFadden.toFixed(3)],
      ['Pseudo R² (Cox–Snell)', coxSnell === null ? '' : coxSnell.toFixed(3)],
      ['LR χ²', summary(lrStat)],
      ['p-value (LR)', lrPvalue === null ? '' : formatPValue(lrPvalue)],
      ['Log-likelihood', summary(ll)],
      ['Null log-likelihood', summary(ll0)],
      ['AIC', summary(aic)],
      ['BIC', summary(fit.bic)],
    ]),
  };
}

/** The coefficient/fit view for a result, or null when the algorithm has none or the payload is incomplete. */
export function buildRegressionView(algorithm: string | null, result: any, yVar: string | null): RegressionView | null {
  if (!result || typeof result !== 'object') return null;
  if (algorithm === 'linear_regression') return linearView(result, yVar);
  if (algorithm === 'logistic_regression') return logisticView(result, yVar);
  return null;
}
