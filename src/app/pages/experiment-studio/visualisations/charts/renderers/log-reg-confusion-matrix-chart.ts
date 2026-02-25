import { EChartsOption } from 'echarts';
import { buildConfusionMatrixChart } from './confusion-matrix-chart';

export function buildLogRegConfusionChart(result: any): EChartsOption[] {
  return buildConfusionMatrixChart(result);
}

