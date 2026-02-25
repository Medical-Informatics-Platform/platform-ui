import * as d3 from 'd3';

// helpers
// Splits labels


// Creates label + background rect
function createLabelGroup(group: d3.Selection<SVGGElement, any, any, any>, d: any) {
  group.selectAll('*').remove();

  const label = d.data.label || '';
  const maxCharsPerLine = 20;

  // Split label into lines
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let currentLine: string[] = [];

  words.forEach((word: string) => {
    const potentialLine = [...currentLine, word].join(' ');
    if (potentialLine.length <= maxCharsPerLine) {
      currentLine.push(word);
    } else {
      if (currentLine.length > 0) lines.push(currentLine.join(' '));
      currentLine = [word];
    }
  });
  if (currentLine.length > 0) lines.push(currentLine.join(' '));

  const fontSize = d.children ? 15 : 10;

  const textNode = group
    .append('text')
    .attr('class', 'label')
    .attr('text-anchor', 'middle')
    .style('font-size', `${fontSize}px`)
    .style('font-weight', '600')
    .style('fill', '#0f172a')
    .style('paint-order', 'stroke')
    .style('stroke', 'rgba(255,255,255,0.9)')
    .style('stroke-width', 2)
    .style('stroke-linejoin', 'round');

  // Add tspans
  lines.forEach((lineStr, i) => {
    textNode.append('tspan')
      .attr('x', 0)
      .attr('dy', i === 0 ? (lines.length === 1 ? '0.35em' : `-${(lines.length - 1) * 0.6}em`) : '1.2em')
      .text(lineStr);
  });

  if (!d.children) return;
}

// Get code/id from nodes
const codeOf = (x: any): string | undefined =>
  x?.code ?? x?.uniqueId ?? x?.id ??
  x?.data?.code ?? x?.data?.uniqueId ?? x?.data?.id ??
  x?.label;

// Turns input arrays into new Set<string> -- copies
const toCodeSet = (arr: any[] | undefined | null): Set<string> =>
  new Set(
    ([...(arr ?? [])] as any[]) // shallow copy
      .map(codeOf)
      .filter((v): v is string => !!v)
  );

type BubbleColorConfig = {
  variable: string;
  covariate: string;
  filter: string;
  selected: string;
  groupStart: string;
  groupEnd: string;
};

const defaultColors: BubbleColorConfig = {
  variable: '#2b33e9',     // Brand Blue (matches --variable-color)
  covariate: '#ccb692',    // Muted Sand (matches --covariate-color)
  filter: '#94a3b8',       // Muted Slate (matches --filter-color)
  selected: '#1b21a3',     // Brand Blue darker
  groupStart: '#dfefe4',   // Light green for groups
  groupEnd: '#2b33e9',     // Brand Blue for groups
};

// Calculate leaf color
const colorForLeaf = (
  d: any,
  sets: { vars: Set<string>; covs: Set<string>; filters: Set<string> },
  colors: BubbleColorConfig
): string => {
  const code = codeOf(d.data);
  if (!code) return 'white';
  if (sets.vars.has(code)) return colors.variable; // variable
  if (sets.covs.has(code)) return colors.covariate; // covariate
  if (sets.filters.has(code)) return colors.filter; // filter
  return 'white';
};

// MAIN FACTORY

