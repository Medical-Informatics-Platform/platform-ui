import * as d3 from 'd3';

export function createHistogram(
  data: {
    bins: string[];
    counts: number[];
    variable?: string;
    variableName?: string;
    description?: string;
    variableType?: string;
  },
  container: HTMLElement,
  config: {
    color?: string;
    skipEveryOtherLabel?: boolean;
  } = {}
): void {
  const isDark = document.body.classList.contains('theme-dark');
  const textColor = isDark ? '#f1f5f9' : '#475569';
  const mutedTextColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0';
  const domainColor = isDark ? 'rgba(255, 255, 255, 0.2)' : '#cbd5e1';
  const barColor = isDark ? '#7f9ce8' : (config.color || '#2b33e9');

  const { bins, counts } = data;
  const {
    skipEveryOtherLabel = false,
  } = config;

  // Base container dimensions
  const containerRect = container.getBoundingClientRect();
  const containerWidth = containerRect.width || 0;
  const containerHeight = Math.max(containerRect.height || 0, 360);

  // Clear any existing chart
  container.innerHTML = '';

  // Create SVG once
  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', containerHeight);

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

  const baseMargins = { top: 50, right: 10, bottom: 60, left: 40 };
  const labelCharsPerLine = 10;
  const maxLabelLength = bins.reduce((max, b) => Math.max(max, String(b).length), 0);
  const estimatedLines = Math.max(1, Math.ceil(maxLabelLength / labelCharsPerLine));
  const hasStringBins = bins.some((b) => isNaN(parseFloat(String(b))));
  const hasLongNumericBins = bins.some((b) => {
    const raw = String(b).trim();
    if (!raw) return false;
    const num = Number(raw);
    if (Number.isNaN(num)) return false;
    return raw.length >= 4 && raw.includes('.');
  });
  const needsRotate = (hasStringBins && estimatedLines > 1) || hasLongNumericBins || (hasStringBins && bins.length > 8);
  const rotateExtra = needsRotate ? 22 : 0;
  const bottomMargin = Math.max(
    70,
    baseMargins.bottom + estimatedLines * 16 + rotateExtra
  );
  const effectiveHeight = containerHeight;

  // Left margin = base + label width + small padding
  const margin = {
    top: baseMargins.top,
    right: baseMargins.right,
    bottom: bottomMargin,
    left: baseMargins.left + yLabelBBox.width + 8
  };

  // Scale width by bin count to allow horizontal scrolling when needed
  const minPerBinWidth = hasStringBins ? 30 : 20;
  const desiredWidth = Math.max(containerWidth, bins.length * minPerBinWidth);

  svg.attr('width', desiredWidth).attr('height', effectiveHeight);

  const innerWidth = desiredWidth - margin.left - margin.right;
  const innerHeight = effectiveHeight - margin.top - margin.bottom - 40;

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
    .domain([0, d3.max(counts) || 0])
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

  // Bars
  chart
    .selectAll('.bar')
    .data(counts)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', (_, i) => xScale(bins[i]) || 0)
    .attr('y', (d) => yScale(d))
    .attr('width', xScale.bandwidth())
    .attr('height', (d) => innerHeight - yScale(d))
    .attr('fill', barColor)
    .attr('opacity', 0.85)
    .on('mouseover', function (event, d) {
      d3.select(this).attr('opacity', 1).attr('filter', 'brightness(1.1)');
      const i = counts.indexOf(d);
      const binLabel = bins[i];

      tooltip
        .style('visibility', 'visible')
        .html(`
          <div style="margin-bottom: 4px; font-weight: 600; line-height: 1.4;">${data.variableName ? data.variableName + ': ' : ''}${binLabel}</div>
          <div>Count: ${smartFormat(d)}</div>
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

  // X axis
  const xAxis = d3
    .axisBottom(xScale)
    .tickValues(bins)
    .tickFormat((d: any) => {
      const num = parseFloat(d);
      if (isNaN(num)) return d;

      if (data.variableType === 'integer') {
        return Math.round(num).toString();
      }

      return smartFormat(num);
    })
    .tickSize(0)
    .tickPadding(12);

  const xAxisGroup = chart
    .append('g')
    .attr('transform', `translate(0, ${innerHeight})`)
    .call(xAxis)
    .call(g => g.select('.domain').attr('stroke', domainColor));

  const tickText = xAxisGroup
    .selectAll<SVGTextElement, any>('text')
    .attr('font-size', '13px')
    .attr('font-weight', '500')
    .attr('fill', textColor)
    .style('text-anchor', needsRotate ? 'end' : 'middle');

  if (needsRotate) {
    tickText.attr('transform', 'rotate(-35)');
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

  // X label
  // X label (now at top)
  if (data.variableName) {
    chart
      .append('text')
      .attr('x', chartWidth / 2)
      .attr('y', -25) // Position above the grid/chart
      .attr('text-anchor', 'middle')
      .text(data.variableName)
      .style('font-size', '14px')
      .style('font-weight', '700')
      .style('fill', textColor)
    //.style('letter-spacing', '0.08em')
  }
}
