import * as d3 from 'd3';
import { formatBarCount } from './histogram-chart';
import { HistogramChartData, histogramSeriesColor } from './histogram-data';

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
export function buildGroupedCategoryClusters(
  data: HistogramChartData,
  /** Keys of every group, hidden ones included, so colours stay put when one is hidden. */
  colorKeys: string[] = (data.groups ?? []).map((group) => group.key)
): GroupedCategoryCluster[] {
  if (!data.groups?.length) return [];
  return data.groups.map((group) => ({
    key: group.key,
    label: group.label,
    color: histogramSeriesColor(Math.max(0, colorKeys.indexOf(group.key))),
    bars: data.bins.map((bin, i) => ({ bin: String(bin), count: group.counts[i] ?? null })),
  }));
}

/** Draws the clusters side by side (d3, vertical bars), one colour per cluster. */
export function createGroupedCategoryChart(
  data: HistogramChartData,
  container: HTMLElement,
  colorKeys?: string[]
): void {
  const clusters = buildGroupedCategoryClusters(data, colorKeys);
  if (!clusters.length) return;

  container.innerHTML = '';
  container.style.height = 'auto';

  const textColor = '#475569';
  const gridColor = '#e2e8f0';
  const width = container.clientWidth || 640;
  const height = 360;
  const margin = { top: 32, right: 16, bottom: 64, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
  const chart = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

  // One outer band per group; every cluster shares the inner bin scale, sized to a cluster band.
  const clusterScale = d3
    .scaleBand<string>()
    .domain(clusters.map((cluster) => cluster.key))
    .range([0, innerWidth])
    .padding(0.18);
  const binScale = d3
    .scaleBand<string>()
    .domain(clusters[0].bars.map((bar) => bar.bin))
    .range([0, clusterScale.bandwidth()])
    .padding(0.12);

  const maxCount = d3.max(
    clusters
      .flatMap((cluster) => cluster.bars.map((bar) => bar.count))
      .filter((count): count is number => count !== null)
  ) || 0;
  const yScale = d3.scaleLinear().domain([0, maxCount]).nice().range([innerHeight, 0]);

  // Grid (Y-axis only), then the visible left axis.
  chart
    .append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth).tickFormat(() => ''))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').attr('stroke', gridColor).attr('stroke-dasharray', '3,3'));

  chart
    .append('g')
    .call(d3.axisLeft(yScale).ticks(5).tickSize(0).tickPadding(8))
    .call((g) => g.select('.domain').remove())
    .selectAll('text')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', textColor);

  for (const cluster of clusters) {
    const clusterGroup = chart
      .append('g')
      .attr('class', 'grouped-category-cluster')
      .attr('transform', `translate(${clusterScale(cluster.key) || 0}, 0)`);

    for (const bar of cluster.bars) {
      const barX = binScale(bar.bin) || 0;
      const barWidth = binScale.bandwidth();
      // A privacy-hidden count draws as a zero-height bar with a dash, never as 0.
      const y = bar.count === null ? innerHeight : yScale(bar.count);
      const barHeight = bar.count === null ? 0 : Math.max(0, innerHeight - y);

      clusterGroup
        .append('rect')
        .attr('class', 'grouped-category-bar')
        .attr('x', barX)
        .attr('y', y)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('fill', cluster.color);

      clusterGroup
        .append('text')
        .attr('class', 'grouped-category-bar-count')
        .attr('x', barX + barWidth / 2)
        .attr('y', y - 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .attr('fill', textColor)
        .text(bar.count === null ? '—' : formatBarCount(bar.count));

      clusterGroup
        .append('text')
        .attr('class', 'grouped-category-bin-label')
        .attr('x', barX + barWidth / 2)
        .attr('y', innerHeight + 14)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .attr('fill', textColor)
        .text(bar.bin);
    }

    clusterGroup
      .append('text')
      .attr('class', 'grouped-category-cluster-label')
      .attr('x', clusterScale.bandwidth() / 2)
      .attr('y', innerHeight + 34)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', textColor)
      .text(cluster.label);
  }

  if (data.splitLabel) {
    chart
      .append('text')
      .attr('class', 'grouped-category-split-label')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 52)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('fill', textColor)
      .text(data.splitLabel);
  }

  container.style.height = `${height}px`;
}
