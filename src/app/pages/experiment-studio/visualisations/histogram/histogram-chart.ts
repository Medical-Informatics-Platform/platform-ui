import * as d3 from 'd3';
import {
  HISTOGRAM_EDGE_PRIVACY_TOOLTIP,
  HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP,
  HISTOGRAM_PRIVACY_STUB_HEIGHT,
  HISTOGRAM_RESIDUAL_COLOR,
  HISTOGRAM_RESIDUAL_KEY,
  HISTOGRAM_RESIDUAL_LABEL,
  HISTOGRAM_RESIDUAL_LEGEND_LABEL,
  HISTOGRAM_SOFT_EDGE,
  HistogramChartData,
  HistogramGroupSeries,
  histogramSeriesColor,
  histogramSeriesEdgeColor,
  residualCount,
} from './histogram-data';

export type { HistogramChartData, HistogramGroupSeries } from './histogram-data';

const MIN_X_TICKS = 4;
const MAX_X_TICKS = 12;

/**
 * getBBox() returns an empty rect for text that has never been laid out - a chart
 * inside a Studio step hidden with `display: none`, for example. Used where a
 * measured label extent would otherwise collapse the layout to nothing.
 */
const UNMEASURED_LABEL_WIDTH_PX = 46;

function binsAreNumeric(bins: string[]): boolean {
  return bins.length > 0 && bins.every((bin) => Number.isFinite(Number(bin)));
}

/** Named groups sort by count; numeric histogram bins keep value order. */
export function orderHorizontalBarRows(
  bins: string[],
  counts: Array<number | null>
): Array<{ bin: string; count: number | null }> {
  const rows = bins.map((bin, index) => ({
    bin: String(bin),
    count: counts[index] ?? null,
  }));
  if (binsAreNumeric(rows.map((row) => row.bin))) {
    return rows;
  }
  return [...rows].sort((a, b) => (b.count ?? -1) - (a.count ?? -1));
}

export function shouldClipNullEdges(bins: Array<string | number>): boolean {
  return binsAreNumeric(bins.map(String));
}

/** First and last non-null count; `start > end` when every count is null. */
function nonNullRange(counts: Array<number | null>): { start: number; end: number } {
  let start = 0;
  while (start < counts.length && counts[start] === null) start += 1;
  let end = counts.length - 1;
  while (end >= start && counts[end] === null) end -= 1;
  return { start, end };
}

export function clipHistogramNullEdges(
  bins: Array<string | number>,
  counts: Array<number | null>,
  groups?: HistogramGroupSeries[]
): { bins: string[]; counts: Array<number | null>; groups?: HistogramGroupSeries[] } {
  if (!Array.isArray(counts) || !Array.isArray(bins) || !bins.length) {
    return { bins: [], counts: [], groups: groups && [] };
  }
  const { start, end } = nonNullRange(counts);
  const clip = <T>(values: T[]): T[] => values.slice(start, end + 1);
  return {
    bins: clip(bins).map(String),
    counts: clip(counts),
    groups: groups?.map((group) => ({ ...group, counts: clip(group.counts) })),
  };
}

/** Bin edges removed by {@link clipHistogramNullEdges}, or null when nothing was trimmed. */
export function describeClippedNullEdges(
  bins: Array<string | number>,
  counts: Array<number | null>
): { below: string | null; above: string | null } | null {
  if (!shouldClipNullEdges(bins) || !counts.length || !bins.length) return null;

  const { start, end } = nonNullRange(counts);
  if (start > end || (start === 0 && end === counts.length - 1)) {
    return null;
  }

  return {
    below: start > 0 ? String(bins[start] ?? '') : null,
    above: end < counts.length - 1 ? String(bins[Math.min(end + 1, bins.length - 1)] ?? '') : null,
  };
}

export function formatClippedNullEdgesNote(
  bounds: { below: string | null; above: string | null } | null
): string | null {
  if (!bounds) return null;
  const range = [bounds.below && `below ${bounds.below}`, bounds.above && `above ${bounds.above}`]
    .filter(Boolean)
    .join(' / ');
  return range
    ? `Values ${range} hidden (too few records per bin for privacy). Review outliers in Data Handling.`
    : null;
}

export function selectXTickValues(bins: string[], chartWidth: number, maxLabelLength: number): string[] {
  const minLabelWidth = Math.max(32, maxLabelLength * 7 + 8);
  const maxTicks = Math.max(MIN_X_TICKS, Math.min(MAX_X_TICKS, Math.floor(chartWidth / minLabelWidth)));
  if (bins.length <= maxTicks) {
    return bins;
  }

  const step = Math.ceil(bins.length / maxTicks);
  const ticks: string[] = [];
  for (let index = 0; index < bins.length; index += step) {
    ticks.push(bins[index]);
  }

  // The last bin is always labelled, but it is less than one step past the last
  // regular tick, so it takes that tick's place instead of crowding beside it.
  const last = bins[bins.length - 1];
  if (ticks[ticks.length - 1] !== last) {
    if (ticks.length > 1) ticks.pop();
    ticks.push(last);
  }

  return ticks;
}

/**
 * Split a long horizontal-bar category label into two lines, breaking at the
 * space closest to the midpoint so words stay intact.
 */
