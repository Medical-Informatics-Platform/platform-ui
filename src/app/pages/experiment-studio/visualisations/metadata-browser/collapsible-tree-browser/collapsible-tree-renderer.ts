import * as d3 from 'd3';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { pluralize } from '../../../../../core/result-label.utils';
import {
  EMPTY_UNAVAILABLE_VARIABLES,
  UnavailableVariablesMap,
  unavailableDatasetsFor,
  unavailableVariableTooltip,
} from '../../../../../core/variable-availability.utils';

interface CollapsibleTreeSelectionOptions {
  selectedVariables?: D3HierarchyNode[];
  highlightNode?: D3HierarchyNode | null;
}

export interface CollapsibleTreeRenderer {
  expandToNode: (node: D3HierarchyNode) => void;
  /** Opens a group, folds everything below it and selects it: breadcrumb and "up" navigation. */
  focusNode: (node: D3HierarchyNode) => void;
  refreshSelection: (options?: CollapsibleTreeSelectionOptions) => void;
  setUnavailableVariables: (unavailable: UnavailableVariablesMap | null | undefined) => void;
  fitView: () => void;
  zoomBy: (factor: number) => void;
  collapseAll: () => void;
  resize: () => void;
  destroy: () => void;
}

interface CollapsibleTreeOptions extends CollapsibleTreeSelectionOptions {
  /** Variables drawn grayed out that ignore clicks, double-clicks and Enter/Space. */
  unavailableVariables?: UnavailableVariablesMap;
  onNodeClick: (node: D3HierarchyNode) => void;
  onNodeDoubleClick: (node: D3HierarchyNode) => void;
  onAutoFitScheduled?: () => void;
  onAutoFitCanceled?: () => void;
  onNodeCentered?: (node: D3HierarchyNode) => void;
  /** The open path, root first, whenever it changes. */
  onPathChange?: (path: D3HierarchyNode[]) => void;
}

interface RenderNode extends D3HierarchyNode {
  children?: RenderNode[];
  /** Marks the synthetic "N more variables" row of a paged group. */
  moreRow?: true;
}

type TreeDatum = d3.HierarchyPointNode<RenderNode> & {
  x0?: number;
  y0?: number;
  /** Every child in display order (groups, then variables), whether open or not. */
  _all?: TreeDatum[];
  /** The children of a closed group. */
  _children?: TreeDatum[];
  /** Variables an open group shows before its "more" row. */
  _limit?: number;
  _more?: TreeDatum;
};

const nodeWidth = 236;
const nodeHeight = 36;
/** Column pitch: one card plus the run of its links. */
const levelWidth = 288;
const rowPitch = 46;
const stubHeight = 30;
const labelMaxWidth = nodeWidth - 52;
/** Scale range the diagram is framed at after a click, so labels stay legible. */
const readableScale = { min: 0.72, max: 1.1 };

/** Variables an opened group lists before folding the rest behind a "more" row. */
export const VARIABLE_PAGE_SIZE = 8;
const VARIABLE_PAGE_STEP = 20;

