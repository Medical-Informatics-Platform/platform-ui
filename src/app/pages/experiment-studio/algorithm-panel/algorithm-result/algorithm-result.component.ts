import { ChartBuilderService } from './../../visualisations/charts/chart-builder.service';
import { Component, input, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutoRendererComponent } from '../../visualisations/auto-renderer/auto-renderer.component';
import { ChartRendererComponent } from '../../visualisations/charts/charts-renderer/charts-renderer.component';
import { NgxEchartsModule } from 'ngx-echarts';
import { EnumMaps, LabelMap, mapAlgorithmResultEnums } from '../../../../core/algorithm-result-enum-mapper';
import { prettifyLabel } from '../../../../core/algorithm-mappers';
import { CsvExportService } from '../../../../services/csv-export.service';

type CoefficientColumnMode = 'key' | 'all';

interface LinearCoefficientRow {
  variable: string;
  estimateText: string;
  stdErrText: string;
  tText: string;
  ciText: string;
  pText: string;
  pValue: number | null;
  /** Unrounded values for export; the *Text fields are display-only. */
  estimate: number | null;
  stdErr: number | null;
  t: number | null;
  lower: number | null;
  upper: number | null;
  significant: boolean;
  isIntercept: boolean;
  plotLeft: number;
  plotWidth: number;
  markerLeft: number;
}

interface LinearKeyFigure {
  label: string;
  value: string;
  note: string;
}

interface LinearFitMetric {
  label: string;
  value: string;
}

interface LinearRegressionView {
  dependent: string;
  rows: LinearCoefficientRow[];
  figures: LinearKeyFigure[];
  fitMetrics: LinearFitMetric[];
  fitGlance: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function formatSignedNumber(value: number): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  return `${sign}${abs.toFixed(abs < 1 ? 3 : 2)}`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatSummaryNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000) return formatInteger(value);
  return formatSignedNumber(value);
}

function formatPValue(value: number | null): string {
  if (value === null) return '—';
  if (value < 0.001) return '< 0.001';
  return value.toFixed(3);
}

