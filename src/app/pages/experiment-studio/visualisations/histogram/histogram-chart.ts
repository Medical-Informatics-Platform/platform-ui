import * as d3 from 'd3';
import {
  HISTOGRAM_EDGE_PRIVACY_TOOLTIP,
  HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP,
  HISTOGRAM_PRIVACY_STUB_HEIGHT,
  HISTOGRAM_RESIDUAL_COLOR,
  HISTOGRAM_RESIDUAL_KEY,
  HISTOGRAM_RESIDUAL_LABEL,
  HistogramChartData,
  HistogramGroupSeries,
  isDatasetSplit,
  isNominalHistogramNode,
  histogramSeriesColor,
  histogramSeriesEdgeColor,
  residualCount,
} from './histogram-data';
import { createGroupedCategoryChart } from './grouped-category-chart';

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

/**
 * First and last bin that draws a bar. A stack draws from the bin total; a dodged
 * dataset split draws one bar per group, so the group counts decide the crop.
 * Interior bins (zero, masked) never drop out of the window.
 */
function drawnRange(
  counts: Array<number | null>,
  groups: HistogramGroupSeries[] | undefined,
  drawnByGroups: boolean
): { start: number; end: number } {
  const series = drawnByGroups && groups?.length
    ? groups.map((group) => group.counts)
    : [counts];
  const drawnAt = (index: number): boolean => series.some((s) => (s[index] ?? 0) > 0);
  let start = 0;
  while (start < counts.length && !drawnAt(start)) start += 1;
  let end = counts.length - 1;
  while (end >= start && !drawnAt(end)) end -= 1;
  return { start, end };
}

export function clipHistogramNullEdges(
  bins: Array<string | number>,
  counts: Array<number | null>,
  groups?: HistogramGroupSeries[],
  /** True for a dataset split: crop by the group bars, not by the pooled bin totals. */
  drawnByGroups?: boolean
): { bins: string[]; counts: Array<number | null>; groups?: HistogramGroupSeries[] } {
  if (!Array.isArray(counts) || !Array.isArray(bins) || !bins.length) {
    return { bins: [], counts: [], groups: groups && [] };
  }
  const { start, end } = drawnRange(counts, groups, drawnByGroups === true);
  const clip = <T>(values: T[]): T[] => values.slice(start, end + 1);
  return {
    bins: clip(bins).map(String),
    counts: clip(counts),
    groups: groups?.map((group) => ({ ...group, counts: clip(group.counts) })),
  };
}

/** One cropped edge: the boundary bin the axis now starts/ends at, and why the trim happened. */
export interface HistogramTrimmedEdge {
  edge: string;
  /** `masked`: at least one cropped bin has a privacy-null count; `empty`: every cropped bin is 0. */
  kind: 'masked' | 'empty';
}

export interface HistogramTrimBounds {
  below: HistogramTrimmedEdge | null;
  above: HistogramTrimmedEdge | null;
}

/**
 * Bin edges removed by {@link clipHistogramNullEdges}, or null when nothing was trimmed.
 * The boundary is the first/last bin the axis keeps, so the note matches the drawn axis.
 */
export function describeClippedNullEdges(
  bins: Array<string | number>,
  counts: Array<number | null>,
  groups?: HistogramGroupSeries[],
  /** True for a dataset split: the crop follows the group bars, not the pooled totals. */
  drawnByGroups?: boolean
): HistogramTrimBounds | null {
  if (!shouldClipNullEdges(bins) || !counts.length || !bins.length) return null;

  const { start, end } = drawnRange(counts, groups, drawnByGroups === true);
  if (start > end || (start === 0 && end === counts.length - 1)) {
    return null;
  }

  const edgeKind = (lo: number, hi: number): 'masked' | 'empty' => {
    for (let index = lo; index <= hi; index += 1) {
      if (counts[index] === null) return 'masked';
    }
    return 'empty';
  };

  return {
    below: start > 0 ? { edge: String(bins[start] ?? ''), kind: edgeKind(0, start - 1) } : null,
    above:
      end < counts.length - 1
        ? { edge: String(bins[Math.min(end + 1, bins.length - 1)] ?? ''), kind: edgeKind(end + 1, bins.length - 1) }
        : null,
  };
}