export function wrapCategoryLabel(label: string): string[] {
  if (label.length <= 26) return [label];
  const mid = label.length / 2;
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index ?? 0);
  if (!spaces.length) return [label];
  const cut = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best));
  return [label.slice(0, cut), label.slice(cut + 1)];
}

// Numeric bins are never rotated: their labels are formatted short, and dense
// ones are thinned by selectXTickValues to ticks that fit side by side.
function shouldRotateXLabels(binCount: number, hasStringBins: boolean, maxLabelLength: number): boolean {
  const estimatedLines = Math.max(1, Math.ceil(maxLabelLength / 10));
  return hasStringBins && (estimatedLines > 1 || binCount > 8);
}

function formatNumber(d: any): string {
  if (typeof d !== 'number' || isNaN(d)) return String(d);
  const abs = Math.abs(d);
  if (Number.isInteger(d)) return d3.format(',')(d);
  if (abs > 10000) return d3.format('.2f')(d);
  if (abs > 0 && abs < 0.01) return d3.format('.2e')(d);
  return d3.format('.2f')(d);
}

/** 1,621 → 1.6k on a bar, but counts under 1,000 stay exact. */
function formatBarCount(count: number): string {
  return count >= 1000 ? d3.format('.2~s')(count) : String(count);
}

/** Top corners rounded, bottom square so the bar sits flush on the baseline. */
function topRoundedBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}` +
    `H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/** Hatched swatch for the residual ("Not shown") series in HTML legends/tooltips. */
const RESIDUAL_SWATCH =
  'repeating-linear-gradient(-45deg, #cbd5e1, #cbd5e1 1.5px, #e2e8f0 1.5px, #e2e8f0 3px)';

interface StackedTooltipRow {
  label: string;
  count: number | null;
  color: string;
  hatch?: boolean;
}

interface LegendItem {
  label: string;
  color: string;
  hatch?: boolean;
  title?: string;
}

function attachChartTooltip(
  container: HTMLElement,
  formatTitle: (binLabel: string) => string = (binLabel) => binLabel,
  total?: number,
) {
  container.style.position = 'relative';
  const tooltip = d3
    .select(container)
    .append('div')
    .attr('class', 'histogram-chart-tooltip')
    .style('position', 'absolute')
    .style('visibility', 'hidden')
    .style('background-color', 'rgba(255, 255, 255, 0.96)')
    .style('color', '#0f172a')
    .style('padding', '10px 12px')
    .style('border-radius', '8px')
    .style('font-size', '12px')
    .style('font-weight', '500')
    .style('box-shadow', '0 8px 24px -8px rgba(15, 23, 42, 0.18)')
    .style('border', '1px solid rgba(43, 51, 233, 0.16)')
    .style('max-width', '250px')
    .style('white-space', 'normal')
    .style('pointer-events', 'none')
    .style('z-index', '10');

  const formatCountLabel = (count: number | null, privacyMessage?: string): string =>
    count === null
      ? (privacyMessage ?? 'Masked for privacy (count below minimum threshold)')
      : formatNumber(count);

  const appendCountRow = (
    parent: typeof tooltip,
    label: string,
    count: number | null,
    shareOf: number | null,
    privacyMessage?: string
  ) => {
    const row = parent.append('div');
    row.append('span').style('color', '#475569').text(`${label} `);
    row.append('b').text(formatCountLabel(count, privacyMessage));
    if (count !== null && shareOf) {
      parent
        .append('div')
        .style('color', '#475569')
        .text(`${d3.format('.1%')(count / shareOf)} of total`);
    }
  };

  const showTooltip = (binLabel: string, count: number | null, privacyMessage?: string) => {
    tooltip.selectAll('*').remove();
    tooltip
      .append('div')
      .style('margin-bottom', '4px')
      .style('font-weight', '700')
      .style('line-height', '1.4')
      .text(formatTitle(binLabel));
    appendCountRow(tooltip, 'Count', count, total ?? null, privacyMessage);
    tooltip.style('visibility', 'visible');
  };

  const showStackedTooltip = (
    binLabel: string,
    binTotal: number | null,
    rows: StackedTooltipRow[]
  ) => {
    tooltip.selectAll('*').remove();
    tooltip.style('max-width', '280px');
    tooltip
      .append('div')
      .style('margin-bottom', '2px')
      .style('font-weight', '700')
      .style('line-height', '1.4')
      .text(formatTitle(binLabel));
    const totalRow = tooltip.append('div').style('margin-bottom', '6px');
    totalRow.append('span').style('color', 'var(--text-muted, #475569)').text('Total ');
    totalRow.append('b').text(formatCountLabel(binTotal));
    if (binTotal !== null && total) {
      totalRow
        .append('span')
        .style('color', 'var(--text-muted, #475569)')
        .text(` · ${d3.format('.0%')(binTotal / total)} of all`);
    }
    for (const row of rows) {
      const line = tooltip
        .append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '6px')
        .style('margin-top', '3px');
      const dot = line.append('span');
      dot
        .style('width', '8px')
        .style('height', '8px')
        .style('border-radius', '2px')
        .style('flex', '0 0 auto')
        .style('background', row.hatch ? RESIDUAL_SWATCH : row.color);
      if (!row.hatch) {
        const edge = histogramSeriesEdgeColor(row.color);
        if (edge) dot.style('box-shadow', `inset 0 0 0 1px ${edge}`);
      }
      line.append('span')
        .style('flex', '1')
        .style('min-width', '0')
        .style('color', 'var(--text-muted, #475569)')
        .style('overflow', 'hidden')
        .style('text-overflow', 'ellipsis')
        .style('white-space', 'nowrap')
        .text(row.label);
      line.append('b').style('flex', '0 0 auto').text(formatCountLabel(row.count));
      if (row.count !== null && binTotal) {
        line
          .append('span')
          .style('flex', '0 0 auto')
          .style('color', 'var(--text-muted, #475569)')
          .text(d3.format('.0%')(row.count / binTotal));
      }
    }
    tooltip.style('visibility', 'visible');
  };

  const moveTooltip = (event: MouseEvent) => {
    const [x, y] = d3.pointer(event, container);
    const tooltipNode = tooltip.node() as HTMLElement;
    const tooltipWidth = tooltipNode?.offsetWidth || 100;
    const tooltipHeight = tooltipNode?.offsetHeight || 60;
    const bounds = container.getBoundingClientRect();
    let left = x + 15;
    let top = y - 10;
    if (left + tooltipWidth > bounds.width) left = x - tooltipWidth - 15;
    if (top + tooltipHeight > bounds.height) top = y - tooltipHeight - 10;
    tooltip.style('left', `${left}px`).style('top', `${top}px`);
  };

  const hideTooltip = () => {
    tooltip.style('visibility', 'hidden');
  };

  return { showTooltip, showStackedTooltip, moveTooltip, hideTooltip };
}