@Component({
  selector: 'app-algorithm-result',
  imports: [CommonModule,
    AutoRendererComponent,
    ChartRendererComponent,
    NgxEchartsModule],
  templateUrl: './algorithm-result.component.html',
  styleUrl: './algorithm-result.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlgorithmResultComponent {
  private chartBuilder = inject(ChartBuilderService);
  private readonly csvExport = inject(CsvExportService);

  result = input<any>(null);
  schema = input<any[]>([]);
  algorithm = input.required<string>();
  algorithmLabel = input<string | null>(null);
  enumMaps = input<EnumMaps | null>(null);
  yVar = input<string | null>(null);
  xVar = input<string | null>(null);
  labelMap = input<LabelMap | null>(null);

  readonly coefficientColumns = signal<CoefficientColumnMode>('key');
  readonly fitOpen = signal(false);

  readonly linearRegression = computed<LinearRegressionView | null>(() => {
    const algorithm = String(this.algorithm() ?? '');
    const result = this.mappedResult();
    if (!result || !algorithm.startsWith('linear_regression')) return null;

    const indepVars: string[] = Array.isArray(result.indep_vars)
      ? result.indep_vars.map((entry: unknown) => String(entry ?? ''))
      : [];
    const coefficients: unknown[] = Array.isArray(result.coefficients) ? result.coefficients : [];
    const stdErr: unknown[] = Array.isArray(result.std_err) ? result.std_err : [];
    const tStats: unknown[] = Array.isArray(result.t_stats) ? result.t_stats : [];
    const pValues: unknown[] = Array.isArray(result.pvalues) ? result.pvalues : [];
    const lowerCi: unknown[] = Array.isArray(result.lower_ci) ? result.lower_ci : [];
    const upperCi: unknown[] = Array.isArray(result.upper_ci) ? result.upper_ci : [];

    if (!indepVars.length || !coefficients.length) return null;

    const dependent = String(result.dependent_var ?? this.yVar() ?? 'outcome');
    const rawRows = indepVars.map((variable, index) => {
      const estimate = toFiniteNumber(coefficients[index]);
      const lower = toFiniteNumber(lowerCi[index]);
      const upper = toFiniteNumber(upperCi[index]);
      const pValue = toFiniteNumber(pValues[index]);
      const stdErrValue = toFiniteNumber(stdErr[index]);
      const tValue = toFiniteNumber(tStats[index]);
      const isIntercept = /^intercept$/i.test(variable);
      const scale =
        Math.max(
          Math.abs(estimate ?? 0),
          Math.abs(lower ?? 0),
          Math.abs(upper ?? 0)
        ) * 1.15 || 1;
      const position = (value: number) => Math.max(0, Math.min(100, 50 + (value / scale) * 50));
      const left = lower === null ? 50 : position(lower);
      const right = upper === null ? 50 : position(upper);
      const marker = estimate === null ? 50 : position(estimate);

      return {
        variable,
        estimateText: estimate === null ? '—' : formatSignedNumber(estimate),
        stdErrText: stdErrValue === null ? '—' : formatSignedNumber(stdErrValue),
        tText: tValue === null ? '—' : formatSignedNumber(tValue),
        ciText:
          lower === null || upper === null
            ? '—'
            : `${formatSignedNumber(lower)} to ${formatSignedNumber(upper)}`,
        pText: formatPValue(pValue),
        pValue,
        estimate,
        stdErr: stdErrValue,
        t: tValue,
        lower,
        upper,
        significant: pValue !== null && pValue < 0.05,
        isIntercept,
        plotLeft: left,
        plotWidth: Math.max(1, right - left),
        markerLeft: marker,
      };
    });

    const rows: LinearCoefficientRow[] = rawRows.sort((a, b) => {
      if (a.isIntercept !== b.isIntercept) return a.isIntercept ? 1 : -1;
      return Math.abs(b.estimate ?? 0) - Math.abs(a.estimate ?? 0);
    });

    const figures: LinearKeyFigure[] = [];
    const rSquared = toFiniteNumber(result.r_squared);
    const adjusted = toFiniteNumber(result.r_squared_adjusted);
    const fStat = toFiniteNumber(result.f_stat);
    const fPvalue = toFiniteNumber(result.f_pvalue);
    const rse = toFiniteNumber(result.rse);
    const nObs = toFiniteNumber(result.n_obs);
    const dfModel = toFiniteNumber(result.df_model);
    const dfResid = toFiniteNumber(result.df_resid);

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
      const dfText =
        dfModel !== null && dfResid !== null
          ? `F(${formatInteger(dfModel)}, ${formatInteger(dfResid)})`
          : 'Model F';
      figures.push({
        label: 'Model F-test',
        value: fPvalue === null ? '—' : formatPValue(fPvalue),
        note: `${dfText}${statText ? ` = ${statText}` : ''}`,
      });
    }
    if (rse !== null) {
      figures.push({
        label: 'Residual SE',
        value: formatSummaryNumber(rse),
        note: `${dependent} points, typical prediction error`,
      });
    }
    if (nObs !== null) {
      figures.push({
        label: 'Observations',
        value: formatInteger(nObs),
        note: 'Rows in the fitted model',
      });
    }

    const summary = (value: unknown) => {
      const number = toFiniteNumber(value);
      return number === null ? '' : formatSummaryNumber(number);
    };
    const fitMetrics: LinearFitMetric[] = [
      ['Dependent variable', dependent],
      ['Observations', nObs === null ? '' : formatInteger(nObs)],
      ['df (model)', dfModel === null ? '' : formatInteger(dfModel)],
      ['df (residual)', dfResid === null ? '' : formatInteger(dfResid)],
      ['R²', rSquared === null ? '' : rSquared.toFixed(3)],
      ['Adjusted R²', adjusted === null ? '' : adjusted.toFixed(3)],
      ['F-statistic', summary(fStat)],
      ['p-value (F)', fPvalue === null ? '' : formatPValue(fPvalue)],
      ['Residual std. error', summary(rse)],
      ['Log-likelihood', summary(result.ll)],
      ['AIC', summary(result.aic)],
      ['BIC', summary(result.bic)],
    ]
      .filter(([, value]) => value !== '')
      .map(([label, value]) => ({ label, value }));

    const fitGlance = fitMetrics
      .filter((metric) => ['AIC', 'BIC', 'Log-likelihood'].includes(metric.label))
      .map((metric) => `${metric.label.replace('Log-', 'log-')} ${metric.value}`)
      .join(' · ');

    return { dependent, rows, figures, fitMetrics, fitGlance };
  });

  /** Raw, unrounded numbers with an ASCII minus and separate CI bounds, so the file
   *  reads as numeric columns in a spreadsheet or R; blanks stand for missing values. */
  downloadCoefficientsCsv(): void {
    const model = this.linearRegression();
    if (!model) return;

    const allColumns = this.coefficientColumns() === 'all';
    const headers = [
      'Variable',
      'Estimate',
      ...(allColumns ? ['Std. error', 't'] : []),
      'CI 95% lower',
      'CI 95% upper',
      'p',
    ];
    const raw = (value: number | null) => (value === null ? '' : String(value));
    const rows = model.rows.map((row) => ({
      'Variable': row.variable,
      'Estimate': raw(row.estimate),
      'Std. error': raw(row.stdErr),
      't': raw(row.t),
      'CI 95% lower': raw(row.lower),
      'CI 95% upper': raw(row.upper),
      'p': raw(row.pValue),
    }));
    const slug = model.dependent.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'coefficients';
    this.csvExport.exportToCsv(rows, headers, `${slug}_coefficients.csv`);
  }

  constructor() { }

  errorMessage = computed(() => {
    if (!this.result()) return null;
    if (this.result()?.status === 'error') {
      return this.result()?.error || this.result()?.message || 'An error occurred.';
    }
    return this.result()?.error ?? null;
  });

  isRenderable = computed(() => {
    return !!this.result() && !!this.algorithm() && !this.errorMessage();
  });

  mappedResult = computed(() =>
    this.errorMessage()
      ? this.result()
      : mapAlgorithmResultEnums(this.algorithm(), this.result(), this.enumMaps(), {
        y: this.yVar(),
        x: this.xVar(),
      }, this.labelMap())
  );

  fallbackResultTitle = computed(() => {
    const explicitTitle = this.mappedResult()?.title;
    if (typeof explicitTitle === 'string' && explicitTitle.trim()) {
      return explicitTitle.trim();
    }

    const label = this.algorithmLabel()?.trim();
    if (label) return `Result ${label}`;

    return `Result ${prettifyLabel(this.algorithm()) || 'Algorithm'}`;
  });


  renderedCharts = computed(() => {
    if (!this.result() || !this.algorithm() || this.errorMessage()) return [];
    return this.chartBuilder.getChartsForAlgorithm(this.algorithm(), this.mappedResult(), this.fallbackResultTitle());
  });
}

