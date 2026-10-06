import {
  formatInteger,
  formatPValue,
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
  stdErrText: string;
  statText: string;
  ciText: string;
  pText: string;
  pValue: number | null;
  /** Unrounded values for export; the *Text fields are display-only. */
  estimate: number | null;
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
  /** Header of the estimate column and its CSV column ("Estimate", "Log-odds"). */
  estimateLabel: string;
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

/** Rows sorted by effect size with the intercept last; each interval is drawn on its own scale around zero. */
function buildRows(input: CoefficientInput): CoefficientRow[] {
  const rows = input.variables.map((variable, index) => {
    const estimate = toFiniteNumber(input.estimates[index]);
    const lower = toFiniteNumber(input.lower[index]);
    const upper = toFiniteNumber(input.upper[index]);
    const pValue = toFiniteNumber(input.pValues[index]);
    const stdErr = toFiniteNumber(input.stdErr[index]);
    const stat = toFiniteNumber(input.stats[index]);
    const scale = Math.max(Math.abs(estimate ?? 0), Math.abs(lower ?? 0), Math.abs(upper ?? 0)) * 1.15 || 1;
    const position = (value: number) => Math.max(0, Math.min(100, 50 + (value / scale) * 50));
    const left = lower === null ? 50 : position(lower);
    const right = upper === null ? 50 : position(upper);

    return {
      variable,
      estimateText: estimate === null ? '—' : formatSignedNumber(estimate),
      stdErrText: stdErr === null ? '—' : formatSignedNumber(stdErr),
      statText: stat === null ? '—' : formatSignedNumber(stat),
      ciText: lower === null || upper === null ? '—' : `${formatSignedNumber(lower)} to ${formatSignedNumber(upper)}`,
      pText: formatPValue(pValue),
      pValue,
      estimate,
      stdErr,
      stat,
      lower,
      upper,
      significant: pValue !== null && pValue < 0.05,
      isIntercept: /^intercept$/i.test(variable),
      plotLeft: left,
      plotWidth: Math.max(1, right - left),
      markerLeft: estimate === null ? 50 : position(estimate),
    };
  });

  return rows.sort((a, b) => {
    if (a.isIntercept !== b.isIntercept) return a.isIntercept ? 1 : -1;
    return Math.abs(b.estimate ?? 0) - Math.abs(a.estimate ?? 0);
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

/** The coefficient/fit view for a result, or null when the algorithm has none or the payload is incomplete. */
export function buildRegressionView(algorithm: string | null, result: any, yVar: string | null): RegressionView | null {
  if (!result || typeof result !== 'object') return null;
  if (algorithm === 'linear_regression') return linearView(result, yVar);
  return null;
}
