import { ALPHA, MipChart } from './chart-theme';
import { buildKMeansChart } from './renderers/k-means-chart';
import {
  buildHazardRatioForest, buildLinearRegressionForest, buildMixedEffectsForest, buildOddsRatioForest,
} from './renderers/regression-forest-chart';
import {
  buildAnovaTwowayChart, buildMannWhitneyChart, buildMeanPlotChart, buildSmdChart, buildTTestChart, buildTukeyForest,
} from './renderers/group-comparison-charts';
import { buildChiSquaredChart, buildFisherExactChart } from './renderers/contingency-charts';
import { buildCorrelationChart, buildPcaCharts } from './renderers/correlation-pca-charts';
import {
  buildCVMetricsChart, buildConfusionMatrixChart, buildNaiveBayesCategoricalChart, buildNaiveBayesGaussianChart,
  buildRocCurveChart, buildSVMChart,
} from './renderers/classification-charts';
import { buildBoxPlotChart, buildHistogramChart, buildOutlierReportChart } from './renderers/descriptive-charts';

/** Builders take the result and the significance level used for filled marks and blue p-values. */
type ChartBuilder = (input: any, alpha?: number) => MipChart[];

interface AlgorithmChartConfig {
  build: ChartBuilder;
  inputPath: string;
}

function composeCharts(...builders: ChartBuilder[]): ChartBuilder {
  return (result: any, alpha = ALPHA) => builders.flatMap(fn => fn(result, alpha));
}

const chart = (build: ChartBuilder): AlgorithmChartConfig => ({ build, inputPath: '' });

// chi_squared and fisher_exact draw once exaflow sends the `observed` table; until then they return no chart.
export const AlgorithmChartRegistry: Record<string, AlgorithmChartConfig> = {
  kmeans: chart(buildKMeansChart),

  linear_regression: chart(buildLinearRegressionForest),
  linear_regression_cv: chart(buildCVMetricsChart),
  logistic_regression: chart(buildOddsRatioForest),
  logistic_regression_cv: chart(composeCharts(buildConfusionMatrixChart, buildRocCurveChart, buildCVMetricsChart)),
  glmm_binary: chart(buildOddsRatioForest),
  lmm: chart(buildMixedEffectsForest),
  glmm_ordinal: chart(buildMixedEffectsForest),
  cox_regression_classical: chart(buildHazardRatioForest),
  cox_regression_stacked: chart(buildHazardRatioForest),

  naive_bayes_gaussian: chart(buildNaiveBayesGaussianChart),
  naive_bayes_categorical: chart(buildNaiveBayesCategoricalChart),
  naive_bayes_gaussian_cv: chart(buildConfusionMatrixChart),
  naive_bayes_categorical_cv: chart(buildConfusionMatrixChart),
  linear_svm: chart(buildSVMChart),

  pearson_correlation: chart(buildCorrelationChart),
  pca: chart(buildPcaCharts),
  pca_with_transformation: chart(buildPcaCharts),

  anova_oneway: chart(composeCharts(buildMeanPlotChart, buildTukeyForest)),
  anova_twoway: chart(buildAnovaTwowayChart),
  ttest_independent: chart(buildTTestChart),
  ttest_paired: chart(buildTTestChart),
  ttest_onesample: chart(buildTTestChart),
  binned_mann_whitney_u_test: chart(buildMannWhitneyChart),
  standardized_mean_difference: chart(buildSmdChart),
  chi_squared: chart(buildChiSquaredChart),
  fisher_exact: chart(buildFisherExactChart),

  describe: chart(buildBoxPlotChart),
  histogram: chart(buildHistogramChart),
  outlier_report: chart(buildOutlierReportChart),

  default: chart(() => []),
};
