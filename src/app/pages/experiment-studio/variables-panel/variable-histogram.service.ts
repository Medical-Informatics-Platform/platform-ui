import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { D3HierarchyNode } from '../../../models/data-model.interface';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { AlgorithmNames } from '../../../core/constants/algorithm.constants';
import { describeClippedNullEdges, formatClippedNullEdgesNote } from '../visualisations/histogram/histogram-chart';
import {
  DATASET_VARIABLE_CODE,
  HISTOGRAM_SPLIT_NONE,
  HistogramChartData,
  HistogramSplitOption,
  buildHistogramSplitOptions,
  buildStackedHistogramSeries,
  extractHistogramItems,
  isNominalHistogramNode,
} from '../visualisations/histogram/histogram-data';
import { VariableCatalogService } from './variable-catalog.service';
import { GroupCensusData, GroupHistogramMeta } from './variables-panel.models';
import {
  buildGroupCensus,
  describeGroup,
  enumerationLabel,
  findNodeByCode,
  isInsufficientDataResponse,
  labelHistogramBins,
  pathToNode,
} from './variables-panel.utils';

/** Shown when the selected node groups variables only, so there is nothing to census. */
const GROUP_OF_VARIABLES_ONLY_MESSAGE =
  'Please select one of the variables in the representation on the left to see its histogram in the selected centers.';
const NO_DISTRIBUTION_MESSAGE = 'No distribution for this selection.';
const LOAD_ERROR_MESSAGE = 'Error loading histogram. Please try again.';

interface HistogramRequest {
  codes: string[];
  label?: string;
  grouping: string | null;
}

/**
 * The chart of the selected node: an Exaflow histogram for a variable (optionally
 * split by a nominal variable or the dataset), a census of child groups for a group.
 * Requests go through one switchMap, so only the latest selection's answer lands.
 */
@Injectable()
export class VariableHistogramService {
  private readonly studio = inject(ExperimentStudioService);
  private readonly catalog = inject(VariableCatalogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests$ = new Subject<HistogramRequest>();

  readonly histogramData = signal<HistogramChartData | null>(null);
  readonly groupHistogramData = signal<GroupCensusData | null>(null);
  readonly groupHistogramMeta = signal<GroupHistogramMeta | null>(null);
  readonly histogramSplit = signal(HISTOGRAM_SPLIT_NONE);
  /** The node the chart is for: the selected node, kept after a pathology reset clears the selection. */
  readonly plottedVariable = signal<D3HierarchyNode | null>(null);
  readonly isLoadingHistogram = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly emptyChartMessage = signal<string | null>(null);

  readonly histogramSplitOptions = computed((): HistogramSplitOption[] =>
    buildHistogramSplitOptions({
      plottedCode: this.plottedVariable()?.code,
      selectedVariables: this.studio.selectedVariables(),
      datasetLevelCount: this.studio.selectedDatasets().length,
      unavailableVariables: this.studio.unavailableVariables(),
    })
  );
  readonly canSplitHistogram = computed(() => {
    const node = this.plottedVariable();
    return !!node && !node.children?.length && !isNominalHistogramNode(node);
  });
  readonly histogramPrivacyTrimNote = computed(() => {
    const data = this.histogramData();
    if (!data?.bins?.length || isNominalHistogramNode(this.plottedVariable())) {
      return null;
    }
    return formatClippedNullEdgesNote(describeClippedNullEdges(data.bins, data.counts));
  });

  constructor() {
    this.requests$
      .pipe(
        switchMap((request) =>
          this.studio
            .getAlgorithmResults(
              AlgorithmNames.HISTOGRAM,
              request.codes,
              null,
              undefined,
              undefined,
              request.grouping ? [request.grouping] : undefined
            )
            .pipe(
              catchError((error) => {
                this.failLoading(error);
                return of(null);
              }),
              map((response) => ({ response, request }))
            )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ response, request }) => {
          this.isLoadingHistogram.set(false);
          if (!response) return;
          try {
            this.showResponse(response, request);
          } catch (error) {
            console.error('Error parsing histogram:', error);
            this.histogramData.set(null);
            this.errorMessage.set(LOAD_ERROR_MESSAGE);
          }
        },
        error: (error) => this.failLoading(error),
      });