export function formatClippedNullEdgesNote(
  bounds: HistogramTrimBounds | null
): string | null {
  if (!bounds) return null;
  const masked: string[] = [];
  const empty: string[] = [];
  if (bounds.below) {
    (bounds.below.kind === 'masked' ? masked : empty).push(`below ${bounds.below.edge}`);
  }
  if (bounds.above) {
    (bounds.above.kind === 'masked' ? masked : empty).push(`above ${bounds.above.edge}`);
  }
  const clauses: string[] = [];
  if (empty.length) clauses.push(`Values ${empty.join(' / ')} have no records`);
  if (masked.length) clauses.push(`Values ${masked.join(' / ')} masked (too few records per bin for privacy)`);
  if (!clauses.length) return null;
  const text = clauses
    .map((clause, index) => (index === 0 ? clause : clause.replace(/^Values/, 'values')))
    .join('; ');
  return masked.length
    ? `${text}. Review outliers in Data Handling.`
    : `${text}. The axis is cropped to the populated range.`;
}

/** Axis title: the variable label as the data model writes it, plus its unit when it has one. */
export function histogramAxisTitle(data: {
  variableName?: string;
  units?: string;
}): string {
  const label = String(data.variableName ?? '').trim();
  const unit = String(data.units ?? '').trim();
  return unit ? `${label} (${unit})` : label;
}

