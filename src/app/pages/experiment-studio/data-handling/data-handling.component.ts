import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  signal,
  untracked,
  output,
  input,
  OnDestroy
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EChartsOption } from 'echarts';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { ExperimentStudioService, PreprocessingConfig } from '../../../services/experiment-studio.service';
import { ChartRendererComponent } from '../visualisations/charts/charts-renderer/charts-renderer.component';
import {
  DATASET_VARIABLE_CODE,
  HISTOGRAM_SPLIT_NONE,
  HistogramSplitOption,
  buildHistogramSplitOptions,
  histogramCacheKey,
} from '../visualisations/histogram/histogram-data';
import { PdfExportService } from '../../../services/pdf-export.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { resolveDatasetDisplayLabel } from '../../../core/describe-result.utils';
import { FilterConfigModalComponent } from '../shared/filter-config-modal/filter-config-modal.component';
import { StationStatus } from '../shared/station-card/station-card.component';
import { DATA_HANDLING } from './data-handling.context';
import { TransformationStationComponent } from './transformation-station/transformation-station.component';
import { PreprocessingStationComponent } from './preprocessing-station/preprocessing-station.component';
import { CohortFilterStationComponent } from './cohort-filter-station/cohort-filter-station.component';
import { SourceDataStationComponent } from './source-data-station/source-data-station.component';
import { SectionAnchorDirective, SectionAnchors } from './section-anchors';
import { RuleBuilder, RuleBuilderRegistry } from './transformation/rule-builder-registry';
import { emptySummaryView, selectionKey, statisticBlockKey } from './utils/summary-view.utils';
import { cloneMissingRules, defaultMissingRule, emptyMissingRule, groupPreprocessingVariables, serializeMissingRule } from './utils/preprocessing-state.utils';
import { PreprocessingStateService } from './preprocessing-station/preprocessing-state.service';
import { StatisticSummaryService } from './statistic-summary.service';
import { SummaryHistogramService } from './summary-histogram.service';
import { enumLabelMap, isCategoricalVariable, pooledTotalRows, variableLabel } from './utils/statistic-summary.utils';
import { PipelineTerminalComponent } from './pipeline-terminal/pipeline-terminal.component';
import { BackendFilter } from '../../../models/filters.model';
import { kmeansCreatorClusterChoices, kmeansCreatorVariables } from '../../../core/kmeans-cluster-source.utils';
import { CsvExportService } from '../../../services/csv-export.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { countFilterRules, formatFilterExpression } from '../../../core/filter-display.utils';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { getAnalysisGuideLayout } from '../guide/experiment-studio-analysis-guide.util';
import { pluralize } from '../../../core/result-label.utils';
import { filterOperatorPhrase } from '../../../core/filter-logic.utils';
import {
  cloneOutlierRules,
  createDefaultOutlierRule,
  defaultFoldForStrategy,
  hydrateOutlierRules,
  isOutlierEligibleVariable,
  OUTLIER_STRATEGIES,
  OUTLIER_TAILS,
  OutlierRule,
  OutlierStrategy,
  OutlierTail,
  outlierStrategyLabel,
  outlierTailLabel,
  serializeOutlierRules,
  validateOutlierRule,
} from '../../../core/outlier-rules';
import {
  CreatorName,
  TransformationStep,
  stepOutputNames as stepOutputNamesOf,
} from '../../../core/transformation-steps.utils';

import {
  TabKey,
  SummaryKind,
  SectionKey,
  PipelineStep,
  PrepStep,
  StatisticVariableType,
  PreprocessingStatus,
  PrepKind,
  SummaryAnchorKey,
  SUMMARY_GUIDE_ANCHORS,
  MissingAction,
  LongitudinalStrategy,
  CategoryFilter,
  TransformationRule,
  TransformationColumnDraft,
  PipelineSubNode,
  SummaryView,
  PivotBlock,
  VariableRow,
  EnumOption,
  HistogramPreviewData,
  HowToGuide,
  PreprocessingRule,
  PreprocessingGroup,
  OutlierPreviewRow,
  DescriptiveProgressState,
} from './data-handling.models';
import { buildPreprocessingDocumentationHtml } from './utils/preprocessing-documentation.utils';
import { OutlierBoundsView, outlierBoundsView, outlierDistributionNumbers } from './utils/outlier-bounds.utils';
import { HistogramPreviewVariable } from './utils/histogram-preview.utils';
import { CREATOR_CHOOSER_COPY, firstFilterCondition, transformationConfigFor } from './utils/transformation-draft.utils';
import { TransformationDraftsService } from './transformation-station/transformation-drafts.service';
import { TransformationStatisticsService } from './transformation-station/transformation-statistics.service';
import {
  CategoryShare,
  Coverage,
  DatasetCoverage,
  DistributionPoint,
  PooledCoverage,
  barWidth,
  blockCoverage,
  blockDistribution,
  categoryShares,
  coverageByDataset,
  coveragePercent,
  coverageSeverity,
  coverageTitle,
  metricGroupLabel,
  missingShareNote,
  pooledCoverage,
} from './utils/summary-coverage.utils';
import {
  displayNumber,
  formatInteger,
  formatOutlierBound,
  formatOutlierPercentage,
} from './utils/statistic-format.utils';