export function createCollapsibleTree(
  data: D3HierarchyNode,
  container: HTMLElement,
  options: CollapsibleTreeOptions
): CollapsibleTreeRenderer {
  container.innerHTML = '';

  const root = d3.hierarchy<RenderNode>(data as RenderNode, groupsFirst) as TreeDatum;
  root.x0 = 0;
  root.y0 = 0;
  initializeCollapse(root);

  let selectedVariables = toCodeSet(options.selectedVariables);
  let unavailableVariables = options.unavailableVariables ?? EMPTY_UNAVAILABLE_VARIABLES;
  const unavailableIn = (node: TreeDatum): readonly string[] =>
    isVariable(node) ? unavailableDatasetsFor(unavailableVariables, node.data) : [];
  const isUnavailable = (node: TreeDatum): boolean => unavailableIn(node).length > 0;
  let highlightedCode = codeOf(options.highlightNode);
  let highlightedPath = pathOf(options.highlightNode);
  let bounds = measureContainer(container);
  let layoutBox = { left: 0, right: 0, top: 0, bottom: 0 };
  let onPath = new Set<TreeDatum>();
  let lastEmittedPath: TreeDatum[] = [];
  let pendingAutoFitFrame: number | null = null;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('class', 'collapsible-tree-svg')
    .attr('role', 'img')
    .attr('aria-label', 'Collapsible metadata tree')
    .attr('width', bounds.width)
    .attr('height', bounds.height)
    .attr('viewBox', `0 0 ${bounds.width} ${bounds.height}`);

  const zoomLayer = svg.append('g').attr('class', 'collapsible-tree-layer');
  const linkLayer = zoomLayer.append('g').attr('class', 'collapsible-links');
  const stubLayer = zoomLayer.append('g').attr('class', 'collapsible-stubs');
  const nodeLayer = zoomLayer.append('g').attr('class', 'collapsible-nodes');

  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'collapsible-tree-tooltip')
    .style('opacity', 0);

  // A plain wheel pans, as in any scrolling list; Ctrl/⌘ + wheel (and pinch) zooms.
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 2.4])
    .filter((event: Event & { ctrlKey?: boolean; metaKey?: boolean; button?: number }) =>
      event.type === 'wheel' ? !!(event.ctrlKey || event.metaKey) : !event.button)
    .on('zoom', (event) => {
      zoomLayer.attr('transform', event.transform.toString());
    });

  svg.call(zoom);
  svg.on('dblclick.zoom', null);
  svg.on('wheel.pan', (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const lineHeight = event.deltaMode === 1 ? 16 : 1;
    const k = d3.zoomTransform(svg.node()!).k;
    zoom.translateBy(svg, (-event.deltaX * lineHeight) / k, (-event.deltaY * lineHeight) / k);
  }, { passive: false } as AddEventListenerOptions);

  const tree = d3.tree<RenderNode>()
    .nodeSize([rowPitch, levelWidth])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.3));
  const duration = 260;

  /** Folds every open sibling, then opens `node`; a lone child group opens with it. */
  const open = (node: TreeDatum): void => {
    if (!node._all?.length) return;
    (node.parent as TreeDatum | null)?._all?.forEach((sibling) => {
      if (sibling !== node) close(sibling);
    });
    node.children = node._all;
    node._children = undefined;
    const only = node._all.length === 1 ? node._all[0] : null;
    if (only && !isVariable(only)) open(only);
  };

  const close = (node: TreeDatum): void => {
    if (!node._all?.length) return;
    node._all.forEach(close);
    node.children = undefined;
    node._children = node._all;
    node._limit = undefined;
  };

  /** Shows an open group's child groups and its first page of variables. */
  const syncChildren = (node: TreeDatum): void => {
    const all = node._all ?? [];
    if (!node.children || !all.length) return;
    const groups = all.filter((child) => !isVariable(child));
    const variables = all.filter(isVariable);
    const limit = Math.max(node._limit ?? VARIABLE_PAGE_SIZE, VARIABLE_PAGE_SIZE);
    // A "1 more" row would cost the same space as the variable it hides.
    const shown = variables.length <= limit + 1 ? variables : variables.slice(0, limit);
    const hidden = variables.length - shown.length;
    node.children = [...groups, ...shown, ...(hidden > 0 ? [moreRow(node, hidden)] : [])];
    groups.forEach(syncChildren);
  };

  /** Root, then each open group down to the deepest one. */
  const openPath = (): TreeDatum[] => {
    const path = [root];
    let current = root;
    for (;;) {
      const next = (current.children as TreeDatum[] | undefined)?.find((child) => !!child.children && !!child._all?.length);
      if (!next) return path;
      path.push(next);
      current = next;
    }
  };

  /** Columns that fit the canvas at the smallest readable scale. */
  const maxColumns = (): number =>
    Math.max(3, Math.floor((bounds.width - 32 + (levelWidth - nodeWidth)) / (levelWidth * readableScale.min)));

  const update = (source: TreeDatum): void => {
    bounds = measureContainer(container);
    svg
      .attr('width', bounds.width)
      .attr('height', bounds.height)
      .attr('viewBox', `0 0 ${bounds.width} ${bounds.height}`);

    syncChildren(root);
    const path = openPath();
    onPath = new Set(path);
    // Deep paths keep only their last levels on screen; the rest fold into the stub and breadcrumb.
    const windowRoot = path[Math.max(0, path.length + 1 - maxColumns())];

    tree(windowRoot);
    const nodes = windowRoot.descendants() as TreeDatum[];
    const links = windowRoot.links();
    nodes.forEach((node) => {
      node.y = (node.depth - windowRoot.depth) * levelWidth;
    });

    const hiddenAbove = windowRoot.parent as TreeDatum | null;
    const stubX = windowRoot.x - nodeHeight / 2 - 26 - stubHeight / 2;
    layoutBox = {
      left: (d3.min(nodes, (node) => node.y) ?? 0) - nodeWidth / 2,
      right: (d3.max(nodes, (node) => node.y) ?? 0) + nodeWidth / 2,
      top: Math.min(d3.min(nodes, (node) => node.x) ?? 0, hiddenAbove ? stubX : Infinity) - nodeHeight / 2,
      bottom: (d3.max(nodes, (node) => node.x) ?? 0) + nodeHeight / 2,
    };

    const enterFrom = (node: TreeDatum): string =>
      isWithin(node, source)
        ? `translate(${source.y0 ?? 0},${source.x0 ?? 0})`
        : `translate(${node.y - levelWidth / 3},${node.x})`;

    const nodeSelection = nodeLayer
      .selectAll<SVGGElement, TreeDatum>('g.collapsible-node')
      .data(nodes, (node) => stableKey(node));

    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'collapsible-node')
      .attr('transform', (node) => enterFrom(node))
      .style('opacity', 0)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .on('click', (event, node) => {
        event.stopPropagation();
        handleNodeClick(node);
      })
      .on('dblclick', (event, node) => {
        event.stopPropagation();
        if (isVariable(node) && !isUnavailable(node)) {
          options.onNodeDoubleClick(node.data);
        }
      })
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleNodeClick(node);
        }
      })
      .on('mouseenter', (event, node) => showTooltip(event, node, unavailableIn(node)))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', hideTooltip);

    nodeEnter.append('rect')
      .attr('class', 'node-card')
      .attr('x', -nodeWidth / 2)
      .attr('y', -nodeHeight / 2)
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('rx', 8);

    nodeEnter.append('circle')
      .attr('class', 'node-anchor')
      .attr('cx', -nodeWidth / 2 + 14)
      .attr('r', 4.5);

    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('x', -nodeWidth / 2 + 27)
      .attr('y', -2);

    nodeEnter.append('text')
      .attr('class', 'node-meta')
      .attr('x', -nodeWidth / 2 + 27)
      .attr('y', 11);

    nodeEnter.append('text')
      .attr('class', 'node-chevron')
      .attr('x', nodeWidth / 2 - 15)
      .attr('y', 5)
      .attr('text-anchor', 'middle');

    const nodeMerge = nodeEnter.merge(nodeSelection);

    nodeMerge
      .attr('class', (node) => nodeClass(node))
      .attr('aria-label', (node) => ariaLabel(node))
      .attr('aria-disabled', (node) => (isUnavailable(node) ? 'true' : null))
      .attr('aria-expanded', (node) => isGroup(node) ? String(!!node.children) : null)
      .transition()
      .duration(duration)
      .style('opacity', 1)
      .attr('transform', (node) => `translate(${node.y},${node.x})`);

    nodeMerge.select<SVGTextElement>('text.node-label').text((node) => fitLabel(nodeLabel(node), labelMaxWidth));
    nodeMerge.select<SVGTextElement>('text.node-meta').text((node) => nodeMeta(node));
    nodeMerge.select<SVGTextElement>('text.node-chevron').text((node) => chevron(node));

    // Leaving nodes fade out in place: out of reach for pointer, keyboard and screen readers meanwhile.
    nodeSelection.exit<TreeDatum>()
      .attr('aria-hidden', 'true')
      .attr('tabindex', -1)
      .style('pointer-events', 'none')
      .transition()
      .duration(duration)
      .attr('transform', (node) => isWithin(node, source)
        ? `translate(${source.y},${source.x})`
        : `translate(${(node.y0 ?? 0) - levelWidth / 3},${node.x0 ?? 0})`)
      .style('opacity', 0)
      .remove();

    const linkSelection = linkLayer
      .selectAll<SVGPathElement, d3.HierarchyPointLink<RenderNode>>('path.tree-link')
      .data(links, (link) => stableKey(link.target as TreeDatum));

    const collapsedLink = { source, target: source } as d3.HierarchyPointLink<RenderNode>;
    linkSelection.enter()
      .append('path')
      .attr('d', (link) => isWithin(link.target as TreeDatum, source) ? diagonal(collapsedLink) : diagonal(link))
      .style('opacity', 0)
      .merge(linkSelection)
      .attr('class', (link) => linkClass(link))
      .transition()
      .duration(duration)
      .style('opacity', 1)
      .attr('d', diagonal);

    linkSelection.exit()
      .transition()
      .duration(duration)
      .style('opacity', 0)
      .remove();

    const stubSelection = stubLayer
      .selectAll<SVGGElement, TreeDatum>('g.ancestor-stub')
      .data(hiddenAbove ? [hiddenAbove] : [], (node) => stableKey(node));

    const stubEnter = stubSelection.enter()
      .append('g')
      .attr('class', 'ancestor-stub')
      .attr('transform', `translate(${windowRoot.y},${stubX})`)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .style('opacity', 0)
      .on('click', (event, node) => {
        event.stopPropagation();
        focusDatum(node);
      })
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          focusDatum(node);
        }
      });
    stubEnter.append('line').attr('class', 'stub-link');
    stubEnter.append('rect')
      .attr('class', 'stub-card')
      .attr('x', -nodeWidth / 2)
      .attr('y', -stubHeight / 2)
      .attr('width', nodeWidth)
      .attr('height', stubHeight)
      .attr('rx', stubHeight / 2);
    stubEnter.append('text').attr('class', 'stub-label').attr('x', -nodeWidth / 2 + 14).attr('y', 4);

    const stubMerge = stubEnter.merge(stubSelection);
    stubMerge
      .attr('aria-label', (node) => `Go up to ${node.data.label ?? 'parent group'}`)
      .transition()
      .duration(duration)
      .style('opacity', 1)
      .attr('transform', `translate(${windowRoot.y},${stubX})`);
    stubMerge.select<SVGLineElement>('line.stub-link')
      .attr('x1', -nodeWidth / 2 + 14)
      .attr('x2', -nodeWidth / 2 + 14)
      .attr('y1', stubHeight / 2)
      .attr('y2', windowRoot.x - stubX - nodeHeight / 2);
    stubMerge.select<SVGTextElement>('text.stub-label')
      .text((node) => fitLabel(`↑ Up to ${normalizeString(node.data.label) || 'parent group'}`, nodeWidth - 28, '650 11px'));
    stubSelection.exit()
      .attr('aria-hidden', 'true')
      .attr('tabindex', -1)
      .style('pointer-events', 'none')
      .transition()
      .duration(duration)
      .style('opacity', 0)
      .remove();

    nodes.forEach((node) => {
      node.x0 = node.x;
      node.y0 = node.y;
    });
    emitPath(path);
  };

  const emitPath = (path: TreeDatum[]): void => {
    if (path.length === lastEmittedPath.length && path.every((node, index) => node === lastEmittedPath[index])) return;
    lastEmittedPath = path;
    options.onPathChange?.(path.map((node) => node.data));
  };

  const markHighlighted = (node: TreeDatum): void => {
    highlightedCode = codeOf(node.data);
    highlightedPath = hierarchyPath(node);
  };

  const handleNodeClick = (node: TreeDatum): void => {
    if (isUnavailable(node)) return;
    if (isMore(node)) {
      const parent = node.parent as TreeDatum;
      parent._limit = (parent._limit ?? VARIABLE_PAGE_SIZE) + VARIABLE_PAGE_STEP;
      update(parent);
      frame(parent);
      return;
    }
    if (isVariable(node)) {
      markHighlighted(node);
      refreshNodeClasses();
      options.onNodeClick(node.data);
      return;
    }

    const path = openPath();
    if (!node.children) {
      open(node);
    } else if (node === path[path.length - 1] && node !== root) {
      close(node);
    } else {
      node._all?.forEach(close);
    }
    markHighlighted(node);
    update(node);
    options.onNodeClick(node.data);
    frame(node);
  };

  const refreshNodeClasses = (): void => {
    nodeLayer
      .selectAll<SVGGElement, TreeDatum>('g.collapsible-node')
      .attr('class', (node) => nodeClass(node))
      .attr('aria-disabled', (node) => (isUnavailable(node) ? 'true' : null));
  };

  const applyTransform = (scale: number, x: number, y: number): void => {
    svg
      .transition()
      .duration(duration)
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
  };

  /** Fits the drawn window; scale is clamped to `[minScale, maxScale]`, centring on `focus` when it overflows. */
  const fitBox = (minScale: number, maxScale: number, focus?: TreeDatum): void => {
    const pad = 28;
    const boxWidth = Math.max(layoutBox.right - layoutBox.left, 1);
    const boxHeight = Math.max(layoutBox.bottom - layoutBox.top, 1);
    const fit = Math.min((bounds.width - pad * 2) / boxWidth, (bounds.height - pad * 2) / boxHeight);
    const scale = Math.min(maxScale, Math.max(minScale, fit));
    const x = boxWidth * scale <= bounds.width - pad * 2
      ? (bounds.width - boxWidth * scale) / 2 - layoutBox.left * scale
      : bounds.width / 2 - (focus?.y ?? layoutBox.left) * scale;
    const y = boxHeight * scale <= bounds.height - pad * 2
      ? (bounds.height - boxHeight * scale) / 2 - layoutBox.top * scale
      : bounds.height / 2 - (focus?.x ?? 0) * scale;
    applyTransform(scale, x, y);
  };

  /** Frames the open window at a readable scale after a change, keeping `target` in view. */
  const frame = (target: TreeDatum): void => {
    fitBox(readableScale.min, readableScale.max, target);
    options.onNodeCentered?.(target.data);
  };

  const fitView = (): void => fitBox(0.3, readableScale.max);

  const cancelPendingAutoFit = (): void => {
    if (pendingAutoFitFrame === null) return;
    cancelAnimationFrame(pendingAutoFitFrame);
    pendingAutoFitFrame = null;
    options.onAutoFitCanceled?.();
  };

  const scheduleAutoFit = (): void => {
    cancelPendingAutoFit();
    pendingAutoFitFrame = requestAnimationFrame(() => {
      pendingAutoFitFrame = null;
      fitView();
    });
    options.onAutoFitScheduled?.();
  };

  /** Opens every group above `target` (one branch per level) and pages a hidden variable into view. */
  const openPathTo = (target: TreeDatum): void => {
    target.ancestors().reverse().forEach((ancestor) => {
      if (ancestor !== target) open(ancestor as TreeDatum);
    });
    const parent = target.parent as TreeDatum | null;
    if (isVariable(target) && parent?._all) {
      // The variable's own column ends the path, so nothing deeper may stay open.
      parent._all.forEach(close);
      const index = parent._all.filter(isVariable).indexOf(target);
      parent._limit = Math.max(parent._limit ?? VARIABLE_PAGE_SIZE, index + 1);
    }
    if (!isVariable(target)) {
      target._all?.forEach(close);
      open(target);
    }
  };

  const expandToNode = (node: D3HierarchyNode): void => {
    cancelPendingAutoFit();
    const target = findHierarchyNode(root, node);
    if (!target) return;
    openPathTo(target);
    highlightedCode = codeOf(node);
    highlightedPath = hierarchyPath(target);
    update(target);
    frame(target);
  };

  const focusDatum = (target: TreeDatum): void => {
    cancelPendingAutoFit();
    openPathTo(target);
    markHighlighted(target);
    update(target);
    options.onNodeClick(target.data);
    frame(target);
  };

  const focusNode = (node: D3HierarchyNode): void => {
    const target = findHierarchyNode(root, node);
    if (target) focusDatum(target);
  };

  const collapseAll = (): void => {
    cancelPendingAutoFit();
    root._all?.forEach(close);
    open(root);
    update(root);
    fitView();
  };

  const zoomBy = (factor: number): void => {
    svg.transition().duration(duration).call(zoom.scaleBy, factor);
  };

  const refreshSelection = (selectionOptions?: CollapsibleTreeSelectionOptions): void => {
    selectedVariables = toCodeSet(selectionOptions?.selectedVariables);
    const highlight = selectionOptions?.highlightNode ?? null;
    highlightedCode = codeOf(highlight);
    // Resolved in the tree, so a group without a code still highlights.
    const target = highlight ? findHierarchyNode(root, highlight) : null;
    highlightedPath = target ? hierarchyPath(target) : pathOf(highlight);
    refreshNodeClasses();
  };

  const setUnavailableVariables = (unavailable: UnavailableVariablesMap | null | undefined): void => {
    unavailableVariables = unavailable ?? EMPTY_UNAVAILABLE_VARIABLES;
    refreshNodeClasses();
  };

  const resize = (): void => {
    const before = maxColumns();
    bounds = measureContainer(container);
    svg
      .attr('width', bounds.width)
      .attr('height', bounds.height)
      .attr('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    // A wider or narrower canvas fits a different number of levels.
    if (maxColumns() !== before) update(openPath().at(-1) ?? root);
    fitView();
  };

  open(root);
  update(root);
  if (options.highlightNode && findHierarchyNode(root, options.highlightNode)) {
    expandToNode(options.highlightNode);
  } else {
    scheduleAutoFit();
  }

  return {
    expandToNode,
    focusNode,
    refreshSelection,
    setUnavailableVariables,
    fitView,
    zoomBy,
    collapseAll,
    resize,
    destroy: () => {
      cancelPendingAutoFit();
      tooltip.remove();
      svg.on('.zoom', null).on('wheel.pan', null);
      container.innerHTML = '';
    },
  };

  function nodeClass(node: TreeDatum): string {
    const classes = ['collapsible-node'];
    if (isMore(node)) {
      classes.push('more-node');
      return classes.join(' ');
    }
    classes.push(isVariable(node) ? 'variable-node' : 'group-node');
    if (node.children) classes.push('expanded');
    if (!node.children && node._children) classes.push('collapsed');
    if (onPath.has(node)) classes.push('on-path');
    const code = codeOf(node.data);
    const nodePath = hierarchyPath(node);
    if (highlightedPath && nodePath === highlightedPath) {
      classes.push('highlighted');
    } else if (!highlightedPath && code && code === highlightedCode) {
      classes.push('highlighted');
    }
    if (code && selectedVariables.has(code)) classes.push('selected-variable');
    if (isUnavailable(node)) classes.push('unavailable-variable');
    return classes.join(' ');
  }

  function linkClass(link: d3.HierarchyPointLink<RenderNode>): string {
    return onPath.has(link.target as TreeDatum) ? 'tree-link on-path' : 'tree-link';
  }
}

