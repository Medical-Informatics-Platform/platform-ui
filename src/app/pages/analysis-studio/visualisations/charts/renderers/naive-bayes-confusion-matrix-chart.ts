import { EChartsOption } from 'echarts';
import { buildConfusionMatrixChart } from './confusion-matrix-chart';

export function buildNaiveBayesConfusionChart(result: any): EChartsOption[] {
  return buildConfusionMatrixChart(result);
}

