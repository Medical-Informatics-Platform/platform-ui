import { EChartsOption } from 'echarts';
import { TableTrim } from '../auto-renderer/algorithm-table-registry';
import { buildRocCurveChart } from './renderers/roc-curve-chart';
import { buildMatrixChart } from './renderers/matrix-chart';

import { buildPCAHeatmapChart } from './renderers/pca-heatmap-chart';
import { buildNaiveBayesConfusionChart } from './renderers/naive-bayes-confusion-matrix-chart';
import { buildLogRegConfusionChart } from './renderers/log-reg-confusion-matrix-chart';
import { buildKMeansChart } from './renderers/k-means-chart';
import { buildMeanPlotChart, buildTTestIntervalChart } from './renderers/mean-plot-chart';
import { buildBoxPlotChart } from './renderers/box-plot-chart';
import { buildSVMChart } from './renderers/svm-chart';

import { buildHistogramChart } from './renderers/histogram-chart';
import { buildNaiveBayesPriorsChart, buildNaiveBayesProfileChart } from './renderers/naive-bayes-priors-chart';

/** What one chart shows of a result table, named by that chart's title text. */
interface ChartTableTrim extends TableTrim {
  byChart: string;
}

interface AlgorithmChartConfig {
  build: (input: any) => EChartsOption[];
  /** Heading of the chart section on the result page. */
  title: string;
  /** What these charts show of the result tables, each left out on screen only when the chart named
   *  in `byChart` rendered: another chart of the same result does not stand in for it. */
  replaces?: ChartTableTrim[];
  /** How to read the charts, in plain language, shown under them. */
  note?: string;
}

const PCA_REPLACES: ChartTableTrim[] = [
  { title: 'PCA Summary', byChart: 'Variance explained' },
  { title: 'Component weights', byChart: 'Component weights' },
];

function composeCharts(...builders: ((result: any) => EChartsOption[])[]): (result: any) => EChartsOption[] {
  return (result: any) => builders.flatMap(fn => fn(result));
}

export const AlgorithmChartRegistry: Record<string, AlgorithmChartConfig> = {
  // The heatmap prints every centre in its cells; the two-variable bubble chart only places them,
  // so with two variables the centres table stays.
  kmeans: { build: buildKMeansChart, title: 'Cluster centres', replaces: [{ title: 'Cluster Centers', byChart: 'Cluster centres' }] },
  logistic_regression_cv: {
    build: composeCharts(buildLogRegConfusionChart, buildRocCurveChart),
    title: 'Classification performance',
  },
  naive_bayes_gaussian: {
    build: composeCharts(buildNaiveBayesPriorsChart, buildNaiveBayesProfileChart),
    title: 'Classes',
    replaces: [{ title: 'Class Summary', byChart: 'Class Prior Probabilities' }],
    note:
      "In the class profiles, each dot shows how far one class's average for a variable lies from that variable's overall average, " +
      'in standard deviations (0 is the overall average). The further apart the dots on a row, the better that variable tells the classes apart.',
  },
  naive_bayes_categorical: {
    build: buildNaiveBayesPriorsChart,
    title: 'Class priors',
    replaces: [{ title: 'Class Summary', byChart: 'Class Prior Probabilities' }],
  },
  naive_bayes_gaussian_cv: {
    build: buildNaiveBayesConfusionChart,
    title: 'Classification performance',
    replaces: [{ title: 'Confusion Matrix (Combined)', byChart: 'Confusion Matrix' }],
  },
  naive_bayes_categorical_cv: {
    build: buildNaiveBayesConfusionChart,
    title: 'Classification performance',
    replaces: [{ title: 'Confusion Matrix (Combined)', byChart: 'Confusion Matrix' }],
  },
  // The pairs table keeps r: it is sorted by strength, and the value it is sorted by belongs in it.
  pearson_correlation: { build: buildMatrixChart, title: 'Correlation matrix' },
  pca: { build: buildPCAHeatmapChart, title: 'Principal components', replaces: PCA_REPLACES },
  anova_oneway: { build: buildMeanPlotChart, title: 'Group means' },
  linear_svm: { build: buildSVMChart, title: 'Model weights' },
  describe: { build: buildBoxPlotChart, title: 'Distributions' },
  histogram: { build: buildHistogramChart, title: 'Distribution' },
  ttest_independent: { build: buildTTestIntervalChart, title: 'Mean difference' },
};

function chartTitle(chart: EChartsOption): string | null {
  const title = Array.isArray(chart.title) ? chart.title[0] : chart.title;
  return typeof title?.text === 'string' ? title.text : null;
}

/** The result tables an algorithm's rendered charts stand in for on screen: each only when its chart is among them. */
export function tablesReplacedByCharts(algorithm: string | null, charts: EChartsOption[]): TableTrim[] {
  const replaces = algorithm ? AlgorithmChartRegistry[algorithm]?.replaces ?? [] : [];
  const rendered = new Set(charts.map(chartTitle));
  return replaces
    .filter((entry) => rendered.has(entry.byChart))
    .map(({ title, columns, rows }) => ({ title, ...(columns ? { columns } : {}), ...(rows ? { rows } : {}) }));
}