export function cloneNode(node: D3HierarchyNode): RenderNode {
  return {
    ...node,
    children: node.children?.map((child) => cloneNode(child)),
  };
}

/** Records every node's children and closes every group below the root. */
export function initializeCollapse(root: TreeDatum): void {
  root.descendants().forEach((node) => {
    const treeNode = node as TreeDatum;
    treeNode._all = treeNode.children as TreeDatum[] | undefined;
    if (treeNode.depth > 0 && treeNode.children) {
      treeNode._children = treeNode._all;
      treeNode.children = undefined;
    }
  });
}

export function findHierarchyNode(root: TreeDatum, target: D3HierarchyNode): TreeDatum | null {
  const nodes = collectTreeNodes(root);
  const byReference = nodes.find((node) => node.data === target);
  if (byReference) {
    return byReference;
  }

  const targetPath = pathOf(target);
  if (targetPath) {
    const byPath = findHierarchyNodeByPath(root, targetPath);
    if (byPath) {
      return byPath;
    }
  }

  const targetCode = codeOf(target);
  const targetLabel = normalizeString(target.label);
  const matches = nodes.filter((node) => {
    const nodeCode = codeOf(node.data);
    if (targetCode && nodeCode === targetCode) return true;
    return !!targetLabel && normalizeString(node.data.label) === targetLabel;
  });

  return matches.length === 1 ? matches[0] : null;
}

