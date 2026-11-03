import { UnavailableVariablesMap, unavailableTooltipFor } from '../../../../core/variable-availability.utils';
import { isCategoricalVariableType } from '../../../../core/data-model.utils';

/** Grouping CDE present in every data model. Always offered as a histogram split. */
export const DATASET_VARIABLE_CODE = 'dataset';

/** Stacked splits with more levels than this are offered but disabled. */
export const MAX_HISTOGRAM_SPLIT_LEVELS = 8;

export const HISTOGRAM_SPLIT_NONE = '';

export const HISTOGRAM_RESIDUAL_KEY = '__residual__';

export const HISTOGRAM_RESIDUAL_LABEL = 'Not shown (missing or < privacy threshold)';

/** Short legend text; {@link HISTOGRAM_RESIDUAL_LABEL} stays on the title/tooltip. */
export const HISTOGRAM_RESIDUAL_LEGEND_LABEL = 'Not shown';

export const HISTOGRAM_EDGE_PRIVACY_TOOLTIP =
  'Fewer than the privacy threshold (hidden for privacy)';

export const HISTOGRAM_INTERIOR_PRIVACY_TOOLTIP =
  '0 or fewer than the privacy threshold';

export const HISTOGRAM_PRIVACY_STUB_HEIGHT = 7;

/** DESIGN.md series order, then darker MIP inks so later groups stay visible on white. */
export const HISTOGRAM_SERIES_COLORS = [
  '#2b33e9',
  '#7f9ce8',
  '#ffba08',
  '#dfefe4',
  '#1b21a3',
  '#065f46',
  '#92400e',
  '#0f172a',
] as const;

export const HISTOGRAM_RESIDUAL_COLOR = '#cbd5e1';

/** Darker yellow for the exposed edge of `#ffba08` segments (DESIGN.md contrast). */
export const HISTOGRAM_YELLOW_EDGE = '#d99a00';

/** Slate at ~40% — mint and residual swatches, never a full bar box. */
export const HISTOGRAM_SOFT_EDGE = 'rgba(71, 85, 105, 0.4)';

export interface HistogramGroupSeries {
  key: string;
  label: string;
  counts: Array<number | null>;
}

export interface HistogramChartData {
  bins: string[];
  counts: Array<number | null>;
  variable?: string;
  variableName?: string;
  description?: string;
  variableType?: string;
  groups?: HistogramGroupSeries[];
  /** Split-variable label for the stacked legend title (`Dataset`, `Sex`, …). */
  splitLabel?: string;
}

export interface HistogramSplitOption {
  code: string;
  label: string;
  disabled: boolean;
  title: string;
  /** Missing from a selected dataset: offered grayed out, disabled, with the datasets in the title. */
  unavailable?: boolean;
}

/** A selected variable as the studio holds it; only nominal ones become splits. */
export interface HistogramSplitVariable {
  code?: string | null;
  label?: string | null;
  name?: string | null;
  type?: string | null;
  enumerations?: unknown[] | null;
}

export interface RawHistogramItem {
  var?: string;
  variable?: string;
  grouping_var?: string | null;
  grouping_enum?: string | null;
  bins?: unknown;
  counts?: unknown;
}

export function histogramCacheKey(variableCode: string, splitCode: string): string {
  return splitCode ? `${variableCode}::${splitCode}` : variableCode;
}

export function isNominalHistogramNode(
  node: {
    type?: string | null;
    enumerations?: unknown[] | null;
  } | null | undefined
): boolean {
  if (!node) return false;
  if (isCategoricalVariableType(node.type)) return true;
  return Array.isArray(node.enumerations) && node.enumerations.length > 0;
}

export function buildHistogramSplitOptions(input: {
  plottedCode: string | null | undefined;
  selectedVariables: HistogramSplitVariable[];
  datasetLevelCount: number;
  unavailableVariables?: UnavailableVariablesMap;
}): HistogramSplitOption[] {
  const plotted = String(input.plottedCode ?? '');
  const tooMany = (count: number, kind: 'datasets' | 'categories'): string =>
    `Too many ${kind} (${count}). Split is limited to ${MAX_HISTOGRAM_SPLIT_LEVELS} categories.`;

  const datasetDisabled = input.datasetLevelCount > MAX_HISTOGRAM_SPLIT_LEVELS;
  const options: HistogramSplitOption[] = [
    {
      code: DATASET_VARIABLE_CODE,
      label: 'Dataset',
      disabled: datasetDisabled,
      title: datasetDisabled
        ? tooMany(input.datasetLevelCount, 'datasets')
        : 'Split bars by dataset',
    },
  ];

  for (const variable of input.selectedVariables) {
    const code = String(variable.code ?? '').trim();
    if (!code || code.toLowerCase() === DATASET_VARIABLE_CODE || code === plotted) continue;
    // Split levels come from enumerations; free-text categoricals have none and Exaflow rejects them.
    if (!isNominalHistogramNode(variable) || !variable.enumerations?.length) continue;
    const label = String(variable.label ?? variable.name ?? variable.code);
    const levelCount = variable.enumerations?.length ?? 0;
    const unavailableTitle = unavailableTooltipFor(input.unavailableVariables, { code });
    if (unavailableTitle) {
      options.push({ code, label, disabled: true, title: unavailableTitle, unavailable: true });
      continue;
    }
    const disabled = levelCount > MAX_HISTOGRAM_SPLIT_LEVELS;
    options.push({
      code,
      label,
      disabled,
      title: disabled ? tooMany(levelCount, 'categories') : `Split bars by ${label}`,
    });
  }

  return options;
}

