import * as d3 from 'd3';

const MIN_X_TICKS = 4;
const MAX_X_TICKS = 12;

function binsAreNumeric(bins: string[]): boolean {
  return bins.length > 0 && bins.every((bin) => Number.isFinite(Number(bin)));
}

export function clipHistogramNullEdges(
  bins: Array<string | number>,
  counts: Array<number | null>
): { bins: string[]; counts: Array<number | null> } {
  if (!Array.isArray(counts) || !counts.length || !Array.isArray(bins) || !bins.length) {
    return { bins: [], counts: [] };
  }

  let start = 0;
  while (start < counts.length && counts[start] === null) {
    start += 1;
  }

  let end = counts.length - 1;
  while (end >= start && counts[end] === null) {
    end -= 1;
  }

  if (start > end) {
    return { bins: [], counts: [] };
  }

  const isEdgeBased = bins.length === counts.length + 1;
  const clippedCounts = counts.slice(start, end + 1);
  const clippedBins = (isEdgeBased ? bins.slice(start, end + 1) : bins.slice(start, end + 1)).map(String);

  return { bins: clippedBins, counts: clippedCounts };
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

  const last = bins[bins.length - 1];
  if (ticks[ticks.length - 1] !== last) {
    ticks.push(last);
  }

  return ticks;
}

function shouldRotateXLabels(
  bins: string[],
  hasStringBins: boolean,
  maxLabelLength: number,
  denseNumericLabels: boolean
): boolean {
  if (denseNumericLabels) {
    return true;
  }

  const estimatedLines = Math.max(1, Math.ceil(maxLabelLength / 10));
  const hasLongNumericBins = bins.some((bin) => {
    const raw = String(bin).trim();
    if (!raw) {
      return false;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      return false;
    }
    return raw.length >= 4 && raw.includes('.');
  });

  return (hasStringBins && estimatedLines > 1) || hasLongNumericBins || (hasStringBins && bins.length > 8);
}

