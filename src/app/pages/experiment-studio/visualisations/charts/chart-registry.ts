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

interface AlgorithmChartConfig {
  build: (input: any) => EChartsOption[];
  /** Heading of the chart section on the result page. */
  title: string;
  /** What these charts already show of the result tables; left out on screen when the charts rendered. */
  replaces?: TableTrim[];
  /** How to read the charts, in plain language, shown under them. */
  note?: string;
}

function composeCharts(...builders: ((result: any) => EChartsOption[])[]): (result: any) => EChartsOption[] {
  return (result: any) => builders.flatMap(fn => fn(result));
}

export const AlgorithmChartRegistry: Record<string, AlgorithmChartConfig> = {
  kmeans: { build: buildKMeansChart, title: 'Cluster centres', replaces: [{ title: 'Cluster Centers' }] },
  logistic_regression_cv: {
    build: composeCharts(buildLogRegConfusionChart, buildRocCurveChart),
    title: 'Classification performance',
  },
  naive_bayes_gaussian: {
    build: composeCharts(buildNaiveBayesPriorsChart, buildNaiveBayesProfileChart),
    title: 'Classes',
    replaces: [{ title: 'Class Summary' }],
    note:
      "In the class profiles, each dot shows how far one class's average for a variable lies from that variable's overall average, " +
      'in standard deviations (0 is the overall average). The further apart the dots on a row, the better that variable tells the classes apart.',
  },
  naive_bayes_categorical: { build: buildNaiveBayesPriorsChart, title: 'Class priors', replaces: [{ title: 'Class Summary' }] },
  naive_bayes_gaussian_cv: { build: buildNaiveBayesConfusionChart, title: 'Classification performance', replaces: [{ title: 'Confusion Matrix (Combined)' }] },
  naive_bayes_categorical_cv: { build: buildNaiveBayesConfusionChart, title: 'Classification performance', replaces: [{ title: 'Confusion Matrix (Combined)' }] },
  // The pairs table keeps r: it is sorted by strength, and the value it is sorted by belongs in it.
  pearson_correlation: { build: buildMatrixChart, title: 'Correlation matrix' },
  pca: { build: buildPCAHeatmapChart, title: 'Principal components', replaces: [{ title: 'PCA Summary' }, { title: 'Component weights' }] },
  pca_with_transformation: { build: buildPCAHeatmapChart, title: 'Principal components', replaces: [{ title: 'PCA Summary' }, { title: 'Component weights' }] },
  anova_oneway: { build: buildMeanPlotChart, title: 'Group means' },
  linear_svm: { build: buildSVMChart, title: 'Model weights' },
  describe: { build: buildBoxPlotChart, title: 'Distributions' },
  histogram: { build: buildHistogramChart, title: 'Distribution' },
  ttest_independent: { build: buildTTestIntervalChart, title: 'Mean difference' },
};