@Component({
  selector: 'app-data-handling',
  imports: [ChartRendererComponent, FormsModule, PipelineTerminalComponent, SectionAnchorDirective, SourceDataStationComponent, CohortFilterStationComponent, PreprocessingStationComponent, TransformationStationComponent],
  // Section components read the pipeline's state through this token (see data-handling.context.ts).
  providers: [
    { provide: DATA_HANDLING, useExisting: forwardRef(() => DataHandlingComponent) },
    RuleBuilderRegistry,
    SectionAnchors,
    TransformationDraftsService,
    TransformationStatisticsService,
    PreprocessingStateService,
    StatisticSummaryService,
    SummaryHistogramService,
  ],
  templateUrl: './data-handling.component.html',
  // Order is the cascade: shell + pipeline canvas, then preprocessing stations,
  // then shared controls / result surfaces + responsive overrides. Concatenated in this order.
  styleUrls: [
    './data-handling.component.css',
    './data-handling.preprocessing.css',
    './data-handling.results.css',
  ],
  host: {
    '(document:click)': 'closeBatchMenuOnOutsideClick($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataHandlingComponent implements OnDestroy {
  readonly processedDataInput = input<PivotBlock[]>([], { alias: 'processedData' });
  processedData: PivotBlock[] = [];
  readonly variables = input<unknown[]>([]);
  readonly filters = input<unknown[]>([]);
  readonly progressStateChange = output<DescriptiveProgressState>();
  /** Scroll targets of goToSection, registered by the elements themselves. */
  private readonly sectionAnchors = inject(SectionAnchors);
  /** Each category's live filter builder, by rule (see RuleBuilderRegistry). */
  readonly ruleBuilders = inject(RuleBuilderRegistry);
  readonly transformationDraftState = inject(TransformationDraftsService);
  readonly transformationStats = inject(TransformationStatisticsService);
  readonly preprocessingState = inject(PreprocessingStateService);
  readonly statisticSummary = inject(StatisticSummaryService);
  private readonly summaryHistogram = inject(SummaryHistogramService);

  expStudioService = inject(ExperimentStudioService);
  private readonly destroyed = new Subject<void>();
  private studioNavigation = inject(ExperimentStudioNavigationService);
  private pdfExportService = inject(PdfExportService);
  private csvExportService = inject(CsvExportService);
  private cdr = inject(ChangeDetectorRef);
  private runtimeEnvService = inject(RuntimeEnvService);
  readonly mipVersion = this.runtimeEnvService.mipVersion;

  get rawSummary(): SummaryView {
    return this.statisticSummary.raw;
  }
  set rawSummary(view: SummaryView) {
    this.statisticSummary.raw = view;
  }
  get processedSummary(): SummaryView {
    return this.statisticSummary.processed;
  }
  set processedSummary(view: SummaryView) {
    this.statisticSummary.processed = view;
  }
  /** Step 0 snapshot: the same `SummaryView` the Raw and Processed surfaces use. */
  get sourceSummary(): SummaryView {
    return this.statisticSummary.source;
  }
  set sourceSummary(view: SummaryView) {
    this.statisticSummary.source = view;
  }
  // The rule maps live in PreprocessingStateService; these keep the panel's names.
  get pendingPreprocessingRules(): Record<string, PreprocessingRule> {
    return this.preprocessingState.pendingMissing;
  }
  set pendingPreprocessingRules(value: Record<string, PreprocessingRule>) {
    this.preprocessingState.pendingMissing = value;
  }
  get appliedPreprocessingRules(): Record<string, PreprocessingRule> {
    return this.preprocessingState.appliedMissing;
  }
  set appliedPreprocessingRules(value: Record<string, PreprocessingRule>) {
    this.preprocessingState.appliedMissing = value;
  }
  get pendingLongitudinalStrategies(): Record<string, LongitudinalStrategy> {
    return this.preprocessingState.pendingLongitudinal;
  }
  set pendingLongitudinalStrategies(value: Record<string, LongitudinalStrategy>) {
    this.preprocessingState.pendingLongitudinal = value;
  }
  get appliedLongitudinalStrategies(): Record<string, LongitudinalStrategy> {
    return this.preprocessingState.appliedLongitudinal;
  }
  set appliedLongitudinalStrategies(value: Record<string, LongitudinalStrategy>) {
    this.preprocessingState.appliedLongitudinal = value;
  }
  get pendingOutlierRules(): Record<string, OutlierRule> {
    return this.preprocessingState.pendingOutlier;
  }
  set pendingOutlierRules(value: Record<string, OutlierRule>) {
    this.preprocessingState.pendingOutlier = value;
  }
  get appliedOutlierRules(): Record<string, OutlierRule> {
    return this.preprocessingState.appliedOutlier;
  }
  set appliedOutlierRules(value: Record<string, OutlierRule>) {
    this.preprocessingState.appliedOutlier = value;
  }
  appliedLongitudinalEnabled = false;
  longitudinalVisit1 = '';
  longitudinalVisit2 = '';
  appliedLongitudinalVisit1 = '';
  appliedLongitudinalVisit2 = '';
  preprocessingStatus: PreprocessingStatus = 'none';
  isApplyingPreprocessing = false;
  preprocessingValidationErrors: Record<string, string> = {};
  outlierValidationErrors: Record<string, string> = {};
  outlierPreviewRows: OutlierPreviewRow[] = [];
  outlierPreviewError = '';
  /** A card's own Apply that failed: its message, shown in that card's footer. */
  preprocessingApplyError: Record<string, string | undefined> = {};
  isLoadingOutlierPreview = false;
  prepSearch: Record<PrepKind, string> = {
    missing: '',
    outlier: '',
    longitudinal: '',
  };
  selectedPrepCode: Record<PrepKind, string | null> = {
    missing: null,
    outlier: null,
    longitudinal: null,
  };
  // Record<string, ..>: the shared summary template indexes it with its own kind.
  statisticsSearch: Record<string, string> = {
    source: '',
    raw: '',
    processed: '',
  };
  isExporting = false;
  isLoading = true;
  readonly sectionOpen = signal<Record<SectionKey, boolean>>({
    source: false,
    raw: false,
    setup: false,
    filters: false,
    processed: false,
    transformation: false,
  });
  readonly summaryExpanded = signal<{ filters: boolean; setup: boolean }>({
    filters: false,
    setup: false,
  });
  preprocessingStepOpen: Record<'missing' | 'outlier' | 'longitudinal' | 'transformation', boolean> = {
    missing: true,
    outlier: true,
    longitudinal: true,
    transformation: true,
  };

  readonly addedSteps = signal<Record<'filters' | 'setup' | 'transformation', boolean>>({
    filters: false,
    setup: false,
    transformation: false,
  });
  readonly showUnappliedChangesWarning = signal(false);

  isStepAdded(step: 'filters' | 'setup' | 'transformation'): boolean {
    if (this.addedSteps()[step]) return true;
    if (step === 'filters') return this.filterRuleCount() > 0;
    if (step === 'transformation') {
      // Prefer the ordered store: singleton-map writes after Apply must not hide derived columns.
      if (this.cards().some((candidate) => stepOutputNamesOf(candidate).length > 0)) return true;
    }
    const applied = this.expStudioService.appliedPreprocessingConfig();
    if (!applied) return false;
    if (step === 'transformation') {
      return !!applied['categorical_column_creator'] || !!applied['kmeans_cluster_creator'];
    }
    return !!(
      applied['missing_values_handler'] ||
      applied['outlier_winsorizer'] ||
      applied['longitudinal_transformer']
    );
  }

  /** Opening a stage is a read: it shows the editor, it never writes the request. */
  addStep(step: 'filters' | 'setup' | 'transformation'): void {
    this.addedSteps.update((s) => ({ ...s, [step]: true }));
    if (step === 'setup') this.ensureDefaultRulesForCurrentSelection();
    this.goToSection(step);
    this.cdr.markForCheck();
  }

  removeStep(step: 'filters' | 'setup' | 'transformation'): void {
    this.addedSteps.update((s) => ({ ...s, [step]: false }));
    if (step === 'filters') {
      this.rawPreviewFilter = undefined;
      this.expStudioService.setFilterLogic(null);
      this.sectionOpen.update((open) => ({ ...open, filters: false, raw: false }));
    } else if (step === 'setup') {
      this.appliedPreprocessingRules = {};
      this.pendingPreprocessingRules = {};
      this.pendingOutlierRules = {};
      this.appliedOutlierRules = {};
      this.userEnabledOutliers.set(false);
      this.persistAppliedDescriptivePreprocessing(null);
      this.preprocessingStatus = 'none';
      this.preprocessingState.userApplied = false;
      this.processedDescribeSeq++;
      this.clearProcessedPreviewSubscription();
      this.processedSummary = emptySummaryView(false);
      this.processedSummaryKey = '';
      this.sectionOpen.update((open) => ({ ...open, setup: false, processed: false }));
    } else if (step === 'transformation') {
      this.resetTransformation();
      this.sectionOpen.update((open) => ({ ...open, transformation: false }));
    }
    this.cdr.markForCheck();
  }

  /**
   * The station footer's primary slot commits pending conditions. An empty builder has
   * nothing to commit and nothing to keep — an optional step with no rules is exactly the
   * default collapsed step — so the same slot closes the station and hands the pipeline back.
   */
  commitOrCloseFilterStation(modal: FilterConfigModalComponent): void {
    if (modal.activeRulesCount() > 0) {
      modal.saveFilters();
      return;
    }
    this.removeStep('filters');
    this.requestSectionScroll('filters');
  }

  /** Folds the stage's editor and preview; nothing is removed or discarded. */
  collapseStep(step: 'filters' | 'setup' | 'transformation'): void {
    if (step === 'filters') return this.foldFilterStation();
    if (step === 'setup') return this.foldPreprocessingStation();
    this.sectionOpen.update((open) => ({ ...open, transformation: false }));
    this.cdr.markForCheck();
    this.requestSectionScroll('transformation');
  }

  /** A click anywhere on a step's header toggles it, except on the header's own buttons
   *  (the title, Remove, Revert, Customize) and at the end of a text selection. */
  onStepHeaderClick(step: PipelineStep, event: Event): void {
    if ((event.target as Element).closest('button')) return;
    if (window.getSelection()?.toString()) return;
    this.toggleStep(step);
  }

  /** Folds an open step and opens a folded one; opening an optional step adds it. */
  toggleStep(step: PipelineStep): void {
    if (step === 'source') return this.toggleSourcePreview();
    if (this.isStepOpen(step)) this.collapseStep(step);
    else this.addStep(step);
  }

  /** A step outside the pipeline is never open, whatever its section flag says. */
  isStepOpen(step: PipelineStep): boolean {
    const open = this.sectionOpen();
    if (step === 'source') return open.source;
    if (!this.isStepAdded(step)) return false;
    if (step === 'filters') return open.filters || open.raw;
    if (step === 'setup') return open.setup || open.processed;
    return open.transformation;
  }

  /** Apply saved the rules; fold the editor. Preview data is what opens the tables. */
  private foldFilterStation(): void {
    this.sectionOpen.update((open) => ({ ...open, filters: false, raw: false }));
    this.cdr.markForCheck();
    this.requestSectionScroll('filters');
  }

  /**
   * Cohort Filtering's "Preview data": describe the cohort under the rules the editor
   * holds — unapplied, including "no rules yet" — and hand the result to the Raw
   * summary. Nothing is written; Apply (`saveFilters`) stays the only path to the
   * request, and an invalid builder keeps the user on the editor with its own error.
   */
  previewFilterData(modal: FilterConfigModalComponent): void {
    const pendingFilters = modal.exportFilterLogic() as BackendFilter | null;
    if (modal.filterError()) {
      this.cdr.markForCheck();
      return;
    }
    this.rawPreviewFilter = pendingFilters ?? null;
    this.goToSection('raw');
  }

  /**
   * Apply wrote the pending rules. Drop any preview pin so later Preview data follows
   * the store; do not open the Raw tables — that is Preview data's job.
   */
  onCohortFiltersApplied(): void {
    this.rawPreviewFilter = undefined;
    this.foldFilterStation();
  }

  /** Clear drops the stored cohort, which retires the preview pinned to it. */
  clearFilterRules(modal: FilterConfigModalComponent): void {
    this.rawPreviewFilter = undefined;
    modal.clearFilters();
  }

  get activeStagesCount(): number {
    return (['filters', 'setup', 'transformation'] as const).filter((step) => this.isStepAdded(step)).length;
  }

  /** Track if outlier section is explicitly enabled by user */
  readonly userEnabledOutliers = signal<boolean>(false);

  /**
   * Which outlier card the editor shows: the station once the step is opened or holds a
   * rule, the dashed add card while it is still dormant. The rail does not read this —
   * see `outlierSubNodeApplied`.
   */
  get showOutliersSection(): boolean {
    if (this.userEnabledOutliers()) return true;
    const hasApplied = Object.values(this.appliedOutlierRules).some((r) => r && r.enabled);
    const hasPending = Object.values(this.pendingOutlierRules).some((r) => r && r.enabled);
    return hasApplied || hasPending;
  }

  enableOutlierHandling(): void {
    this.userEnabledOutliers.set(true);
    this.preprocessingStepOpen.outlier = true;
    this.cdr.markForCheck();
  }

  removeOutlierHandling(): void {
    this.userEnabledOutliers.set(false);
    for (const code of Object.keys(this.pendingOutlierRules)) {
      if (this.pendingOutlierRules[code]) {
        this.pendingOutlierRules[code].enabled = false;
      }
    }
    for (const code of Object.keys(this.appliedOutlierRules)) {
      if (this.appliedOutlierRules[code]) {
        this.appliedOutlierRules[code].enabled = false;
      }
    }
    this.cdr.markForCheck();
  }

  finishDataHandling(): void {
    if (this.pendingChangeCount > 0 || this.transformationHasPendingChange) {
      this.showUnappliedChangesWarning.set(true);
      this.cdr.markForCheck();
      return;
    }
    this.studioNavigation.navigateToSection('algorithm-section');
  }

  applyAndContinue(): void {
    this.showUnappliedChangesWarning.set(false);
    if (this.pendingChangeCount > 0) {
      this.continueAfterApply = true;
      this.applyPreprocessing();
      return;
    }
    this.studioNavigation.navigateToSection('algorithm-section');
  }

  discardAndContinue(): void {
    this.showUnappliedChangesWarning.set(false);
    this.resetChanges();
    this.discardPendingTransformation();
    this.studioNavigation.navigateToSection('algorithm-section');
  }

  /** Header chip tone; the label reads off it so copy and colour cannot drift. */
  get preprocessingBadgeTone(): 'applied' | 'pending' | 'default' {
    if (this.pendingChangeCount > 0) return 'pending';
    return this.preprocessingStatus === 'applied' ? 'applied' : 'default';
  }

  get preprocessingStatusLabel(): string {
    switch (this.preprocessingBadgeTone) {
      case 'pending':
        return `In run · ${pluralize(this.pendingChangeCount, 'change')} not applied`;
      case 'applied': {
        const count = this.appliedPreprocessingCount;
        return count > 1 ? `${count} steps applied ✓` : 'Applied ✓';
      }
      default:
        return 'In run · Default';
    }
  }

  /** Terminal card's preprocessing fact: default drop-NaN, or the applied step count. */
  get terminalPreprocessingLine(): string {
    if (this.preprocessingBadgeTone === 'default') return 'Missing values: remove rows (default)';
    return `Preprocessing: ${pluralize(this.appliedPreprocessingCount, 'step')}`;
  }

  /**
   * Sub-steps the pipeline will actually run, read from the persisted request
   * config so the rail can never disagree with the next run. Missing values is
   * always present: default NA removal is an active step even when untouched.
   */
  get appliedPreprocessingSubNodes(): PipelineSubNode[] {
    const config = this.expStudioService.appliedPreprocessingConfig() ?? {};
    const nodes: PipelineSubNode[] = [this.missingValuesSubNode(config)];

    const outlier = config['outlier_winsorizer'] as { strategies?: Record<string, unknown> } | undefined;
    const outlierStrategies = Object.values(outlier?.strategies ?? {});
    if (outlierStrategies.length) {
      nodes.push({
        id: 'outlier',
        icon: 'fas fa-line-chart',
        title: 'Outlier Winsorizer',
        subtitle: `Extreme values capped on ${outlierStrategies.length} ${outlierStrategies.length === 1 ? 'variable' : 'numerical variables'} (${Array.from(new Set(outlierStrategies.map((s) => outlierStrategyLabel(String(s))))).join(', ')})`,
        statusLabel: 'Applied',
        statusTone: this.hasPendingOutlierChanges ? 'pending' : 'applied',
      });
    }

    const longitudinal = config['longitudinal_transformer'] as
      | { visit1?: unknown; visit2?: unknown; strategies?: Record<string, unknown> }
      | undefined;
    if (longitudinal && this.isLongitudinalModel) {
      const count = Object.keys(longitudinal.strategies ?? {}).length;
      nodes.push({
        id: 'longitudinal',
        icon: 'fas fa-code-compare',
        title: 'Longitudinal Comparison',
        subtitle: `${this.visitLabel(longitudinal.visit1)} vs ${this.visitLabel(longitudinal.visit2)} strategy configured on ${count} ${count === 1 ? 'variable' : 'variables'}`,
        statusLabel: 'Applied',
        statusTone: this.pendingLongitudinalChangeCount > 0 ? 'pending' : 'applied',
      });
    }

    return nodes;
  }

  /**
   * Rail counterpart of the outlier step: whether the rail already draws it as a node.
   * The dashed row that creates a sub-step must answer to the same source as the rail's own
   * rows — the persisted request — so a sub-step always has exactly one representation. The
   * editor's `showOutliersSection` also turns true on a merely opened step, which used to
   * leave an untouched step that was closed again with neither a node nor an add row.
   */
  get outlierSubNodeApplied(): boolean {
    return this.appliedPreprocessingSubNodes.some((node) => node.id === 'outlier');
  }

  get appliedPreprocessingCount(): number {
    return this.appliedPreprocessingSubNodes.filter((node) => node.statusTone === 'applied').length;
  }

  /** A derived column only exists once its config is persisted; otherwise the stage stays empty. */
  get appliedTransformationSubNodes(): PipelineSubNode[] {
    const statusTone: PipelineSubNode['statusTone'] =
      this.transformationStatusLabel === 'Applied' ? 'applied' : 'pending';
    const nodes: PipelineSubNode[] = [];
    for (const step of this.cards()) {
      const outputs = stepOutputNamesOf(step);
      if (!outputs.length) continue;
      if (step.name === 'categorical_column_creator') {
        const rules = (step.parameters['rules'] as Record<string, unknown> | undefined) ?? {};
        const ruleCount = Object.keys(rules).length;
        const fallback = String(step.parameters['default_enumeration'] ?? '').trim();
        nodes.push({
          id: `transformation:${step.id}`,
          icon: 'fas fa-tag',
          title: `Derived column: ${outputs[0]}`,
          subtitle: `${ruleCount} ${ruleCount === 1 ? 'category rule' : 'category rules'} configured${fallback ? ` · default: ${fallback}` : ''}`,
          statusLabel: 'Applied',
          statusTone,
        });
        continue;
      }
      if (step.name === 'kmeans_cluster_creator') {
        const variables = kmeansCreatorVariables(step.parameters);
        const clusterCount = kmeansCreatorClusterChoices(step.parameters).length;
        nodes.push({
          id: `transformation:${step.id}`,
          icon: 'fas fa-diagram-project',
          title: `K-means clusters: ${outputs[0]}`,
          subtitle: `${clusterCount} clusters from ${variables.join(', ')}`,
          statusLabel: 'Applied',
          statusTone: 'applied',
        });
        continue;
      }
      const available = this.transformationDraftState.isCreatorAvailable(step.name);
      nodes.push({
        id: `transformation:${step.id}`,
        icon: CREATOR_CHOOSER_COPY[step.name].icon,
        title: `${CREATOR_CHOOSER_COPY[step.name].title}: ${outputs.join(', ')}`,
        subtitle: available ? 'Configured' : 'Not available on this deployment',
        statusLabel: available ? 'Applied' : 'Unavailable',
        statusTone: available ? 'applied' : 'pending',
      });
    }
    return nodes;
  }

  get appliedTransformationCount(): number {
    return this.appliedTransformationSubNodes.length;
  }

  /** Expands the owning stage and opens only the clicked station. */
  jumpToSubNode(stage: 'setup' | 'transformation', subNode: PipelineSubNode['id']): void {
    this.goToSection(stage);
    if (stage === 'transformation') {
      this.preprocessingStepOpen.transformation = true;
      return;
    }
    for (const step of ['missing', 'outlier', 'longitudinal'] as const) {
      this.preprocessingStepOpen[step] = step === subNode;
    }
    if (subNode === 'outlier') this.userEnabledOutliers.set(true);
    this.cdr.markForCheck();
  }

  /** A dashed rail row adds and opens its sub-step in one click, writing nothing. */
  addPreprocessingSubNode(subNode: 'outlier' | 'longitudinal'): void {
    if (!this.isStepAdded('setup')) this.addStep('setup');
    this.jumpToSubNode('setup', subNode);
  }

  /** Same for the Transformation stage: opens it on the type chooser at the end of its graph. */
  addTransformationSubNode(): void {
    this.addStep('transformation');
  }

  /** Ordered cards from the store — one station per transformation step. */
  cards(): TransformationStep[] {
    return this.transformationDraftState.cards();
  }

  /** Nothing picked yet: the chooser is the whole stage, so it asks instead of offering. */
  get transformationChooserOnly(): boolean {
    return this.cards().length === 0;
  }

  /** Type chooser row: appends a new store step (a nominal one also gets its rule-editor draft). */
  chooseTransformation(name: CreatorName): void {
    this.transformationDraftState.choose(name);
    this.cdr.markForCheck();
  }

  toggleCardOpen(stepId: string, open = !this.transformationDraftState.isCardOpen(stepId)): void {
    this.transformationDraftState.setCardOpen(stepId, open);
    this.cdr.markForCheck();
  }

  private missingValuesSubNode(config: Record<string, unknown>): PipelineSubNode {
    const handler = config['missing_values_handler'] as
      | { strategies?: Record<string, unknown> }
      | undefined;
    const entries = Object.entries(handler?.strategies ?? {}).filter(([, action]) => action !== 'no_action');
    const imputed = entries.filter(([, action]) => action !== 'drop');
    const pending = this.hasPendingMissingChanges ? 'pending' : 'applied';
    const droppedByDefault = this.rowsDroppedByDefault;
    const impact = droppedByDefault != null
      ? `−${droppedByDefault.toLocaleString()} records`
      : undefined;

    if (imputed.length) {
      const summary = imputed.slice(0, 3).map(([code, action]) => {
        const variable = this.preprocessingVariables.find((v) => v.code === code);
        return `${variable ? this.variableLabel(variable) : code}: ${this.missingStrategyLabel(String(action))}`;
      });
      return {
        id: 'missing',
        icon: 'fas fa-eraser',
        title: 'Missing Values Strategy',
        subtitle: `Imputation configured for ${imputed.length} ${imputed.length === 1 ? 'variable' : 'variables'} (${summary.join(', ')}${imputed.length > 3 ? ', …' : ''})`,
        statusLabel: 'Applied',
        statusTone: pending,
      };
    }

    if (entries.length) {
      return {
        id: 'missing',
        icon: 'fas fa-eraser',
        title: 'Missing Values Handler',
        subtitle: `Rows with missing values removed for ${entries.length} ${entries.length === 1 ? 'variable' : 'variables'}`,
        statusLabel: 'Applied',
        statusTone: pending,
        impact,
      };
    }

    return {
      id: 'missing',
      icon: 'fas fa-eraser',
      title: 'Missing values',
      subtitle: `All ${pluralize(this.preprocessingVariables.length, 'variable')}: remove rows with a missing value (default)`,
      statusLabel: 'In run · Default',
      statusTone: 'default',
      impact,
    };
  }

  missingStrategyLabel(action: string): string {
    return this.missingActions.find((item) => item.value === action)?.label ?? action;
  }

  private visitLabel(code: unknown): string {
    const value = String(code ?? '');
    return this.visitOptions.find((option) => option.code === value)?.label ?? value;
  }

  get filteringStatusLabel(): string {
    const count = this.filterRuleCount();
    if (count > 0) return `In run · ${pluralize(count, 'rule')}`;
    return 'Not in run yet';
  }

  /** Builder match chip after Preview: filtered rows (raw summary) out of the unfiltered
   *  source snapshot. The processed summary is excluded: its drop is preprocessing, not the filter. */
  get filterPreviewStatus(): string {
    const matched = this.getSummaryTotalRows(this.rawSummary);
    const source = this.getSummaryTotalRows(this.sourceSummary);
    if (matched === null || source === null) return '';
    // Never round a partial match to 0% or 100%: those read as "none" and "the filter does nothing".
    const share = matched === source ? 100
      : matched === 0 || source === 0 ? 0
      : Math.min(99, Math.max(1, Math.round((matched / source) * 100)));
    return `Matches ${matched.toLocaleString()} of ${source.toLocaleString()} records · ${share}%`;
  }

  /** Header "Records out" per stage, read off the summaries already loaded; null hides it.
   *  With no stored rule the Raw summary is the unfiltered cohort, so it stands in for the
   *  source snapshot, which is only fetched when Raw data is previewed. A Raw summary
   *  pinned to an unapplied preview stands in for neither. */
  get recordsOut(): { source: number | null; filtered: number | null; processed: number | null } {
    // A Raw summary pinned to unsaved preview rules does not describe the stored cohort.
    const rawIsStoredCohort = this.rawSummaryKey === this.rawSummaryKeyFor();
    const filtered = rawIsStoredCohort ? this.getSummaryTotalRows(this.rawSummary) : null;
    const source = this.getSummaryTotalRows(this.sourceSummary)
      ?? (this.filterRuleCount() === 0 ? filtered : null);
    return { source, filtered, processed: this.getSummaryTotalRows(this.processedSummary) };
  }

  /** Collapsed Cohort filtering: one row per top-level rule of the stored filter. */
  get cohortRuleRows(): Array<{ title: string; subtitle: string }> {
    return (this.expStudioService.filterLogic()?.rules ?? []).map((node) => {
      if ('rules' in node) {
        const joiner = node.condition === 'OR' ? ' or ' : ' and ';
        const title = node.rules
          .map((child) => ('rules' in child ? '(…)' : this.filterConditionSentence(child)))
          .join(joiner);
        const scope = node.condition === 'OR' ? 'any' : 'all';
        return { title, subtitle: `Group · matches ${scope} of ${pluralize(countFilterRules(node), 'condition')}` };
      }
      return { title: this.filterConditionSentence(node), subtitle: node.type === 'string' ? 'Categorical' : 'Numerical' };
    });
  }

  get cohortMatchesAny(): boolean {
    return this.expStudioService.filterLogic()?.condition === 'OR';
  }

  /** "How to use" strip copy per expanded stage; K-means is projected into its card. */
  readonly howTo: Record<'source' | 'filters' | 'setup' | 'transformation' | 'kmeans' | 'pca', HowToGuide> = {
    source: {
      steps: ['Pick a variable on the left', 'Switch between Table, Charts and Histogram', 'Note gaps or odd ranges — fix them in the steps below'],
      note: 'Read only — this preview never changes the data or the run.',
    },
    filters: {
      steps: ['Add a condition: variable, operator, value', 'Preview to see who matches', 'Apply to use the filter in the run'],
      note: 'Records that match stay in the run. Everything else is left out — the raw data itself is never changed.',
    },
    setup: {
      steps: ['Pick a variable', 'Choose what happens to its missing values', 'Apply — the run uses your rules'],
      note: "Variables you don't touch keep the default: rows with a missing value are removed.",
    },
    transformation: {
      steps: ['Choose the kind of column to add', 'Define it — category rules, or a K-means or PCA run', 'Done on a rule loads its counts, then Apply'],
      note: 'The new column joins your variable list, so you can pick it as an outcome or predictor in Algorithm Selection.',
    },
    kmeans: {
      steps: ['Choose the variables to group by', 'Run the K-means report and check the clusters', 'Name the column and use it'],
      note: 'Rows missing any chosen variable are left out. A finished K-means run can be reused if it used the same data model, datasets and filters.',
    },
    pca: {
      steps: ['Choose the variables to combine', 'Run the PCA report and pick the components', 'Name the columns and add them'],
      note: 'No saved PCA experiment is needed. Rows missing any chosen variable are left out. A finished PCA run can be reused if it used the same data model, datasets and filters.',
    },
  };

  readonly missingActions: Array<{ value: MissingAction; label: string }> = [
    { value: 'drop', label: 'Remove rows' },
    { value: 'mean', label: 'Mean imputation' },
    { value: 'median', label: 'Median imputation' },
    { value: 'constant', label: 'Constant value' },
  ];

  /** The card whose category counts replace its editor ('kmeans' = the cluster card). */
  previewDraftId: string | null = null;
  /** Ordered cards; the stage always keeps at least one (possibly empty) draft. */
  /** The nominal-column cards (state and rules in TransformationDraftsService). */
  get transformationDrafts(): TransformationColumnDraft[] {
    return this.transformationDraftState.drafts;
  }
  set transformationDrafts(drafts: TransformationColumnDraft[]) {
    this.transformationDraftState.drafts = drafts;
  }

  readonly longitudinalStrategies: Array<{ value: LongitudinalStrategy; label: string }> = [
    { value: 'diff', label: 'Diff (Visit 2 - Visit 1)' },
    { value: 'first', label: 'Use visit 1' },
    { value: 'second', label: 'Use visit 2' },
  ];
  readonly outlierStrategies = OUTLIER_STRATEGIES;
  readonly outlierTails = OUTLIER_TAILS;

  private selectionKey = '';
  /** Cohort half of `selectionKey`, so a preprocessing write can be ignored on its own. */
  private cohortSelectionKey = '';
  /**
   * JSON of the applied config written by this component. The selection effect
   * rehydrates every card from that signal; this write must not, or a card Apply
   * wipes the other cards' pending edits.
   */
  private appliedConfigWrite = '';
  /** Card preview describes that card's pending rules over the applied rest. */
  private processedPreviewScope: PrepStep | 'all' = 'all';
  private get rawSummaryKey(): string {
    return this.statisticSummary.loadedKey.raw;
  }
  private set rawSummaryKey(key: string) {
    this.statisticSummary.loadedKey.raw = key;
  }
  /**
   * The cohort rules the Raw surface was last fetched with when they are unsaved
   * editor state. `undefined` means the surface follows the stored `filterLogic()`,
   * so the selection effect may refresh it; a value — including `null` for "no rules
   * at all" — pins the Raw summary to what the modal holds, so Preview shows the
   * cohort the user is composing rather than the older stored one.
   */
  private rawPreviewFilter: BackendFilter | null | undefined = undefined;
  /** Supersedes an in-flight raw describe so a late response cannot win. */
  private rawDescribeSeq = 0;
  private get processedSummaryKey(): string {
    return this.statisticSummary.loadedKey.processed;
  }
  private set processedSummaryKey(key: string) {
    this.statisticSummary.loadedKey.processed = key;
  }
  private get sourceSummaryKey(): string {
    return this.statisticSummary.loadedKey.source;
  }
  private set sourceSummaryKey(key: string) {
    this.statisticSummary.loadedKey.source = key;
  }
  private processedPreviewSubscription: Subscription | null = null;
  private sourcePreviewSubscription: Subscription | null = null;
  /** Supersedes in-flight processed/source describes so a late response cannot win. */
  private processedDescribeSeq = 0;
  private sourceDescribeSeq = 0;
  private scrollRequestId = 0;
  private continueAfterApply = false;
  private readonly scrollSectionRequest = signal<{ section: SectionKey; requestId: number } | null>(null);
  private readonly guideState = inject(ExperimentStudioGuideStateService);

  constructor() {
    this.transformationStats.ports = {
      hasInvalidPendingRules: () => Object.keys(this.validatePendingRules()).length > 0,
      pendingPreprocessingConfig: () => this.buildPreprocessingConfig(this.pendingPreprocessingRules),
      variableLabel: (code) => this.variableLabelForCode(code),
    };
    this.summaryHistogram.ports = {
      selectedBlock: (kind) => this.selectedStatisticBlock(kind),
      target: (kind, block) => {
        const code = this.variableCodeForBlock(block);
        if (!code) return null;
        return {
          code,
          split: this.histogramSplitValue(kind, block),
          variable: () => this.histogramVariable(kind, block),
          splitLabel: (groupingCode) =>
            this.histogramSplitOptions(block).find((option) => option.code === groupingCode)?.label ?? groupingCode,
        };
      },
      pendingPreprocessing: () => this.buildPreprocessingConfig(this.pendingPreprocessingRules, this.currentPreprocessingCodeSet()),
      rawPreviewFilter: () => this.rawPreviewFilter,
      groupLabel: (groupingVar, groupingEnum) => this.groupingEnumLabel(groupingVar, groupingEnum),
      changed: () => this.cdr.markForCheck(),
    };
    effect(() => {
      const layout = getAnalysisGuideLayout(this.guideState.activeStepId());
      if (!layout) return;

      if (layout.expandSection === 'none') {
        this.collapseAllWorkflowSections();
      } else {
        this.goToSection(layout.expandSection);
      }

      if (layout.summaryKind && layout.summaryTab) {
        this.setSummaryTab(layout.summaryKind, layout.summaryTab);
      }

      if (layout.preprocessingStep) {
        this.preprocessingStepOpen = {
          missing: layout.preprocessingStep === 'missing',
          outlier: layout.preprocessingStep === 'outlier',
          longitudinal: layout.preprocessingStep === 'longitudinal',
          transformation: false,
        };
      }
      this.cdr.markForCheck();
    });

    effect(() => {
      const incomingProcessedData = this.processedDataInput();
      this.processedData = incomingProcessedData;
      this.isLoading = incomingProcessedData.length === 0;
      this.cdr.markForCheck();
    });

    effect(() => {
      const variables = this.expStudioService.selectedVariables();
      const filters = this.expStudioService.selectedFilters();
      const filterLogic = this.expStudioService.filterLogic();
      const appliedPreprocessing = this.expStudioService.appliedPreprocessingConfig();
      const cohortKey = selectionKey(variables, filters, filterLogic);
      const nextSelectionKey = selectionKey(variables, filters, filterLogic, appliedPreprocessing);
      const echoed = this.appliedConfigWrite;
      if (
        echoed
        && echoed === JSON.stringify(appliedPreprocessing ?? null)
        && cohortKey === this.cohortSelectionKey
      ) {
        this.appliedConfigWrite = '';
        this.selectionKey = nextSelectionKey;
        return;
      }
      this.appliedConfigWrite = '';

      if (nextSelectionKey === this.selectionKey) return;
      this.cohortSelectionKey = cohortKey;
      this.selectionKey = nextSelectionKey;
      this.reconcilePreprocessingForSelection();

      if (!variables.length && !filters.length) {
        this.rawDescribeSeq++;
        this.processedDescribeSeq++;
        this.sourceDescribeSeq++;
        this.clearProcessedPreviewSubscription();
        this.clearSourcePreviewSubscription();
        this.rawSummary = emptySummaryView(false);
        this.processedSummary = emptySummaryView(false);
        this.sourceSummary = emptySummaryView(false);
        this.rawSummaryKey = '';
        this.sourceSummaryKey = '';
        this.processedSummaryKey = '';
        this.processedData = [];
        this.isLoading = false;
        this.expStudioService.clearDataExclusionWarnings();
        this.cdr.markForCheck();
        return;
      }

      // Raw is "the variables as stored": it is requested with a null preprocessing
      // config, so applying preprocessing cannot change its numbers and must not
      // spend a second full federated describe on it. A Cohort Filtering preview owns
      // the surface instead, and ensureRawSummary re-runs the describe with those
      // unsaved rules rather than falling back to the stored cohort read above.
      this.ensureRawSummary();
      this.fetchProcessedPreview();
      // untracked: the snapshot refreshes with the selection, but sectionOpen must
      // not become a dependency of this effect or every section switch refetches raw.
      if (untracked(this.sectionOpen).source) this.ensureSourceSummary();
    });

    effect(() => {
      const request = this.scrollSectionRequest();
      if (!request) return;

      setTimeout(() => {
        if (this.scrollSectionRequest()?.requestId !== request.requestId) return;
        this.scrollSectionIntoView(request.section);
        if (this.scrollSectionRequest()?.requestId === request.requestId) {
          this.scrollSectionRequest.set(null);
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
    this.clearProcessedPreviewSubscription();
    this.clearSourcePreviewSubscription();
  }

  get pendingChangeCount(): number {
    return this.pendingMissingChangeCount + this.pendingOutlierChangeCount + this.pendingLongitudinalChangeCount;
  }

  readonly filterRuleCount = computed(() =>
    countFilterRules(this.expStudioService.filterLogic())
  );

  /** Two columns cannot share a name: exaflow errors when `code` already exists. */
  get transformationHasDuplicateCodes(): boolean {
    return this.transformationDraftState.hasDuplicateCodes;
  }

  get transformationHasPendingChange(): boolean {
    return this.transformationDraftState.hasPendingChange;
  }

  get transformationStatusLabel(): string {
    const validCount = this.transformationDraftState.configs().length;
    const hasAppliedColumn = validCount > 0
      || this.cards().some((step) => step.name !== 'categorical_column_creator' && stepOutputNamesOf(step).length > 0);
    if (hasAppliedColumn && !this.transformationHasPendingChange) return 'Applied';
    if (
      hasAppliedColumn
      || this.transformationHasPendingChange
      || this.transformationDraftState.hasAnyWork
      || this.cards().length > 0
    ) {
      return 'Not applied';
    }
    return 'Not set';
  }

  /** Pipeline-header badge: shows the derived-column count once applied. */
  get transformationBadgeLabel(): string {
    const count = this.appliedTransformationCount;
    if (this.transformationStatusLabel === 'Applied' && count > 0) {
      return `${count} ${count === 1 ? 'Transformation' : 'Transformations'} active`;
    }
    return this.transformationStatusLabel === 'Applied' ? 'Applied' : 'Not in run yet';
  }


  get pendingMissingChangeCount(): number {
    return this.hasPendingMissingChanges ? 1 : 0;
  }

  get hasPendingMissingChanges(): boolean {
    return this.preprocessingVariables.some((variable) => this.preprocessingState.missingHasPendingChange(variable.code));
  }

  get pendingOutlierChangeCount(): number {
    return this.hasPendingOutlierChanges ? 1 : 0;
  }

  get hasPendingOutlierChanges(): boolean {
    return this.outlierPreprocessingVariables.some((variable) => this.preprocessingState.outlierHasPendingChange(variable.code));
  }

  get pendingLongitudinalChangeCount(): number {
    if (!this.isLongitudinalModel) return 0;
    return this.serializeLongitudinalState(false) === this.serializeLongitudinalState(true) ? 0 : 1;
  }

  get preprocessingVariables(): VariableRow[] {
    const selectedVars = this.expStudioService.selectedVariables() as VariableRow[];
    return Array.from(
      new Map(selectedVars.map((variable) => [variable.code, variable])).values()
    ).filter((variable) => !!variable?.code);
  }

  filteredPrepVariables(kind: PrepKind): VariableRow[] {
    const query = this.prepSearch[kind].trim().toLowerCase();
    const pool = kind === 'outlier' ? this.outlierPreprocessingVariables : this.preprocessingVariables;
    if (!query) return pool;
    return pool.filter((variable) => {
      const label = this.variableLabel(variable).toLowerCase();
      return label.includes(query) || String(variable.code).toLowerCase().includes(query);
    });
  }

  get outlierPreprocessingVariables(): VariableRow[] {
    return this.preprocessingVariables.filter((variable) => isOutlierEligibleVariable(variable));
  }

  prepGroups(kind: PrepKind): PreprocessingGroup[] {
    return groupPreprocessingVariables(this.filteredPrepVariables(kind), (variable) => {
      if (this.prepVariableHasPendingChange(kind, variable)) return 'pending';
      if (this.prepVariableIsApplied(kind, variable)) return 'applied';
      if (kind === 'missing' && this.isPreprocessingVariableUsingDefault(variable)) return 'default';
      return 'not-applied';
    });
  }

  selectedPrepVariable(kind: PrepKind): VariableRow | null {
    const filtered = this.filteredPrepVariables(kind);
    if (!filtered.length) return null;
    return filtered.find((variable) => variable.code === this.selectedPrepCode[kind]) ?? filtered[0];
  }

  selectPrepVariable(kind: PrepKind, variable: VariableRow): void {
    this.selectedPrepCode[kind] = variable.code;
    this.cdr.markForCheck();
  }

  isPrepVariableSelected(kind: PrepKind, variable: VariableRow): boolean {
    return this.selectedPrepVariable(kind)?.code === variable.code;
  }

  prepVariableStateLabel(kind: PrepKind, variable: VariableRow): string {
    if (this.prepVariableHasPendingChange(kind, variable)) return 'Pending';
    if (this.prepVariableIsApplied(kind, variable)) return 'Applied';
    if (kind === 'missing' && this.isPreprocessingVariableUsingDefault(variable)) return 'Default';
    return 'Not applied';
  }

    prepVariableHasPendingChange(kind: PrepKind, variable: VariableRow): boolean {
    switch (kind) {
      case 'missing':
        return this.preprocessingState.missingHasPendingChange(variable.code);
      case 'outlier':
        return this.preprocessingState.outlierHasPendingChange(variable.code);
      case 'longitudinal': {
        if (!this.isLongitudinalModel) return false;
        const pendingStrategy = this.pendingLongitudinalStrategies[variable.code] ?? this.defaultLongitudinalStrategy(variable);
        const appliedStrategy = this.appliedLongitudinalStrategies[variable.code] ?? null;
        return pendingStrategy !== appliedStrategy || this.longitudinalVisitPairHasPendingChange;
      }
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }

  private prepVariableIsApplied(kind: PrepKind, variable: VariableRow): boolean {
    switch (kind) {
      case 'missing':
        return this.hasAppliedPreprocessing(variable.code);
      case 'outlier':
        return this.hasAppliedOutlierPreprocessing(variable.code);
      case 'longitudinal':
        return this.hasAppliedLongitudinalPreprocessing(variable.code);
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }

  isPreprocessingVariableUsingDefault(variable: VariableRow): boolean {
    return this.preprocessingState.isUsingDefaultMissing(variable.code);
  }

  get longitudinalVisitPairHasPendingChange(): boolean {
    return this.longitudinalVisit1 !== this.appliedLongitudinalVisit1 || this.longitudinalVisit2 !== this.appliedLongitudinalVisit2;
  }

  get missingPreprocessingStatusLabel(): string {
    if (this.hasPendingMissingChanges) {
      return `${pluralize(this.pendingMissingChangeCount, 'change')} · not applied`;
    }
    if (Object.values(this.appliedPreprocessingRules).some((rule) => rule.enabled && rule.action !== 'no_action')) return 'Applied';
    if (this.preprocessingVariables.some((variable) => this.isPreprocessingVariableUsingDefault(variable))) return 'Default · in run';
    return 'Required';
  }

  get outlierPreprocessingStatusLabel(): string {
    if (!this.outlierPreprocessingVariables.length) return 'Not available';
    if (this.hasPendingOutlierChanges) {
      return `${pluralize(this.pendingOutlierChangeCount, 'change')} · not applied`;
    }
    if (Object.values(this.appliedOutlierRules).some((rule) => rule.enabled)) return 'Applied';
    return 'Optional';
  }

  get hasOutlierRulesForPreview(): boolean {
    return !!this.buildOutlierPreprocessingConfig(this.pendingOutlierRules);
  }

  get longitudinalPreprocessingStatusLabel(): string {
    if (!this.isLongitudinalModel) return 'Not available';
    if (this.pendingLongitudinalChangeCount > 0) {
      return `${pluralize(this.pendingLongitudinalChangeCount, 'change')} · not applied`;
    }
    if (this.appliedLongitudinalEnabled) return 'Applied';
    return 'Required';
  }

  get selectedFilters(): VariableRow[] {
    return this.expStudioService.selectedFilters() as VariableRow[];
  }

  get isLongitudinalModel(): boolean {
    return !!this.expStudioService.selectedDataModel()?.longitudinal;
  }

  get visitOptions(): Array<{ code: string; label: string }> {
    const visitVariable = this.findModelVariable('visitid');
    return (visitVariable?.enumerations ?? [])
      .map((item) => {
        const code = item?.code === undefined || item?.code === null ? '' : String(item.code);
        return {
          code,
          label: String(item?.label ?? item?.name ?? item?.code ?? ''),
        };
      })
      .filter((item) => item.code);
  }

  setSummaryTab(kind: SummaryKind, tab: TabKey): void {
    const summary = this.getSummary(kind);
    summary.activeTab = tab;
    this.summaryExportMenuKind.set(null);
    if (tab === 'Histogram') {
      const block = this.selectedStatisticBlock(kind);
      if (block) this.summaryHistogram.ensure(kind, block);
    }
    this.cdr.markForCheck();
  }

  filteredStatisticBlocks(kind: SummaryKind): PivotBlock[] {
    const summary = this.getSummary(kind);
    const query = this.statisticsSearch[kind].trim().toLowerCase();
    if (!query) return summary.data;
    return summary.data.filter((block) => {
      const variable = this.variableForBlock(block);
      return [
        block.name,
        variable?.code,
        variable?.label,
        variable?.name,
      ].some((value) => String(value ?? '').toLowerCase().includes(query));
    });
  }

  statisticBlocks(kind: SummaryKind, type: StatisticVariableType): PivotBlock[] {
    return this.filteredStatisticBlocks(kind).filter((block) => this.statisticBlockType(kind, block) === type);
  }

  selectStatisticBlock(kind: SummaryKind, block: PivotBlock): void {
    const summary = this.getSummary(kind);
    summary.selectedStatisticKey = statisticBlockKey(block);
    if (summary.activeTab === 'Histogram') {
      this.summaryHistogram.ensure(kind, block);
    }
  }

  selectedStatisticBlock(kind: SummaryKind): PivotBlock | null {
    const filtered = this.filteredStatisticBlocks(kind);
    if (!filtered.length) return null;
    const selectedKey = this.getSummary(kind).selectedStatisticKey;
    return filtered.find((block) => statisticBlockKey(block) === selectedKey) ?? filtered[0];
  }

  isStatisticBlockSelected(kind: SummaryKind, block: PivotBlock): boolean {
    const selected = this.selectedStatisticBlock(kind);
    return !!selected && statisticBlockKey(selected) === statisticBlockKey(block);
  }

  statisticBlockVariable(block: PivotBlock): VariableRow | null {
    return this.variableForBlock(block);
  }

  statisticBlockTypeLabel(kind: SummaryKind, block: PivotBlock): string {
    return this.statisticBlockType(kind, block) === 'numeric' ? 'Numerical' : 'Categorical';
  }

  selectedSummaryChartType(kind: SummaryKind, block: PivotBlock): 'numeric' | 'nominal' {
    return this.statisticBlockType(kind, block);
  }

  selectedSummaryChartOptions(kind: SummaryKind, block: PivotBlock): EChartsOption[] {
    const variable = this.statisticBlockVariable(block);
    if (!variable) return [];

    const summary = this.getSummary(kind);
    if (this.selectedSummaryChartType(kind, block) === 'numeric') {
      const index = summary.nonNominalVariables.findIndex((item) => item.code === variable.code);
      return index >= 0 ? summary.chartsForBoxPlot[index] ?? [] : [];
    }

    const index = summary.nominalVariables.findIndex((item) => item.code === variable.code);
    return index >= 0 ? summary.chartsForNominal[index] ?? [] : [];
  }

  selectedSummaryHistogramData(kind: SummaryKind, block: PivotBlock): HistogramPreviewData | null {
    const code = this.variableCodeForBlock(block);
    if (!code) return null;
    return this.getSummary(kind).histogramDataByVariable[this.histogramLookupKey(kind, block, code)] ?? null;
  }

  summaryHistogramLoading(kind: SummaryKind, block: PivotBlock): boolean {
    const code = this.variableCodeForBlock(block);
    if (!code) return false;
    return !!this.getSummary(kind).histogramLoadingByVariable[this.histogramLookupKey(kind, block, code)];
  }

  /** What a histogram run covers, spelled out for the loading state. The pooled
     "all datasets" rollup is a result column, not a node, so it is not counted. */
  summaryHistogramRunLabel(block: PivotBlock): string {
    return this.federatedRunLabel(block.columns.filter((column) => !this.isRollupColumn(column)).length);
  }

  /** Fan-out wording for a run that has not returned yet, read from the live scope. */
  summaryScopeRunLabel(): string {
    const excluded = this.expStudioService.excludedDatasets();
    const nodes = this.expStudioService.selectedDatasets().filter((ds) => !excluded.includes(ds)).length;
    return this.federatedRunLabel(nodes);
  }

  private federatedRunLabel(nodes: number): string {
    return `Calculated on ${nodes} dataset ${nodes === 1 ? 'node' : 'nodes'}`;
  }

  summaryHistogramError(kind: SummaryKind, block: PivotBlock): string {
    const code = this.variableCodeForBlock(block);
    if (!code) return '';
    return this.getSummary(kind).histogramErrorByVariable[this.histogramLookupKey(kind, block, code)] ?? '';
  }

  canSplitSummaryHistogram(kind: SummaryKind, block: PivotBlock): boolean {
    return this.selectedSummaryChartType(kind, block) === 'numeric';
  }

  histogramSplitOptions(block: PivotBlock): HistogramSplitOption[] {
    return buildHistogramSplitOptions({
      plottedCode: this.variableCodeForBlock(block),
      selectedVariables: this.expStudioService.selectedVariables(),
      datasetLevelCount: this.expStudioService.selectedDatasets().length,
    });
  }

  onHistogramSplitChange(kind: SummaryKind, block: PivotBlock, event: Event): void {
    const code = this.variableCodeForBlock(block);
    if (!code) return;
    const selected = (event.target as HTMLSelectElement).value;
    const option = this.histogramSplitOptions(block).find((item) => item.code === selected);
    const split = option && !option.disabled ? selected : HISTOGRAM_SPLIT_NONE;
    const summary = this.getSummary(kind);
    summary.histogramSplitByVariable = {
      ...summary.histogramSplitByVariable,
      [code]: split,
    };
    this.summaryHistogram.ensure(kind, block);
    this.cdr.markForCheck();
  }

  /** The block's split, or none once it is no longer offered or enabled. */
  histogramSplitValue(kind: SummaryKind, block: PivotBlock): string {
    if (!this.canSplitSummaryHistogram(kind, block)) return HISTOGRAM_SPLIT_NONE;
    const code = this.variableCodeForBlock(block);
    if (!code) return HISTOGRAM_SPLIT_NONE;
    const split = this.getSummary(kind).histogramSplitByVariable[code] ?? HISTOGRAM_SPLIT_NONE;
    if (!split) return HISTOGRAM_SPLIT_NONE;
    const option = this.histogramSplitOptions(block).find((item) => item.code === split);
    return option && !option.disabled ? split : HISTOGRAM_SPLIT_NONE;
  }

  private histogramLookupKey(kind: SummaryKind, block: PivotBlock, code: string): string {
    return histogramCacheKey(code, this.histogramSplitValue(kind, block));
  }

  goToSection(section: SectionKey): void {
    const filtersStation = section === 'filters' || section === 'raw';
    const setupStation = section === 'setup' || section === 'processed';
    const previewFilters = section === 'raw';
    const previewSetup = section === 'processed';
    if (filtersStation) {
      this.addedSteps.update((s) => ({ ...s, filters: true }));
    }
    if (setupStation) {
      this.addedSteps.update((s) => ({ ...s, setup: true }));
    }
    if (section === 'transformation') {
      this.addedSteps.update((s) => ({ ...s, transformation: true }));
    }
    this.summaryExpanded.set({
      filters: previewFilters,
      setup: previewSetup,
    });
    this.sectionOpen.set({
      source: section === 'source',
      filters: filtersStation && !previewFilters,
      raw: previewFilters,
      setup: setupStation && !previewSetup,
      processed: previewSetup,
      transformation: section === 'transformation',
    });
    if (section === 'raw') {
      // The Raw summary must show the cohort it claims to: the stored rules, or the
      // unsaved ones a Cohort Filtering preview pinned to it.
      this.ensureRawSummary();
    }
    if (section === 'processed') {
      // Pipeline consistency: the processed preview always mirrors the current
      // pipeline state (cohort filter + configured preprocessing, pending edits
      // included), not just the last persisted snapshot.
      this.fetchProcessedPreview();
    }
    this.cdr.markForCheck();
    this.requestSectionScroll(section);
  }

  /**
   * Scrolling is a request, not a call: the section is measured only after the template
   * has reacted to whatever just opened or closed. Shared by goToSection and the stations'
   * Close action, which folds an editor away and must not leave the viewport stranded.
   */
  private requestSectionScroll(section: SectionKey): void {
    this.scrollSectionRequest.set({ section, requestId: ++this.scrollRequestId });
  }

  /**
   * Step 0 is a read: it shows the selection as stored and can never write the
   * experiment request, so it toggles a section instead of adding a stage.
   */
  toggleSourcePreview(): void {
    if (this.sectionOpen().source) {
      this.collapseAllWorkflowSections();
      this.cdr.markForCheck();
      return;
    }
    this.goToSection('source');
    this.ensureSourceSummary();
  }

  /**
   * The snapshot's own cache key: the variable and dataset scope it describes. The
   * shared `selectionKey` also folds in the cohort filter and the applied preprocessing,
   * neither of which this request carries, so keying on it would refetch an identical
   * snapshot on every committed filter rule while the preview happens to be open.
   */
  private get sourceScopeKey(): string {
    return JSON.stringify({
      variables: this.preprocessingVariables.map((variable) => variable.code).sort(),
      datasets: this.expStudioService.selectedDatasets(),
    });
  }

  /** The snapshot follows the selection, so reopening it after a change refetches. */
  ensureSourceSummary(): void {
    if (this.sourceSummaryKey === this.sourceScopeKey && !this.sourceSummary.isLoading) return;
    this.fetchSourceSummary();
  }

  /**
   * The same describe run that feeds the Raw summary with the cohort filter and
   * the preprocessing steps left off. It fills a `SummaryView`, so step 0 reuses
   * the shared summary workspace - browser, statistics, charts, histograms,
   * export - instead of a second presentation of its own.
   */
  fetchSourceSummary(): void {
    const variableCodes = this.preprocessingVariables.map((item) => item.code);
    const hasScope = !!this.expStudioService.selectedDataModel() && this.expStudioService.selectedDatasets().length > 0;
    if (!hasScope || !variableCodes.length) {
      this.sourceSummary = emptySummaryView(false);
      this.sourceSummaryKey = '';
      this.cdr.markForCheck();
      return;
    }

    const requestedKey = this.sourceScopeKey;
    const requestSeq = ++this.sourceDescribeSeq;
    this.sourceSummary = { ...this.sourceSummary, isLoading: true, histogramSettledByVariable: {} };
    this.cdr.markForCheck();

    // No filter payload, no preprocessing steps: the data exactly as selected.
    this.clearSourcePreviewSubscription();
    this.sourcePreviewSubscription = this.expStudioService
      .loadDescriptiveOverview(variableCodes, null, null, null)
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (response) => {
          if (requestSeq !== this.sourceDescribeSeq) return;
          this.clearSourcePreviewSubscription();
          this.sourceSummary = this.buildSummaryFromResponse(response, 'source');
          this.sourceSummaryKey = requestedKey;
          this.summaryHistogram.refreshActive('source');
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (requestSeq !== this.sourceDescribeSeq) return;
          this.clearSourcePreviewSubscription();
          console.error(err);
          this.sourceSummary = { ...this.sourceSummary, isLoading: false };
          this.cdr.markForCheck();
        },
      });
  }

  /** Heading and aria text, so one summary template reads correctly for all three kinds. */
  summaryKindLabel(kind: SummaryKind): string {
    return kind === 'source' ? 'Source data' : kind === 'raw' ? 'Raw data' : 'Processed data';
  }

  /** Anchor name for one slot of the shared summary template; see `SUMMARY_GUIDE_ANCHORS`. */
  summaryGuideAnchor(kind: SummaryKind, anchor: SummaryAnchorKey): string | null {
    return SUMMARY_GUIDE_ANCHORS[kind][anchor];
  }

  /** Close on a data preview returns to the station editor (filters or preprocessing). */
  toggleSummaryWorkspace(kind: SummaryKind): void {
    if (kind === 'raw') {
      this.goToSection(this.sectionOpen().raw ? 'filters' : 'raw');
      return;
    }
    this.updatePreprocessingStatus();
    this.goToSection(this.sectionOpen().processed ? 'setup' : 'processed');
  }

  collapseAllWorkflowSections(): void {
    this.sectionOpen.set({
      source: false,
      raw: false,
      setup: false,
      filters: false,
      processed: false,
      transformation: false,
    });
    this.cdr.markForCheck();
  }

  togglePreprocessingStep(step: 'missing' | 'outlier' | 'longitudinal' | 'transformation'): void {
    this.preprocessingStepOpen[step] = !this.preprocessingStepOpen[step];
  }

  /** "How this works" disclosures, moved from the body summary into the card header. */
  readonly preprocessingDocOpen = signal<Record<'missing' | 'outlier' | 'longitudinal', boolean>>({
    missing: false,
    outlier: false,
    longitudinal: false,
  });

  togglePreprocessingDoc(step: 'missing' | 'outlier' | 'longitudinal'): void {
    this.preprocessingDocOpen.update((open) => ({ ...open, [step]: !open[step] }));
    this.cdr.markForCheck();
  }

  /** Maps a station status label onto the shared chip states (Default / Pending / Applied). */
  statusTone(label: string, pending = false): StationStatus {
    if (pending) return 'pending';
    return label === 'Applied' ? 'applied' : 'default';
  }

  /**
   * Persist live category-filter builders onto every rule (across all cards, or only
   * `only`'s) without touching cohort filters. A rule is rewritten only when its builder
   * can speak for it: a builder that rejects its own half-typed condition, or that could
   * not read what the store holds, leaves that rule as it is rather than exporting an
   * empty filter and erasing a configured category.
   */
  commitTransformationRuleFilters(only?: TransformationColumnDraft): void {
    for (const draft of this.transformationDrafts) {
      if (only && draft !== only) continue;
      for (const rule of draft.rules) {
        const builder = this.ruleBuilders.get(rule);
        if (!builder) continue;
        const logic = builder.exportFilterLogic();
        // Keep walking the remaining cards: one broken builder must not stop the
        // others from committing what they hold. The builder renders its own error.
        if (builder.filterError()) continue;
        rule.filter = logic;
      }
    }
    this.onTransformationChange();
  }

  /** The K-means card's Preview: cluster counts, shown in place of its editor. */
  previewTransformationCard(stepId?: string): void {
    this.previewDraftId = stepId
      ?? this.cards().find((step) => step.name === 'kmeans_cluster_creator')?.id
      ?? null;
    this.transformationStats.refresh();
    this.cdr.markForCheck();
  }

  closeTransformationPreview(): void {
    this.previewDraftId = null;
    this.cdr.markForCheck();
  }

  toggleTransformationPreview(): void {
    if (this.previewDraftId) this.closeTransformationPreview();
    else this.previewTransformationCard();
  }

  /** A card's own Apply/Close: commit its rule builders, then fold it once it is settled.
   *  Valid cards are persisted as they are typed, so this never writes other cards. */
  commitTransformationDraft(draft: TransformationColumnDraft): void {
    this.commitTransformationRuleFilters(draft);
    // An untouched category row (no name, no rule) is dropped, not left to block Apply.
    for (let index = draft.rules.length - 1; index >= 0; index--) {
      const rule = draft.rules[index];
      if (!rule.value.trim() && !rule.filter) this.removeTransformationRule(draft, index);
    }
    if (!this.transformationDraftState.hasNewWork(draft)) draft.open = false;
    this.cdr.markForCheck();
  }

  /** Clear the transformation station: pending edits and the committed config alike. */
  resetTransformation(): void {
    this.transformationDraftState.reset();
    this.previewDraftId = null;
    this.transformationStats.clear();
    this.transformationStats.invalidate();
    this.emitProgressState();
    this.cdr.markForCheck();
  }

  /** A new category opens straight onto its filter, with the first condition ready. */
  addTransformationRule(draft: TransformationColumnDraft): void {
    const index = this.transformationDraftState.addRule(draft);
    this.onTransformationChange();
    this.cdr.detectChanges();
    this.ruleBuilderAt(draft, index)?.ensureFirstCondition();
  }

  private ruleBuilderAt(draft: TransformationColumnDraft, index: number): RuleBuilder | undefined {
    const rule = draft.rules[index];
    return rule ? this.ruleBuilders.get(rule) : undefined;
  }

  /**
   * Done on the rule being edited: save what its builder holds and fold back to the
   * category list. A builder with an error stays open and shows its own message.
   */
  finishTransformationRule(draft: TransformationColumnDraft, index: number): void {
    const modal = this.ruleBuilderAt(draft, index);
    if (modal) {
      const logic = modal.exportFilterLogic();
      if (modal.filterError()) {
        this.cdr.markForCheck();
        return;
      }
      draft.rules[index].filter = logic;
    }
    draft.openRuleIndex = null;
    this.onTransformationChange();
    this.transformationStats.countsDraftId.set(draft.id);
    this.transformationStats.refresh();
  }

  removeTransformationRule(draft: TransformationColumnDraft, index: number): void {
    this.transformationDraftState.removeRule(draft, index);
    this.onTransformationChange();
  }

  toggleTransformationRule(draft: TransformationColumnDraft, index: number): void {
    draft.openRuleIndex = draft.openRuleIndex === index ? null : index;
    this.cdr.markForCheck();
  }

  /** A one-line rule summary for the collapsed row. */
  transformationRuleSummary(rule: TransformationRule): string {
    const condition = firstFilterCondition(rule.filter);
    return condition ? this.filterConditionSentence(condition) : 'No rule yet';
  }

  /** `Age is at least 60`: one condition in words, labelled from the selected variables. */
  private filterConditionSentence(condition: { field: string; operator: string; value: unknown }): string {
    const variable = this.expStudioService.selectedVariables()
      .find((item) => String(item?.code ?? '') === condition.field);
    const label = String(variable?.label ?? variable?.name ?? condition.field);
    const enumLabel = (code: string) =>
      variable?.enumerations?.find((item: { code?: unknown }) => String(item?.code) === code)?.label || code;
    const values = (Array.isArray(condition.value) ? condition.value : [condition.value ?? ''])
      .map((value) => enumLabel(String(value)))
      .join(', ');
    const phrase = filterOperatorPhrase(condition.operator);
    return values ? `${label} ${phrase} ${values}` : `${label} ${phrase}`;
  }

  toggleTransformationDraft(draft: TransformationColumnDraft): void {
    draft.open = !draft.open;
    this.cdr.markForCheck();
  }

  /**
   * Remove a store step (and its categorical draft). Disabled while dependents remain —
   * callers should check `canRemoveTransformation` first.
   */
  removeTransformationDraft(id: string): void {
    if (!this.transformationDraftState.remove(id)) return;
    this.transformationStats.invalidate();
    this.emitProgressState();
    this.cdr.markForCheck();
  }

  onTransformationInput(): void {
    this.onTransformationChange();
  }

  preprocessingStepDocumentation(stepName: string): string {
    const algorithms = Object.values(this.expStudioService.backendAlgorithms?.() ?? {}) as Array<{
      preprocessing?: Array<{ name: string; documentation?: string }>;
    }>;
    const step = algorithms
      .flatMap((algorithm) => algorithm.preprocessing ?? [])
      .find((candidate) => candidate.name === stepName);
    return step?.documentation?.trim() ?? '';
  }

  formatPreprocessingDocumentationHtml(stepName: string): string {
    return buildPreprocessingDocumentationHtml(this.preprocessingStepDocumentation(stepName));
  }


  // ── Preprocessing evidence ────────────────────────────────────────────────
  // A preprocessing form states a decision but never priced it. These read the
  // descriptive stats already loaded for the Raw summary, so "Remove rows" can
  // say how many rows it removes. Every helper returns null/empty when the
  // stats have not arrived; the editor then shows no evidence at all rather
  // than an estimate — an unpriced decision is honest, a made-up price is not.
  summaryBlockFor(variable: VariableRow): PivotBlock | null {
    return this.rawSummary.data.find((block) => this.variableCodeForBlock(block) === variable.code) ?? null;
  }

  coverageFor(variable: VariableRow): Coverage | null {
    return blockCoverage(this.summaryBlockFor(variable));
  }

  /** Both rails price a variable the same way; coverageFor() is the variable-based entry. */
  blockCoverage(block: PivotBlock | null | undefined): Coverage | null {
    return blockCoverage(block);
  }

  displayNumber(value: string | undefined | null): string {
    return displayNumber(value);
  }

  missingShareNote(block: PivotBlock, row: PivotBlock['rows'][number], dataset: string): string | null {
    return missingShareNote(block, row, dataset);
  }

  /** The rail's foot: coverage re-pooled over every variable currently shown. */
  selectionCoverage(kind: SummaryKind): PooledCoverage | null {
    return pooledCoverage(this.filteredStatisticBlocks(kind));
  }

  /** The pooled column is a rollup, not another dataset. Normalised through the
   *  same label lookup the header uses, because the pivot columns are already
   *  labelled and the header labels them again — this holds either way. */
  isRollupColumn(column: string): boolean {
    return this.datasetLabel(column) === this.datasetLabel('all datasets');
  }

  metricGroupLabel(rows: PivotBlock['rows'], index: number): string | null {
    return metricGroupLabel(rows, index);
  }

  coveragePercent(coverage: { share: number }): string {
    return coveragePercent(coverage);
  }

  barWidth(share: unknown, scale: number): number {
    return barWidth(share, scale);
  }

  coverageTitle(coverage: { total: number; missing: number }): string {
    return coverageTitle(coverage);
  }

  /** An unpriced decision must say why it is unpriced, not render blank.
     Shared by both preprocessing evidence panes. */
  summaryUnavailableNote(): string {
    return this.rawSummary.isLoading
      ? 'Loading dataset statistics\u2026'
      : 'No dataset statistics are available for this variable, so neither the distribution nor the row cost can be shown.';
  }

  coverageSeverity(coverage: { share: number }): 'none' | 'warning' | 'high' {
    return coverageSeverity(coverage);
  }

  distributionFor(variable: VariableRow): DistributionPoint[] {
    return blockDistribution(this.summaryBlockFor(variable));
  }

  categoryCountsFor(variable: VariableRow, limit = 6): CategoryShare[] {
    return this.isCategoricalVariable(variable) ? categoryShares(this.summaryBlockFor(variable), limit) : [];
  }

  /** The selected missing-value action restated in rows, so it can be judged. */
  missingActionConsequence(variable: VariableRow): string | null {
    const coverage = this.coverageFor(variable);
    if (!coverage) return null;
    const total = coverage.total.toLocaleString();
    const missing = coverage.missing.toLocaleString();
    const share = this.coveragePercent(coverage);
    const action = this.ruleFor(variable).action;
    if (action === 'drop') {
      return coverage.missing > 0
        ? `Drops up to ${missing} of ${total} rows (${share}).`
        : `No missing values, so no rows are dropped.`;
    }
    if (action === 'no_action') return `${missing} of ${total} values (${share}) stay missing.`;
    const fill = action === 'constant' ? 'a fixed value' : `the ${action}`;
    return `Fills ${missing} of ${total} values (${share}) with ${fill}. Rows kept.`;
  }

  /**
   * What each preprocessing card does for a scoped Apply / Discard. A scope of 'all' runs
   * every card's op in this order, so a new card is added here and nowhere else.
   */
  private readonly prepStepOps: Record<PrepStep, {
    pending: () => number;
    validate: () => Record<string, string>;
    commit: () => void;
    reset: () => void;
  }> = {
    missing: {
      pending: () => this.pendingMissingChangeCount,
      validate: () => this.validatePendingMissingRules(),
      commit: () => {
        this.appliedPreprocessingRules = this.mergeRulesForCurrentSelection(
          this.appliedPreprocessingRules,
          this.pendingPreprocessingRules
        );
      },
      reset: () => {
        this.pendingPreprocessingRules = this.mergeRulesForCurrentSelection(
          this.pendingPreprocessingRules,
          this.appliedPreprocessingRules
        );
      },
    },
    outlier: {
      pending: () => this.pendingOutlierChangeCount,
      validate: () => this.validatePendingOutlierRules(),
      commit: () => {
        this.appliedOutlierRules = this.mergeOutlierRulesForCurrentSelection(
          this.appliedOutlierRules,
          this.pendingOutlierRules
        );
      },
      reset: () => {
        this.pendingOutlierRules = this.mergeOutlierRulesForCurrentSelection(
          this.pendingOutlierRules,
          this.appliedOutlierRules
        );
      },
    },
    longitudinal: {
      pending: () => this.pendingLongitudinalChangeCount,
      validate: () => this.validatePendingLongitudinalRules(),
      commit: () => {
        this.appliedLongitudinalEnabled = this.isLongitudinalModel;
        this.appliedLongitudinalVisit1 = this.longitudinalVisit1;
        this.appliedLongitudinalVisit2 = this.longitudinalVisit2;
        this.appliedLongitudinalStrategies = { ...this.pendingLongitudinalStrategies };
      },
      reset: () => {
        this.longitudinalVisit1 = this.appliedLongitudinalVisit1;
        this.longitudinalVisit2 = this.appliedLongitudinalVisit2;
        this.pendingLongitudinalStrategies = { ...this.appliedLongitudinalStrategies };
        this.ensureLongitudinalDefaults();
      },
    },
  };

  private stepsIn(scope: PrepStep | 'all'): PrepStep[] {
    return scope === 'all' ? ['missing', 'outlier', 'longitudinal'] : [scope];
  }

  /** Pending edits of one preprocessing card; the stage count sums these. */
  stepPendingCount(step: PrepStep): number {
    return this.prepStepOps[step].pending();
  }

  stepApplyLabel(step: PrepStep): string {
    if (this.isApplyingPreprocessing) return 'Applying…';
    return this.stepPendingCount(step) > 0 ? 'Apply' : 'Close';
  }

  /** Card footer primary: apply only this card's edits, or fold the card when it has none. */
  commitOrCloseStep(step: PrepStep): void {
    if (this.stepPendingCount(step) > 0) {
      this.applyPreprocessing(step);
      return;
    }
    this.preprocessingStepOpen[step] = false;
    this.cdr.markForCheck();
  }

  /** Choice-card effect line. Empty when the summary has not loaded: the label alone
   *  is still better than the old select. */
  missingActionEffect(variable: VariableRow, action: MissingAction): string {
    const coverage = this.coverageFor(variable);
    if (!coverage) return '';
    const n = coverage.missing.toLocaleString();
    switch (action) {
      case 'drop':
        return `Removes ${n} records (${this.coveragePercent(coverage)}) from the run`;
      case 'mean':
      case 'median': {
        const value = this.distributionMapValue(variable, action);
        return `Fills ${n} values with the ${action}${value ? `, ${value}` : ''}`;
      }
      case 'constant':
        return `Fills ${n} values with a value you set`;
      default:
        return '';
    }
  }

  distributionMapValue(variable: VariableRow, label: string): string {
    return this.distributionFor(variable)
      .find((point) => point.label.toLowerCase() === label.toLowerCase())?.value ?? '';
  }

  /** Per-dataset coverage for the missing-values evidence tiles, minus the rollup column. */
  coverageByDataset(variable: VariableRow): DatasetCoverage[] {
    return coverageByDataset(this.summaryBlockFor(variable), (code) => this.datasetLabel(code));
  }

  ruleFor(variable: VariableRow): PreprocessingRule {
    return this.preprocessingState.missingRule(variable.code);
  }

  onMissingActionChange(variable: VariableRow, action: MissingAction): void {
    const next = { ...this.ruleFor(variable), action };
    next.enabled = true;
    if (action !== 'constant') next.value = '';
    if (action === 'constant' && this.isCategoricalVariable(variable)) {
      const enumValues = this.enumOptions(variable).map((item) => item.code);
      if (!enumValues.includes(next.value)) next.value = '';
    }
    this.pendingPreprocessingRules = {
      ...this.pendingPreprocessingRules,
      [variable.code]: next,
    };
    this.preprocessingValidationErrors = {
      ...this.preprocessingValidationErrors,
      [variable.code]: '',
    };
    this.updatePreprocessingStatus();
    this.emitProgressState();
  }

  onMissingValueChange(variable: VariableRow, value: string): void {
    this.pendingPreprocessingRules = {
      ...this.pendingPreprocessingRules,
      [variable.code]: { ...this.ruleFor(variable), value },
    };
    this.updatePreprocessingStatus();
    this.emitProgressState();
  }

  onLongitudinalVisitChange(which: 'visit1' | 'visit2', value: string): void {
    if (which === 'visit1') this.longitudinalVisit1 = value;
    else this.longitudinalVisit2 = value;
    this.updatePreprocessingStatus();
    this.emitProgressState();
  }

  onLongitudinalStrategyChange(variable: VariableRow, strategy: LongitudinalStrategy): void {
    this.pendingLongitudinalStrategies = {
      ...this.pendingLongitudinalStrategies,
      [variable.code]: strategy,
    };
    this.updatePreprocessingStatus();
    this.emitProgressState();
  }

  outlierStrategyDisplay(strategy: OutlierStrategy): string {
    return this.outlierStrategies.find((item) => item.value === strategy)?.label ?? strategy;
  }

  outlierTailDisplay(tail: OutlierTail): string {
    if (tail === 'left') return 'Low only';
    if (tail === 'right') return 'High only';
    return 'Both';
  }

  outlierFoldDisplay(strategy: OutlierStrategy): string {
    switch (strategy) {
      case 'gaussian': return '× std. dev.';
      case 'iqr': return '× IQR';
      case 'mad': return '× MAD';
      case 'quantile': return 'Quantile';
    }
  }

  outlierRuleSummary(variable: VariableRow): string {
    const rule = this.outlierRuleFor(variable);
    if (!rule.enabled) return 'Off';
    return `${this.outlierStrategyDisplay(rule.strategy)} × ${rule.fold ?? '—'} · ${this.outlierTailDisplay(rule.tail)}`;
  }

  outlierPreviewRowsFor(variable: VariableRow): OutlierPreviewRow[] {
    const label = this.variableLabel(variable);
    return this.outlierPreviewRows.filter((row) => row.variable === label || row.variable === variable.code);
  }

  outlierBoundsView(variable: VariableRow): OutlierBoundsView | null {
    return outlierBoundsView(
      outlierDistributionNumbers(this.distributionFor(variable)),
      this.outlierRuleFor(variable),
      this.outlierPreviewRowsFor(variable)
    );
  }

  outlierRuleFor(variable: VariableRow): OutlierRule {
    return this.preprocessingState.outlierRule(variable.code);
  }

  onOutlierEnabledChange(variable: VariableRow, enabled: boolean): void {
    const existing = this.outlierRuleFor(variable);
    this.pendingOutlierRules = {
      ...this.pendingOutlierRules,
      [variable.code]: { ...existing, enabled },
    };
    this.outlierValidationErrors = {
      ...this.outlierValidationErrors,
      [variable.code]: '',
    };
    this.updatePreprocessingStatus();
    this.emitProgressState();
  }

  onOutlierStrategyChange(variable: VariableRow, strategy: OutlierStrategy): void {
    const existing = this.outlierRuleFor(variable);
    this.pendingOutlierRules = {
      ...this.pendingOutlierRules,
      [variable.code]: {
        ...existing,
        enabled: true,
        strategy,
        fold: defaultFoldForStrategy(strategy),
      },
    };
    this.outlierValidationErrors = {
      ...this.outlierValidationErrors,
      [variable.code]: '',
    };
    this.updatePreprocessingStatus();
    this.emitProgressState();
  }

  onOutlierTailChange(variable: VariableRow, tail: OutlierTail): void {
    const existing = this.outlierRuleFor(variable);
    this.pendingOutlierRules = {
      ...this.pendingOutlierRules,
      [variable.code]: { ...existing, enabled: true, tail },
    };
    this.updatePreprocessingStatus();
    this.emitProgressState();
  }

  onOutlierFoldChange(variable: VariableRow, rawValue: string | number): void {
    const existing = this.outlierRuleFor(variable);
    const value = String(rawValue ?? '').trim();
    const fold = value === '' ? null : Number(value);
    const next: OutlierRule = {
      ...existing,
      enabled: true,
      fold: typeof fold === 'number' && Number.isFinite(fold) ? fold : null,
    };
    this.pendingOutlierRules = {
      ...this.pendingOutlierRules,
      [variable.code]: next,
    };
    this.outlierValidationErrors = {
      ...this.outlierValidationErrors,
      [variable.code]: validateOutlierRule(next) ?? '',
    };
    this.updatePreprocessingStatus();
    this.emitProgressState();
  }

  batchMenuOpen = signal<'missing' | 'outlier' | null>(null);
  summaryExportMenuKind = signal<SummaryKind | null>(null);

  toggleBatchMenu(kind: 'missing' | 'outlier'): void {
    this.batchMenuOpen.update((open) => (open === kind ? null : kind));
    this.cdr.markForCheck();
  }

  toggleSummaryExportMenu(kind: SummaryKind): void {
    this.summaryExportMenuKind.update((open) => (open === kind ? null : kind));
    this.cdr.markForCheck();
  }

  closeBatchMenuOnOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (
      this.batchMenuOpen() !== null
      && !(target instanceof Element && target.closest('.batch-menu'))
    ) {
      this.batchMenuOpen.set(null);
      this.cdr.markForCheck();
    }
    if (
      this.summaryExportMenuKind() !== null
      && !(target instanceof Element && target.closest('.summary-export-group'))
    ) {
      this.summaryExportMenuKind.set(null);
      this.cdr.markForCheck();
    }
  }

  applyBatchMissingStrategy(strategy: 'drop' | 'mean' | 'median'): void {
    const variables =
      strategy === 'drop'
        ? this.preprocessingVariables
        : this.preprocessingVariables.filter((variable) => this.isNumericVariable(variable));
    variables.forEach((variable) => this.onMissingActionChange(variable, strategy));
    this.batchMenuOpen.set(null);
    this.cdr.markForCheck();
  }

  toggleAllOutliers(enabled: boolean): void {
    this.outlierPreprocessingVariables.forEach((variable) => this.onOutlierEnabledChange(variable, enabled));
    this.batchMenuOpen.set(null);
    this.cdr.markForCheck();
  }

  outlierRuleError(variable: VariableRow): string {
    const rule = this.outlierRuleFor(variable);
    return this.outlierValidationErrors[variable.code] || validateOutlierRule(rule) || '';
  }

  longitudinalStrategyFor(variable: VariableRow): LongitudinalStrategy {
    if (!this.pendingLongitudinalStrategies[variable.code]) {
      this.pendingLongitudinalStrategies[variable.code] = this.defaultLongitudinalStrategy(variable);
    }
    return this.pendingLongitudinalStrategies[variable.code];
  }

  isMissingActionDisabled(variable: VariableRow, action: MissingAction): boolean {
    return (action === 'mean' || action === 'median') && !this.isNumericVariable(variable);
  }

  isLongitudinalStrategyDisabled(variable: VariableRow, strategy: LongitudinalStrategy): boolean {
    return strategy === 'diff' && !this.isNumericVariable(variable);
  }

  /** Discard pending edits: one card's (its footer) or every card's (leaving the stage). */
  resetChanges(scope: PrepStep | 'all' = 'all'): void {
    this.stepsIn(scope).forEach((step) => this.prepStepOps[step].reset());
    this.preprocessingApplyError = {};
    this.preprocessingValidationErrors = {};
    this.outlierValidationErrors = {};
    this.updatePreprocessingStatus();
    this.emitProgressState();
    this.cdr.markForCheck();
  }

  previewOutlierReport(): void {
    this.ensureDefaultRulesForCurrentSelection();
    this.ensureOutlierDefaultsForCurrentSelection();
    if (
      this.reportPendingValidationErrors({
        ...this.validatePendingMissingRules(),
        ...this.validatePendingOutlierRules(),
      })
    ) {
      this.outlierPreviewRows = [];
      this.outlierPreviewError = 'Fix the outlier preprocessing rules before previewing.';
      return;
    }

    const outlierParameters = this.buildOutlierPreprocessingConfig(this.pendingOutlierRules);
    if (!outlierParameters) {
      this.outlierPreviewRows = [];
      this.outlierPreviewError = 'Enable at least one outlier rule before previewing.';
      this.cdr.markForCheck();
      return;
    }

    const variableCodes = Object.keys((outlierParameters['strategies'] as Record<string, string>) ?? {});
    const missingValuesHandler = this.buildMissingPreprocessingConfig(
      this.pendingPreprocessingRules,
      new Set(variableCodes)
    );
    const preprocessing = missingValuesHandler
      ? { missing_values_handler: missingValuesHandler }
      : null;

    this.isLoadingOutlierPreview = true;
    this.outlierPreviewRows = [];
    this.outlierPreviewError = '';
    this.preprocessingValidationErrors = {};
    this.outlierValidationErrors = {};
    this.cdr.markForCheck();

    this.expStudioService.loadOutlierReportPreview(variableCodes, outlierParameters, preprocessing).subscribe({
      next: (response) => {
        this.outlierPreviewRows = this.buildOutlierPreviewRows(response);
        this.outlierPreviewError = this.outlierPreviewRows.length
          ? ''
          : 'No outlier report rows were returned for the enabled rules.';
        this.isLoadingOutlierPreview = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.outlierPreviewRows = [];
        this.outlierPreviewError = 'Outlier report preview failed.';
        this.isLoadingOutlierPreview = false;
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Fold the station: editor and processed workspace both close, nothing is reverted.
   * Used by Close (nothing to commit) and by Apply once the describe has landed.
   * The node keeps its rail of applied sub-steps, and that rail is the way back into the editor.
   */
  private foldPreprocessingStation(): void {
    this.sectionOpen.update((open) => ({ ...open, setup: false, processed: false }));
    this.cdr.markForCheck();
    this.requestSectionScroll('setup');
  }

  /**
   * The Preprocessing station's "Preview data" action: describe the processed cohort
   * under the current (pending) config without writing it into the request. It fills
   * the shared processed SummaryView, so the preview shows data instead of an empty
   * card; Apply remains the only path that persists the config.
   */
  previewProcessedData(scope: PrepStep | 'all' = 'all'): void {
    this.ensureDefaultRulesForCurrentSelection();
    this.ensureOutlierDefaultsForCurrentSelection();
    this.ensureLongitudinalDefaults();
    if (this.reportPendingValidationErrors(this.validatePendingRulesFor(scope), scope)) return;
    this.processedPreviewScope = scope;
    // Navigating to the processed section performs the transient describe;
    // it must not run twice for one click.
    this.goToSection('processed');
  }

  /**
   * Transient processed describe for the pending config. It shares the processed
   * summary's cache key with the applied fetch, so an Apply (or an applied refresh)
   * with identical inputs reuses the data instead of refetching.
   */
  private fetchProcessedPreview(): void {
    const scope = this.processedPreviewScope;
    this.processedPreviewScope = 'all';
    if (Object.keys(this.validatePendingRulesFor(scope)).length > 0) return;
    const variableCodes = this.preprocessingVariables.map((variable) => variable.code);
    const hasScope =
      !!this.expStudioService.selectedDataModel() && this.expStudioService.selectedDatasets().length > 0;
    if (!hasScope || !variableCodes.length) {
      this.clearProcessedPreviewSubscription();
      this.processedSummary = emptySummaryView(false);
      this.processedSummaryKey = '';
      this.cdr.markForCheck();
      return;
    }
    const preprocessing = scope === 'all'
      ? this.buildPreprocessingConfig(this.pendingPreprocessingRules, this.currentPreprocessingCodeSet())
      : this.buildScopedPreprocessingConfig(scope);
    const nextKey = this.buildProcessedSummaryKey(variableCodes, preprocessing ?? {});
    // The key is claimed before the request goes out, so an in-flight or already
    // settled fetch for the same config answers this call; re-requesting it would
    // both spend a second federated describe and supersede the pending response.
    if (nextKey === this.processedSummaryKey) return;
    const previous = this.processedSummary;
    const requestSeq = ++this.processedDescribeSeq;
    this.clearProcessedPreviewSubscription();
    this.processedSummaryKey = nextKey;
    this.processedSummary = {
      ...emptySummaryView(true),
      activeTab: previous.activeTab,
      selectedStatisticKey: previous.selectedStatisticKey,
      histogramSplitByVariable: previous.histogramSplitByVariable,
    };
    this.cdr.markForCheck();
    this.processedPreviewSubscription = this.expStudioService
      .loadDescriptiveOverview(variableCodes, preprocessing)
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (response) => {
          if (requestSeq !== this.processedDescribeSeq) return;
          this.clearProcessedPreviewSubscription();
          this.processedSummary = this.buildSummaryFromResponse(response, 'processed');
          this.summaryHistogram.refreshActive('processed');
          this.emitProgressState();
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (requestSeq !== this.processedDescribeSeq) return;
          this.clearProcessedPreviewSubscription();
          console.error(err);
          // Drop the claimed key so reopening the preview retries instead of
          // trusting a summary that never arrived.
          this.processedSummaryKey = '';
          this.processedSummary = emptySummaryView(false);
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Apply pending edits: every card's (Apply & Continue) or one card's (its footer). A
   * scoped apply writes that card's pending rules over the applied rest, leaves the other
   * cards' edits pending, and folds only its own card.
   */
  applyPreprocessing(scope: PrepStep | 'all' = 'all'): void {
    this.ensureDefaultRulesForCurrentSelection();
    this.ensureOutlierDefaultsForCurrentSelection();
    this.ensureLongitudinalDefaults();
    if (this.stepsIn(scope).every((step) => this.stepPendingCount(step) === 0)) return;
    this.preprocessingApplyError = {};
    if (this.reportPendingValidationErrors(this.validatePendingRulesFor(scope))) return;
    this.clearOutlierPreview();

    const currentCodes = this.currentPreprocessingCodeSet();
    const preprocessing = scope === 'all'
      ? this.buildPreprocessingConfig(this.pendingPreprocessingRules, currentCodes)
      : this.buildScopedPreprocessingConfig(scope);
    if (!preprocessing) {
      this.commitPendingToApplied(scope);
      this.processedSummary = emptySummaryView(false);
      this.persistAppliedDescriptivePreprocessing(
        this.buildPreprocessingConfig(this.appliedPreprocessingRules)
      );
      this.preprocessingStatus = this.pendingChangeCount > 0
        ? 'pending'
        : this.buildPreprocessingConfig(this.appliedPreprocessingRules) ? 'applied' : 'none';
      if (scope !== 'all') this.preprocessingStepOpen[scope] = false;
      this.sectionOpen.update((open) => ({ ...open, processed: false }));
      this.emitProgressState();
      this.cdr.markForCheck();
      return;
    }

    const variableCodes = this.preprocessingVariables.map((variable) => variable.code);
    const requestSeq = ++this.processedDescribeSeq;
    this.isApplyingPreprocessing = true;
    this.clearProcessedPreviewSubscription();
    this.processedSummary = emptySummaryView(true);
    // Claim the summary key up front so the navigate-to-preview fetch is
    // deduped against the apply request below (identical payload).
    this.processedSummaryKey = this.buildProcessedSummaryKey(variableCodes, preprocessing);
    if (scope === 'all') {
      this.summaryExpanded.update((expanded) => ({ ...expanded, setup: true }));
      this.goToSection('processed');
    }
    this.preprocessingValidationErrors = {};
    this.outlierValidationErrors = {};
    this.cdr.markForCheck();

    this.processedPreviewSubscription = this.expStudioService
      .loadDescriptiveOverview(variableCodes, preprocessing)
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (response) => {
          if (requestSeq !== this.processedDescribeSeq) return;
          this.clearProcessedPreviewSubscription();
          this.processedSummary = this.buildSummaryFromResponse(response, 'processed');
          this.processedSummaryKey = this.buildProcessedSummaryKey(variableCodes, preprocessing);
          this.commitPendingToApplied(scope);
          // The describe above included the other cards' applied rules (and implicit
          // defaults). Save only what is actually applied, so those defaults are not
          // stored as an explicit missing-values handler.
          this.persistAppliedDescriptivePreprocessing(
            this.buildPreprocessingConfig(this.appliedPreprocessingRules)
          );
          this.preprocessingState.userApplied = true;
          this.preprocessingStatus = this.pendingChangeCount > 0 ? 'pending' : 'applied';
          this.isApplyingPreprocessing = false;
          this.summaryHistogram.refreshActive('processed');
          this.emitProgressState();
          // Apply saves and closes: fold the card (or, for Apply & Continue, the station),
          // and do not open the next one. The summary just computed stays reachable
          // through Preview; moving on belongs to "Continue to Algorithm Selection".
          if (scope === 'all') this.foldPreprocessingStation();
          else this.preprocessingStepOpen[scope] = false;
          if (this.continueAfterApply) {
            this.continueAfterApply = false;
              this.studioNavigation.navigateToSection('algorithm-section');
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (requestSeq !== this.processedDescribeSeq) return;
          this.clearProcessedPreviewSubscription();
          console.error(err);
          this.isApplyingPreprocessing = false;
          // Nothing was applied, so the key claimed for this request is a lie;
          // clear it so the next preview or apply refetches.
          this.processedSummaryKey = '';
          this.processedSummary = emptySummaryView(false);
          if (scope === 'all') {
            this.sectionOpen.update((open) => ({ ...open, processed: true }));
          } else {
            // A card's own Apply never left the card: keep it open and say why nothing changed.
            this.preprocessingApplyError = { [scope]: 'Could not apply these changes. They are still pending — try Apply again.' };
          }
          this.cdr.markForCheck();
      },
    });
  }

  /**
   * The Raw summary describe. `filterOverride` runs it against unsaved Cohort
   * Filtering rules; the cache key always carries the filter that was actually sent,
   * so a pending preview and the stored cohort never claim each other's numbers.
   */
  fetchDescriptiveStatistics(filterOverride?: BackendFilter | null): void {
    if (!this.expStudioService.selectedDataModel() || this.expStudioService.selectedDatasets().length === 0) {
      this.rawDescribeSeq++;
      this.rawSummaryKey = '';
      this.expStudioService.clearDataExclusionWarnings();
      this.rawSummary = emptySummaryView(false);
      this.processedData = [];
      this.isLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.rawSummary = { ...this.rawSummary, isLoading: true };
    this.isLoading = true;
    this.expStudioService.clearDataExclusionWarnings();
    this.cdr.markForCheck();

    const items = this.preprocessingVariables;
    if (!items.length) {
      this.rawSummaryKey = '';
      this.rawDescribeSeq++;
      this.expStudioService.clearDataExclusionWarnings();
      this.rawSummary = emptySummaryView(false);
      this.processedData = [];
      this.isLoading = false;
      this.cdr.markForCheck();
      return;
    }

    const variableCodes = items.map((item) => item.code);
    const requestSeq = ++this.rawDescribeSeq;
    this.rawSummaryKey = this.rawSummaryKeyFor(filterOverride);
    this.expStudioService
      .loadDescriptiveOverview(variableCodes, null, null, filterOverride)
      .subscribe({
        next: (response) => {
          // Selection changed while this was in flight; the newer run owns the summary.
          if (requestSeq !== this.rawDescribeSeq) return;
          this.expStudioService.setDataExclusionWarnings([], []);
          this.rawSummary = this.buildSummaryFromResponse(response, 'raw');
          this.processedData = this.rawSummary.data;
          this.isLoading = false;
          this.summaryHistogram.refreshActive('raw');
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (requestSeq !== this.rawDescribeSeq) return;
          console.error(err);
          this.expStudioService.clearDataExclusionWarnings();
          this.rawSummary = { ...this.rawSummary, isLoading: false };
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Cache key of the Raw summary for one cohort. The stored `filterLogic()` is the
   * default; a pending preview keys on the rules it is showing instead, so the two
   * states cannot reuse each other's response.
   */
  private rawSummaryKeyFor(filterOverride?: BackendFilter | null): string {
    return this.statisticSummary.rawKeyFor(filterOverride);
  }

  /**
   * Show the Raw summary for the cohort it is supposed to describe, spending at most
   * one describe: an identical cohort (same rules, same selection) is already cached.
   */
  private ensureRawSummary(): void {
    if (this.rawSummaryKey === this.rawSummaryKeyFor(this.rawPreviewFilter)) return;
    this.fetchDescriptiveStatistics(this.rawPreviewFilter);
  }

  variableLabel(variable: VariableRow): string {
    return variableLabel(variable);
  }

  datasetLabel(datasetCode: string): string {
    if (!datasetCode) return datasetCode;
    const map = this.expStudioService.getDatasetLabelMap();
    return resolveDatasetDisplayLabel(String(datasetCode), map);
  }

  variableTypeLabel(variable: VariableRow): string {
    if (this.isNumericVariable(variable)) return 'Numeric';
    if (this.isCategoricalVariable(variable)) return 'Categorical';
    return variable.type ?? 'Unknown';
  }

  enumOptions(variable: VariableRow): EnumOption[] {
    return (variable.enumerations ?? [])
      .map((item) => {
        const raw = item.code ?? item.label ?? item.name;
        if (raw === undefined || raw === null) return null;
        return {
          code: String(raw),
          label: String(item.label ?? item.name ?? raw),
        };
      })
      .filter((item): item is EnumOption => !!item);
  }

  async exportAllDescriptiveToPDF(kind: SummaryKind = 'raw'): Promise<void> {
    this.isExporting = true;
    this.cdr.markForCheck();
    try {
      const numericCharts = document.querySelectorAll(
        `.hidden-charts-for-export.${kind}-export .numeric-charts-export app-chart-renderer`
      ) as NodeListOf<HTMLElement>;

      const nominalCharts = document.querySelectorAll(
        `.hidden-charts-for-export.${kind}-export .nominal-charts-export app-chart-renderer`
      ) as NodeListOf<HTMLElement>;

      const dataModel = this.expStudioService.selectedDataModel();
      const pathologyName = dataModel?.label || dataModel?.code || '';
      const summary = this.getSummary(kind);

      const labelMap = this.expStudioService.variableLabelMap();
      const enumMaps = this.expStudioService.getCategoricalEnumMaps();
      const filterLogic = this.expStudioService.filterLogic();
      await this.pdfExportService.exportDescriptiveStatisticsPdf({
        title: this.summaryKindLabel(kind),
        pathologyName,
        context: [
          ['Datasets', this.expStudioService.selectedDatasets().map((code) => this.datasetLabel(code))],
          // Source data is the selection before any cohort rule or preprocessing.
          ['Filters', kind !== 'source' && filterLogic ? formatFilterExpression(filterLogic, { labelMap, enumMaps }) : null],
          ['Preprocessing', kind === 'processed'
            ? this.expStudioService.formatPreprocessingConfig(this.expStudioService.getAppliedDescriptivePreprocessing(), labelMap, enumMaps).split('\n')
            : null],
        ],
        variables: this.pivotBlocksWithDatasetLabels(summary.data),
        charts: numericCharts,
        nonNominalVariables: summary.nonNominalVariables,
        nominalCharts,
        nominalVariables: summary.nominalVariables,
        mipVersion: this.mipVersion,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  exportSummaryToCSV(kind: SummaryKind): void {
    const summary = this.getSummary(kind);
    if (!summary.data.length) return;

    const rows = summary.data.flatMap((variable) =>
      variable.rows.flatMap((row) =>
        variable.columns.map((dataset) => ({
          Variable: variable.name,
          Metric: row.metric,
          Dataset: this.datasetLabel(dataset),
          Value: row.values[dataset] ?? '',
        }))
      )
    );

    const filename = `${kind}_data_summary.csv`;
    this.csvExportService.exportToCsv(rows, ['Variable', 'Metric', 'Dataset', 'Value'], filename);
  }

  /** Every kind with a summary surface, in pipeline order. */
  readonly summaryKinds: SummaryKind[] = ['source', 'raw', 'processed'];

  getSummary(kind: SummaryKind): SummaryView {
    return this.statisticSummary.get(kind);
  }

  private scrollSectionIntoView(section: SectionKey): void {
    const element = this.sectionAnchors.get(section)?.nativeElement;
    if (!element) return;

    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  private buildSummaryFromResponse(response: unknown, kind: SummaryKind): SummaryView {
    return this.statisticSummary.fromDescribeResponse(response, this.getSummary(kind), this.preprocessingVariables);
  }

  private buildProcessedSummaryKey(
    variableCodes: string[],
    preprocessing: PreprocessingConfig
  ): string {
    return JSON.stringify({
      variableCodes,
      preprocessing,
      filterLogic: this.expStudioService.filterLogic(),
    });
  }

  private clearProcessedPreviewSubscription(): void {
    this.processedPreviewSubscription?.unsubscribe();
    this.processedPreviewSubscription = null;
  }

  private clearSourcePreviewSubscription(): void {
    this.sourcePreviewSubscription?.unsubscribe();
    this.sourcePreviewSubscription = null;
  }

  /** The plotted variable as a histogram preview describes it. */
  private histogramVariable(kind: SummaryKind, block: PivotBlock): HistogramPreviewVariable {
    return {
      name: block.name,
      type: this.statisticBlockType(kind, block),
      enumerations: this.statisticBlockVariable(block)?.enumerations,
    };
  }

  private groupingEnumLabel(groupingVar: string, groupingEnum: string): string {
    if (groupingVar.toLowerCase() === DATASET_VARIABLE_CODE) {
      return this.expStudioService.getDatasetLabelMap()[groupingEnum] ?? groupingEnum;
    }
    const selected = (this.expStudioService.selectedVariables() as VariableRow[])
      .find((variable) => variable.code === groupingVar);
    const mapped = enumLabelMap(selected ?? this.findModelVariable(groupingVar) ?? undefined)
      .get(groupingEnum);
    return mapped ?? groupingEnum;
  }

  private buildOutlierPreviewRows(response: unknown): OutlierPreviewRow[] {
    const payload = (response as { result?: unknown })?.result ?? response;
    const featurewise = Array.isArray((payload as { featurewise?: unknown })?.featurewise)
      ? ((payload as { featurewise: unknown[] }).featurewise)
      : [];

    return featurewise
      .filter((row) => {
        const item = row as { dataset?: unknown };
        return String(item.dataset ?? '').trim().toLowerCase() !== 'all datasets';
      })
      .map((row) => {
      const item = row as { variable?: unknown; dataset?: unknown; data?: Record<string, unknown> };
      const data = item.data ?? {};
      const variableCode = String(item.variable ?? '');
      return {
        variable: this.variableLabelForCode(variableCode),
        dataset: String(item.dataset ?? '').trim() || '-',
        strategy: outlierStrategyLabel(String(data['strategy'] ?? '')),
        tail: outlierTailLabel(String(data['tail'] ?? '')),
        fold: formatOutlierBound(data['fold']),
        lowerBound: formatOutlierBound(data['lower_bound']),
        upperBound: formatOutlierBound(data['upper_bound']),
        lowerOutliers: formatInteger(data['lower_outlier_count'], '-'),
        upperOutliers: formatInteger(data['upper_outlier_count'], '-'),
        totalOutliers: formatInteger(data['total_outlier_count'], '-'),
        outlierPercentage: formatOutlierPercentage(data['total_outlier_percentage']),
      };
    });
  }

  private variableLabelForCode(code: string): string {
    const variable = this.preprocessingVariables.find((item) => item.code === code);
    return variable ? this.variableLabel(variable) : code;
  }






  /** Copy pending → applied for one card or all of them. */
  private commitPendingToApplied(scope: PrepStep | 'all'): void {
    this.stepsIn(scope).forEach((step) => this.prepStepOps[step].commit());
  }

  /** The run config one card's Apply writes: its pending rules over the applied rest
   *  (untouched variables on their defaults, exactly as a full apply would send them). */
  private buildScopedPreprocessingConfig(step: PrepStep): PreprocessingConfig | null {
    const config: PreprocessingConfig = {};
    const missing = this.buildMissingPreprocessingConfig(step === 'missing'
      ? this.pendingPreprocessingRules
      : this.mergeRulesForCurrentSelection({}, this.appliedPreprocessingRules));
    if (missing) config['missing_values_handler'] = missing;
    const outlier = this.buildOutlierPreprocessingConfig(step === 'outlier'
      ? this.pendingOutlierRules
      : this.mergeOutlierRulesForCurrentSelection({}, this.appliedOutlierRules));
    if (outlier) config['outlier_winsorizer'] = outlier;
    const longitudinal = this.buildLongitudinalPreprocessingConfig(step !== 'longitudinal');
    if (longitudinal) config['longitudinal_transformer'] = longitudinal;
    return Object.keys(config).length ? config : null;
  }

  private buildPreprocessingConfig(
    rules: Record<string, PreprocessingRule>,
    allowedCodes = this.currentPreprocessingCodeSet()
  ): PreprocessingConfig | null {
    const config: PreprocessingConfig = {};
    const missingValuesHandler = this.buildMissingPreprocessingConfig(rules, allowedCodes);
    if (missingValuesHandler) config['missing_values_handler'] = missingValuesHandler;

    const outlier = this.buildOutlierPreprocessingConfig(
      rules === this.appliedPreprocessingRules ? this.appliedOutlierRules : this.pendingOutlierRules,
      allowedCodes
    );
    if (outlier) config['outlier_winsorizer'] = outlier;

    const longitudinal = this.buildLongitudinalPreprocessingConfig(rules === this.appliedPreprocessingRules, allowedCodes);
    if (longitudinal) config['longitudinal_transformer'] = longitudinal;

    return Object.keys(config).length ? config : null;
  }

  onTransformationChange(): void {
    // Each nominal draft upserts by id. An incomplete draft clears its outputs so the request
    // skips it. A draft with a write problem leaves the prior parameters untouched and
    // shows the problem on its status chip.
    for (const draft of this.transformationDrafts) {
      if (this.transformationDraftState.writeProblem(draft)) continue;
      this.expStudioService.upsertTransformation({
        id: draft.id,
        name: 'categorical_column_creator',
        parameters: transformationConfigFor(draft) ?? {},
      });
    }
    this.transformationStats.invalidate();
    this.emitProgressState();
    this.cdr.markForCheck();
  }

  private buildMissingPreprocessingConfig(
    rules: Record<string, PreprocessingRule>,
    allowedCodes = this.currentPreprocessingCodeSet()
  ): Record<string, unknown> | null {
    const strategies: Record<string, string> = {};
    const fillValues: Record<string, string> = {};

    Object.values(rules).forEach((rule) => {
      if (!allowedCodes.has(rule.variableCode)) return;
      if (!rule.enabled || rule.action === 'no_action') return;
      strategies[rule.variableCode] = rule.action;
      if (rule.action === 'constant') fillValues[rule.variableCode] = rule.value;
    });

    if (!Object.keys(strategies).length) return null;
    const missingValuesHandler: Record<string, unknown> = { strategies };
    if (Object.keys(fillValues).length) missingValuesHandler['fill_values'] = fillValues;
    return missingValuesHandler;
  }

  private buildOutlierPreprocessingConfig(
    rules: Record<string, OutlierRule>,
    allowedCodes = this.currentPreprocessingCodeSet()
  ): Record<string, unknown> | null {
    const outlierCodes = new Set(
      Array.from(this.currentOutlierPreprocessingCodeSet()).filter((code) => allowedCodes.has(code))
    );
    const serialized = serializeOutlierRules(rules, outlierCodes);
    return serialized ? { ...serialized } : null;
  }

  private validatePendingRulesFor(scope: PrepStep | 'all'): Record<string, string> {
    return Object.assign({}, ...this.stepsIn(scope).map((step) => this.prepStepOps[step].validate()));
  }

  private validatePendingRules(): Record<string, string> {
    return this.validatePendingRulesFor('all');
  }

  /**
   * Records what blocks a run (splitting off the codes the outlier step owns) and says
   * whether the caller has to stop. Clears both maps when the rules are valid, so a
   * fixed rule never leaves stale red text behind.
   */
  private reportPendingValidationErrors(
    validationErrors: Record<string, string>,
    scope: PrepStep | 'all' = 'all',
  ): boolean {
    const outlierCodes = this.currentOutlierPreprocessingCodeSet();
    const inScope = (code: string): boolean => {
      if (scope === 'all') return true;
      if (scope === 'outlier') return outlierCodes.has(code);
      if (scope === 'longitudinal') return code === '__longitudinal__';
      return !outlierCodes.has(code) && code !== '__longitudinal__';
    };
    const kept = Object.fromEntries(
      Object.entries(this.preprocessingValidationErrors).filter(([code]) => !inScope(code))
    );
    if (Object.keys(validationErrors).length === 0) {
      this.preprocessingValidationErrors = kept;
      if (scope === 'all' || scope === 'outlier') this.outlierValidationErrors = {};
      return false;
    }
    this.preprocessingValidationErrors = { ...kept, ...validationErrors };
    if (scope === 'all' || scope === 'outlier') {
      this.outlierValidationErrors = Object.fromEntries(
        Object.entries(validationErrors).filter(([code]) => outlierCodes.has(code))
      );
    }
    this.cdr.markForCheck();
    return true;
  }

  private validatePendingMissingRules(): Record<string, string> {
    const errors: Record<string, string> = {};
    const currentCodes = this.currentPreprocessingCodeSet();
    Object.values(this.pendingPreprocessingRules).forEach((rule) => {
      if (!currentCodes.has(rule.variableCode)) return;
      if (!rule.enabled || rule.action === 'no_action') return;
      const variable = this.preprocessingVariables.find((row) => row.code === rule.variableCode);
      if (!variable) return;
      if ((rule.action === 'mean' || rule.action === 'median') && !this.isNumericVariable(variable)) {
        errors[rule.variableCode] = 'Mean and median imputation are only available for numeric variables.';
      }
      if (rule.action === 'constant') {
        const value = String(rule.value ?? '').trim();
        if (!value) {
          errors[rule.variableCode] = 'A constant value is required.';
          return;
        }
        const enumCodes = this.enumCodes(variable);
        if (enumCodes.length && !enumCodes.includes(value)) {
          errors[rule.variableCode] = `Use one of the categorical enum codes: ${enumCodes.join(', ')}.`;
        }
      }
    });
    return errors;
  }

  private validatePendingOutlierRules(): Record<string, string> {
    const errors: Record<string, string> = {};
    const outlierCodes = this.currentOutlierPreprocessingCodeSet();
    Object.values(this.pendingOutlierRules).forEach((rule) => {
      if (!outlierCodes.has(rule.variableCode)) return;
      const error = validateOutlierRule(rule);
      if (error) errors[rule.variableCode] = error;
    });
    return errors;
  }

  private validatePendingLongitudinalRules(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (this.isLongitudinalModel) {
      if (!this.longitudinalVisit1 || !this.longitudinalVisit2) {
        errors['__longitudinal__'] = 'Both longitudinal visits are required.';
      } else if (this.longitudinalVisit1 === this.longitudinalVisit2) {
        errors['__longitudinal__'] = 'Select two different longitudinal visits.';
      }

      this.preprocessingVariables.forEach((variable) => {
        const strategy = this.longitudinalStrategyFor(variable);
        if (strategy === 'diff' && !this.isNumericVariable(variable)) {
          errors[variable.code] = 'Difference strategy is only available for numeric variables.';
        }
      });
    }
    return errors;
  }

  private updatePreprocessingStatus(): void {
    if (this.pendingChangeCount > 0) this.preprocessingStatus = 'pending';
    else if (this.buildPreprocessingConfig(this.appliedPreprocessingRules)) this.preprocessingStatus = 'applied';
    else this.preprocessingStatus = 'none';
    this.clearOutlierPreview();
    if (this.sectionOpen().processed) this.fetchProcessedPreview();
  }

  private clearOutlierPreview(): void {
    this.outlierPreviewRows = [];
    this.outlierPreviewError = '';
    this.isLoadingOutlierPreview = false;
  }

  private reconcilePreprocessingForSelection(): void {
    const currentCodes = this.currentPreprocessingCodeSet();
    const appliedPreprocessing = this.expStudioService.getAppliedDescriptivePreprocessing();
    if (appliedPreprocessing) {
      this.hydrateAppliedPreprocessing(appliedPreprocessing, currentCodes);
      // Edit-mode hydration: the saved experiment already had preprocessing
      // applied, so its step is genuinely complete (not a fresh auto-applied
      // default). Create mode must stay out: auto-applied defaults there are
      // persisted into the applied config without a user apply.
      if (this.expStudioService.editingExistingExperiment()) {
        this.preprocessingState.userApplied = true;
      }
    } else {
      this.ensureDefaultRulesForCurrentSelection(currentCodes);
      this.ensureOutlierDefaultsForCurrentSelection();
      // No persisted config means this session has no explicit apply yet.
      this.preprocessingState.userApplied = false;
    }
    this.preprocessingValidationErrors = Object.fromEntries(
      Object.entries(this.preprocessingValidationErrors).filter(([code]) => currentCodes.has(code))
    );
    const outlierCodes = this.currentOutlierPreprocessingCodeSet();
    this.outlierValidationErrors = Object.fromEntries(
      Object.entries(this.outlierValidationErrors).filter(([code]) => outlierCodes.has(code))
    );
    this.sectionOpen.update((open) => ({ ...open, processed: false }));
    this.ensureLongitudinalDefaults();
    if (!this.isApplyingPreprocessing) {
      this.clearProcessedPreviewSubscription();
    }
    this.updatePreprocessingStatus();
    this.syncAppliedPreprocessingForCurrentSelection();
    this.fetchProcessedPreview();
  }

  private hydrateAppliedPreprocessing(
    preprocessing: PreprocessingConfig,
    currentCodes = this.currentPreprocessingCodeSet()
  ): void {
    const missingValues = preprocessing['missing_values_handler'] as {
      strategies?: Record<string, unknown>;
      fill_values?: Record<string, unknown>;
    } | undefined;
    const strategies = missingValues?.strategies ?? {};
    const fillValues = missingValues?.fill_values ?? {};
    const nextApplied = cloneMissingRules(this.appliedPreprocessingRules);
    const nextPending = cloneMissingRules(this.pendingPreprocessingRules);

    currentCodes.forEach((code) => {
      const strategy = String(strategies[code] ?? '');
      const action = this.isMissingAction(strategy) ? strategy : 'no_action';
      const rule: PreprocessingRule = action === 'no_action'
        ? emptyMissingRule(code)
        : {
          variableCode: code,
          action,
          value: fillValues[code] === undefined || fillValues[code] === null ? '' : String(fillValues[code]),
          enabled: true,
        };
      nextApplied[code] = rule;
      const existingPending = nextPending[code];
      nextPending[code] = action === 'no_action'
        ? {
          ...(existingPending && serializeMissingRule(existingPending) !== serializeMissingRule(rule)
            ? existingPending
            : defaultMissingRule(code)),
        }
        : { ...rule };
    });

    this.appliedPreprocessingRules = nextApplied;
    this.pendingPreprocessingRules = nextPending;

    const outlier = preprocessing['outlier_winsorizer'];
    const outlierCodes = this.currentOutlierPreprocessingCodeSet();
    const hydratedOutlier = hydrateOutlierRules(outlier, outlierCodes);
    const nextAppliedOutlier = cloneOutlierRules(this.appliedOutlierRules);
    const nextPendingOutlier = cloneOutlierRules(this.pendingOutlierRules);
    outlierCodes.forEach((code) => {
      const rule = hydratedOutlier[code] ?? this.defaultOutlierRule(code);
      nextAppliedOutlier[code] = { ...rule };
      nextPendingOutlier[code] = { ...rule };
    });
    this.appliedOutlierRules = nextAppliedOutlier;
    this.pendingOutlierRules = nextPendingOutlier;

    const longitudinal = preprocessing['longitudinal_transformer'] as {
      visit1?: unknown;
      visit2?: unknown;
      strategies?: Record<string, unknown>;
    } | undefined;

    if (!longitudinal || !this.isLongitudinalModel) {
      this.appliedLongitudinalEnabled = false;
      this.appliedLongitudinalVisit1 = '';
      this.appliedLongitudinalVisit2 = '';
      this.appliedLongitudinalStrategies = {};
    } else {
      this.appliedLongitudinalEnabled = true;
      this.appliedLongitudinalVisit1 = longitudinal.visit1 === undefined || longitudinal.visit1 === null ? '' : String(longitudinal.visit1);
      this.appliedLongitudinalVisit2 = longitudinal.visit2 === undefined || longitudinal.visit2 === null ? '' : String(longitudinal.visit2);
      this.longitudinalVisit1 = this.appliedLongitudinalVisit1;
      this.longitudinalVisit2 = this.appliedLongitudinalVisit2;
      const longitudinalStrategies = longitudinal.strategies ?? {};
      const appliedStrategies: Record<string, LongitudinalStrategy> = {};
      currentCodes.forEach((code) => {
        const strategy = String(longitudinalStrategies[code] ?? '');
        if (this.isLongitudinalStrategy(strategy)) appliedStrategies[code] = strategy;
      });
      this.appliedLongitudinalStrategies = appliedStrategies;
      this.pendingLongitudinalStrategies = { ...appliedStrategies };
    }

    this.hydrateAppliedTransformation();
  }

  /** One editable card per stored categorical step, keyed by the step id. */
  private hydrateAppliedTransformation(): void {
    this.transformationDrafts = this.cards()
      .filter((step) => step.name === 'categorical_column_creator')
      .map((step) => ({
        ...this.draftFromCreatorConfig(step.parameters as {
          new_column_names?: unknown;
          rules?: Record<string, CategoryFilter>;
          default_enumeration?: unknown;
        }, step.id),
        chosen: true,
      }));
  }

  /** Rebuild one editable card from a persisted categorical_column_creator config. */
  private draftFromCreatorConfig(
    creator: {
      new_column_names?: unknown;
      rules?: Record<string, CategoryFilter>;
      default_enumeration?: unknown;
    },
    id: string,
  ): TransformationColumnDraft {
    const rules = creator.rules ?? {};
    const code = Array.isArray(creator.new_column_names) ? String(creator.new_column_names[0] ?? '').trim() : '';
    return {
      id,
      code,
      defaultEnumeration: creator.default_enumeration == null ? '' : String(creator.default_enumeration),
      rules: Object.entries(rules).map(([value, filter]) => ({
        value,
        filter: filter ?? null,
      })),
      open: true,
    };
  }

  private isMissingAction(value: string): value is MissingAction {
    return ['drop', 'mean', 'median', 'constant'].includes(value);
  }

  private isLongitudinalStrategy(value: string): value is LongitudinalStrategy {
    return ['first', 'second', 'diff'].includes(value);
  }

  private ensureDefaultRulesForCurrentSelection(currentCodes = this.currentPreprocessingCodeSet()): void {
    const nextPending = cloneMissingRules(this.pendingPreprocessingRules);
    let changed = false;
    currentCodes.forEach((code) => {
      if (!nextPending[code] && !this.appliedPreprocessingRules[code]) {
        nextPending[code] = defaultMissingRule(code);
        changed = true;
      }
    });
    if (changed) this.pendingPreprocessingRules = nextPending;
  }

  private ensureOutlierDefaultsForCurrentSelection(currentCodes = this.currentOutlierPreprocessingCodeSet()): void {
    const nextPending = cloneOutlierRules(this.pendingOutlierRules);
    let changed = false;
    currentCodes.forEach((code) => {
      if (!nextPending[code] && !this.appliedOutlierRules[code]) {
        nextPending[code] = this.defaultOutlierRule(code);
        changed = true;
      }
    });
    if (changed) this.pendingOutlierRules = nextPending;
  }

  private emitProgressState(): void {
    this.progressStateChange.emit({
      pendingChangeCount: this.pendingChangeCount,
      // Report 'applied' only for an explicit user apply; auto-applied and
      // hydrated defaults stay out of the emitted status so the studio stepper
      // does not mark Data review Done without user work.
      preprocessingStatus:
        this.preprocessingStatus === 'applied' && !this.preprocessingState.userApplied
          ? 'none'
          : this.preprocessingStatus,
      transformationStatusLabel: this.transformationStatusLabel,
    });
  }

  private persistAppliedDescriptivePreprocessing(preprocessing: PreprocessingConfig | null): void {
    // Singletons only — column creators live in appliedTransformations and must keep order/ids.
    this.expStudioService.setAppliedDescriptivePreprocessing(preprocessing);
    this.appliedConfigWrite = JSON.stringify(this.expStudioService.appliedPreprocessingConfig() ?? null);
  }

  private syncAppliedPreprocessingForCurrentSelection(): void {
    this.persistAppliedDescriptivePreprocessing(
      this.buildPreprocessingConfig(this.appliedPreprocessingRules)
    );
  }

  private currentPreprocessingCodeSet(): Set<string> {
    return new Set(this.preprocessingVariables.map((variable) => variable.code));
  }

  private currentOutlierPreprocessingCodeSet(): Set<string> {
    return new Set(this.outlierPreprocessingVariables.map((variable) => variable.code));
  }

  private buildLongitudinalPreprocessingConfig(
    applied: boolean,
    allowedCodes = this.currentPreprocessingCodeSet()
  ): Record<string, unknown> | null {
    if (!this.isLongitudinalModel) return null;
    const enabled = applied ? this.appliedLongitudinalEnabled : true;
    if (!enabled) return null;

    const visit1 = applied ? this.appliedLongitudinalVisit1 : this.longitudinalVisit1;
    const visit2 = applied ? this.appliedLongitudinalVisit2 : this.longitudinalVisit2;
    const sourceStrategies = applied ? this.appliedLongitudinalStrategies : this.pendingLongitudinalStrategies;
    const strategies: Record<string, string> = {};

    this.preprocessingVariables.forEach((variable) => {
      if (!allowedCodes.has(variable.code)) return;
      const strategy = sourceStrategies[variable.code] ?? (applied ? null : this.defaultLongitudinalStrategy(variable));
      if (strategy) strategies[variable.code] = strategy;
    });

    if (!visit1 || !visit2 || !Object.keys(strategies).length) return null;
    return { visit1, visit2, strategies };
  }

  private ensureLongitudinalDefaults(): void {
    if (!this.isLongitudinalModel) {
      this.appliedLongitudinalEnabled = false;
      return;
    }

    const visits = this.visitOptions;
    if (!this.longitudinalVisit1 && visits[0]) this.longitudinalVisit1 = visits[0].code;
    if (!this.longitudinalVisit2 && visits[1]) this.longitudinalVisit2 = visits[1].code;

    const next = { ...this.pendingLongitudinalStrategies };
    this.preprocessingVariables.forEach((variable) => {
      if (!next[variable.code]) next[variable.code] = this.defaultLongitudinalStrategy(variable);
    });
    this.pendingLongitudinalStrategies = next;
  }

  private defaultLongitudinalStrategy(variable: VariableRow): LongitudinalStrategy {
    return this.isNumericVariable(variable) ? 'diff' : 'first';
  }

  private serializeLongitudinalState(applied: boolean): string {
    const enabled = applied ? this.appliedLongitudinalEnabled : this.isLongitudinalModel;
    const visit1 = applied ? this.appliedLongitudinalVisit1 : this.longitudinalVisit1;
    const visit2 = applied ? this.appliedLongitudinalVisit2 : this.longitudinalVisit2;
    const sourceStrategies = applied ? this.appliedLongitudinalStrategies : this.pendingLongitudinalStrategies;
    const allowedCodes = this.currentPreprocessingCodeSet();
    const strategies = Object.fromEntries(
      this.preprocessingVariables
        .filter((variable) => allowedCodes.has(variable.code))
        .map((variable) => [
          variable.code,
          sourceStrategies[variable.code] ?? (applied ? null : this.defaultLongitudinalStrategy(variable)),
        ])
    );
    return JSON.stringify({ enabled, visit1, visit2, strategies });
  }

  private hasAppliedPreprocessing(variableCode: string): boolean {
    return this.preprocessingState.hasAppliedMissing(variableCode);
  }

  private hasAppliedLongitudinalPreprocessing(variableCode: string): boolean {
    if (!this.isLongitudinalModel || !this.appliedLongitudinalEnabled) return false;
    if (!this.appliedLongitudinalVisit1 || !this.appliedLongitudinalVisit2) return false;
    return !!this.appliedLongitudinalStrategies[variableCode];
  }

  private hasAppliedOutlierPreprocessing(variableCode: string): boolean {
    return this.preprocessingState.hasAppliedOutlier(variableCode);
  }

  private mergeRulesForCurrentSelection(
    base: Record<string, PreprocessingRule>,
    source: Record<string, PreprocessingRule>
  ): Record<string, PreprocessingRule> {
    const next = cloneMissingRules(base);
    this.currentPreprocessingCodeSet().forEach((code) => {
      next[code] = source[code] ? { ...source[code] } : defaultMissingRule(code);
    });
    return next;
  }

  private mergeOutlierRulesForCurrentSelection(
    base: Record<string, OutlierRule>,
    source: Record<string, OutlierRule>
  ): Record<string, OutlierRule> {
    const next = cloneOutlierRules(base);
    this.currentOutlierPreprocessingCodeSet().forEach((code) => {
      next[code] = source[code] ? { ...source[code] } : this.defaultOutlierRule(code);
    });
    return next;
  }

  private defaultOutlierRule(variableCode: string): OutlierRule {
    return createDefaultOutlierRule(variableCode, false);
  }

  private discardPendingTransformation(): void {
    this.hydrateAppliedTransformation();
    if (!this.transformationDrafts.length) {
      this.transformationStats.clear();
    }
    this.onTransformationChange();
  }

  private getSummaryTotalRows(summary: SummaryView): number | null {
    return pooledTotalRows(summary.featurewiseRows ?? []);
  }

  get cohortRetention(): { raw: number; processed: number; dropped: number; percentage: number } | null {
    const raw = this.getSummaryTotalRows(this.rawSummary);
    const processed = this.getSummaryTotalRows(this.processedSummary);
    if (raw === null || processed === null) return null;
    return {
      raw,
      processed,
      dropped: Math.max(0, raw - processed),
      percentage: raw > 0 ? (processed / raw) * 100 : 0,
    };
  }

  /** Rows the default drop-NaN rule would remove. Only priced when both raw and
   *  processed summaries have loaded; otherwise the rail stays honest and the
   *  row falls back to its unpriced layout. */
  private get rowsDroppedByDefault(): number | null {
    const retention = this.cohortRetention;
    return retention && retention.dropped > 0 ? retention.dropped : null;
  }

  private isNumericVariable(variable: VariableRow): boolean {
    return ['real', 'int', 'integer', 'numeric', 'number'].includes(String(variable.type ?? '').toLowerCase());
  }

  isCategoricalVariable(variable: VariableRow): boolean {
    return isCategoricalVariable(variable);
  }

  private enumCodes(variable: VariableRow): string[] {
    return (variable.enumerations ?? [])
      .map((item) => item.code ?? item.label ?? item.name)
      .filter((value): value is string => value !== undefined && value !== null)
      .map((value) => String(value));
  }

  private findModelVariable(code: string): VariableRow | null {
    const model = this.expStudioService.selectedDataModel();
    const target = code.toLowerCase();
    const visit = this.flattenModelVariables(model?.variables ?? [], model?.groups ?? [])
      .find((variable) => String(variable.code ?? '').toLowerCase() === target);
    return visit ?? null;
  }

  private flattenModelVariables(variables: any[], groups: Array<{ variables?: any[]; groups?: any[] }>): VariableRow[] {
    return [
      ...variables,
      ...groups.flatMap((group) => this.flattenModelVariables(group.variables ?? [], group.groups ?? [])),
    ].filter((variable): variable is VariableRow => !!variable?.code);
  }

  private variableForBlock(block: PivotBlock): VariableRow | null {
    const target = block.name.toLowerCase();
    const code = block.code?.toLowerCase();
    return this.preprocessingVariables.find((variable) =>
      (code !== undefined && variable.code.toLowerCase() === code) ||
      this.variableLabel(variable).toLowerCase() === target ||
      variable.code.toLowerCase() === target
    ) ?? null;
  }

  private variableCodeForBlock(block: PivotBlock): string | null {
    if (block.code) return block.code;
    return this.variableForBlock(block)?.code ?? null;
  }

  private pivotBlocksWithDatasetLabels(blocks: PivotBlock[]): PivotBlock[] {
    return blocks.map((block) => {
      const labeledColumns = block.columns.map((code) => this.datasetLabel(code));
      return {
        ...block,
        columns: labeledColumns,
        rows: block.rows.map((row) => ({
          metric: row.metric,
          values: Object.fromEntries(
            block.columns.map((code, index) => [labeledColumns[index], row.values[code]])
          ),
        })),
      };
    });
  }

  private statisticBlockType(kind: SummaryKind, block: PivotBlock): StatisticVariableType {
    const summary = this.getSummary(kind);
    const variable = this.statisticBlockVariable(block);
    if (variable && summary.nominalVariables.some((item) => item.code === variable.code)) return 'nominal';
    if (variable && this.isCategoricalVariable(variable)) return 'nominal';
    const numericMetrics = new Set(['Mean', 'Standard Deviation', 'Minimum', 'Q1', 'Median', 'Q3', 'Maximum']);
    return block.rows.some((row) => numericMetrics.has(row.metric)) ? 'numeric' : 'nominal';
  }
}