export function findHierarchyNodeByPath(root: TreeDatum, path: string): TreeDatum | null {
  const segments = path
    .split('>')
    .map((segment) => normalizeString(segment))
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }

  if (normalizeString(root.data.label) !== segments[0]) {
    return null;
  }

  let current: TreeDatum = root;
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    const next = childrenOf(current).find((child) => normalizeString(child.data.label) === segment);
    if (!next) {
      return null;
    }
    current = next;
  }

  return current;
}

/** Groups before variables, each in source order, so a paged group keeps its subgroups on top. */
function groupsFirst(node: RenderNode): RenderNode[] | undefined {
  const children = node.children;
  if (!children?.length) return undefined;
  const isGroupData = (child: RenderNode): boolean => !!child.children?.length || !child.type;
  return [...children.filter(isGroupData), ...children.filter((child) => !isGroupData(child))];
}

function moreRow(parent: TreeDatum, hidden: number): TreeDatum {
  const more = parent._more ?? (d3.hierarchy<RenderNode>({ label: '', moreRow: true }) as TreeDatum);
  more.parent = parent;
  (more as { depth: number }).depth = parent.depth + 1;
  more.data.label = `${hidden} more ${hidden === 1 ? 'variable' : 'variables'}`;
  parent._more = more;
  return more;
}