export function histogramSeriesColor(index: number): string {
  return HISTOGRAM_SERIES_COLORS[index % HISTOGRAM_SERIES_COLORS.length];
}

export function histogramSeriesEdgeColor(color: string): string | null {
  if (color === '#ffba08') return HISTOGRAM_YELLOW_EDGE;
  if (color === '#dfefe4') return HISTOGRAM_SOFT_EDGE;
  return null;
}

export function toNumericCounts(counts: unknown): Array<number | null> {
  if (!Array.isArray(counts)) return [];
  return counts.map((count) => {
    if (count === null || count === undefined) return null;
    const value = typeof count === 'number' ? count : Number(count);
    return Number.isFinite(value) ? value : null;
  });
}

export function extractHistogramItems(response: unknown): RawHistogramItem[] {
  const payload = (response as { result?: unknown } | null)?.result ?? response;
  const fromPayload = (payload as { histogram?: unknown } | null)?.histogram;
  const fromResponse = (response as { histogram?: unknown } | null)?.histogram;
  const histList = Array.isArray(fromPayload)
    ? fromPayload
    : Array.isArray(fromResponse)
      ? fromResponse
      : [];
  return histList as RawHistogramItem[];
}

export function histogramItemMatchesVariable(item: RawHistogramItem | undefined, code: string): boolean {
  if (!item) return false;
  const entryCode = String(item.var ?? item.variable ?? '');
  return entryCode.toLowerCase() === code.toLowerCase();
}

export function selectOverallHistogramItem(
  items: RawHistogramItem[],
  code: string
): RawHistogramItem | undefined {
  // Never fall back to a grouped entry: one group's counts are not the bin totals.
  const ungrouped = items.filter((entry) => !entry?.grouping_var);
  return ungrouped.find((entry) => histogramItemMatchesVariable(entry, code)) ?? ungrouped[0];
}

export function buildStackedHistogramSeries(
  items: RawHistogramItem[],
  yCode: string,
  groupingCode: string | null,
  labelFor: (groupingVar: string, groupingEnum: string) => string,
  /** Selected dataset codes; a `dataset` split keeps only these groups. */
  selectedDatasets?: Iterable<string> | null
): { bins: unknown[]; counts: Array<number | null>; groups?: HistogramGroupSeries[] } | null {
  const overall = selectOverallHistogramItem(items, yCode);
  const bins = overall?.bins;
  const counts = toNumericCounts(overall?.counts);
  if (!overall || !Array.isArray(bins) || !bins.length || !counts.length) {
    return null;
  }

  if (!groupingCode) {
    return { bins, counts };
  }

  const grouped = items.filter((entry) => {
    if (!histogramItemMatchesVariable(entry, yCode)) return false;
    return String(entry.grouping_var ?? '').toLowerCase() === groupingCode.toLowerCase();
  });

  const groups: HistogramGroupSeries[] = [];
  for (const entry of grouped) {
    const enumCode = entry.grouping_enum;
    if (enumCode === null || enumCode === undefined || enumCode === '') continue;
    const key = String(enumCode);
    groups.push({
      key,
      label: labelFor(groupingCode, key),
      counts: alignGroupCounts(toNumericCounts(entry.counts), counts.length),
    });
  }

  return {
    bins,
    counts,
    groups: filterVisibleHistogramGroups(
      groups,
      groupingCode.toLowerCase() === DATASET_VARIABLE_CODE ? selectedDatasets : null
    ) ?? [],
  };
}

/** Drop groups with no visible counts, and optionally keep only allowed keys. */
export function filterVisibleHistogramGroups(
  groups: HistogramGroupSeries[] | undefined,
  allowedKeys?: Iterable<string> | null
): HistogramGroupSeries[] | undefined {
  if (!groups?.length) return undefined;
  const allowed = allowedKeys
    ? new Set([...allowedKeys].map((key) => String(key).toLowerCase()))
    : null;
  const visible = groups.filter((group) => {
    if (allowed && !allowed.has(group.key.toLowerCase())) return false;
    return group.counts.some((count) => count !== null);
  });
  return visible.length ? visible : undefined;
}

/** Bin `index`'s total minus what the groups show there. */
export function residualCount(total: number | null, groups: HistogramGroupSeries[], index: number): number {
  if (total === null) return 0;
  const shown = groups.reduce((sum, group) => sum + (group.counts[index] ?? 0), 0);
  return Math.max(0, total - shown);
}

function alignGroupCounts(counts: Array<number | null>, length: number): Array<number | null> {
  return Array.from({ length }, (_, index) => counts[index] ?? null);
}
