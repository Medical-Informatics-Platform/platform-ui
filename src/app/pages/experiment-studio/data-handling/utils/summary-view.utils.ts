import { PivotBlock, SummaryView, VariableRow } from '../data-handling.models';

/** A summary surface with nothing loaded yet: the Table view, no variables, no per-variable caches. */
export function emptySummaryView(isLoading: boolean): SummaryView {
  return {
    activeTab: 'Statistics',
    data: [],
    featurewiseRows: [],
    isLoading,
    showDistributions: false,
    distributionSubTab: 'Numeric',
    nonNominalVariables: [],
    nominalVariables: [],
    chartsForBoxPlot: [],
    chartsForNominal: [],
    histogramDataByVariable: {},
    histogramLoadingByVariable: {},
    histogramErrorByVariable: {},
    histogramSettledByVariable: {},
    histogramRequestIdByVariable: {},
    histogramSplitByVariable: {},
    activeBoxPlotIndex: 0,
    activeNominalIndex: 0,
    selectedStatisticKey: null,
  };
}

/** Selection identity of a pivot block (its variable code, else its name). */
export function statisticBlockKey(block: PivotBlock): string {
  return block.code ?? block.name;
}

/** Keeps the selected variable when it is still in `data`, else selects the first one. */
export function nextStatisticSelection(data: readonly PivotBlock[], currentKey: string | null): string | null {
  if (!data.length) return null;
  if (currentKey && data.some((block) => statisticBlockKey(block) === currentKey)) return currentKey;
  return statisticBlockKey(data[0]);
}

/**
 * Cache key of a summary for one selection: variable and filter codes (order-free), the
 * filter rules and, for the surfaces that depend on it, the applied preprocessing.
 */
export function selectionKey(
  variables: readonly VariableRow[],
  filters: readonly VariableRow[],
  filterLogic: unknown,
  appliedPreprocessing?: unknown,
): string {
  return JSON.stringify({
    variables: variables.map((variable) => variable.code).sort(),
    filters: filters.map((variable) => variable.code).sort(),
    filterLogic,
    appliedPreprocessing,
  });
}