function hierarchyPath(node: TreeDatum): string {
  return node
    .ancestors()
    .reverse()
    .map((ancestor) => normalizeString(ancestor.data.label))
    .filter(Boolean)
    .join(' > ');
}

function pathOf(node: D3HierarchyNode | null | undefined): string {
  return normalizeString((node as D3HierarchyNode & { path?: string } | null | undefined)?.path);
}

function childrenOf(node: TreeDatum): TreeDatum[] {
  return node._all ?? ([...(node.children ?? []), ...(node._children ?? [])] as TreeDatum[]).filter((child) => !isMore(child));
}

function collectTreeNodes(root: TreeDatum): TreeDatum[] {
  const nodes: TreeDatum[] = [];
  const visit = (node: TreeDatum): void => {
    nodes.push(node);
    childrenOf(node).forEach(visit);
  };
  visit(root);
  return nodes;
}

/** Whether `node` sits in the subtree of `ancestor` (or is it). */
function isWithin(node: TreeDatum, ancestor: TreeDatum): boolean {
  for (let current: TreeDatum | null = node; current; current = current.parent as TreeDatum | null) {
    if (current === ancestor) return true;
  }
  return false;
}

function diagonal(link: d3.HierarchyPointLink<RenderNode>): string {
  const source = link.source as TreeDatum;
  const target = link.target as TreeDatum;
  const startY = source.y + (source === target ? 0 : nodeWidth / 2);
  const endY = target.y - (source === target ? 0 : nodeWidth / 2);
  const midY = (startY + endY) / 2;
  return `M${startY},${source.x}C${midY},${source.x} ${midY},${target.x} ${endY},${target.x}`;
}