export function createZoomableCirclePacking(
  data: any,
  container: HTMLElement,
  onNodeClick: (node: any) => void,
  onNodeDoubleClick: (node: any) => void,
  options?: {
    selectedVariables?: any[];
    selectedCovariates?: any[];
    selectedFilters?: any[];
    colors?: Partial<BubbleColorConfig>;
    onAnimationStart?: () => void;
    onAnimationEnd?: () => void;
  }
): { zoomToNode: (d: any) => void; refreshColors: (opts?: any) => void; destroy?: () => void } {

  // local snapshots, decouple references of the experiment studio service signals
  let sets = {
    vars: toCodeSet(options?.selectedVariables),
    covs: toCodeSet(options?.selectedCovariates),
    filters: toCodeSet(options?.selectedFilters),
  };

  let colors: BubbleColorConfig = { ...defaultColors, ...(options?.colors ?? {}) };

  const bounds = container.getBoundingClientRect();
  const width = Math.floor(bounds.width || 0) || 700;
  const height = Math.floor(bounds.height || 0) || 728;
  const paddingLabel = 20;
  const availableHeight = height - paddingLabel;
  const size = Math.min(width, availableHeight);
  // Calculate offset to center the square packing within the rectangle
  const offsetX = (width - size) / 2;
  const offsetY = paddingLabel + (availableHeight - size) / 2;
  let groupColor = d3.scaleLinear<string>()
    .domain([0, 5])
    .range([colors.groupStart, colors.groupEnd])
    .interpolate(d3.interpolateHcl);

  if (!container) {
    console.error('No container provided');
    return { zoomToNode: () => { }, refreshColors: () => { } };
  }
  container.innerHTML = '';

  // Tooltip setup
  const tooltip = d3
    .select('body')
    .append('div')
    .attr('class', 'tooltip');

  function decodeUnicode(str: string): string {
    try {
      return str.replace(/\\u[\dA-Fa-f]{4}/g, (match) =>
        String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))
      );
    } catch {
      return str;
    }
  }

  function showTooltip(event: MouseEvent, d: any) {
    const label = d.data.label || '(no label)';
    const descriptionRaw = d.data.description || '';
    const description = decodeUnicode(descriptionRaw.trim());
    const type = d.data.type || '';

    let html = `<div><strong>${label}</strong></div>`;
    if (type)
      html += `<div style="margin-top:4px;"><strong>Type:</strong> ${type}</div>`;
    if (description)
      html += `<div style="margin-top:4px;"><strong>Description:</strong> ${description}</div>`;

    tooltip
      .html(html)
      .style('left', `${event.clientX + 10}px`)
      .style('top', `${event.clientY + 10}px`)
      .transition()
      .duration(150)
      .style('opacity', 1);
  }

  function moveTooltip(event: MouseEvent) {
    tooltip
      .style('left', `${event.clientX + 10}px`)
      .style('top', `${event.clientY + 10}px`);
  }

  function hideTooltip() {
    tooltip.transition().duration(150).style('opacity', 0);
  }

  // Create a perfectly square pack layout
  // Create a perfectly square pack layout based on the minimum dimension
  const packSize = size;
  const packHeight = packSize;
  const topMargin = 0; // Handled by zoom radius buffer now

  const root = d3.pack<any>().size([packSize, packHeight]).padding(3)(
    d3.hierarchy<any>(data, (d: any) => d.children)
      .sum((d: any) => d.value ?? 0)
      .sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0))
  );

  let focus = root;
  // Use a 2.05x radius to reduce padding
  let view: [number, number, number] = [focus.x, focus.y, focus.r * 2];
  let selectedDataNode: d3.HierarchyNode<any> | null = null;

  const svg = d3
    .create('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr(
      'style',
      `width: 100%; height: 100%; display: block; margin: 0;
       background: transparent; cursor: pointer;`
    );

  const defs = svg.append('defs');
  defs.append('filter')
    .attr('id', 'node-glow')
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%')
    .append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 0)
    .attr('stdDeviation', 2.5)
    .attr('flood-color', 'rgba(0,0,0,0.35)');

  // Nodes
  const node = svg.append('g')
    .selectAll('circle')
    .data(root.descendants().slice(1))
    .join('circle')
    .attr('class', (d: any) => (d.children ? 'group' : 'leaf'))
    .attr('fill', (d: any) => (d.children ? groupColor(d.depth) : colorForLeaf(d, sets, colors)))
    .attr('fill-opacity', (d: any) => (d.children ? 0.6 : 1))
    .attr('stroke', (d: any) => (d.children ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.12)'))
    .attr('stroke-width', (d: any) => (d.children ? 1 : 0.6))
    .style('cursor', 'pointer')
    .on('click', (event: MouseEvent, d: any) => {
      event.stopPropagation();
      if (!d.children) {
        selectedDataNode = d;
        onNodeClick(d.data);
        updateSelection();
        return;
      }
      zoom(event, d);
    })
    .on('dblclick', (event: MouseEvent, d: any) => {
      event.stopPropagation();
      if (!d.children) {
        onNodeDoubleClick(d.data);
      }
    })
    .on('mouseover', function (event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('stroke', '#000')
        .attr('stroke-width', 2)
        .attr('filter', 'url(#node-glow)');
      showTooltip(event, d);
    })
    .on('mousemove', function (event) {
      moveTooltip(event);
    })
    .on('mouseout', function () {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('stroke', (d: any) => (d.children ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.12)'))
        .attr('stroke-width', (d: any) => (d.children ? 1 : 0.6))
        .attr('filter', 'none');
      updateSelection();
      hideTooltip();
    });


  // Labels
  const labelsGroup = svg.append('g').attr('pointer-events', 'none');
  const labelNodes = labelsGroup
    .selectAll('g.label-group')
    .data(root.descendants())
    .join('g')
    .attr('class', 'label-group')
    .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    .style('display', (d: any) => (d.parent === focus ? 'inline' : 'none'));

  zoomTo([focus.x, focus.y, focus.r * 2]);
  container.appendChild(svg.node()!);

  // Functions
  function zoomTo(v: [number, number, number]) {
    const k = size / v[2];
    view = v;

    node.attr('transform', (d: any) => `translate(${(d.x - v[0]) * k + size / 2 + offsetX}, ${(d.y - v[1]) * k + size / 2 + offsetY})`);
    node.attr('r', (d: any) => d.r * k);

    labelNodes.attr('transform', (d: any) => {
      const x = (d.x - v[0]) * k + size / 2 + offsetX;
      const y = (d.y - v[1]) * k + size / 2 + offsetY;
      const offset = d.children ? d.r * k + 8 : 0;
      return `translate(${x}, ${y - offset})`;
    })
      .each(function (d: any) {
        const el = d3.select(this as SVGGElement);
        if (d.parent === focus && shouldShowLabel(d, k)) {
          el.style('display', 'inline').style('fill-opacity', 0.92);
          createLabelGroup(el, d);
        } else el.style('display', 'none');
      });
  }

  function updateSelection() {
    node.transition().duration(200)
      .attr('fill', (d: any) => {
        if (d === selectedDataNode) return colors.selected;
        if (d.children) return groupColor(d.depth);
        return colorForLeaf(d, sets, colors);
      })
      .attr('fill-opacity', (d: any) => (d.children ? 0.6 : 1))
      .attr('stroke', (d: any) => {
        if (d === selectedDataNode) return '#000';
        if (d.children) return 'rgba(0,0,0,0.08)';
        return 'rgba(0,0,0,0.12)';
      })
      .attr('stroke-width', (d: any) => {
        if (d === selectedDataNode) return 2;
        if (d.children) return 1;
        return 0.6;
      })
      .attr('filter', (d: any) => (d === selectedDataNode ? 'url(#node-glow)' : 'none'));
  }

  function zoom(event: MouseEvent | null, d: any) {
    if (focus === d) return;
    focus = d;
    onNodeClick(d.data);

    const isFast = event && event.altKey;

    options?.onAnimationStart?.();

    svg.transition()
      .duration(isFast ? 7500 : 750)
      .tween('zoom', () => {
        const i = d3.interpolateZoom(view, [d.x, d.y, d.r * 2]);
        return (t: number) => zoomTo(i(t));
      })
      .on('end', () => {
        selectedDataNode = null;
        updateSelection();
        options?.onAnimationEnd?.();
      })
      .on('interrupt', () => {
        options?.onAnimationEnd?.();
      });
  }

  function zoomToNode(dataNode: any) {
    const code = dataNode?.code ?? dataNode;  // accepts {code} or "code"

    const target = root.descendants().find((n: any) => n.data.code === code);
    if (!target) return;

    // if group -> zoom to group
    // if leaf  -> zoom to parent
    const group = target.children ? target : (target.parent ?? root);

    if (focus === group) {
      selectedDataNode = target.children ? null : target;
      updateSelection();
      return;
    }

    const zoomTarget: [number, number, number] = [group.x, group.y, group.r * 2];

    labelNodes.each(function (nd: any) {
      const el = d3.select(this as SVGGElement);
      if (nd.parent === group && shouldShowLabel(nd, size / zoomTarget[2])) {
        el.style('display', 'inline').style('fill-opacity', 0.6);
        createLabelGroup(el, nd);
      } else el.style('display', 'none').style('fill-opacity', 0);
    });

    if (!view) view = [root.x, root.y, root.r * 2];

    if (focus === root && !selectedDataNode) {
      zoomTo(zoomTarget);
      focus = group;
      selectedDataNode = target.children ? null : target; // group -> null
      updateSelection();
    }

    options?.onAnimationStart?.();

    svg.transition()
      .duration(750)
      .tween('zoom', () => {
        const i = d3.interpolateZoom(view, zoomTarget);
        return (t: number) => zoomTo(i(t));
      })
      .on('end', () => {
        focus = group;
        selectedDataNode = target.children ? null : target; // group -> null
        updateSelection();

        labelNodes.each(function (nd: any) {
          const el = d3.select(this as SVGGElement);
          if (nd.parent === group && shouldShowLabel(nd, size / zoomTarget[2])) {
            el.style('display', 'inline')
              .transition()
              .duration(250)
              .style('fill-opacity', 0.92);
          } else el.style('display', 'none').style('fill-opacity', 0);
        });

        options?.onAnimationEnd?.();
      })
      .on('interrupt', () => {
        options?.onAnimationEnd?.();
      });
  }

  svg.on('click', function (event: MouseEvent) {
    if (event.target === this) zoom(event, root);
  });

  // immutable refreshColors
  function refreshColors(newOptions?: {
    selectedVariables?: any[];
    selectedCovariates?: any[];
    selectedFilters?: any[];
    colors?: Partial<BubbleColorConfig>;
  }) {
    colors = { ...colors, ...(newOptions?.colors ?? {}) };
    groupColor = d3.scaleLinear<string>()
      .domain([0, 5])
      .range([colors.groupStart, colors.groupEnd])
      .interpolate(d3.interpolateHcl);

    // Updates global snapshot
    sets = {
      vars: new Set(
        [...(newOptions?.selectedVariables ?? [])]
          .map(codeOf)
          .filter((v): v is string => !!v)
      ),
      covs: new Set(
        [...(newOptions?.selectedCovariates ?? [])]
          .map(codeOf)
          .filter((v): v is string => !!v)
      ),
      filters: new Set(
        [...(newOptions?.selectedFilters ?? [])]
          .map(codeOf)
          .filter((v): v is string => !!v)
      ),
    };

    // Updates leaf node colors based on the new snapshot
    node.each(function (d: any) {
      const circle = d3.select(this);
      if (!d.children) {
        const newFill = colorForLeaf(d, sets, colors);
        if (circle.attr('fill') !== newFill) {
          circle.attr('fill', newFill);
        }
      } else {
        circle.attr('fill', groupColor(d.depth));
      }
    });
    updateSelection();
  }

  function shouldShowLabel(d: any, k: number): boolean {
    const radius = d.r * k;
    if (radius < 16) return false;
    return true;
  }

  return {
    zoomToNode,
    refreshColors,
    destroy: () => {
      tooltip.remove();
    }
  };
}
