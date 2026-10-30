import { resolveDatasetDisplayLabel } from '../../../../core/describe-result.utils';
import { PivotBlock, SummaryKind, SummaryView, VariableRow } from '../data-handling.models';

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

/** Heading and aria text, so one summary template reads correctly for all three kinds. */
export function summaryKindLabel(kind: SummaryKind): string {
  return kind === 'source' ? 'Source data' : kind === 'raw' ? 'Raw data' : 'Processed data';
}

/** A dataset code as the studio names it (the code itself when it has no label). */
export function datasetDisplayLabel(datasetCode: string, labels: Record<string, string>): string {
  if (!datasetCode) return datasetCode;
  return resolveDatasetDisplayLabel(String(datasetCode), labels);
}

/** The blocks with every dataset column renamed to its label, values carried over. */
export function labelDatasetColumns(blocks: readonly PivotBlock[], label: (datasetCode: string) => string): PivotBlock[] {
  return blocks.map((block) => {
    const labeledColumns = block.columns.map(label);
    return {
      ...block,
      columns: labeledColumns,
      rows: block.rows.map((row) => ({
        metric: row.metric,
        values: Object.fromEntries(block.columns.map((code, index) => [labeledColumns[index], row.values[code]])),
      })),
    };
  });
}

export const SUMMARY_CSV_COLUMNS = ['Variable', 'Metric', 'Dataset', 'Value'];

/** One CSV record per variable x metric x dataset, with the stored cell strings as they are. */
export function summaryCsvRows(blocks: readonly PivotBlock[], label: (datasetCode: string) => string): Array<Record<string, string>> {
  return blocks.flatMap((block) =>
    block.rows.flatMap((row) =>
      block.columns.map((dataset) => ({
        Variable: block.name,
        Metric: row.metric,
        Dataset: label(dataset),
        Value: row.values[dataset] ?? '',
      }))
    )
  );
}