function isMore(node: TreeDatum): boolean {
  return !!node.data.moreRow;
}

function isVariable(node: TreeDatum): boolean {
  return !isMore(node) && !childrenOf(node).length && !!node.data.type;
}

function isGroup(node: TreeDatum): boolean {
  return !isMore(node) && childrenOf(node).length > 0;
}

function nodeLabel(node: TreeDatum): string {
  if (isMore(node)) return `+ ${node.data.label}`;
  return normalizeString(node.data.label) || 'Untitled';
}

function nodeMeta(node: TreeDatum): string {
  if (isMore(node)) {
    const hidden = Number.parseInt(node.data.label, 10) || 0;
    return `Show the next ${Math.min(hidden, VARIABLE_PAGE_STEP)}`;
  }
  if (isVariable(node)) {
    const type = normalizeString(node.data.type);
    return type || 'Variable';
  }
  const groupCount = childrenOf(node).filter((child) => !isVariable(child)).length;
  const variableCount = countVariables(node);
  const variables = pluralize(variableCount, 'variable');
  return groupCount ? `${pluralize(groupCount, 'group')} · ${variables}` : variables;
}

function countVariables(node: TreeDatum): number {
  const children = childrenOf(node);
  if (!children.length) return isVariable(node) ? 1 : 0;
  return children.reduce((sum, child) => sum + countVariables(child), 0);
}

