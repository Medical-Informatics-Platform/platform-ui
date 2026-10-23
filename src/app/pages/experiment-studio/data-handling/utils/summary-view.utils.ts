import { SummaryView } from '../data-handling.models';

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
    histogramSubscriptionsByVariable: {},
    histogramRequestIdByVariable: {},
    histogramSplitByVariable: {},
    activeBoxPlotIndex: 0,
    activeNominalIndex: 0,
    selectedStatisticKey: null,
  };
}