/** House style for axis titles: sentence case, 500 weight, muted ink, no caps tracking. */
export function styleAxisTitle(
  text: d3.Selection<SVGTextElement, unknown, any, any>
): void {
  text
    .style('font-size', '11px')
    .style('font-weight', '500')
    .style('fill', 'var(--text-muted, #475569)');
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
export function formatBarCount(count: number): string {
  return count >= 1000 ? d3.format('.2~s')(count) : String(count);
}

/** Top corners rounded, bottom square so the bar sits flush on the baseline. */
export function topRoundedBarPath(x: number, y: number, width: number, height: number, radius: number): string {
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

/**
 * Drops hidden split groups. Each bin's total becomes the groups still shown plus
 * the masked-or-missing share no group accounts for, so hiding a group never
 * hides the masked records with it.
 */
export function withoutHiddenGroups(
  data: HistogramChartData,
  hidden: ReadonlySet<string>
): HistogramChartData {
  if (!data.groups?.length || !hidden.size) return data;
  const allGroups = data.groups;
  const groups = allGroups.filter((group) => !hidden.has(group.key));
  const counts = data.counts.map((total, index) => {
    if (total === null) return null;
    const shown = groups.reduce((sum, group) => sum + (group.counts[index] ?? 0), 0);
    return shown + residualCount(total, allGroups, index);
  });
  return { ...data, counts, groups };
}

/** True when some bin's total is more than its groups show (privacy masking, missing values). */
export function hasMaskedRemainder(data: HistogramChartData): boolean {
  const groups = data.groups ?? [];
  return groups.length > 0 && data.counts.some((total, index) => residualCount(total, groups, index) > 0);
}

export function attachChartTooltip(
  container: HTMLElement,
  formatTitle: (binLabel: string) => string = (binLabel) => binLabel,
  total?: number,
  totalLabel = 'Total',
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
    totalRow.append('span').style('color', 'var(--text-muted, #475569)').text(`${totalLabel} `);
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

/**
 * Keep overflow on the chart host. Pass `chartWidthPx` from the vertical numeric
 * chart so a plot that already fits the container does not grow a 1px scrollbar
 * from overflowing tick labels; omit it to keep the previous always-scroll host.
 */
export function preventChartScrollbar(container: HTMLElement, chartWidthPx?: number): void {
  const hostWidth = container.clientWidth;
  const needsXScroll = chartWidthPx == null
    ? true
    : hostWidth > 0 && chartWidthPx > hostWidth + 0.5;
  container.style.overflowX = needsXScroll ? 'auto' : 'hidden';
  container.style.overflowY = 'hidden';
}

export function createHistogram(
  data: HistogramChartData,
  container: HTMLElement,
  config: {
    color?: string;
    orientation?: 'vertical' | 'horizontal';
    clipNullEdges?: boolean;
    /** Split-group keys the user switched off in the legend. */
    hiddenGroups?: ReadonlySet<string>;
  } = {}
): void {
  // Colours follow the full group list, so a hidden group keeps its slot and the
  // remaining groups keep their colours.
  const allGroups = data.groups;
  const hiddenGroups = config.hiddenGroups ?? new Set<string>();
  const shownGroupCount = (allGroups ?? []).filter((group) => !hiddenGroups.has(group.key)).length;
  // Dataset groups can overlap (a pooled dataset beside its parts), so their sum
  // is not a total: a dataset split keeps the pooled bin counts whatever is hidden.
  const datasetSplit = isDatasetSplit(data);
  const totalLabel = hiddenGroups.size && allGroups?.length && !datasetSplit
    ? `Total (${shownGroupCount} of ${allGroups.length} shown)`
    : 'Total';

  // A nominal variable split by another category has no meaningful stack: draw
  // one side-by-side cluster of bars per group instead.
  if (allGroups?.length && isNominalHistogramNode({ type: data.variableType })) {
    createGroupedCategoryChart(
      withoutHiddenGroups(data, hiddenGroups),
      container,
      allGroups.map((group) => group.key)
    );
    return;
  }

  data = datasetSplit && data.groups
    ? { ...data, groups: data.groups.filter((group) => !hiddenGroups.has(group.key)) }
    : withoutHiddenGroups(data, hiddenGroups);

  if (config.orientation === 'horizontal') {
    createHorizontalBarChart(data, container, config);
    return;
  }

  const textColor = '#475569';
  const gridColor = '#e2e8f0';
  const domainColor = '#cbd5e1';
  const barColor = config.color || '#2b33e9';

  const clipNullEdges = config.clipNullEdges !== false;
  // A dataset split's groups can overlap (a pooled dataset next to its parts), so
  // a stack double counts. Dodged bars draw one group per sub-slot of each bin.
  const dodged = datasetSplit && data.groups !== undefined;
  const clipped = clipNullEdges && shouldClipNullEdges(data.bins)
    ? clipHistogramNullEdges(data.bins, data.counts, data.groups, dodged)
    : { bins: data.bins.map(String), counts: data.counts, groups: data.groups };
  const { bins, counts } = clipped;
  const groups = clipped.groups;
  const hasGroups = groups !== undefined;
  const stacked = hasGroups && !dodged;
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
  preventChartScrollbar(container, desiredWidth);

  svg
    .attr('width', desiredWidth)
    .attr('height', containerHeight)
    .style('display', 'block')
    .style('overflow', 'hidden');

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

  // Dodged bars split each bin band into one sub-slot per visible group. Colours
  // keep the full-group slot, so hiding a group leaves the others' colours.
  const groupScale = dodged && groups?.length
    ? d3
        .scaleBand<string>()
        .domain(groups.map((group) => group.key))
        .range([0, xScale.bandwidth()])
        .paddingInner(0.12)
        .paddingOuter(0.08)
    : null;
  const barXOf = (segment: { index: number; groupKey: string }): number =>
    (xScale(bins[segment.index]) || 0) + (groupScale ? groupScale(segment.groupKey) || 0 : 0);
  const barWidthOf = (): number => (groupScale ? groupScale.bandwidth() : xScale.bandwidth());

  // A dodged bar never exceeds the largest single group count, so the y axis
  // is sized to that, not to a stack of overlapping groups.
  const drawnMax = dodged && groups
    ? d3.max(groups.flatMap((group) => group.counts), (count) => count ?? 0) || 0
    : d3.max(counts.filter((count): count is number => count !== null)) || 0;

  const yScale = d3
    .scaleLinear()
    .domain([0, drawnMax])
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
    totalLabel,
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
    (allGroups ?? []).map((group, index) => [group.key, histogramSeriesColor(index)])
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
    count: number;
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

  // One segment per visible bin. A stacked bin splits into group pieces plus a
  // residual for what the groups do not show, keeping the unsplit total height.
  // A dodged bin draws one bar per group, each at its own height: overlapping
  // groups (a pooled dataset plus its parts) are never added into one bar.
  const segments: BarDatum[] = [];
  for (const point of visiblePoints) {
    if (dodged) {
      for (const group of groups ?? []) {
        const count = Math.max(0, group.counts[point.index] ?? 0);
        if (count > 0) {
          segments.push({
            index: point.index,
            groupKey: group.key,
            color: groupColorByKey.get(group.key) ?? barColor,
            count,
            y: yScale(count),
            height: innerHeight - yScale(count),
            separator: false,
            isTop: true,
          });
        }
      }
      continue;
    }
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
        count: piece.count,
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
    .attr('data-group', (d) => (hasGroups ? d.groupKey : null))
    .attr('d', (d) =>
      topRoundedBarPath(barXOf(d), d.y, barWidthOf(), d.height, hasStringBins ? 4 : 0))
    .attr('fill', (d) => d.groupKey === HISTOGRAM_RESIDUAL_KEY ? `url(#${residualHatchId})` : d.color)
    .attr('stroke', 'none')
    .attr('opacity', barOpacity)
    .style('transition', 'opacity 120ms ease')
    .style('pointer-events', 'none');

  if (hasGroups) {
    const hueEdges: HueEdge[] = segments.flatMap((segment) => {
      const color = histogramSeriesEdgeColor(segment.color);
      if (!color) return [];
      const x = barXOf(segment);
      const w = barWidthOf();
      const top = segment.y;
      const bottom = segment.y + segment.height;
      const edge = (x1: number, y1: number, x2: number, y2: number): HueEdge =>
        ({ index: segment.index, x1, y1, x2, y2, color });
      return [
        edge(x + 0.5, top, x + 0.5, bottom),
        edge(x + w - 0.5, top, x + w - 0.5, bottom),
        ...(segment.isTop ? [edge(x, top + 0.5, x + w, top + 0.5)] : []),
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

    if (stacked) {
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

  // Count labels above the bars, skipped when a bar is too narrow to read them:
  // one per dodged bar, otherwise one per bin (never on a stacked category bar).
  const fits = (count: number, width: number, min: number): boolean =>
    width >= Math.max(min, formatBarCount(count).length * 6.5 + 4);
  const barLabels = dodged
    ? segments
        .filter((segment) => fits(segment.count, barWidthOf(), 24))
        .map((segment) => ({
          index: segment.index,
          groupKey: segment.groupKey as string | null,
          x: barXOf(segment) + barWidthOf() / 2,
          y: segment.y,
          count: segment.count,
        }))
    : visiblePoints
        .filter((entry) =>
          fits(entry.count as number, bandWidth, 28) && (!hasStringBins || (!stacked && bandWidth >= 34)))
        .map((entry) => ({
          index: entry.index,
          groupKey: null,
          x: (xScale(bins[entry.index]) || 0) + bandWidth / 2,
          y: yScale(entry.count as number),
          count: entry.count as number,
        }));
  chart
    .selectAll('.bar-value')
    .data(barLabels)
    .enter()
    .append('text')
    .attr('class', 'bar-value')
    .attr('data-index', (d) => d.index)
    .attr('data-group', (d) => d.groupKey)
    .attr('x', (d) => d.x)
    .attr('y', (d) => d.y - 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', 'var(--text-muted, #475569)')
    .style('pointer-events', 'none')
    .text((d) => formatBarCount(d.count));

  const stackedTooltipRows = (index: number, binTotal: number | null): StackedTooltipRow[] => {
    const rows: StackedTooltipRow[] = (groups ?? []).map((group) => ({
      label: group.label,
      count: group.counts[index] ?? null,
      color: groupColorByKey.get(group.key) ?? barColor,
    }));
    // Dodged groups are not parts of the total, so there is no remainder to name.
    const leftover = dodged ? 0 : residualCount(binTotal, groups ?? [], index);
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
      } else if (hasGroups) {
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
    .attr('class', 'x-axis')
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
  const xAxisTitleText = data.variableName ? histogramAxisTitle(data) : '';
  // The title's baseline sits at xLabelY; its descender must stay inside the SVG,
  // so the height floor includes the title, not just the tick labels.
  const titleRoom = margin.top + xLabelY + (xAxisTitleText ? 14 : 4);
  if (titleRoom > containerHeight) {
    containerHeight = Math.ceil(titleRoom);
    svg.attr('height', containerHeight);
  }

  if (xAxisTitleText) {
    chart
      .append('text')
      .attr('class', 'histogram-x-title')
      .attr('x', chartWidth / 2)
      .attr('y', xLabelY)
      .attr('text-anchor', 'middle')
      .text(xAxisTitleText)
      .call(styleAxisTitle);
  }

  // Y axis: compact counts (50k); fractional ticks on small counts are not counts.
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(6)
    .tickFormat((d: any) => (Number.isInteger(d) ? d3.format('~s')(d) : ''))
    .tickSize(0)
    .tickPadding(8);

  chart.append('g')
    .attr('class', 'y-axis')
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
    .call(styleAxisTitle);

  // A zero-height bbox is the signature of an unlaid-out container; keep the
  // computed height instead of collapsing the chart to a few visible pixels.
  const svgBBox = (svg.node() as SVGSVGElement | null)?.getBBox();
  if (svgBBox && svgBBox.height > 0) {
    containerHeight = Math.ceil(Math.max(svgBBox.y + svgBBox.height + 4, titleRoom));
    svg.attr('height', containerHeight);
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

  // Vertical grid lines span the bar area: axis lives on the baseline so
  // tickSize(-innerHeight) draws up through every row, not into the top margin.
  chart
    .append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0, ${innerHeight})`)
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