function chevron(node: TreeDatum): string {
  if (!isGroup(node)) return '';
  return node.children ? '−' : '+';
}

/** Keyed by path, so equal labels in different branches stay separate nodes. */
function stableKey(node: TreeDatum): string {
  if (isMore(node)) return `more:${hierarchyPath(node.parent as TreeDatum)}`;
  return `${hierarchyPath(node)}:${normalizeString(node.data.code)}:${normalizeString(node.data.type)}`;
}

function ariaLabel(node: TreeDatum): string {
  if (isMore(node)) return `Show ${node.data.label}`;
  return `${isVariable(node) ? 'Variable' : 'Group'} ${node.data.label ?? ''}`;
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Trims `text` with an ellipsis to fit `maxWidth` pixels at the label font. */
function fitLabel(text: string, maxWidth: number, font = '700 11.5px'): string {
  if (measureContext === undefined) {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  if (!measureContext) {
    return text.length > 30 ? `${text.slice(0, 29)}…` : text;
  }
  measureContext.font = `${font} Inter, system-ui, sans-serif`;
  if (measureContext.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measureContext.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

function showTooltip(event: MouseEvent, node: TreeDatum, unavailableIn: readonly string[] = []): void {
  if (isMore(node)) return;
  const label = normalizeString(node.data.label) || 'Untitled';
  const type = normalizeString(node.data.type);
  const description = normalizeString(node.data.description);
  const tooltip = d3.select('.collapsible-tree-tooltip');

  const appendRow = (name: string, value: string): void => {
    const row = tooltip.append('span');
    row.append('b').text(name);
    row.append('span').text(' ' + value);
  };

  tooltip.selectAll('*').remove();
  tooltip.append('strong').text(label);
  if (type) appendRow('Type:', type);
  if (description) appendRow('Description:', description);
  if (!isVariable(node)) appendRow('Contains:', nodeMeta(node));
  if (unavailableIn.length) tooltip.append('span').text(unavailableVariableTooltip(unavailableIn));
  tooltip
    .style('left', `${event.clientX + 12}px`)
    .style('top', `${event.clientY + 12}px`)
    .transition()
    .duration(120)
    .style('opacity', 1);
}

function moveTooltip(event: MouseEvent): void {
  d3.select('.collapsible-tree-tooltip')
    .style('left', `${event.clientX + 12}px`)
    .style('top', `${event.clientY + 12}px`);
}

function hideTooltip(): void {
  d3.select('.collapsible-tree-tooltip')
    .transition()
    .duration(120)
    .style('opacity', 0);
}

function measureContainer(container: HTMLElement): { width: number; height: number } {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(320, Math.floor(rect.width || 0)),
    height: Math.max(360, Math.floor(rect.height || 0)),
  };
}

function toCodeSet(nodes: D3HierarchyNode[] | null | undefined): Set<string> {
  return new Set((nodes ?? []).map((node) => codeOf(node)).filter((code): code is string => !!code));
}

function codeOf(node: D3HierarchyNode | null | undefined): string {
  return normalizeString(node?.code);
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}