    // A split whose option was removed from the pool or became disabled (too many
    // datasets) must not stay drawn under a select that no longer offers it.
    effect(() => {
      const split = this.histogramSplit();
      if (!split) return;
      const option = this.histogramSplitOptions().find((item) => item.code === split);
      // A split that became unavailable after a dataset change is kept: nothing chosen is auto-removed.
      if (option && (!option.disabled || option.unavailable)) return;
      untracked(() => this.applySplit(HISTOGRAM_SPLIT_NONE));
    });
  }

  /** Charts a newly selected node: a group census for a group, a histogram request for a variable. */
  show(node: D3HierarchyNode): void {
    this.clearChartNotices();
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.histogramSplit.set(HISTOGRAM_SPLIT_NONE);
    this.plottedVariable.set(node);
    this.groupHistogramMeta.set(null);

    if (node.children && node.children.length > 0) {
      const { hasGroups, items } = describeGroup(node);
      this.isLoadingHistogram.set(false);
      if (!items.length) {
        this.errorMessage.set('No groups found for this selection.');
        return;
      }
      this.groupHistogramMeta.set({
        pathNodes: pathToNode(this.catalog.hierarchy(), node),
        groupCount: items.length,
        hasGroups,
      });
      // A group that holds only variables has nothing to census: every bar would be a
      // single variable. Ask the user to pick a variable from the browser instead.
      if (!hasGroups) {
        this.emptyChartMessage.set(GROUP_OF_VARIABLES_ONLY_MESSAGE);
        return;
      }
      this.groupHistogramData.set(buildGroupCensus(node, items));
      return;
    }

    this.request([node.code ?? ''], node.label);
  }

  /** Nothing selected: no chart, and the chart area says so. */
  showNothingSelected(): void {
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.histogramSplit.set(HISTOGRAM_SPLIT_NONE);
    this.plottedVariable.set(null);
    this.groupHistogramMeta.set(null);
    this.isLoadingHistogram.set(false);
    this.errorMessage.set('No variable selected.');
  }

  /** Drops the charts of a pathology that is going away. */
  clearCharts(): void {
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.groupHistogramMeta.set(null);
  }

  /** The "Split by" select changed; a disabled or unknown choice falls back to no split. */
  selectSplit(split: string): void {
    const option = this.histogramSplitOptions().find((item) => item.code === split);
    this.applySplit(option && !option.disabled ? split : HISTOGRAM_SPLIT_NONE);
  }

  private applySplit(split: string): void {
    this.histogramSplit.set(split);
    const node = this.plottedVariable();
    if (!node?.code || node.children?.length) return;
    this.request([node.code], node.label, split || null);
  }

  private request(codes: string[], label?: string, grouping: string | null = null): void {
    this.isLoadingHistogram.set(true);
    this.clearChartNotices();
    this.histogramData.set(null);
    this.requests$.next({ codes, label, grouping });
  }

  private showResponse(response: unknown, { codes, label, grouping }: HistogramRequest): void {
    const items = extractHistogramItems(response);
    if (!items.length) {
      this.histogramData.set(null);
      this.emptyChartMessage.set(
        isInsufficientDataResponse(response) ? 'This variable does not have sufficient data.' : NO_DISTRIBUTION_MESSAGE
      );
      return;
    }
    const variableCode = String(items[0]?.var ?? items[0]?.variable ?? codes[0] ?? '');
    const variableNode = variableCode ? findNodeByCode(this.catalog.hierarchy(), variableCode) : null;
    const stacked = buildStackedHistogramSeries(
      items,
      variableCode,
      grouping,
      (groupingVar, groupingEnum) => this.groupLabel(groupingVar, groupingEnum),
      this.studio.selectedDatasets()
    );
    if (!stacked) {
      this.histogramData.set(null);
      this.emptyChartMessage.set(NO_DISTRIBUTION_MESSAGE);
      return;
    }
    const splitLabel = grouping
      ? (this.histogramSplitOptions().find((option) => option.code === grouping)?.label ?? grouping)
      : undefined;
    this.histogramData.set({
      bins: labelHistogramBins(stacked.bins, variableNode?.enumerations),
      counts: stacked.counts,
      groups: stacked.groups,
      variableName: label ?? variableNode?.label ?? '',
      variableType: variableNode?.type,
      splitLabel,
    });
    this.clearChartNotices();
  }

  /** Legend label of one split group: a dataset label, or the split variable's enumeration label. */
  private groupLabel(groupingVar: string, groupingEnum: string): string {
    if (groupingVar.toLowerCase() === DATASET_VARIABLE_CODE) {
      const fromMap = this.studio.getDatasetLabelMap()[groupingEnum];
      if (fromMap) return fromMap;
      const fromList = this.catalog.availableDatasets().find((dataset) => dataset.code === groupingEnum)?.label;
      if (fromList) return fromList;
    }
    const node = findNodeByCode(this.catalog.hierarchy(), groupingVar)
      ?? this.studio.selectedVariables().find((variable: { code?: string }) => variable.code === groupingVar);
    return enumerationLabel(groupingEnum, node?.enumerations) ?? groupingEnum;
  }

  private failLoading(error: unknown): void {
    this.isLoadingHistogram.set(false);
    console.error('Error fetching histogram:', error);
    this.errorMessage.set(LOAD_ERROR_MESSAGE);
  }

  private clearChartNotices(): void {
    this.errorMessage.set(null);
    this.emptyChartMessage.set(null);
  }
}