export function createHistogram(
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
  } = {}
): void {
  const isDark = false;
  const textColor = isDark ? '#f1f5f9' : '#475569';
  const mutedTextColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0';
  const domainColor = isDark ? 'rgba(255, 255, 255, 0.2)' : '#cbd5e1';
  const barColor = isDark ? '#7f9ce8' : (config.color || '#2b33e9');

  const clipped = clipHistogramNullEdges(data.bins, data.counts);
  const { bins, counts } = clipped;
  const containerRect = container.getBoundingClientRect();
  const containerWidth = containerRect.width || 640;

  // Clear any existing chart
  container.innerHTML = '';
  container.style.height = 'auto';
  container.style.minHeight = '0';

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
    .style('font-size', '16px')
    .text(yLabelText);

  const yLabelBBox = (tempLabel.node() as SVGTextElement).getBBox();
  tempLabel.remove();

  const baseMargins = { top: 16, right: 10, bottom: 60, left: 40 };
  const maxLabelLength = bins.reduce((max, b) => Math.max(max, String(b).length), 0);
  const estimatedLines = Math.max(1, Math.ceil(maxLabelLength / 10));
  const hasStringBins = !binsAreNumeric(bins);
  const denseNumericLabels = !hasStringBins && bins.length > 8 && maxLabelLength >= 3;
  const needsRotate = shouldRotateXLabels(bins, hasStringBins, maxLabelLength, denseNumericLabels);
  const bottomMargin = needsRotate
    ? Math.max(88, 24 + Math.min(120, maxLabelLength * 3.2))
    : Math.max(70, baseMargins.bottom + estimatedLines * 16);

  // Left margin = base + label width + small padding
  const margin = {
    top: baseMargins.top,
    right: baseMargins.right,
    bottom: bottomMargin,
    left: baseMargins.left + yLabelBBox.width + 8
  };

  const innerHeight = needsRotate
    ? 240
    : hasStringBins && bins.length <= 8
      ? 200
      : 260;
  let containerHeight = margin.top + innerHeight + margin.bottom;

  // Scale width by bin count to allow horizontal scrolling when needed
  const minPerBinWidth = hasStringBins ? 30 : Math.max(24, maxLabelLength * 8);
  const desiredWidth = Math.max(containerWidth, bins.length * minPerBinWidth);

  svg.attr('width', desiredWidth).attr('height', containerHeight);

  const innerWidth = desiredWidth - margin.left - margin.right;

  // Aesthetic: Limit max bar width for small number of bins
  const maxBarWidth = 100;
  const optimalChartWidth = bins.length * maxBarWidth;
  const chartWidth = Math.min(innerWidth, optimalChartWidth);
  const xOffset = (innerWidth - chartWidth) / 2;

  // Scales
  const xScale = d3
    .scaleBand()
    .domain(bins)
    .range([0, chartWidth])
    .padding(0.2);

  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(counts.filter((count): count is number => count !== null)) || 0])
    .nice()
    .range([innerHeight, 0]);

  // Chart group
  const chart = svg
    .append('g')
    .attr('transform', `translate(${margin.left + xOffset}, ${margin.top})`);

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


  // Tooltip
  const tooltip = d3
    .select(container)
    .append('div')
    .style('position', 'absolute')
    .style('visibility', 'hidden')
    .style('background-color', isDark ? '#1e293b' : '#ffffff')
    .style('color', isDark ? '#f1f5f9' : '#0f172a')
    .style('padding', '8px 12px')
    .style('border-radius', '6px')
    .style('font-size', '12px')
    .style('font-weight', '500')
    .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
    .style('border', `1px solid ${isDark ? '#334155' : '#e2e8f0'}`)
    .style('max-width', '250px')
    .style('white-space', 'normal')
    .style('pointer-events', 'none')
    .style('z-index', '10');

  // Bars (skip privacy-masked null counts, but keep their x-axis labels)
  chart
    .selectAll('.bar')
    .data(counts.map((count, index) => ({ count, index })).filter((entry) => entry.count !== null))
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', (d) => xScale(bins[d.index]) || 0)
    .attr('y', (d) => yScale(d.count as number))
    .attr('width', xScale.bandwidth())
    .attr('height', (d) => innerHeight - yScale(d.count as number))
    .attr('fill', barColor)
    .attr('opacity', 0.85)
    .on('mouseover', function (_event, d) {
      d3.select(this).attr('opacity', 1).attr('filter', 'brightness(1.1)');
      const binLabel = bins[d.index];

      tooltip
        .style('visibility', 'visible')
        .html(`
          <div style="margin-bottom: 4px; font-weight: 600; line-height: 1.4;">${data.variableName ? data.variableName + ': ' : ''}${binLabel}</div>
          <div>Count: ${smartFormat(d.count)}</div>
        `);
    })
    .on('mousemove', function (event) {
      // Get container position to calculate relative coordinates
      const [x, y] = d3.pointer(event, container);

      // Keep tooltip within container bounds
      const tooltipNode = tooltip.node() as HTMLElement;
      const tooltipWidth = tooltipNode?.offsetWidth || 100;
      const tooltipHeight = tooltipNode?.offsetHeight || 60;

      let left = x + 15;
      let top = y - 10;

      // Flip if too close to right edge
      if (left + tooltipWidth > containerWidth) {
        left = x - tooltipWidth - 15;
      }

      // Flip if too close to bottom edge
      if (top + tooltipHeight > containerHeight) {
        top = y - tooltipHeight - 10;
      }

      tooltip
        .style('left', `${left}px`)
        .style('top', `${top}px`);
    })
    .on('mouseout', function () {
      d3.select(this).attr('opacity', 0.85).attr('filter', null);
      tooltip.style('visibility', 'hidden');
    });

  // Smart number formatter
  function smartFormat(d: any): string {
    if (typeof d !== 'number' || isNaN(d)) return String(d);
    const abs = Math.abs(d);

    if (Number.isInteger(d)) return d.toString();
    if (abs > 10000) return d3.format('.2f')(d);
    if (abs > 0 && abs < 0.01) return d3.format('.2e')(d);
    return d3.format('.2f')(d);
  }

  const xTickValues = denseNumericLabels
    ? selectXTickValues(bins, chartWidth, maxLabelLength)
    : bins;

  // X axis
  const xAxis = d3
    .axisBottom(xScale)
    .tickValues(xTickValues)
    .tickFormat((d: any) => {
      const num = parseFloat(d);
      if (isNaN(num)) return d;

      if (data.variableType === 'integer' || Number.isInteger(num)) {
        return d3.format(',')(Math.round(num));
      }

      return smartFormat(num);
    })
    .tickSize(0)
    .tickPadding(needsRotate ? 8 : 12);

  const xAxisGroup = chart
    .append('g')
    .attr('transform', `translate(0, ${innerHeight})`)
    .call(xAxis)
    .call(g => g.select('.domain').attr('stroke', domainColor));

  const tickFontSize = denseNumericLabels ? '11px' : '13px';
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
  if (xAxisBBox) {
    const axisBottom = margin.top + innerHeight + xAxisBBox.y + xAxisBBox.height + 12;
    if (axisBottom > containerHeight) {
      containerHeight = Math.ceil(axisBottom);
      svg.attr('height', containerHeight);
    }
  }

  // Y axis
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(6)
    .tickFormat((d: any) => smartFormat(d))
    .tickSize(0)
    .tickPadding(12);

  chart.append('g')
    .call(yAxis)
    .call(g => g.select('.domain').remove())
    .selectAll('text')
    .attr('font-size', '13px')
    .attr('font-weight', '500')
    .attr('fill', textColor);

  // Y label
  const yLabelPaddingFromAxis = 32;

  chart
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2)
    .attr('y', -margin.left + yLabelPaddingFromAxis)
    .attr('text-anchor', 'middle')
    .text(yLabelText)
    .style('font-size', '12px')
    .style('font-weight', '700')
    .style('fill', mutedTextColor)
    .style('letter-spacing', '0.08em')
    .style('text-transform', 'uppercase');

  const svgBBox = (svg.node() as SVGSVGElement | null)?.getBBox();
  if (svgBBox) {
    containerHeight = Math.ceil(svgBBox.y + svgBBox.height + 8);
    svg.attr('height', containerHeight);
  }

  container.style.height = `${containerHeight}px`;
}
