import { Injectable, inject } from '@angular/core';
import { getFeaturewiseDescribeRows } from '../../../core/describe-result.utils';
import { BackendFilter } from '../../../models/filters.model';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { buildGroupedBarChart } from '../visualisations/charts/renderers/grouped-bar-chart';
import { VariableStats } from '../../../models/algorithm-results.model';
import { SummaryKind, SummaryView, VariableRow } from './data-handling.models';
import { categoryCounts, enumLabelMap, pivotByDataset, variableLabel } from './utils/statistic-summary.utils';
import { emptySummaryView, nextStatisticSelection, selectionKey } from './utils/summary-view.utils';

type DistributionState = Pick<
  SummaryView,
  | 'showDistributions'
  | 'distributionSubTab'
  | 'nonNominalVariables'
  | 'nominalVariables'
  | 'chartsForBoxPlot'
  | 'chartsForNominal'
  | 'activeBoxPlotIndex'
  | 'activeNominalIndex'
>;

/**
 * The three summary surfaces of Data Handling (the Source snapshot, the Raw preview of
 * the filtered cohort and the Processed preview), the cache key each was loaded for,
 * and turning a describe response into a SummaryView. Provided by the Data Handling
 * panel; the panel keeps the requests, histograms and exports.
 */
@Injectable()
export class StatisticSummaryService {
  private readonly studio = inject(ExperimentStudioService);
  private readonly chartBuilder = inject(ChartBuilderService);

  source = emptySummaryView(true);
  raw = emptySummaryView(true);
  processed = emptySummaryView(false);

  /** The selection each surface's current data was loaded for ('' = none yet). */
  readonly loadedKey: Record<SummaryKind, string> = { source: '', raw: '', processed: '' };

  get(kind: SummaryKind): SummaryView {
    if (kind === 'raw') return this.raw;
    if (kind === 'source') return this.source;
    return this.processed;
  }

  /**
   * Cache key of the Raw summary for one cohort. The stored `filterLogic()` is the
   * default; a pending preview keys on the rules it is showing instead, so the two
   * states cannot reuse each other's response.
   */
  rawKeyFor(filterOverride?: BackendFilter | null): string {
    const effectiveFilter = filterOverride === undefined ? this.studio.filterLogic() : filterOverride;
    return selectionKey(this.studio.selectedVariables(), this.studio.selectedFilters(), effectiveFilter);
  }

  /**
   * A describe response as the next state of a surface: pivoted per dataset ("all
   * datasets" last) for `variables`, with the distribution charts rebuilt, the view and
   * selection carried over from `current`, and the per-variable histogram caches reset.
   */
  fromDescribeResponse(response: unknown, current: SummaryView, variables: VariableRow[]): SummaryView {
    const featurewise = getFeaturewiseDescribeRows(response);
    const datasetOrder = Array.from(new Set(featurewise.map((item) => String(item.dataset))))
      .filter((dataset) => dataset && dataset !== 'all datasets')
      .concat('all datasets');
    const data = pivotByDataset(featurewise, variables, datasetOrder);
    return {
      ...current,
      data,
      featurewiseRows: featurewise,
      isLoading: false,
      activeTab: current.activeTab,
      selectedStatisticKey: nextStatisticSelection(data, current.selectedStatisticKey),
      histogramDataByVariable: {},
      histogramLoadingByVariable: {},
      histogramErrorByVariable: {},
      histogramSubscriptionsByVariable: {},
      histogramRequestIdByVariable: {},
      ...this.distributionState(featurewise, response),
    };
  }

  /** Box plots for the numerical variables and grouped bars for the categorical ones. */
  private distributionState(featurewise: VariableStats[], response: unknown): DistributionState {
    const selectedVars = this.studio.selectedVariables() as VariableRow[];
    const unique = Array.from(new Map(selectedVars.map((v) => [v.code, v])).values());

    const varsWithCounts = new Set<string>();
    for (const item of featurewise) {
      if (Object.keys(categoryCounts(item.data)).length > 0) {
        varsWithCounts.add(item.variable);
      }
    }

    const nominalVariables = unique.filter(
      (v) => v?.type === 'nominal' || varsWithCounts.has(v.code)
    );
    const nominalCodes = new Set(nominalVariables.map((v) => v.code));
    const nonNominalVariables = unique.filter(
      (v) => !nominalCodes.has(v.code) && v?.type !== 'text'
    );
    const showDistributions = nonNominalVariables.length > 0 || nominalVariables.length > 0;
    const distributionSubTab = nonNominalVariables.length > 0 ? 'Numeric' : 'Nominal';

    const datasetLabels = this.studio.getDatasetLabelMap();
    const chartsForBoxPlot = nonNominalVariables.map((v) => {
      const perVarResp = {
        ...(response as Record<string, unknown>),
        result: {
          ...((response as { result?: Record<string, unknown> })?.result ?? {}),
          featurewise: featurewise.filter(
            (row) => row.variable === v.code && row.dataset !== 'all datasets'
          ),
          dataset_labels: datasetLabels,
        },
      };
      return this.chartBuilder.getChartsForAlgorithm('describe', perVarResp);
    });

    const chartsForNominal = nominalVariables.map((v) => {
      const varData = featurewise.filter((row) => row.variable === v.code);
      const varLabel = variableLabel(v);
      const enumMap = enumLabelMap(v);
      return buildGroupedBarChart(varData, varLabel, enumMap);
    });

    return {
      showDistributions,
      distributionSubTab,
      nonNominalVariables,
      nominalVariables,
      chartsForBoxPlot,
      chartsForNominal,
      activeBoxPlotIndex: 0,
      activeNominalIndex: 0,
    };

  }
}