function appendHistogramLegend(
  container: HTMLElement,
  items: LegendItem[],
  title?: string,
  plotLeft = 0
): number {
  // D3/DOM nodes created at runtime have no `_ngcontent-*`, so emulated
  // component CSS never matches them. Inline styles, same as the tooltip.
  const el = (tag: string, className: string, css: string): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    node.style.cssText = css;
    return node;
  };
  const muted = 'color: var(--text-muted, #475569);';
  const legend = el('div', 'histogram-legend',
    'display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 0;' +
    ` margin: 0 0 4px ${Math.max(0, plotLeft)}px;` +
    ` width: ${plotLeft ? `calc(100% - ${plotLeft}px)` : '100%'};` +
    ` box-sizing: border-box; font-family: var(--font-sans, inherit); ${muted}`);
  if (title) {
    const heading = el('span', 'histogram-legend-title',
      'display: block; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em;' +
      ` text-transform: uppercase; ${muted}`);
    heading.textContent = title;
    legend.appendChild(heading);
  }
  const list = el('div', 'histogram-legend-items',
    'display: flex; flex-wrap: wrap; align-items: center; column-gap: 12px; row-gap: 6px; width: 100%;');
  list.setAttribute('role', 'list');
  for (const item of items) {
    const entry = el('span', 'histogram-legend-item',
      'display: inline-flex; align-items: center; gap: 6px; max-width: 180px; min-height: 16px;' +
      ` font-size: 12px; line-height: 1.2; font-variant-numeric: tabular-nums; ${muted}`);
    entry.setAttribute('role', 'listitem');
    entry.title = item.title || item.label;
    const edge = item.hatch ? HISTOGRAM_SOFT_EDGE : histogramSeriesEdgeColor(item.color);
    const swatch = el('span', 'histogram-legend-swatch',
      'display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex: 0 0 auto;' +
      ` background: ${item.hatch ? RESIDUAL_SWATCH : item.color};` +
      (edge ? ` box-shadow: inset 0 0 0 1px ${edge};` : ''));
    const caption = el('span', '', 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;');
    caption.textContent = item.label;
    entry.append(swatch, caption);
    list.appendChild(entry);
  }
  legend.appendChild(list);
  container.insertBefore(legend, container.firstChild);
  return legend.offsetHeight || 28;
}

let hatchSerial = 0;

function appendHatch(
  svg: d3.Selection<SVGSVGElement, unknown, HTMLElement | null, unknown>,
  kind: 'privacy' | 'residual',
  fill: string,
  stroke: string
): string {
  hatchSerial += 1;
  const id = `histogram-${kind}-hatch-${hatchSerial}`;
  const pattern = svg
    .append('defs')
    .append('pattern')
    .attr('id', id)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6)
    .attr('height', 6);
  pattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', fill);
  pattern.append('path').attr('d', 'M0,6 L6,0').attr('stroke', stroke).attr('stroke-width', 1);
  return id;
}

function preventChartScrollbar(container: HTMLElement): void {
  container.style.overflowX = 'auto';
  container.style.overflowY = 'hidden';
}

