import { PreprocessingConfig } from '../../../../services/experiment-studio.service';
import { VariableStats } from '../../../../models/algorithm-results.model';
import { buildStackedHistogramSeries, extractHistogramItems } from '../../visualisations/histogram/histogram-data';
import { HistogramPreviewData, SummaryKind } from '../data-handling.models';
import { categoryCounts } from './statistic-summary.utils';

/** The plotted variable as a histogram preview describes it. */
export interface HistogramPreviewVariable {
  /** The summary block's name, shown as the chart's variable name. */
  name: string;
  type: string;
  enumerations?: Array<{ code?: unknown; label?: string; name?: string }>;
}

/** Bin codes as enumeration labels, when at least one bin matches an enumeration; otherwise unchanged. */
export function mapBinsToEnumLabels(
  bins: unknown[],
  enumerations?: Array<{ code?: unknown; label?: string; name?: string }>
): unknown[] {
  if (!Array.isArray(bins) || !enumerations?.length) return bins;

  const codeToLabel = new Map(
    enumerations.map((entry) => [
      String(entry?.code ?? entry?.label ?? entry?.name ?? ''),
      entry?.label ?? entry?.name ?? String(entry?.code ?? ''),
    ])
  );
  let mapped = 0;
  const mappedBins = bins.map((bin) => {
    const label = codeToLabel.get(String(bin));
    if (label === undefined) return bin;
    mapped += 1;
    return label;
  });
  return mapped > 0 ? mappedBins : bins;
}

/** Add `drop` for `code` unless the config already carries a strategy for it. */
export function withDefaultDropFor(preprocessing: PreprocessingConfig | null, code: string): PreprocessingConfig {
  const config: PreprocessingConfig = { ...(preprocessing ?? {}) };
  const handler = { ...((config['missing_values_handler'] as Record<string, unknown>) ?? {}) };
  const strategies = { ...((handler['strategies'] as Record<string, unknown>) ?? {}) };
  if (strategies[code]) return config;
  strategies[code] = 'drop';
  handler['strategies'] = strategies;
  config['missing_values_handler'] = handler;
  return config;
}

/**
 * A nominal variable's histogram straight from the category counts a describe already
 * returned (all datasets when present), so no histogram request is needed. Null when
 * there are no positive counts.
 */
export function histogramFromDescribeCounts(
  featurewiseRows: readonly VariableStats[],
  code: string,
  variable: HistogramPreviewVariable
): HistogramPreviewData | null {
  const row = featurewiseRows.find((item) => item?.variable === code && String(item?.dataset ?? '') === 'all datasets')
    ?? featurewiseRows.find((item) => item?.variable === code);
  const counts = categoryCounts(row?.data);
  const binCodes = Object.keys(counts);
  if (!binCodes.length) return null;

  const mappedCounts = binCodes.map((key) => {
    const value = counts[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  });
  if (!mappedCounts.some((count) => count !== null && count > 0)) return null;

  return {
    bins: mapBinsToEnumLabels(binCodes, variable.enumerations).map(String),
    counts: mappedCounts,
    variableName: variable.name,
    variableType: variable.type,
  };
}

/** The message a failed histogram response carries (a string payload, `data` or `message`), or null. */
export function histogramResponseError(response: unknown, payload: unknown): string | null {
  const candidates: unknown[] = [payload, response];
  if (response && typeof response === 'object' && 'result' in (response as object)) {
    candidates.push((response as { result?: unknown }).result);
  }
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    for (const key of ['data', 'message']) {
      const text = record[key];
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
  }
  return null;
}

interface ParseHistogramInput {
  response: unknown;
  code: string;
  variable: HistogramPreviewVariable;
  kind: SummaryKind;
  /** The variable the bars are split by, if any. */
  groupingCode: string | null;
  /** Legend label of one split group. */
  groupLabel: (groupingVar: string, groupingEnum: string) => string;
  /** Selected dataset codes; a dataset split keeps only these. */
  datasets: Iterable<string>;
  /** Label of the split variable in the legend. */
  splitLabel: (groupingCode: string) => string;
}

/** A histogram response as chart data, or the reason there is none. */
export function parseHistogramResponse(input: ParseHistogramInput): { data: HistogramPreviewData | null; error: string } {
  const { response, code, variable, kind, groupingCode } = input;
  if (!response) return { data: null, error: 'Failed to load histogram preview.' };

  const payload = (response as { result?: unknown })?.result ?? response;
  const stacked = buildStackedHistogramSeries(extractHistogramItems(response), code, groupingCode, input.groupLabel, input.datasets);
  if (!stacked) {
    const backendError = histogramResponseError(response, payload);
    if (backendError) return { data: null, error: backendError };
    return {
      data: null,
      error: kind === 'processed'
        ? 'No histogram data available for this variable after preprocessing. The federated histogram preview returned no bins—often because preprocessing removed too many rows or the execution engine reported an error.'
        : 'No histogram data available for this variable.',
    };
  }

  if (!stacked.counts.some((count) => count !== null && count > 0)) {
    return {
      data: null,
      error: 'Histogram counts are unavailable (privacy threshold or insufficient data after preprocessing).',
    };
  }

  return {
    data: {
      bins: mapBinsToEnumLabels(stacked.bins, variable.enumerations).map(String),
      counts: stacked.counts,
      groups: stacked.groups,
      variableName: variable.name,
      variableType: variable.type,
      splitLabel: groupingCode ? input.splitLabel(groupingCode) : undefined,
    },
    error: '',
  };
}
