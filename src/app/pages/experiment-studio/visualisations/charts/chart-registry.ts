import { EChartsOption } from 'echarts';
import { buildRocCurveChart } from './renderers/roc-curve-chart';
import { buildMatrixChart } from './renderers/matrix-chart';

import { buildPCAHeatmapChart } from './renderers/pca-heatmap-chart';
import { buildNaiveBayesConfusionChart } from './renderers/naive-bayes-confusion-matrix-chart';
import { buildLogRegConfusionChart } from './renderers/log-reg-confusion-matrix-chart';
import { buildKMeansChart } from './renderers/k-means-chart';
import { buildMeanPlotChart } from './renderers/mean-plot-chart';
import { buildBoxPlotChart } from './renderers/box-plot-chart';
import { buildSVMChart } from './renderers/svm-chart';

import { buildHistogramChart } from './renderers/histogram-chart';
import { buildNaiveBayesPriorsChart } from './renderers/naive-bayes-priors-chart';
import { buildCoxHazardRatioForestChart } from './renderers/cox-hazard-ratio-forest-chart';

interface AlgorithmChartConfig {
  build: (input: any) => EChartsOption[];
  /** Heading of the chart section on the result page. */
  title: string;
}

function composeCharts(...builders: ((result: any) => EChartsOption[])[]): (result: any) => EChartsOption[] {
  return (result: any) => builders.flatMap(fn => fn(result));
}

export const AlgorithmChartRegistry: Record<string, AlgorithmChartConfig> = {
  kmeans: { build: buildKMeansChart, title: 'Cluster centres' },
  logistic_regression_cv: {
    build: composeCharts(buildLogRegConfusionChart, buildRocCurveChart),
    title: 'Classification performance',
  },
  naive_bayes_gaussian: { build: buildNaiveBayesPriorsChart, title: 'Class priors' },
  naive_bayes_categorical: { build: buildNaiveBayesPriorsChart, title: 'Class priors' },
  naive_bayes_gaussian_cv: { build: buildNaiveBayesConfusionChart, title: 'Classification performance' },
  naive_bayes_categorical_cv: { build: buildNaiveBayesConfusionChart, title: 'Classification performance' },
  pearson_correlation: { build: buildMatrixChart, title: 'Correlation matrix' },
  pca: { build: buildPCAHeatmapChart, title: 'Principal components' },
  pca_with_transformation: { build: buildPCAHeatmapChart, title: 'Principal components' },
  anova_oneway: { build: buildMeanPlotChart, title: 'Group means' },
  linear_svm: { build: buildSVMChart, title: 'Model weights' },
  describe: { build: buildBoxPlotChart, title: 'Distributions' },
  histogram: { build: buildHistogramChart, title: 'Distribution' },
  cox_regression_classical: { build: buildCoxHazardRatioForestChart, title: 'Hazard ratios' },
  cox_regression_stacked: { build: buildCoxHazardRatioForestChart, title: 'Hazard ratios' },
};