export function createHistogram(
  data: HistogramChartData,
  container: HTMLElement,
  config: {
    color?: string;
    orientation?: 'vertical' | 'horizontal';
    clipNullEdges?: boolean;
  } = {}
): void {
  if (config.orientation === 'horizontal') {
    createHorizontalBarChart(data, container, config);
    return;
  }

  const textColor = '#475569';
  const gridColor = '#e2e8f0';
  const domainColor = '#cbd5e1';
  const barColor = config.color || '#2b33e9';

  const clipNullEdges = config.clipNullEdges !== false;
  const clipped = clipNullEdges && shouldClipNullEdges(data.bins)
    ? clipHistogramNullEdges(data.bins, data.counts, data.groups)
    : { bins: data.bins.map(String), counts: data.counts, groups: data.groups };
  const { bins, counts } = clipped;
  const groups = clipped.groups;
  const stacked = groups !== undefined;
  const showPrivacyStubs = !clipNullEdges;
  const containerWidth = container.clientWidth || 640;

  // Clear any existing chart
  container.innerHTML = '';
  container.style.height = 'auto';
  container.style.minHeight = '0';
  preventChartScrollbar(container);

  if (!bins.length || !counts.length) {
    return;
  }

  // Create SVG once; height is computed from plot content below.
  const svg = d3
    .select(container)
    .append('svg');

  // Measure Y-axis label to make left margin dynamic
  const yLabelText = 'Count';

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

  // Layout is sized from the labels as drawn: raw float bins such as
  // 0.019999999999999997 would otherwise size every bin for 20 characters.
  const formatBin = (bin: string): string => {
    const num = parseFloat(bin);
    if (isNaN(num)) return bin;
    if (data.variableType === 'discrete' || Number.isInteger(num)) {
      return d3.format(',')(Math.round(num));
    }
    return formatNumber(num);
  };
  const binLabels = bins.map(formatBin);

  const baseMargins = { top: 18, right: 8, bottom: 44, left: 28 };
  const maxLabelLength = binLabels.reduce((max, label) => Math.max(max, label.length), 0);
  const estimatedLines = Math.max(1, Math.ceil(maxLabelLength / 10));
  const hasStringBins = !binsAreNumeric(bins);
  const denseNumericLabels = !hasStringBins && bins.length > 8 && maxLabelLength >= 3;
  const needsRotate = shouldRotateXLabels(bins.length, hasStringBins, maxLabelLength);
  const bottomMargin = needsRotate
    ? Math.max(72, 20 + Math.min(120, maxLabelLength * 3.2))
    : Math.max(52, baseMargins.bottom + estimatedLines * 12);

  // A -40° label hangs left of its bar by ~cos(40°) of its length (~6.5px a
  // character at 12px), so the first one is clipped unless the margin covers it.
  const firstLabelReach = needsRotate ? binLabels[0].length * 6.5 * Math.cos(Math.PI * 40 / 180) : 0;

  // Left margin = ticks + a tight slot for the rotated "COUNT" title.
  const yAxisGutter = baseMargins.left + measuredYLabelWidth + 4;
  const margin = {
    top: baseMargins.top,
    right: baseMargins.right,
    bottom: bottomMargin,
    left: Math.max(yAxisGutter, Math.ceil(firstLabelReach)),
  };

  const innerHeight = needsRotate
    ? 240
    : hasStringBins && bins.length <= 8
      ? 200
      : 260;
  let containerHeight = margin.top + innerHeight + margin.bottom;

  // Aesthetic: Limit max bar width for small number of bins
  const maxBarWidth = 100;

  // Scale width by bin count to allow horizontal scrolling when needed. Dense
  // numeric ticks are thinned, so their bins do not each need a label's width.
  // Capped at maxBarWidth: a wider bin centres the plot off-screen in empty SVG.
  const minPerBinWidth = Math.min(
    maxBarWidth,
    hasStringBins ? 30 : denseNumericLabels ? 12 : Math.max(24, maxLabelLength * 8),
  );
  const desiredWidth = Math.max(containerWidth, bins.length * minPerBinWidth);

  svg.attr('width', desiredWidth).attr('height', containerHeight);

  const innerWidth = desiredWidth - margin.left - margin.right;
  const optimalChartWidth = bins.length * maxBarWidth;
  const chartWidth = Math.min(innerWidth, optimalChartWidth);
  const xOffset = (innerWidth - chartWidth) / 2;

  // Scales
  const xScale = d3
    .scaleBand()
    .domain(bins)
    .range([0, chartWidth])
    .padding(hasStringBins ? 0.2 : 0);

  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(counts.filter((count): count is number => count !== null)) || 0])
    .nice()
    .range([innerHeight, 0]);
  const binPoints = bins.map((bin, index) => ({
    bin,
    index,
    count: counts[index] ?? null,
  }));

  const plotLeft = margin.left + xOffset;

  // Chart group
  const chart = svg
    .append('g')
    .attr('transform', `translate(${plotLeft}, ${margin.top})`);

  // Background Grid (Y-axis only)
  chart
    .append('g')
    .attr('class', 'grid')
    .call(
      d3.axisLeft(yScale)
        .ticks(6)
        .tickSize(-chartWidth)
        .tickFormat(() => '')
    )
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('.tick line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3,3')
    );


  const total = d3.sum(counts, (count) => count ?? 0);
  const tooltipBinTitle = (bin: string, index: number): string =>
    !hasStringBins && index < bins.length - 1
      ? `${formatBin(bin)}–${formatBin(bins[index + 1])}`
      : formatBin(bin);
  const { showTooltip, showStackedTooltip, moveTooltip, hideTooltip } = attachChartTooltip(
    container,
    (binLabel) => `${data.variableName ? data.variableName + ' · ' : ''}${binLabel}`,
    total,
  );
  const visiblePoints = binPoints.filter((entry) => entry.count !== null);
  // Every null bin before the first or after the last visible bin is an edge outlier.
  const firstVisibleIndex = visiblePoints[0]?.index ?? bins.length;
  const lastVisibleIndex = visiblePoints[visiblePoints.length - 1]?.index ?? -1;
  const privacyStubPoints = showPrivacyStubs
    ? binPoints.filter((entry) => entry.count === null)
    : [];
  const bandWidth = xScale.bandwidth();
  const barOpacity = 0.9;
  const groupColorByKey = new Map(
    (groups ?? []).map((group, index) => [group.key, histogramSeriesColor(index)])
  );

  // Hover band behind the bars: a full-height tint marks the bin under the pointer.
  const hoverBand = chart
    .append('rect')
    .attr('y', 0)
    .attr('width', bandWidth + xScale.step() * xScale.paddingInner())
    .attr('height', innerHeight)
    .attr('rx', hasStringBins ? 4 : 0)
    .attr('fill', 'rgba(43, 51, 233, 0.06)')
    .attr('visibility', 'hidden')
    .style('pointer-events', 'none');

  type BarDatum = {
    index: number;
    groupKey: string;
    color: string;
    y: number;
    height: number;
    separator: boolean;
    isTop: boolean;
  };

  type HueEdge = {
    index: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
  };

  // One segment per visible bin; a stacked bin splits into group pieces plus a
  // residual for what the groups do not show, keeping the unsplit total height.
  const segments: BarDatum[] = [];
  for (const point of visiblePoints) {
    let remaining = point.count as number;
    const pieces: Array<{ groupKey: string; count: number; color: string }> = [];
    for (const group of groups ?? []) {
      const shown = Math.max(0, Math.min(group.counts[point.index] ?? 0, remaining));
      if (shown > 0) {
        pieces.push({ groupKey: group.key, count: shown, color: groupColorByKey.get(group.key) ?? barColor });
        remaining -= shown;
      }
    }
    if (!stacked) {
      pieces.push({ groupKey: '', count: remaining, color: barColor });
    } else if (remaining > 0) {
      pieces.push({ groupKey: HISTOGRAM_RESIDUAL_KEY, count: remaining, color: HISTOGRAM_RESIDUAL_COLOR });
    }
    let yCursor = innerHeight;
    pieces.forEach((piece, pieceIndex) => {
      const height = innerHeight - yScale(piece.count);
      yCursor -= height;
      segments.push({
        index: point.index,
        groupKey: piece.groupKey,
        color: piece.color,
        y: yCursor,
        height,
        separator: pieceIndex > 0,
        isTop: pieceIndex === pieces.length - 1,
      });
    });
  }

  const anyResidual = segments.some((segment) => segment.groupKey === HISTOGRAM_RESIDUAL_KEY);
  const privacyHatchId = privacyStubPoints.length
    ? appendHatch(svg, 'privacy', 'rgba(43, 51, 233, 0.08)', 'rgba(43, 51, 233, 0.4)')
    : '';
  const residualHatchId = anyResidual ? appendHatch(svg, 'residual', '#e2e8f0', '#94a3b8') : '';

  // Visible bars: proportional heights only. Numeric bins are square, category bars round.
  // No per-segment slate stroke — yellow/mint get a hue edge on exposed sides only.
  chart
    .selectAll('.bar')
    .data(segments)
    .enter()
    .append('path')
    .attr('class', (d) => d.groupKey === HISTOGRAM_RESIDUAL_KEY ? 'bar bar-residual' : 'bar')
    .attr('data-index', (d) => d.index)
    .attr('data-group', (d) => (stacked ? d.groupKey : null))
    .attr('d', (d) =>
      topRoundedBarPath(xScale(bins[d.index]) || 0, d.y, bandWidth, d.height, hasStringBins ? 4 : 0))
    .attr('fill', (d) => d.groupKey === HISTOGRAM_RESIDUAL_KEY ? `url(#${residualHatchId})` : d.color)
    .attr('stroke', 'none')
    .attr('opacity', barOpacity)
    .style('transition', 'opacity 120ms ease')
    .style('pointer-events', 'none');

  if (stacked) {
    const hueEdges: HueEdge[] = segments.flatMap((segment) => {
      const color = histogramSeriesEdgeColor(segment.color);
      if (!color) return [];
      const x = xScale(bins[segment.index]) || 0;
      const top = segment.y;
      const bottom = segment.y + segment.height;
      const edge = (x1: number, y1: number, x2: number, y2: number): HueEdge =>
        ({ index: segment.index, x1, y1, x2, y2, color });
      return [
        edge(x + 0.5, top, x + 0.5, bottom),
        edge(x + bandWidth - 0.5, top, x + bandWidth - 0.5, bottom),
        ...(segment.isTop ? [edge(x, top + 0.5, x + bandWidth, top + 0.5)] : []),
      ];
    });
    chart
      .selectAll('.bar-hue-edge')
      .data(hueEdges)
      .enter()
      .append('line')
      .attr('class', 'bar-hue-edge')
      .attr('data-index', (d) => d.index)
      .attr('x1', (d) => d.x1)
      .attr('y1', (d) => d.y1)
      .attr('x2', (d) => d.x2)
      .attr('y2', (d) => d.y2)
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1)
      .style('pointer-events', 'none');

    chart
      .selectAll('.bar-stack-separator')
      .data(segments.filter((segment) => segment.separator))
      .enter()
      .append('rect')
      .attr('class', 'bar-stack-separator')
      .attr('data-index', (d) => d.index)
      .attr('x', (d) => xScale(bins[d.index]) || 0)
      .attr('y', (d) => d.y + d.height - 0.5)
      .attr('width', bandWidth)
      .attr('height', 1)
      .attr('fill', '#ffffff')
      .style('pointer-events', 'none');
  }

  if (privacyStubPoints.length) {
    chart
      .selectAll('.bar-privacy-stub')
      .data(privacyStubPoints)
      .enter()
      .append('rect')
      .attr('class', 'bar bar-privacy-stub')
      .attr('data-index', (d) => d.index)
      .attr('x', (d) => xScale(d.bin) || 0)
      .attr('y', innerHeight - HISTOGRAM_PRIVACY_STUB_HEIGHT)
      .attr('width', bandWidth)
      .attr('height', HISTOGRAM_PRIVACY_STUB_HEIGHT)
      .attr('fill', `url(#${privacyHatchId})`)
      .style('pointer-events', 'none');
  }

  const labelPoints = visiblePoints.filter((entry) => {
    const text = formatBarCount(entry.count as number);
    const fits = bandWidth >= Math.max(28, text.length * 6.5 + 4);
    if (!fits) return false;
    return !hasStringBins || (!stacked && bandWidth >= 34);
  });
  if (labelPoints.length) {
    chart
      .selectAll('.bar-value')
      .data(labelPoints)
      .enter()
      .append('text')
      .attr('class', 'bar-value')
      .attr('data-index', (d) => d.index)
      .attr('x', (d) => (xScale(bins[d.index]) || 0) + bandWidth / 2)
      .attr('y', (d) => yScale(d.count as number) - 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('fill', 'var(--text-muted, #475569)')
      .style('pointer-events', 'none')
      .text((d) => formatBarCount(d.count as number));
  }

  const stackedTooltipRows = (index: number, binTotal: number | null): StackedTooltipRow[] => {
    const rows: StackedTooltipRow[] = (groups ?? []).map((group) => ({
      label: group.label,
      count: group.counts[index] ?? null,
      color: groupColorByKey.get(group.key) ?? barColor,
    }));
    const leftover = residualCount(binTotal, groups ?? [], index);
    if (leftover > 0) {
      rows.push({ label: HISTOGRAM_RESIDUAL_LABEL, count: leftover, color: HISTOGRAM_RESIDUAL_COLOR, hatch: true });
    }
    return rows;
  };

  // Invisible hit areas: full-height bin targets for reliable hover.
  chart
    .selectAll('.bar-hit-area')
    .data(binPoints)
    .enter()
    .append('rect')
    .attr('class', 'bar-hit-area')
    .attr('x', (d) => xScale(d.bin) || 0)
    .attr('y', 0)
    .attr('width', bandWidth)
    .attr('height', innerHeight)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('mouseover', function (_event, d) {
      hoverBand
        .attr('x', (xScale(d.bin) || 0) - (xScale.step() * xScale.paddingInner()) / 2)
        .attr('visibility', 'visible');
      const fade = (index: number) => (index === d.index ? 1 : 0.45);
      chart.selectAll<SVGElement, { index: number }>('.bar')
        .attr('opacity', (bar) => fade(bar.index));
      chart.selectAll<SVGLineElement, HueEdge>('.bar-hue-edge')
        .attr('opacity', (edge) => fade(edge.index));
      chart.selectAll<SVGTextElement, { index: number }>('.bar-value')
        .attr('opacity', (label) => fade(label.index));
      const tooltipTitle = tooltipBinTitle(d.bin, d.index);
      if (d.count === null && showPrivacyStubs) {
        const isEdge = d.index < firstVisibleIndex || d.index > lastVisibleIndex;
        showTooltip(
          tooltipTitle,
          null,
          isEdge ? HISTOGRAM_EDGE_PRIVACY_TOOLTIP : HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP
        );
      } else if (stacked) {
        showStackedTooltip(tooltipTitle, d.count, stackedTooltipRows(d.index, d.count));
      } else {
        showTooltip(tooltipTitle, d.count);
      }
    })
    .on('mousemove', function (event) {
      moveTooltip(event as MouseEvent);
    })
    .on('mouseout', function () {
      hoverBand.attr('visibility', 'hidden');
      chart.selectAll('.bar').attr('opacity', barOpacity);
      chart.selectAll('.bar-hue-edge').attr('opacity', 1);
      chart.selectAll('.bar-value').attr('opacity', 1);
      hideTooltip();
    });

  const xTickValues = denseNumericLabels
    ? selectXTickValues(bins, chartWidth, maxLabelLength)
    : bins;

  // X axis
  const xAxis = d3
    .axisBottom(xScale)
    .tickValues(xTickValues)
    .tickFormat((d: any) => formatBin(String(d)))
    .tickSize(0)
    .tickPadding(needsRotate ? 6 : 8);

  const xAxisGroup = chart
    .append('g')
    .attr('transform', `translate(0, ${innerHeight})`)
    .call(xAxis)
    .call(g => g.select('.domain').attr('stroke', domainColor));

  const tickFontSize = '11px';
  const tickText = xAxisGroup
    .selectAll<SVGTextElement, any>('text')
    .attr('font-size', tickFontSize)
    .attr('font-weight', '500')
    .attr('fill', textColor)
    .style('text-anchor', needsRotate ? 'end' : 'middle');

  if (needsRotate) {
    tickText.attr('transform', 'rotate(-40)').attr('dx', '-0.35em').attr('dy', '0.15em');
  }

  const xAxisBBox = (xAxisGroup.node() as SVGGElement | null)?.getBBox();
  const xTicksBottom = xAxisBBox && xAxisBBox.height > 0 ? xAxisBBox.y + xAxisBBox.height : 28;
  const xLabelY = innerHeight + xTicksBottom + 10;
  const axisBottom = margin.top + xLabelY + 8;
  if (axisBottom > containerHeight) {
    containerHeight = Math.ceil(axisBottom);
    svg.attr('height', containerHeight);
  }

  if (data.variableName) {
    chart
      .append('text')
      .attr('x', chartWidth / 2)
      .attr('y', xLabelY)
      .attr('text-anchor', 'middle')
      .text(data.variableName)
      .style('font-size', '11px')
      .style('font-weight', '700')
      .style('fill', 'var(--text-muted, #475569)')
      .style('letter-spacing', '0.08em')
      .style('text-transform', 'uppercase');
  }

  // Y axis: compact counts (50k); fractional ticks on small counts are not counts.
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(6)
    .tickFormat((d: any) => (Number.isInteger(d) ? d3.format('~s')(d) : ''))
    .tickSize(0)
    .tickPadding(8);

  chart.append('g')
    .call(yAxis)
    .call(g => g.select('.domain').remove())
    .selectAll('text')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', textColor);

  // Y label
  const yLabelPaddingFromAxis = 18;

  chart
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2)
    .attr('y', -yAxisGutter + yLabelPaddingFromAxis)
    .attr('text-anchor', 'middle')
    .text(yLabelText)
    .style('font-size', '11px')
    .style('font-weight', '700')
    .style('fill', 'var(--text-muted, #475569)')
    .style('letter-spacing', '0.08em')
    .style('text-transform', 'uppercase');

  // A zero-height bbox is the signature of an unlaid-out container; keep the
  // computed height instead of collapsing the chart to a few visible pixels.
  const svgBBox = (svg.node() as SVGSVGElement | null)?.getBBox();
  if (svgBBox && svgBBox.height > 0) {
    containerHeight = Math.ceil(svgBBox.y + svgBBox.height + 4);
    svg.attr('height', containerHeight);
  }

  if (stacked) {
    const legendItems: LegendItem[] = (groups ?? []).map((group) => ({
      label: group.label,
      color: groupColorByKey.get(group.key) ?? barColor,
    }));
    if (anyResidual) {
      legendItems.push({
        label: HISTOGRAM_RESIDUAL_LEGEND_LABEL,
        color: HISTOGRAM_RESIDUAL_COLOR,
        hatch: true,
        title: HISTOGRAM_RESIDUAL_LABEL,
      });
    }
    if (legendItems.length) {
      const legendHeight = appendHistogramLegend(
        container,
        legendItems,
        data.splitLabel,
        plotLeft
      );
      containerHeight += legendHeight + 4;
    }
  }

  container.style.height = `${containerHeight}px`;
}

