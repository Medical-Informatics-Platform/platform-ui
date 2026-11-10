import { HistogramChartData } from './histogram-data';

/** One cluster of bars: a split group (dataset or category) with one bar per category bin. */
export interface GroupedCategoryCluster {
  key: string;
  label: string;
  color: string;
  bars: Array<{ bin: string; count: number | null }>;
}

/**
 * Clusters for a categorical variable split by another category: one cluster per group,
 * in group order, each holding one bar per bin of the plotted variable.
 */
export function buildGroupedCategoryClusters(data: HistogramChartData): GroupedCategoryCluster[] {
  void data;
  throw new Error('not implemented');
}

/** Draws the clusters side by side (d3, vertical bars), one colour per cluster. */
export function createGroupedCategoryChart(data: HistogramChartData, container: HTMLElement): void {
  void data;
  void container;
  throw new Error('not implemented');
}
