import * as d3 from 'd3';
import {
  attachChartTooltip,
  formatBarCount,
  histogramAxisTitle,
  preventChartScrollbar,
  styleAxisTitle,
  topRoundedBarPath,
} from './histogram-chart';
import {
  HistogramChartData,
  HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP,
  histogramSeriesColor,
  histogramSeriesEdgeColor,
} from './histogram-data';

/** One cluster of bars: a split group (dataset or category) with one bar per category bin. */
export interface GroupedCategoryCluster {
  key: string;
  label: string;
  color: string;
  bars: Array<{ bin: string; count: number | null }>;
}

/**
 * Clusters for a categorical variable split by another category: one cluster per group,
 * in group order, each holding one bar per bin of the plotted variable. The chart
 * draws them as grouped bars on one shared bin axis (see `createGroupedCategoryChart`).
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

/** One ellipsis-aware axis row per bin: the visible label plus the full label for its `<title>`. */
interface BinLabel {
  bin: string;
  shown: string;
}

interface GroupedBar {
  bin: string;
  groupKey: string;
  groupLabel: string;
  color: string;
  count: number | null;
  x: number;
  width: number;
  y: number;
  height: number;
}

const ELLIPSIS = '…';
const UNMEASURED_LABEL_WIDTH_PX = 46;
const BAR_OPACITY = 0.9;
const BAR_RADIUS = 4;

/** Takes the largest leading slice of `bin` that fits `maxChars`, ending in one ellipsis. */
function truncate(bin: string, maxChars: number): string {
  if (bin.length <= maxChars) return bin;
  if (maxChars <= 1) return ELLIPSIS;
  return `${bin.slice(0, maxChars - 1)}${ELLIPSIS}`;
}

/**
 * One shared category axis for the grouped bars. The outer band is the plotted
 * variable's bins (each label once, centred on its group cluster); the inner
 * band is the split groups, so every bin holds its visible groups side by side.
 * `cluster.color` / `histogramSeriesColor` and the `colorKeys` slot logic live
 * in {@link buildGroupedCategoryClusters}; bars are grouped, never stacked
 * (groups can overlap — a pooled dataset plus its parts — so a stack would
 * double count). Group identity is the show/hide chips in `histogram.component.ts`.
 *
 * Bin labels never overlap: when a bin band is too narrow for its label the
 * labels rotate about -35 degrees (text-anchor end) and long ones are
 * truncated with an ellipsis plus an SVG `<title>` holding the full text.
 * Count labels above bars are skipped when a bar is too narrow to read.
 * Hover uses the same HTML tooltip as the unsplit histogram, with the group
 * label in the title; a privacy-hidden (`null`) count is a zero-height bar.
 */