/**
 * Horizontal bar chart used for group summaries: one bar per group/variable,
 * category labels on the Y axis and count on the X axis. Reads cleanly without
 * rotating labels or horizontal scrolling.
 */
function createHorizontalBarChart(
  data: {
    bins: string[];
    counts: Array<number | null>;
    variable?: string;
    variableName?: string;
    description?: string;
    variableType?: string;
  },
  container: HTMLElement,
  config: {
    color?: string;
    orientation?: 'vertical' | 'horizontal';
  } = {}
): void {
  const textColor = '#475569';
  const mutedTextColor = '#64748b';
  const gridColor = '#e2e8f0';
  const barColor = config.color || '#2b33e9';
  const containerWidth = container.clientWidth || 640;

  const rows = orderHorizontalBarRows(data.bins.map(String), data.counts);
  const bins = rows.map((row) => row.bin);
  const sortedCounts = rows.map((row) => row.count);

  container.innerHTML = '';
  container.style.height = 'auto';
  container.style.minHeight = '0';
  container.style.position = 'relative';
  preventChartScrollbar(container);

  if (!bins.length || !sortedCounts.length) {
    return;
  }

  const yLabelWidth = 200;
  const margin = { top: 40, right: 44, bottom: 40, left: yLabelWidth };

  const rowHeight = 42;
  const innerHeight = Math.max(120, bins.length * rowHeight);
  const containerHeight = margin.top + innerHeight + margin.bottom;
  const desiredWidth = Math.max(containerWidth, 360);
  const innerWidth = desiredWidth - margin.left - margin.right;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', desiredWidth)
    .attr('height', containerHeight);

  // Y scale: categories (bands)
  const yScale = d3
    .scaleBand<string>()
    .domain(bins)
    .range([0, innerHeight])
    .padding(0.22);

  // X scale: count (linear)
  const maxCount = d3.max(sortedCounts.filter((count): count is number => count !== null)) || 0;
  const xScale = d3
    .scaleLinear()
    .domain([0, maxCount])
    .nice()
    .range([0, innerWidth]);

  const chart = svg
    .append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  // Vertical grid lines (X axis)
  chart
    .append('g')
    .attr('class', 'grid')
    .call(
      d3.axisBottom(xScale)
        .ticks(Math.min(8, Math.max(3, Math.floor(innerWidth / 80))))
        .tickSize(-innerHeight)
        .tickFormat(() => '')
    )
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3,3')
    );

  const { showTooltip, moveTooltip, hideTooltip } = attachChartTooltip(container);
  const getBarSelector = (index: number) => `.bar[data-index="${index}"]`;

  const binPoints = bins.map((bin, index) => ({
    bin,
    index,
    count: sortedCounts[index] ?? null,
  }));

  // Visible bars: horizontal, proportional widths.
  chart
    .selectAll('.bar')
    .data(binPoints.filter((entry) => entry.count !== null))
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('data-index', (d) => d.index)
    .attr('x', 0)
    .attr('y', (d) => yScale(bins[d.index]) || 0)
    .attr('width', (d) => xScale(d.count as number))
    .attr('height', yScale.bandwidth())
    .attr('fill', barColor)
    .attr('opacity', 0.85)
    .attr('rx', 3)
    .attr('ry', 3)
    .style('pointer-events', 'none');

  chart
    .selectAll('.bar-value')
    .data(binPoints.filter((entry) => entry.count !== null))
    .enter()
    .append('text')
    .attr('class', 'bar-value')
    .attr('x', (d) => xScale(d.count as number) + 6)
    .attr('y', (d) => (yScale(bins[d.index]) || 0) + yScale.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('font-size', '11px')
    .attr('font-weight', '600')
    .attr('fill', textColor)
    .style('pointer-events', 'none')
    .text((d) => formatNumber(d.count));

  // Invisible full-height hit areas for reliable hover.
  chart
    .selectAll('.bar-hit-area')
    .data(binPoints)
    .enter()
    .append('rect')
    .attr('class', 'bar-hit-area')
    .attr('x', -yLabelWidth)
    .attr('y', (d) => yScale(d.bin) || 0)
    .attr('width', innerWidth + yLabelWidth)
    .attr('height', yScale.bandwidth())
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('mouseover', function (_event, d) {
      chart.select(getBarSelector(d.index)).attr('opacity', 1).attr('filter', 'brightness(1.1)');
      showTooltip(String(d.bin), d.count);
    })
    .on('mousemove', function (event) {
      moveTooltip(event as MouseEvent);
    })
    .on('mouseout', function (_event, d) {
      chart.select(getBarSelector(d.index)).attr('opacity', 0.85).attr('filter', null);
      hideTooltip();
    });

  // Y axis (category labels): long clinical names wrap to two lines instead of
  // hard-truncating; the full label stays available via the native <title>.
  const yAxisGroup = chart
    .append('g')
    .call(d3.axisLeft(yScale).tickSize(0).tickPadding(10).tickFormat((label) => String(label)))
    .call((g) => g.select('.domain').remove());
  yAxisGroup
    .selectAll<SVGTextElement, string>('text')
    .attr('font-size', '12px')
    .attr('font-weight', '500')
    .attr('fill', textColor)
    .each(function (label) {
      const text = d3.select(this);
      const lines = wrapCategoryLabel(String(label));
      const x = this.getAttribute('x');
      text.text('');
      lines.forEach((line, i) => {
        text
          .append('tspan')
          .attr('x', x)
          .attr('dy', i === 0 ? 0 : 12)
          .text(line);
      });
      text.append('title').text(String(label));
    });

  // X axis (count)
  chart.append('g')
    .attr('transform', `translate(0, ${innerHeight})`)
    .call(d3.axisBottom(xScale).ticks(Math.min(8, Math.max(3, Math.floor(innerWidth / 80)))).tickSize(0).tickPadding(8).tickFormat((d: any) => formatNumber(d)))
    .call((g) => g.select('.domain').attr('stroke', '#cbd5e1'))
    .selectAll('text')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', textColor);

  // X label
  chart.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 30)
    .attr('text-anchor', 'middle')
    .text('Count')
    .style('font-size', '12px')
    .style('font-weight', '700')
    .style('fill', mutedTextColor)
    .style('letter-spacing', '0.08em')
    .style('text-transform', 'uppercase');

  container.style.height = `${containerHeight}px`;
}
