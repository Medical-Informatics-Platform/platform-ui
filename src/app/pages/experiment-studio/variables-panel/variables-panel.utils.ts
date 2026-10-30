import { D3HierarchyNode } from '../../../models/data-model.interface';
import { countLeafNodes } from '../../../core/data-model.utils';
import { EnumerationLike, GroupCensusData, PathNode } from './variables-panel.models';

/** Depth-first search of the hierarchy for the node with this code. */
export function findNodeByCode(node: D3HierarchyNode | null | undefined, code: string): D3HierarchyNode | null {
  if (!node) return null;
  if (node.code === code) return node;
  for (const child of node.children ?? []) {
    const found = findNodeByCode(child, code);
    if (found) return found;
  }
  return null;
}

/** The variables under a node: the node itself when it is a variable. */
export function collectLeafNodes(node: D3HierarchyNode): D3HierarchyNode[] {
  if (!node.children?.length) return [node];
  return node.children.flatMap(collectLeafNodes);
}

/**
 * Breadcrumb from the root to `node`. Consecutive steps with the same label collapse
 * (the pathology root and its single group often share one). A node outside the tree
 * gets a one-step path of its own.
 */
export function pathToNode(root: D3HierarchyNode | null | undefined, node: D3HierarchyNode | null | undefined): PathNode[] {
  const code = node?.code;
  if (!code) {
    const fallbackLabel = String(node?.label ?? '');
    return fallbackLabel ? [{ code: String(code ?? ''), label: fallbackLabel }] : [];
  }
  const path: PathNode[] = [];
  if (!collectPath(root, code, path)) {
    return [{ code: String(code), label: String(node?.label ?? code) }];
  }
  return path.filter((step, index) => index === 0 || path[index - 1].label !== step.label);
}

function collectPath(current: D3HierarchyNode | null | undefined, code: string, path: PathNode[]): boolean {
  if (!current) return false;
  const label = nodeLabel(current);
  if (label) {
    path.push({ code: String(current.code ?? ''), label });
  }
  if (current.code === code) return true;
  for (const child of current.children ?? []) {
    if (collectPath(child, code, path)) return true;
  }
  if (label) path.pop();
  return false;
}

function nodeLabel(node: D3HierarchyNode): string {
  return String(node.label ?? node.code ?? '');
}

/**
 * What a selected group charts. A group of groups censuses its child groups; a group
 * that holds only variables has nothing to census (every bar would be one variable).
 */
export function describeGroup(group: D3HierarchyNode): { hasGroups: boolean; items: D3HierarchyNode[] } {
  const children = Array.isArray(group.children) ? group.children : [];
  const hasGroups = children.some((child) => child?.children?.length);
  return {
    hasGroups,
    items: hasGroups ? children.filter((child) => child?.children?.length) : children,
  };
}

/** The group census chart: child groups by variable count, largest first. */
export function buildGroupCensus(group: D3HierarchyNode, childGroups: D3HierarchyNode[]): GroupCensusData {
  const rows = childGroups
    .map((child) => ({ bin: nodeLabel(child), count: countLeafNodes(child) }))
    .sort((a, b) => b.count - a.count);
  return {
    bins: rows.map((row) => row.bin),
    counts: rows.map((row) => row.count),
    variableName: String(group.label ?? 'Groups'),
  };
}

/** The label of one enumeration value, or null when the variable does not enumerate it. */
export function enumerationLabel(value: unknown, enumerations?: readonly EnumerationLike[] | null): string | null {
  if (value === null || value === undefined || !enumerations?.length) return null;
  const match = enumerations.find((entry) => String(entry?.code ?? entry?.label ?? entry?.name ?? '') === String(value));
  if (!match) return null;
  return String(match.label ?? match.name ?? value);
}

/** Histogram bin codes as labels: enumeration labels where one matches, the code otherwise. */
export function labelHistogramBins(bins: readonly unknown[], enumerations?: readonly EnumerationLike[] | null): string[] {
  return bins.map((bin) => enumerationLabel(bin, enumerations) || String(bin));
}

/** True when the histogram response says the variable has too few records to chart. */
export function isInsufficientDataResponse(response: unknown): boolean {
  const body = response as { result?: { data?: unknown }; data?: unknown } | null | undefined;
  const resultData = body?.result?.data || body?.data;
  return typeof resultData === 'string' && resultData.includes('insufficient data');
}

/** Tooltip of the study-context chip: pathology plus how many datasets feed it. */
export function studyContextTitle(pathologyLabel: string | null | undefined, datasetCount: number): string {
  if (!pathologyLabel) return 'Select a pathology';
  if (datasetCount > 0) {
    return `${pathologyLabel} · ${datasetCount} dataset${datasetCount === 1 ? '' : 's'}`;
  }
  return `${pathologyLabel} · Select datasets`;
}