export function createGroupedCategoryChart(
  data: HistogramChartData,
  container: HTMLElement,
  colorKeys?: string[]
): void {
  const clusters = buildGroupedCategoryClusters(data, colorKeys);
  if (!clusters.length) return;

  const bins = clusters[0].bars.map((bar) => bar.bin);
  if (!bins.length) return;

  container.innerHTML = '';
  container.style.height = 'auto';
  container.style.minHeight = '0';
  preventChartScrollbar(container);

  const textColor = '#475569';
  const gridColor = '#e2e8f0';
  const domainColor = '#cbd5e1';
  const width = container.clientWidth || 640;
  const innerHeight = 240;
  const yLabelText = 'Count';

  const svg = d3.select(container).append('svg').attr('width', width);
  const tempLabel = svg
    .append('text')
    .attr('x', -9999)
    .attr('y', -9999)
    .style('font-size', '12px')
    .text(yLabelText);
  const yLabelBBox = (tempLabel.node() as SVGTextElement | null)?.getBBox();
  tempLabel.remove();
  const measuredYLabelWidth = yLabelBBox && yLabelBBox.width > 0
    ? yLabelBBox.width
    : UNMEASURED_LABEL_WIDTH_PX;
  const yAxisGutter = 28 + measuredYLabelWidth + 4;

  const longestLabel = Math.max(...bins.map((bin) => bin.length), 1);
  const axisTitleSpace = data.variableName ? 22 : 0;
  const margin = {
    top: 18,
    right: 8,
    bottom: 52 + axisTitleSpace,
    left: yAxisGutter,
  };

  const bandScales = (left: number) => {
    const inner = Math.max(0, width - left - margin.right);
    const binBand = d3.scaleBand<string>().domain(bins).range([0, inner]).padding(0.2);
    const groupBand = d3
      .scaleBand<string>()
      .domain(clusters.map((cluster) => cluster.key))
      .range([0, binBand.bandwidth()])
      .padding(0.08);
    return { innerWidth: inner, binBandScale: binBand, groupScale: groupBand };
  };

  let { innerWidth, binBandScale, groupScale } = bandScales(margin.left);
  let binBandWidth = binBandScale.bandwidth();
  const rotateLabels = longestLabel * 6.5 > binBandWidth;
  const maxBinLabelChars = rotateLabels
    ? Math.max(8, Math.min(longestLabel, Math.floor(binBandWidth / 5)))
    : longestLabel;
  const binLabels: BinLabel[] = bins.map((bin) => ({ bin, shown: truncate(bin, maxBinLabelChars) }));
  if (rotateLabels) {
    const firstLabelReach = binLabels[0].shown.length * 6.5 * Math.cos(Math.PI * 35 / 180);
    margin.left = Math.max(margin.left, Math.ceil(firstLabelReach));
    margin.bottom = Math.min(
      160,
      24 + binLabels.reduce((len, label) => Math.max(len, label.shown.length), 1) * 6 + 12 + axisTitleSpace,
    );
    ({ innerWidth, binBandScale, groupScale } = bandScales(margin.left));
    binBandWidth = binBandScale.bandwidth();
  }
  const groupBarWidth = groupScale.bandwidth();
  let containerHeight = margin.top + innerHeight + margin.bottom;
  svg.attr('height', containerHeight);

  const chart = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

  const maxCount = d3.max(
    clusters
      .flatMap((cluster) => cluster.bars.map((bar) => bar.count))
      .filter((count): count is number => count !== null)
  ) || 0;
  const yScale = d3.scaleLinear().domain([0, maxCount]).nice().range([innerHeight, 0]);

  chart
    .append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale).ticks(6).tickSize(-innerWidth).tickFormat(() => ''))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').attr('stroke', gridColor).attr('stroke-dasharray', '3,3'));

  chart
    .append('g')
    .call(
      d3.axisLeft(yScale)
        .ticks(6)
        .tickFormat((d: any) => (Number.isInteger(d) ? d3.format('~s')(d) : ''))
        .tickSize(0)
        .tickPadding(8)
    )
    .call((g) => g.select('.domain').remove())
    .selectAll('text')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', textColor);

  const { showTooltip, moveTooltip, hideTooltip } = attachChartTooltip(
    container,
    (binLabel) => `${data.variableName ? data.variableName + ' · ' : ''}${binLabel}`,
  );

  const barData: GroupedBar[] = [];
  for (const bin of bins) {
    const binX = binBandScale(bin) || 0;
    for (const cluster of clusters) {
      const bar = cluster.bars.find((candidate) => candidate.bin === bin);
      if (!bar) continue;
      const barX = binX + (groupScale(cluster.key) || 0);
      const y = bar.count === null ? innerHeight : yScale(bar.count);
      barData.push({
        bin,
        groupKey: cluster.key,
        groupLabel: cluster.label,
        color: cluster.color,
        count: bar.count,
        x: barX,
        width: groupBarWidth,
        y,
        height: Math.max(0, innerHeight - y),
      });
    }
  }

  const hoverBand = chart
    .append('rect')
    .attr('y', 0)
    .attr('width', binBandWidth + binBandScale.step() * binBandScale.paddingInner())
    .attr('height', innerHeight)
    .attr('rx', BAR_RADIUS)
    .attr('fill', 'rgba(43, 51, 233, 0.06)')
    .attr('visibility', 'hidden')
    .style('pointer-events', 'none');

  chart
    .selectAll('.grouped-category-bar')
    .data(barData)
    .enter()
    .append('path')
    .attr('class', 'bar grouped-category-bar')
    .attr('data-bin', (d) => d.bin)
    .attr('data-group', (d) => d.groupKey)
    .attr('height', (d) => d.height)
    .attr('d', (d) => topRoundedBarPath(d.x, d.y, d.width, d.height, BAR_RADIUS))
    .attr('fill', (d) => d.color)
    .attr('stroke', 'none')
    .attr('opacity', BAR_OPACITY)
    .style('transition', 'opacity 120ms ease')
    .style('pointer-events', 'none');

  const hueEdges = barData.flatMap((bar) => {
    const color = histogramSeriesEdgeColor(bar.color);
    if (!color || bar.height <= 0) return [];
    const top = bar.y;
    const bottom = bar.y + bar.height;
    return [
      { x1: bar.x + 0.5, y1: top, x2: bar.x + 0.5, y2: bottom, color },
      { x1: bar.x + bar.width - 0.5, y1: top, x2: bar.x + bar.width - 0.5, y2: bottom, color },
      { x1: bar.x, y1: top + 0.5, x2: bar.x + bar.width, y2: top + 0.5, color },
    ];
  });
  if (hueEdges.length) {
    chart
      .selectAll('.bar-hue-edge')
      .data(hueEdges)
      .enter()
      .append('line')
      .attr('class', 'bar-hue-edge')
      .attr('x1', (d) => d.x1)
      .attr('y1', (d) => d.y1)
      .attr('x2', (d) => d.x2)
      .attr('y2', (d) => d.y2)
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1)
      .style('pointer-events', 'none');
  }

  const showCount = (value: string): boolean => groupBarWidth >= Math.max(28, value.length * 6.5 + 4);
  const countLabels = barData.filter((bar) => {
    const text = bar.count === null ? '—' : formatBarCount(bar.count);
    return showCount(text);
  });
  chart
    .selectAll('.grouped-category-bar-count')
    .data(countLabels)
    .enter()
    .append('text')
    .attr('class', 'bar-value grouped-category-bar-count')
    .attr('data-bin', (d) => d.bin)
    .attr('data-group', (d) => d.groupKey)
    .attr('x', (d) => d.x + d.width / 2)
    .attr('y', (d) => d.y - 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', 'var(--text-muted, #475569)')
    .style('pointer-events', 'none')
    .text((d) => (d.count === null ? '—' : formatBarCount(d.count)));

  const fadeBars = (groupKey: string | null, bin: string | null) => {
    const fade = (bar: GroupedBar) =>
      groupKey && bar.groupKey === groupKey && bar.bin === bin ? 1 : 0.45;
    chart.selectAll<SVGPathElement, GroupedBar>('.grouped-category-bar')
      .attr('opacity', (bar) => (groupKey ? fade(bar) : BAR_OPACITY));
    chart.selectAll<SVGTextElement, GroupedBar>('.grouped-category-bar-count')
      .attr('opacity', (bar) => (groupKey ? fade(bar) : 1));
  };

  chart
    .selectAll('.bar-hit-area')
    .data(barData)
    .enter()
    .append('rect')
    .attr('class', 'bar-hit-area')
    .attr('data-bin', (d) => d.bin)
    .attr('data-group', (d) => d.groupKey)
    .attr('x', (d) => d.x)
    .attr('y', 0)
    .attr('width', (d) => d.width)
    .attr('height', innerHeight)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('mouseover', function (_event, d) {
      hoverBand
        .attr('x', (binBandScale(d.bin) || 0) - (binBandScale.step() * binBandScale.paddingInner()) / 2)
        .attr('visibility', 'visible');
      fadeBars(d.groupKey, d.bin);
      showTooltip(
        `${d.groupLabel} · ${d.bin}`,
        d.count,
        d.count === null ? HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP : undefined,
      );
    })
    .on('mousemove', function (event) {
      moveTooltip(event as MouseEvent);
    })
    .on('mouseout', function () {
      hoverBand.attr('visibility', 'hidden');
      fadeBars(null, null);
      hideTooltip();
    });

  for (const binLabel of binLabels) {
    const binGroup = chart
      .append('g')
      .attr('class', 'grouped-category-bin')
      .attr('data-bin', binLabel.bin)
      .attr('transform', `translate(${binBandScale(binLabel.bin) || 0}, 0)`);

    const axisLabel = binGroup
      .append('text')
      .attr('class', 'grouped-category-bin-label')
      .attr('x', binBandWidth / 2)
      .attr('y', innerHeight + 14)
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('fill', textColor)
      .text(binLabel.shown);
    axisLabel.append('title').text(binLabel.bin);
    if (rotateLabels) {
      axisLabel
        .attr('text-anchor', 'end')
        .attr('transform', `rotate(-35, ${binBandWidth / 2}, ${innerHeight + 8})`)
        .attr('dx', '-0.35em')
        .attr('dy', '0.15em');
    } else {
      axisLabel.attr('text-anchor', 'middle');
    }
  }

  chart
    .append('line')
    .attr('class', 'grouped-category-baseline')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', innerHeight)
    .attr('y2', innerHeight)
    .attr('stroke', domainColor);

  const xAxisBBoxBottom = rotateLabels ? margin.bottom - axisTitleSpace - 8 : 28;
  const xLabelY = innerHeight + Math.max(28, xAxisBBoxBottom);
  const xAxisTitleText = histogramAxisTitle(data);
  if (xAxisTitleText) {
    chart
      .append('text')
      .attr('class', 'grouped-category-x-title')
      .attr('x', innerWidth / 2)
      .attr('y', xLabelY)
      .attr('text-anchor', 'middle')
      .text(xAxisTitleText)
      .call(styleAxisTitle);
  }

  chart
    .append('text')
    .attr('class', 'grouped-category-y-title')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2)
    .attr('y', -yAxisGutter + 18)
    .attr('text-anchor', 'middle')
    .text(yLabelText)
    .call(styleAxisTitle);

  const svgBBox = (svg.node() as SVGSVGElement | null)?.getBBox();
  if (svgBBox && svgBBox.height > 0) {
    containerHeight = Math.ceil(svgBBox.y + svgBBox.height + 4);
    svg.attr('height', containerHeight);
  }

  container.style.height = `${containerHeight}px`;
}
