import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  QueryList,
  signal,
  ViewChild,
  ViewChildren,
  output,
  input
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { EChartsOption } from 'echarts';
import { ExperimentStudioService, PreprocessingConfig } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { ChartRendererComponent } from '../visualisations/charts/charts-renderer/charts-renderer.component';
import { HistogramComponent } from '../visualisations/histogram/histogram.component';
import {
  clipHistogramNullEdges,
  shouldClipNullEdges,
} from '../visualisations/histogram/histogram-chart';
import { PdfExportService } from '../../../services/pdf-export.service';
import { buildGroupedBarChart } from '../visualisations/charts/renderers/grouped-bar-chart';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import {
  getFeaturewiseDescribeRows,
  resolveDatasetDisplayLabel,
} from '../../../core/describe-result.utils';
import { FilterConfigModalComponent } from '../shared/filter-config-modal/filter-config-modal.component';
import { StationActionBarComponent } from '../shared/station-action-bar/station-action-bar.component';
import { StationCardComponent, StationStatus } from '../shared/station-card/station-card.component';
import { StationListRowComponent } from '../shared/station-list-row/station-list-row.component';
import { BackendFilter } from '../../../models/filters.model';
import { CsvExportService } from '../../../services/csv-export.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { countFilterRules } from '../shared/filter-rule-count.util';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { getAnalysisGuideLayout } from '../guide/experiment-studio-analysis-guide.util';
import { AlgorithmNames } from '../../../core/constants/algorithm.constants';
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
  serializeOutlierRule,
  serializeOutlierRules,
  validateOutlierRule,
} from '../../../core/outlier-rules';

type TabKey = 'Statistics' | 'Charts' | 'Histogram';
type SummaryKind = 'raw' | 'processed';
type SectionKey = 'raw' | 'setup' | 'filters' | 'processed' | 'transformation';
type DistributionSubTab = 'Numeric' | 'Nominal';
type StatisticVariableType = 'numeric' | 'nominal';
type PreprocessingStatus = 'none' | 'pending' | 'applied';
type PrepKind = 'missing' | 'outlier' | 'longitudinal';

type MissingAction = 'no_action' | 'drop' | 'mean' | 'median' | 'constant';
type LongitudinalStrategy = 'first' | 'second' | 'diff';

interface TransformationRule {
  value: string;
  filter: BackendFilter | null;
}

/** One "Create new categorical column" card. The stage holds an ordered list. */
interface TransformationColumnDraft {
  id: number;
  code: string;
  defaultEnumeration: string;
  rules: TransformationRule[];
  open: boolean;
}

let transformationDraftSeq = 0;
function emptyTransformationDraft(): TransformationColumnDraft {
  return { id: ++transformationDraftSeq, code: '', defaultEnumeration: '', rules: [], open: true };
}

/** One sub-step of a pipeline stage, rendered on the pipeline-overview rail. */
interface PipelineSubNode {
  // Preprocessing stations use fixed ids; transformation sub-nodes carry a
  // `transformation:<code>` id so the rail can list one card per derived column.
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: 'applied' | 'default' | 'pending';
}
type MetricKey =
  | 'num_dtps' | 'num_na' | 'num_total'
  | 'mean' | 'std' | 'min' | 'q1' | 'q2' | 'q3' | 'max';

interface SummaryView {
  activeTab: TabKey;
  data: PivotBlock[];
  featurewiseRows: any[];
  isLoading: boolean;
  showDistributions: boolean;
  distributionSubTab: DistributionSubTab;
  nonNominalVariables: VariableRow[];
  nominalVariables: VariableRow[];
  chartsForBoxPlot: EChartsOption[][];
  chartsForNominal: EChartsOption[][];
  histogramDataByVariable: Record<string, HistogramPreviewData>;
  histogramLoadingByVariable: Record<string, boolean>;
  histogramErrorByVariable: Record<string, string>;
  activeBoxPlotIndex: number;
  activeNominalIndex: number;
  selectedStatisticKey: string | null;
}

interface PivotBlock {
  code?: string;
  name: string;
  columns: string[];
  rows: Array<{ metric: string; values: Record<string, string> }>;
}

interface VariableRow {
  code: string;
  name?: string;
  label?: string;
  type?: string;
  enumerations?: Array<{ code?: string; label?: string; name?: string }>;
}

interface EnumOption {
  code: string;
  label: string;
}

interface HistogramPreviewData {
  bins: string[];
  counts: Array<number | null>;
  variableName: string;
  variableType?: string;
}

interface PreprocessingRule {
  variableCode: string;
  action: MissingAction;
  value: string;
  enabled: boolean;
}

interface PreprocessingGroup {
  key: 'pending' | 'applied' | 'default' | 'not-applied';
  title: string;
  variables: VariableRow[];
}

interface OutlierPreviewRow {
  variable: string;
  dataset: string;
  strategy: string;
  tail: string;
  fold: string;
  lowerBound: string;
  upperBound: string;
  lowerOutliers: string;
  upperOutliers: string;
  totalOutliers: string;
  outlierPercentage: string;
}

export interface DescriptiveProgressState {
  pendingChangeCount: number;
  preprocessingStatus: PreprocessingStatus;
  transformationStatusLabel: string;
}

@Component({
  selector: 'app-statistic-analysis-panel',
  imports: [ChartRendererComponent, HistogramComponent, FormsModule, FilterConfigModalComponent, StationActionBarComponent, StationCardComponent, StationListRowComponent],
  templateUrl: './statistic-analysis-panel.component.html',
  // Order is the cascade: shell + pipeline canvas, then preprocessing stations,
  // then shared controls / result surfaces + responsive overrides. Concatenated in this order.
  styleUrls: [
    './statistic-analysis-panel.component.css',
    './statistic-analysis-panel.preprocessing.css',
    './statistic-analysis-panel.results.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatisticAnalysisPanelComponent {
  readonly processedDataInput = input<PivotBlock[]>([], { alias: 'processedData' });
  processedData: PivotBlock[] = [];
  readonly variables = input<unknown[]>([]);
  readonly filters = input<unknown[]>([]);
  readonly progressStateChange = output<DescriptiveProgressState>();
  @ViewChild('rawSection')
  rawSection?: ElementRef<HTMLElement>;
  @ViewChild('setupSection')
  setupSection?: ElementRef<HTMLElement>;
  @ViewChild('filtersSection')
  filtersSection?: ElementRef<HTMLElement>;
  @ViewChild('processedSection')
  processedSection?: ElementRef<HTMLElement>;
  @ViewChild('transformationSection')
  transformationSection?: ElementRef<HTMLElement>;
  @ViewChildren('ruleModal')
  transformationRuleModals?: QueryList<FilterConfigModalComponent>;

  expStudioService = inject(ExperimentStudioService);
  private studioNavigation = inject(ExperimentStudioNavigationService);
  private chartBuilder = inject(ChartBuilderService);
  private pdfExportService = inject(PdfExportService);
  private csvExportService = inject(CsvExportService);
  private cdr = inject(ChangeDetectorRef);
  private runtimeEnvService = inject(RuntimeEnvService);
  private sanitizer = inject(DomSanitizer);
  readonly mipVersion = this.runtimeEnvService.mipVersion;

  rawSummary = this.createEmptySummary(true);
  processedSummary = this.createEmptySummary(false);
  pendingPreprocessingRules: Record<string, PreprocessingRule> = {};
  appliedPreprocessingRules: Record<string, PreprocessingRule> = {};
  appliedLongitudinalEnabled = false;
  longitudinalVisit1 = '';
  longitudinalVisit2 = '';
  appliedLongitudinalVisit1 = '';
  appliedLongitudinalVisit2 = '';
  pendingLongitudinalStrategies: Record<string, LongitudinalStrategy> = {};
  appliedLongitudinalStrategies: Record<string, LongitudinalStrategy> = {};
  pendingOutlierRules: Record<string, OutlierRule> = {};
  appliedOutlierRules: Record<string, OutlierRule> = {};
  preprocessingStatus: PreprocessingStatus = 'none';
  private userPreprocessingApplied = false;
  isApplyingPreprocessing = false;
  preprocessingValidationErrors: Record<string, string> = {};
  outlierValidationErrors: Record<string, string> = {};
  outlierPreviewRows: OutlierPreviewRow[] = [];
  outlierPreviewError = '';
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
  statisticsSearch: Record<SummaryKind, string> = {
    raw: '',
    processed: '',
  };
  successMessage = '';
  isExporting = false;
  isLoading = true;
  readonly sectionOpen = signal<Record<SectionKey, boolean>>({
    raw: false,
    setup: false,
    filters: true,
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

  isStepAdded(step: 'filters' | 'setup' | 'transformation'): boolean {
    if (this.addedSteps()[step]) return true;
    if (step === 'filters') return this.filterRuleCount() > 0;
    const applied = this.expStudioService.appliedPreprocessingConfig();
    if (!applied) return false;
    if (step === 'transformation') return !!applied['categorical_column_creator'];
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
      this.userPreprocessingApplied = false;
      this.processedSummary = this.createEmptySummary(false);
      this.processedSummaryKey = '';
      this.sectionOpen.update((open) => ({ ...open, setup: false, processed: false }));
    } else if (step === 'transformation') {
      this.resetTransformation();
      this.sectionOpen.update((open) => ({ ...open, transformation: false }));
    }
    this.cdr.markForCheck();
  }

  get activeStagesCount(): number {
    return (['filters', 'setup', 'transformation'] as const).filter((step) => this.isStepAdded(step)).length;
  }

  /** Track if outlier section is explicitly enabled by user */
  readonly userEnabledOutliers = signal<boolean>(false);

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
    this.studioNavigation.navigateToSection('algorithm-section');
  }

  get preprocessingStatusLabel(): string {
    if (this.pendingChangeCount > 0) return 'Pending changes';
    if (this.preprocessingStatus === 'applied') {
      const count = this.appliedPreprocessingCount;
      return count > 1 ? `${count} steps applied ✓` : 'Applied ✓';
    }
    return 'Default';
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

  get appliedPreprocessingCount(): number {
    return this.appliedPreprocessingSubNodes.filter((node) => node.statusTone === 'applied').length;
  }

  /** A derived column only exists once its config is persisted; otherwise the stage stays empty. */
  get appliedTransformationSubNodes(): PipelineSubNode[] {
    const persisted = this.expStudioService.appliedPreprocessingConfig()?.['categorical_column_creator'];
    const creators = Array.isArray(persisted) ? persisted : persisted ? [persisted] : [];
    const statusTone: PipelineSubNode['statusTone'] =
      this.transformationStatusLabel === 'Applied' ? 'applied' : 'pending';
    const nodes: PipelineSubNode[] = [];
    creators.forEach((raw, index) => {
      const creator = raw as { code?: unknown; rules?: Record<string, unknown>; default_enumeration?: unknown };
      const code = String(creator?.code ?? '').trim();
      if (!code) return;
      const ruleCount = Object.keys(creator?.rules ?? {}).length;
      const fallback = String(creator?.default_enumeration ?? '').trim();
      nodes.push({
        id: `transformation:${code || index}`,
        icon: 'fas fa-tag',
        title: `Derived column: ${code}`,
        subtitle: `${ruleCount} ${ruleCount === 1 ? 'category rule' : 'category rules'} configured${fallback ? ` · default: ${fallback}` : ''}`,
        statusLabel: 'Applied',
        statusTone,
      });
    });
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

  private missingValuesSubNode(config: Record<string, unknown>): PipelineSubNode {
    const handler = config['missing_values_handler'] as
      | { strategies?: Record<string, unknown> }
      | undefined;
    const entries = Object.entries(handler?.strategies ?? {}).filter(([, action]) => action !== 'no_action');
    const imputed = entries.filter(([, action]) => action !== 'drop');
    const pending = this.hasPendingMissingChanges ? 'pending' : 'applied';

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
      };
    }

    return {
      id: 'missing',
      icon: 'fas fa-eraser',
      title: 'Missing Values Handler',
      subtitle: 'Default NaN removal active across all selected variables',
      statusLabel: 'Default',
      statusTone: 'default',
    };
  }

  private missingStrategyLabel(action: string): string {
    return this.missingActions.find((item) => item.value === action)?.label ?? action;
  }

  private visitLabel(code: unknown): string {
    const value = String(code ?? '');
    return this.visitOptions.find((option) => option.code === value)?.label ?? value;
  }

  get filteringStatusLabel(): string {
    const count = this.filterRuleCount();
    if (count > 0) return `Applied ✓ (${count} ${count === 1 ? 'rule' : 'rules'})`;
    return 'No filters applied';
  }

  readonly missingActions: Array<{ value: MissingAction; label: string }> = [
    { value: 'drop', label: 'Remove rows' },
    { value: 'mean', label: 'Mean imputation' },
    { value: 'median', label: 'Median imputation' },
    { value: 'constant', label: 'Constant value' },
  ];

  transformationActiveTab: 'Create' | 'Statistics' = 'Create';
  /** Ordered cards; the stage always keeps at least one (possibly empty) draft. */
  transformationDrafts: TransformationColumnDraft[] = [emptyTransformationDraft()];
  transformationStatistics: Array<{ code: string; rows: Array<{ value: string; count: number | null }> }> = [];
  isTransformationStatsLoading = false;
  transformationStatisticsError = '';
  /** Blocks Apply when two cards share a derived column name. */
  transformationApplyError = '';
  private transformationStatsRequestId = 0;

  readonly longitudinalStrategies: Array<{ value: LongitudinalStrategy; label: string }> = [
    { value: 'diff', label: 'Diff (Visit 2 - Visit 1)' },
    { value: 'first', label: 'Use visit 1' },
    { value: 'second', label: 'Use visit 2' },
  ];
  readonly outlierStrategies = OUTLIER_STRATEGIES;
  readonly outlierTails = OUTLIER_TAILS;

  readonly metricOrder: Array<{ key: string; label: string }> = [
    { key: 'num_datapoints', label: 'Datapoints' },
    { key: 'num_missing', label: 'Missing' },
    { key: 'num_total', label: 'Total' },
    { key: 'mean', label: 'Mean' },
    { key: 'std', label: 'Standard Deviation' },
    { key: 'min', label: 'Min' },
    { key: 'q1', label: 'Q1' },
    { key: 'q2', label: 'Median' },
    { key: 'q3', label: 'Q3' },
    { key: 'max', label: 'Max' },
  ];

  readonly metricLabel: Record<MetricKey, string> = {
    num_dtps: 'Datapoints',
    num_na: 'Missing',
    num_total: 'Total',
    mean: 'Mean',
    std: 'Standard Deviation',
    min: 'Min',
    q1: 'Q1',
    q2: 'Median',
    q3: 'Q3',
    max: 'Max',
  };

  private selectionKey = '';
  private processedSummaryKey = '';
  private scrollRequestId = 0;
  private readonly scrollSectionRequest = signal<{ section: SectionKey; requestId: number } | null>(null);
  private readonly guideState = inject(ExperimentStudioGuideStateService);

  constructor() {
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
      const nextSelectionKey = this.buildSelectionKey(variables, filters, filterLogic, appliedPreprocessing);

      if (nextSelectionKey !== this.selectionKey) {
        this.selectionKey = nextSelectionKey;
        this.reconcilePreprocessingForSelection();
      }

      if (!variables.length && !filters.length) {
        this.rawSummary = this.createEmptySummary(false);
        this.processedSummary = this.createEmptySummary(false);
        this.processedData = [];
        this.isLoading = false;
        this.expStudioService.clearDataExclusionWarnings();
        this.cdr.markForCheck();
        return;
      }

      this.fetchDescriptiveStatistics();
      this.fetchProcessedSummaryForAppliedPreprocessing();
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

  get pendingChangeCount(): number {
    return this.pendingMissingChangeCount + this.pendingOutlierChangeCount + this.pendingLongitudinalChangeCount;
  }

  readonly filterRuleCount = computed(() =>
    countFilterRules(this.expStudioService.filterLogic())
  );

  /** Drafts that already form a valid column config (code + at least one filtered rule). */
  private transformationConfigs(): Record<string, unknown>[] {
    return this.transformationDrafts
      .map((draft) => this.buildTransformationConfigForDraft(draft))
      .filter((config): config is Record<string, unknown> => !!config);
  }

  /** A draft counts as touched once the user typed any column name, default, or rule. */
  private draftHasWork(draft: TransformationColumnDraft): boolean {
    return (
      draft.code.trim().length > 0 ||
      draft.defaultEnumeration.trim().length > 0 ||
      draft.rules.some((rule) => rule.value.trim().length > 0 || !!rule.filter)
    );
  }

  /** Two columns cannot share a name: exaflow errors when `code` already exists. */
  get transformationHasDuplicateCodes(): boolean {
    const codes = this.transformationDrafts.map((draft) => draft.code.trim()).filter((code) => code.length > 0);
    return new Set(codes).size !== codes.length;
  }

  get transformationHasPendingChange(): boolean {
    if (this.transformationHasDuplicateCodes) return true;
    return this.transformationDrafts.some(
      (draft) => this.draftHasWork(draft) && !this.buildTransformationConfigForDraft(draft)
    );
  }

  get transformationStatusLabel(): string {
    const validCount = this.transformationConfigs().length;
    if (validCount > 0 && !this.transformationHasPendingChange) return 'Applied';
    if (
      validCount > 0
      || this.transformationHasPendingChange
      || this.transformationDrafts.some((draft) => this.draftHasWork(draft))
    ) {
      return 'Pending';
    }
    return 'Not defined';
  }

  get transformationIsValid(): boolean {
    return (
      this.transformationConfigs().length > 0
      && !this.transformationHasDuplicateCodes
      && !this.transformationRulesNeedFilters
    );
  }

  /** Pipeline-header badge: shows the derived-column count once applied. */
  get transformationBadgeLabel(): string {
    const count = this.appliedTransformationCount;
    if (this.transformationStatusLabel === 'Applied' && count > 0) {
      return `${count} ${count === 1 ? 'Transformation' : 'Transformations'} active`;
    }
    return this.transformationStatusLabel;
  }

  /** True when a named category on any card is still missing an applied filter. */
  get transformationRulesNeedFilters(): boolean {
    return this.transformationDrafts.some((draft) => {
      if (!draft.code.trim()) return false;
      const named = draft.rules.filter((rule) => rule.value.trim().length > 0);
      return named.length > 0 && named.some((rule) => !rule.filter);
    });
  }

  get pendingMissingChangeCount(): number {
    return this.hasPendingMissingChanges ? 1 : 0;
  }

  get hasPendingMissingChanges(): boolean {
    const currentCodes = this.currentPreprocessingCodeSet();
    const codes = new Set(
      [
        ...Array.from(currentCodes),
        ...Object.keys(this.pendingPreprocessingRules),
        ...Object.keys(this.appliedPreprocessingRules),
      ].filter((code) => currentCodes.has(code))
    );
    for (const code of codes) {
      const appliedRule = this.appliedPreprocessingRules[code];
      const pendingRule = this.pendingPreprocessingRules[code]
        ?? (appliedRule ? undefined : this.defaultRule(code));
      // Newly added variables sit on the implicit NA-removal default; that
      // doesn't count as a pending change because no user action is required.
      if (this.isDefaultMissingRule(pendingRule) && !this.hasAppliedPreprocessing(code)) continue;
      if (this.serializeRule(pendingRule) !== this.serializeRule(appliedRule)) {
        return true;
      }
    }
    return false;
  }

  get pendingOutlierChangeCount(): number {
    return this.hasPendingOutlierChanges ? 1 : 0;
  }

  get hasPendingOutlierChanges(): boolean {
    const currentCodes = this.currentOutlierPreprocessingCodeSet();
    const codes = new Set(
      [
        ...Array.from(currentCodes),
        ...Object.keys(this.pendingOutlierRules),
        ...Object.keys(this.appliedOutlierRules),
      ].filter((code) => currentCodes.has(code))
    );
    for (const code of codes) {
      const pendingRule = this.pendingOutlierRules[code]
        ?? (this.appliedOutlierRules[code] ? undefined : this.defaultOutlierRule(code));
      if (serializeOutlierRule(pendingRule) !== serializeOutlierRule(this.appliedOutlierRules[code])) {
        return true;
      }
    }
    return false;
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
    return this.buildPreprocessingGroups(
      this.filteredPrepVariables(kind),
      (variable) => this.prepVariableHasPendingChange(kind, variable),
      (variable) => this.prepVariableIsApplied(kind, variable),
      kind === 'missing' ? (variable) => this.isPreprocessingVariableUsingDefault(variable) : () => false,
    );
  }

  private buildPreprocessingGroups(
    variables: VariableRow[],
    isPending: (variable: VariableRow) => boolean,
    isApplied: (variable: VariableRow) => boolean,
    isDefault: (variable: VariableRow) => boolean = () => false
  ): PreprocessingGroup[] {
    const pending: VariableRow[] = [];
    const applied: VariableRow[] = [];
    const defaults: VariableRow[] = [];
    const notApplied: VariableRow[] = [];

    variables.forEach((variable) => {
      if (isPending(variable)) pending.push(variable);
      else if (isApplied(variable)) applied.push(variable);
      else if (isDefault(variable)) defaults.push(variable);
      else notApplied.push(variable);
    });

    const groups: PreprocessingGroup[] = [
      {
        key: 'pending',
        title: 'Pending',
        variables: pending,
      },
      {
        key: 'applied',
        title: 'Applied preprocessing',
        variables: applied,
      },
      {
        key: 'default',
        title: 'Default (NA removal)',
        variables: defaults,
      },
      {
        key: 'not-applied',
        title: 'Not applied',
        variables: notApplied,
      },
    ];
    return groups.filter((group) => group.variables.length > 0);
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
      case 'missing': {
        const appliedRule = this.appliedPreprocessingRules[variable.code];
        const pendingRule = this.pendingPreprocessingRules[variable.code]
          ?? (appliedRule ? undefined : this.defaultRule(variable.code));
        if (this.isDefaultMissingRule(pendingRule) && !this.hasAppliedPreprocessing(variable.code)) {
          return false;
        }
        return this.serializeRule(pendingRule) !== this.serializeRule(appliedRule);
      }
      case 'outlier': {
        const appliedRule = this.appliedOutlierRules[variable.code];
        const pendingRule = this.pendingOutlierRules[variable.code]
          ?? (appliedRule ? undefined : this.defaultOutlierRule(variable.code));
        return serializeOutlierRule(pendingRule) !== serializeOutlierRule(appliedRule);
      }
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
    if (this.hasAppliedPreprocessing(variable.code)) return false;
    const pendingRule = this.pendingPreprocessingRules[variable.code]
      ?? this.defaultRule(variable.code);
    return this.isDefaultMissingRule(pendingRule);
  }

  private isDefaultMissingRule(rule: PreprocessingRule | undefined): boolean {
    if (!rule) return false;
    return rule.enabled === true
      && rule.action === 'drop'
      && (rule.value === undefined || rule.value === '');
  }

  get longitudinalVisitPairHasPendingChange(): boolean {
    return this.longitudinalVisit1 !== this.appliedLongitudinalVisit1 || this.longitudinalVisit2 !== this.appliedLongitudinalVisit2;
  }

  get missingPreprocessingStatusLabel(): string {
    if (this.hasPendingMissingChanges) return 'Pending';
    if (Object.values(this.appliedPreprocessingRules).some((rule) => rule.enabled && rule.action !== 'no_action')) return 'Applied';
    if (this.preprocessingVariables.some((variable) => this.isPreprocessingVariableUsingDefault(variable))) return 'Default';
    return 'Required';
  }

  get outlierPreprocessingStatusLabel(): string {
    if (!this.outlierPreprocessingVariables.length) return 'Not available';
    if (this.hasPendingOutlierChanges) return 'Pending';
    if (Object.values(this.appliedOutlierRules).some((rule) => rule.enabled)) return 'Applied';
    return 'Optional';
  }

  get hasOutlierRulesForPreview(): boolean {
    return !!this.buildOutlierPreprocessingConfig(this.pendingOutlierRules);
  }

  get longitudinalPreprocessingStatusLabel(): string {
    if (!this.isLongitudinalModel) return 'Not available';
    if (this.pendingLongitudinalChangeCount > 0) return 'Pending';
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
    summary.activeTab = summary.activeTab === tab && tab !== 'Statistics' ? 'Statistics' : tab;
    if (tab === 'Histogram') {
      const block = this.selectedStatisticBlock(kind);
      if (block) this.ensureHistogramForBlock(kind, block);
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
    summary.selectedStatisticKey = this.statisticBlockKey(block);
    if (summary.activeTab === 'Histogram') {
      this.ensureHistogramForBlock(kind, block);
    }
  }

  selectedStatisticBlock(kind: SummaryKind): PivotBlock | null {
    const filtered = this.filteredStatisticBlocks(kind);
    if (!filtered.length) return null;
    const selectedKey = this.getSummary(kind).selectedStatisticKey;
    return filtered.find((block) => this.statisticBlockKey(block) === selectedKey) ?? filtered[0];
  }

  isStatisticBlockSelected(kind: SummaryKind, block: PivotBlock): boolean {
    const selected = this.selectedStatisticBlock(kind);
    return !!selected && this.statisticBlockKey(selected) === this.statisticBlockKey(block);
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

  selectedSummaryChartTypeLabel(kind: SummaryKind, block: PivotBlock): string {
    return this.selectedSummaryChartType(kind, block) === 'numeric' ? 'Numerical' : 'Categorical';
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
    return this.getSummary(kind).histogramDataByVariable[code] ?? null;
  }

  summaryHistogramLoading(kind: SummaryKind, block: PivotBlock): boolean {
    const code = this.variableCodeForBlock(block);
    if (!code) return false;
    return !!this.getSummary(kind).histogramLoadingByVariable[code];
  }

  summaryHistogramError(kind: SummaryKind, block: PivotBlock): string {
    const code = this.variableCodeForBlock(block);
    if (!code) return '';
    return this.getSummary(kind).histogramErrorByVariable[code] ?? '';
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
      filters: filtersStation && !previewFilters,
      raw: previewFilters,
      setup: setupStation && !previewSetup,
      processed: previewSetup,
      transformation: section === 'transformation',
    });
    if (section === 'transformation') {
      this.transformationActiveTab = 'Create';
    }
    this.cdr.markForCheck();
    this.scrollSectionRequest.set({ section, requestId: ++this.scrollRequestId });
  }

  toggleSummaryWorkspace(kind: SummaryKind): void {
    if (kind === 'raw') {
      this.goToSection(this.sectionOpen().raw ? 'filters' : 'raw');
      return;
    }
    this.updatePreprocessingStatus();
    if (!this.sectionOpen().processed) {
      this.fetchProcessedSummaryForAppliedPreprocessing();
    }
    this.goToSection(this.sectionOpen().processed ? 'setup' : 'processed');
  }

  collapseAllWorkflowSections(): void {
    this.sectionOpen.set({
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

  /** Maps a station status label onto the shared chip states (Default / Pending / Applied). */
  statusTone(label: string, pending = false): StationStatus {
    if (pending) return 'pending';
    return label === 'Applied' ? 'applied' : 'default';
  }

  setTransformationActiveTab(tab: 'Create' | 'Statistics'): void {
    this.transformationActiveTab = tab;
    if (tab === 'Statistics') {
      this.refreshTransformationStatistics();
    }
    this.cdr.markForCheck();
  }

  /**
   * Persist live category-filter builders onto every rule (across all cards) without
   * touching cohort filters. `#ruleModal` renders one modal per rule in DOM order, so a
   * single running index walks drafts and their rules in the same order the template emits.
   */
  commitTransformationRuleFilters(): boolean {
    const modals = this.transformationRuleModals?.toArray() ?? [];
    let modalIndex = 0;
    for (const draft of this.transformationDrafts) {
      for (const rule of draft.rules) {
        const modal = modals[modalIndex++];
        if (!modal) {
          continue;
        }
        const logic = modal.exportFilterLogic();
        if (modal.filterError()) {
          return false;
        }
        rule.filter = logic;
      }
    }
    this.onTransformationChange();
    return true;
  }

  previewTransformationData(): void {
    if (!this.commitTransformationRuleFilters()) {
      return;
    }
    this.setTransformationActiveTab('Statistics');
  }

  /** Clear the transformation station: pending edits and the committed config alike. */
  resetTransformation(): void {
    this.transformationDrafts = [emptyTransformationDraft()];
    this.transformationStatistics = [];
    this.transformationStatisticsError = '';
    this.transformationApplyError = '';
    this.onTransformationChange();
  }

  /**
   * Transformation is optional: committing is a no-op when nothing is configured.
   * Apply keeps the user on the pipeline. A stage that now holds derived columns
   * folds back to its sub-node overview, so the whole rail can be reviewed before
   * Continue to Algorithm Selection. An untouched stage has nothing to review, so
   * its editor stays open rather than collapsing to an empty overview.
   */
  applyTransformation(): void {
    this.transformationApplyError = '';
    if (!this.commitTransformationRuleFilters()) {
      return;
    }
    if (this.transformationRulesNeedFilters) {
      return;
    }
    if (this.transformationHasDuplicateCodes) {
      this.transformationApplyError = 'Each derived column needs a unique name.';
      this.cdr.markForCheck();
      return;
    }
    if (!this.transformationConfigs().length) {
      this.cdr.markForCheck();
      return;
    }
    // Accepted: fold the cards and then the stage. The drafts keep their values,
    // so reopening resumes where the user left off, on the editor and not on
    // whatever preview tab they happened to be on.
    this.transformationActiveTab = 'Create';
    this.transformationDrafts.forEach((draft) => {
      draft.open = false;
    });
    this.sectionOpen.update((open) => ({ ...open, transformation: false }));
    this.cdr.markForCheck();
  }

  addTransformationRule(draft: TransformationColumnDraft): void {
    draft.rules.push({ value: '', filter: null });
    this.onTransformationChange();
  }

  removeTransformationRule(draft: TransformationColumnDraft, index: number): void {
    draft.rules.splice(index, 1);
    this.onTransformationChange();
  }

  /** Per-card chip: a card is Applied only when it is complete and its name is unique. */
  transformationDraftStatus(draft: TransformationColumnDraft): { label: string; tone: 'applied' | 'pending' | 'default' } {
    const code = draft.code.trim();
    const isDuplicate = !!code && this.transformationDrafts.some((other) => other !== draft && other.code.trim() === code);
    if (this.buildTransformationConfigForDraft(draft)) {
      return isDuplicate ? { label: 'Duplicate name', tone: 'pending' } : { label: 'Applied', tone: 'applied' };
    }
    if (this.draftHasWork(draft) || isDuplicate) return { label: 'Pending', tone: 'pending' };
    return { label: 'Not defined', tone: 'default' };
  }

  toggleTransformationDraft(draft: TransformationColumnDraft): void {
    draft.open = !draft.open;
    this.cdr.markForCheck();
  }

  /** Append another empty "Create new categorical column" card. */
  addTransformationDraft(): void {
    this.transformationDrafts.push(emptyTransformationDraft());
    this.transformationApplyError = '';
    this.onTransformationChange();
  }

  /**
   * Remove a card. The first card is the primary one: it is cleared, not removed,
   * so the stage always keeps at least one editor (same behavior as shared Clear).
   */
  removeTransformationDraft(id: number): void {
    const index = this.transformationDrafts.findIndex((draft) => draft.id === id);
    if (index < 0) {
      return;
    }
    if (this.transformationDrafts.length === 1) {
      this.transformationDrafts[0] = emptyTransformationDraft();
    } else {
      this.transformationDrafts.splice(index, 1);
    }
    this.transformationApplyError = '';
    this.onTransformationChange();
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

  formatPreprocessingDocumentationHtml(stepName: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      this.buildPreprocessingDocumentationHtml(this.preprocessingStepDocumentation(stepName))
    );
  }

  private buildPreprocessingDocumentationHtml(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }

    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const lines = trimmed.includes('\n')
      ? trimmed.split(/\r?\n/)
      : trimmed.split(/\s+-\s+(?=[A-Za-z])/);

    const parts: string[] = [];
    let listItems: string[] = [];
    let isIntroParagraph = true;

    const flushList = (): void => {
      if (!listItems.length) {
        return;
      }
      parts.push(`<ul class="preprocessing-doc-list">${listItems.join('')}</ul>`);
      listItems = [];
    };

    const pushParagraph = (line: string): void => {
      const escaped = escapeHtml(line);
      if (line.endsWith(':') && line.length <= 120) {
        parts.push(`<p class="preprocessing-doc-section-title">${escaped}</p>`);
        isIntroParagraph = false;
        return;
      }

      const classes = isIntroParagraph
        ? 'preprocessing-doc-paragraph preprocessing-doc-intro'
        : 'preprocessing-doc-paragraph';
      parts.push(`<p class="${classes}">${escaped}</p>`);
      isIntroParagraph = false;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      let itemText = line.startsWith('- ') ? line.slice(2).trim() : line;
      const colonIndex = itemText.indexOf(':');
      const looksLikeListItem =
        line.startsWith('- ') ||
        (colonIndex > 0 && colonIndex < 40 && itemText.slice(colonIndex + 1).trim().length > 0);

      if (looksLikeListItem && colonIndex > 0) {
        const term = escapeHtml(itemText.slice(0, colonIndex).trim());
        const description = escapeHtml(itemText.slice(colonIndex + 1).trim());
        listItems.push(
          `<li><span class="preprocessing-doc-term">${term}</span><span class="preprocessing-doc-desc">${description}</span></li>`
        );
        continue;
      }

      if (line.startsWith('- ')) {
        listItems.push(`<li><span class="preprocessing-doc-desc">${escapeHtml(itemText)}</span></li>`);
        continue;
      }

      flushList();
      pushParagraph(line);
    }

    flushList();
    return parts.join('');
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

  coverageFor(variable: VariableRow): { total: number; missing: number; share: number } | null {
    return this.blockCoverage(this.summaryBlockFor(variable));
  }

  /** Block-based coverage. Both rails price a variable the same way, so the
   *  lookup lives here and coverageFor() stays the variable-based entry. */
  blockCoverage(block: PivotBlock | null | undefined): { total: number; missing: number; share: number } | null {
    if (!block) return null;
    const total = this.statisticMetricNumber(block, 'Total');
    if (total <= 0) return null;
    const missing = Math.min(this.statisticMissingValue(block), total);
    return { total, missing, share: missing / total };
  }

  /** Display form of a canonical pivot value: parse the stored string, then
   *  locale-group it. Storage and CSV export use `formatNumber`, never this. */
  displayNumber(value: string | undefined | null): string {
    if (value === null || value === undefined || value === '') return value ?? '';
    const n = Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(n)) return value;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  missingShareNote(block: PivotBlock, row: PivotBlock['rows'][number], dataset: string): string | null {
    if (row.metric !== 'Missing') return null;
    const parse = (metric: string) =>
      Number((block.rows.find((item) => item.metric === metric)?.values[dataset] ?? '').replace(/,/g, ''));
    const missing = parse('Missing');
    const total = parse('Total');
    if (!Number.isFinite(missing) || !Number.isFinite(total) || total <= 0) return null;
    return this.coveragePercent({ share: Math.min(missing / total, 1) });
  }

  /** The rail's foot: coverage re-pooled over every variable currently shown.
   *  Per-variable shares are not additive, so this sums the counts and divides
   *  once — averaging 0.7% and 100% would state a number that describes no
   *  dataset. Null when no shown block has statistics, so the foot disappears
   *  rather than reporting 0%. */
  selectionCoverage(kind: SummaryKind): { total: number; missing: number; share: number; variables: number } | null {
    let total = 0;
    let missing = 0;
    let variables = 0;
    for (const block of this.filteredStatisticBlocks(kind)) {
      const coverage = this.blockCoverage(block);
      if (!coverage) continue;
      total += coverage.total;
      missing += coverage.missing;
      variables += 1;
    }
    if (variables === 0 || total <= 0) return null;
    return { total, missing, share: Math.min(missing / total, 1), variables };
  }

  /** The pooled column is a rollup, not another dataset. Normalised through the
   *  same label lookup the header uses, because the pivot columns are already
   *  labelled and the header labels them again — this holds either way. */
  isRollupColumn(column: string): boolean {
    return this.datasetLabel(column) === this.datasetLabel('all datasets');
  }

  private isCountMetric(metric: string | undefined): boolean {
    return metric === 'Datapoints' || metric === 'Missing' || metric === 'Total';
  }

  /** Group heading rendered above rows[index], or null when the row continues
   *  the group above it. A group starts where count-ness changes. */
  metricGroupLabel(rows: PivotBlock['rows'], index: number): string | null {
    const here = this.isCountMetric(rows[index]?.metric);
    if (index === 0 || this.isCountMetric(rows[index - 1]?.metric) !== here) {
      return here ? 'Coverage' : 'Distribution';
    }
    return null;
  }

  coveragePercent(coverage: { share: number }): string {
    return this.formatPercent(coverage.share * 100);
  }

  /** The full count belongs in its tooltip; the row only carries the share. */
  coverageTitle(coverage: { total: number; missing: number }): string {
    return `${coverage.missing.toLocaleString()} of ${coverage.total.toLocaleString()} values missing`;
  }

  /** An unpriced decision must say why it is unpriced, not render blank.
     Shared by both preprocessing evidence panes. */
  summaryUnavailableNote(): string {
    return this.rawSummary.isLoading
      ? 'Loading dataset statistics\u2026'
      : 'No dataset statistics are available for this variable, so neither the distribution nor the row cost can be shown.';
  }

  /** Three bands. At the old single 10% floor 30% and 100% rendered in the same
   *  red, so across a rail of variables the colour ranked nothing. 10% keeps the
   *  studio's existing "worth noticing" onset; 50% is where a variable stops
   *  being usable. The exact figure always sits beside the colour. */
  coverageSeverity(coverage: { share: number }): 'none' | 'warning' | 'high' {
    if (coverage.share >= 0.5) return 'high';
    if (coverage.share >= 0.1) return 'warning';
    return 'none';
  }

  distributionFor(variable: VariableRow): Array<{ label: string; value: string }> {
    const block = this.summaryBlockFor(variable);
    if (!block) return [];
    // A nominal block carries no quantile rows at all, so the lookups come back
    // 'N/A'; those are absent data, not values, and must not render as a row of N/A.
    return (['min', 'q1', 'q2', 'q3', 'max'] as const)
      .map((key) => ({
        label: this.metricLabel[key],
        value: this.displayNumber(this.statisticMetricText(block, this.metricLabel[key])),
      }))
      .filter((point) => point.value !== 'N/A');
  }

  /** Category frequencies. In the pivot these are the rows after the three
   *  count metrics, so anything that is not a count metric is a category — but
   *  only for a nominal block. A numeric block's remaining rows are Mean/Std/
   *  Min/Q1/Q2/Q3/Max, which are not categories and were being relabelled. */
  categoryCountsFor(variable: VariableRow, limit = 6): Array<{ label: string; value: string; share: number }> {
    if (!this.isCategoricalVariable(variable)) return [];
    const block = this.summaryBlockFor(variable);
    if (!block) return [];
    const base = new Set(['Datapoints', 'Missing', 'Total']);
    const dataset = block.columns.includes('all datasets') ? 'all datasets' : block.columns[0];
    const datapoints = Number((block.rows.find((row) => row.metric === 'Datapoints')?.values[dataset] ?? '').replace(/,/g, ''));
    return block.rows
      .filter((row) => !base.has(row.metric))
      .map((row) => {
        const value = row.values[dataset] ?? '';
        const count = Number(value.replace(/,/g, ''));
        return {
          label: row.metric,
          value: this.displayNumber(value || '0'),
          share: Number.isFinite(count) && datapoints > 0 ? Math.min(count / datapoints, 1) : 0,
        };
      })
      .slice(0, limit);
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

  ruleFor(variable: VariableRow): PreprocessingRule {
    if (!this.pendingPreprocessingRules[variable.code]) {
      this.pendingPreprocessingRules[variable.code] = this.defaultRule(variable.code);
    }
    return this.pendingPreprocessingRules[variable.code];
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

  outlierRuleFor(variable: VariableRow): OutlierRule {
    if (!this.pendingOutlierRules[variable.code]) {
      this.pendingOutlierRules = {
        ...this.pendingOutlierRules,
        [variable.code]: this.defaultOutlierRule(variable.code),
      };
    }
    return this.pendingOutlierRules[variable.code];
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

  resetChanges(): void {
    const nextPending = this.cloneRules(this.pendingPreprocessingRules);
    this.currentPreprocessingCodeSet().forEach((code) => {
      nextPending[code] = this.appliedPreprocessingRules[code]
        ? { ...this.appliedPreprocessingRules[code] }
        : this.defaultRule(code);
    });
    this.pendingPreprocessingRules = nextPending;
    const nextOutlierPending = cloneOutlierRules(this.pendingOutlierRules);
    this.currentOutlierPreprocessingCodeSet().forEach((code) => {
      nextOutlierPending[code] = this.appliedOutlierRules[code]
        ? { ...this.appliedOutlierRules[code] }
        : this.defaultOutlierRule(code);
    });
    this.pendingOutlierRules = nextOutlierPending;
    this.longitudinalVisit1 = this.appliedLongitudinalVisit1;
    this.longitudinalVisit2 = this.appliedLongitudinalVisit2;
    this.pendingLongitudinalStrategies = { ...this.appliedLongitudinalStrategies };
    this.ensureLongitudinalDefaults();
    this.preprocessingValidationErrors = {};
    this.outlierValidationErrors = {};
    this.updatePreprocessingStatus();
    this.emitProgressState();
    this.cdr.markForCheck();
  }

  previewOutlierReport(): void {
    this.ensureDefaultRulesForCurrentSelection();
    this.ensureOutlierDefaultsForCurrentSelection();
    const validationErrors = {
      ...this.validatePendingMissingRules(),
      ...this.validatePendingOutlierRules(),
    };
    if (Object.keys(validationErrors).length > 0) {
      this.preprocessingValidationErrors = validationErrors;
      const outlierCodes = this.currentOutlierPreprocessingCodeSet();
      this.outlierValidationErrors = Object.fromEntries(
        Object.entries(validationErrors).filter(([code]) => outlierCodes.has(code))
      );
      this.outlierPreviewRows = [];
      this.outlierPreviewError = 'Fix the outlier preprocessing rules before previewing.';
      this.cdr.markForCheck();
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

  applyPreprocessing(): void {
    this.ensureDefaultRulesForCurrentSelection();
    this.ensureOutlierDefaultsForCurrentSelection();
    this.ensureLongitudinalDefaults();
    if (this.pendingChangeCount === 0) return;
    const validationErrors = this.validatePendingRules();
    if (Object.keys(validationErrors).length > 0) {
      this.preprocessingValidationErrors = validationErrors;
      const outlierCodes = this.currentOutlierPreprocessingCodeSet();
      this.outlierValidationErrors = Object.fromEntries(
        Object.entries(validationErrors).filter(([code]) => outlierCodes.has(code))
      );
      this.cdr.markForCheck();
      return;
    }
    this.clearOutlierPreview();

    const currentCodes = this.currentPreprocessingCodeSet();
    const preprocessing = this.buildPreprocessingConfig(this.pendingPreprocessingRules, currentCodes);
    if (!preprocessing) {
      this.appliedPreprocessingRules = this.mergeRulesForCurrentSelection(
        this.appliedPreprocessingRules,
        this.pendingPreprocessingRules
      );
      this.appliedOutlierRules = this.mergeOutlierRulesForCurrentSelection(
        this.appliedOutlierRules,
        this.pendingOutlierRules
      );
      this.appliedLongitudinalEnabled = this.isLongitudinalModel;
      this.appliedLongitudinalVisit1 = this.longitudinalVisit1;
      this.appliedLongitudinalVisit2 = this.longitudinalVisit2;
      this.appliedLongitudinalStrategies = { ...this.pendingLongitudinalStrategies };
      this.processedSummary = this.createEmptySummary(false);
      this.persistAppliedDescriptivePreprocessing(null);
      this.preprocessingStatus = 'none';
      this.sectionOpen.update((open) => ({ ...open, processed: false }));
      this.successMessage = '';
      this.emitProgressState();
      this.cdr.markForCheck();
      return;
    }

    const variableCodes = this.preprocessingVariables.map((variable) => variable.code);
    this.isApplyingPreprocessing = true;
    this.processedSummary = this.createEmptySummary(true);
    this.summaryExpanded.update((expanded) => ({ ...expanded, setup: true }));
    this.goToSection('processed');
    this.preprocessingValidationErrors = {};
    this.outlierValidationErrors = {};
    this.cdr.markForCheck();

    this.expStudioService.loadDescriptiveOverview(variableCodes, preprocessing).subscribe({
      next: (response) => {
        this.processedSummary = this.buildSummaryFromResponse(response, 'processed');
        this.processedSummaryKey = this.buildProcessedSummaryKey(variableCodes, preprocessing);
        this.appliedPreprocessingRules = this.mergeRulesForCurrentSelection(
          this.appliedPreprocessingRules,
          this.pendingPreprocessingRules
        );
        this.appliedOutlierRules = this.mergeOutlierRulesForCurrentSelection(
          this.appliedOutlierRules,
          this.pendingOutlierRules
        );
        this.appliedLongitudinalEnabled = this.isLongitudinalModel;
        this.appliedLongitudinalVisit1 = this.longitudinalVisit1;
        this.appliedLongitudinalVisit2 = this.longitudinalVisit2;
        this.appliedLongitudinalStrategies = { ...this.pendingLongitudinalStrategies };
        this.persistAppliedDescriptivePreprocessing(preprocessing);
        this.userPreprocessingApplied = true;
        this.preprocessingStatus = 'applied';
        this.isApplyingPreprocessing = false;
        this.successMessage = '';
        this.refreshActiveHistogramPreview('processed');
        this.emitProgressState();
        // Apply & Continue: hand the user to the next station, not to the summary they just applied.
        this.goToSection('transformation');
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.isApplyingPreprocessing = false;
        this.processedSummary = this.createEmptySummary(false);
        this.sectionOpen.update((open) => ({ ...open, processed: true }));
        this.cdr.markForCheck();
      },
    });
  }

  fetchDescriptiveStatistics(): void {
    if (!this.expStudioService.selectedDataModel() || this.expStudioService.selectedDatasets().length === 0) {
      this.expStudioService.clearDataExclusionWarnings();
      this.rawSummary = this.createEmptySummary(false);
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
      this.expStudioService.clearDataExclusionWarnings();
      this.rawSummary = this.createEmptySummary(false);
      this.processedData = [];
      this.isLoading = false;
      this.cdr.markForCheck();
      return;
    }

    const variableCodes = items.map((item) => item.code);
    this.expStudioService.loadDescriptiveOverview(variableCodes, null).subscribe({
      next: (response) => {
        this.expStudioService.setDataExclusionWarnings([], []);
        this.rawSummary = this.buildSummaryFromResponse(response, 'raw');
        this.processedData = this.rawSummary.data;
        this.isLoading = false;
        this.refreshActiveHistogramPreview('raw');
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.expStudioService.clearDataExclusionWarnings();
        this.rawSummary = { ...this.rawSummary, isLoading: false };
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  variableLabel(variable: VariableRow): string {
    return variable.name ?? variable.label ?? variable.code;
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

      await this.pdfExportService.exportDescriptiveStatisticsPdf({
        pathologyName,
        variables: this.pivotBlocksWithDatasetLabels(summary.data),
        models: [],
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

    const filename = `${kind === 'raw' ? 'raw' : 'processed'}_data_summary.csv`;
    this.csvExportService.exportToCsv(rows, ['Variable', 'Metric', 'Dataset', 'Value'], filename);
  }

  private createEmptySummary(isLoading: boolean): SummaryView {
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
      activeBoxPlotIndex: 0,
      activeNominalIndex: 0,
      selectedStatisticKey: null,
    };
  }

  private getSummary(kind: SummaryKind): SummaryView {
    return kind === 'raw' ? this.rawSummary : this.processedSummary;
  }

  private sectionElement(section: SectionKey): ElementRef<HTMLElement> | undefined {
    switch (section) {
      case 'raw':
        return this.rawSection;
      case 'setup':
        return this.setupSection;
      case 'filters':
        return this.filtersSection;
      case 'processed':
        return this.processedSection;
      case 'transformation':
        return this.transformationSection;
      default: {
        const _exhaustive: never = section;
        return _exhaustive;
      }
    }
  }

  private scrollSectionIntoView(section: SectionKey): void {
    const element = this.sectionElement(section)?.nativeElement;
    if (!element) return;

    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  private buildSummaryFromResponse(response: unknown, kind: SummaryKind): SummaryView {
    const current = this.getSummary(kind);
    const featurewise = getFeaturewiseDescribeRows(response);
    const dsFromPayload = Array.from(
      new Set((featurewise ?? []).map((item: any) => String(item.dataset)))
    ) as string[];
    const datasetOrder = dsFromPayload
      .filter((dataset) => dataset && dataset !== 'all datasets')
      .concat('all datasets');
    const variableList = this.preprocessingVariables;
    const data = this.pivotByDataset(featurewise, variableList, datasetOrder);
    const distributionState = this.buildDistributionState(featurewise, response);
    const summary: SummaryView = {
      ...current,
      data,
      featurewiseRows: featurewise,
      isLoading: false,
      activeTab: current.activeTab,
      selectedStatisticKey: this.nextStatisticSelection(data, current.selectedStatisticKey),
      histogramDataByVariable: {},
      histogramLoadingByVariable: {},
      histogramErrorByVariable: {},
      ...distributionState,
    };
    return summary;
  }

  private refreshActiveHistogramPreview(kind: SummaryKind): void {
    const summary = this.getSummary(kind);
    if (summary.activeTab !== 'Histogram') return;
    const block = this.selectedStatisticBlock(kind);
    if (!block) return;
    this.ensureHistogramForBlock(kind, block);
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

  private ensureHistogramForBlock(kind: SummaryKind, block: PivotBlock): void {
    const code = this.variableCodeForBlock(block);
    if (!code) return;

    const summary = this.getSummary(kind);
    if (summary.histogramLoadingByVariable[code]) return;
    if (summary.histogramDataByVariable[code]) return;

    const fromDescribe = this.buildHistogramFromDescribeCounts(kind, code, block);
    if (fromDescribe) {
      summary.histogramDataByVariable = {
        ...summary.histogramDataByVariable,
        [code]: fromDescribe,
      };
      summary.histogramErrorByVariable = {
        ...summary.histogramErrorByVariable,
        [code]: '',
      };
      this.cdr.markForCheck();
      return;
    }

    summary.histogramLoadingByVariable = {
      ...summary.histogramLoadingByVariable,
      [code]: true,
    };
    summary.histogramErrorByVariable = {
      ...summary.histogramErrorByVariable,
      [code]: '',
    };
    this.cdr.markForCheck();

    // Raw summary describe loads without preprocessing; keep histogram aligned.
    const preprocessingOverride = kind === 'processed'
      ? this.expStudioService.getAppliedDescriptivePreprocessing()
      : null;

    this.expStudioService
      .getAlgorithmResults(AlgorithmNames.HISTOGRAM, [code], null, preprocessingOverride)
      .subscribe({
        next: (response) => {
          const nextSummary = this.getSummary(kind);
          const parsed = this.parseHistogramResponse(response, code, block, kind);
          if (parsed.data) {
            nextSummary.histogramDataByVariable = {
              ...nextSummary.histogramDataByVariable,
              [code]: parsed.data,
            };
            nextSummary.histogramErrorByVariable = {
              ...nextSummary.histogramErrorByVariable,
              [code]: '',
            };
          } else {
            nextSummary.histogramErrorByVariable = {
              ...nextSummary.histogramErrorByVariable,
              [code]: parsed.error,
            };
          }
          nextSummary.histogramLoadingByVariable = {
            ...nextSummary.histogramLoadingByVariable,
            [code]: false,
          };
          this.cdr.markForCheck();
        },
        error: () => {
          const nextSummary = this.getSummary(kind);
          nextSummary.histogramLoadingByVariable = {
            ...nextSummary.histogramLoadingByVariable,
            [code]: false,
          };
          nextSummary.histogramErrorByVariable = {
            ...nextSummary.histogramErrorByVariable,
            [code]: 'Failed to load histogram preview.',
          };
          this.cdr.markForCheck();
        },
      });
  }

  private buildHistogramFromDescribeCounts(
    kind: SummaryKind,
    code: string,
    block: PivotBlock
  ): HistogramPreviewData | null {
    const featurewise = this.getSummary(kind).featurewiseRows;
    const row = featurewise.find(
      (item: { variable?: string; dataset?: string }) =>
        item?.variable === code && String(item?.dataset ?? '') === 'all datasets'
    ) ?? featurewise.find((item: { variable?: string }) => item?.variable === code);
    const counts = (row as { data?: { counts?: Record<string, number> } })?.data?.counts;
    if (!counts || typeof counts !== 'object' || !Object.keys(counts).length) {
      return null;
    }

    const variable = this.statisticBlockVariable(block);
    const binCodes = Object.keys(counts);
    const binsWithLabels = this.mapBinsToEnumLabels(binCodes, variable?.enumerations);
    const mappedCounts = binCodes.map((key) => {
      const value = counts[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    });
    if (!mappedCounts.some((count) => count !== null && count > 0)) {
      return null;
    }

    return {
      bins: binsWithLabels.map((bin) => String(bin)),
      counts: mappedCounts,
      variableName: block.name,
      variableType: this.statisticBlockType(kind, block),
    };
  }

  private extractTransientHistogramError(response: unknown, payload: unknown): string | null {
    const candidates: unknown[] = [payload, response];
    if (response && typeof response === 'object' && 'result' in (response as object)) {
      candidates.push((response as { result?: unknown }).result);
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        continue;
      }
      const record = candidate as Record<string, unknown>;
      const data = record['data'];
      if (typeof data === 'string' && data.trim()) {
        return data.trim();
      }
      const message = record['message'];
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }

    return null;
  }

  private parseHistogramResponse(
    response: unknown,
    code: string,
    block: PivotBlock,
    kind: SummaryKind
  ): { data: HistogramPreviewData | null; error: string } {
    if (!response) {
      return { data: null, error: 'Failed to load histogram preview.' };
    }

    const payload = (response as { result?: unknown })?.result ?? response;
    const histList = Array.isArray((payload as { histogram?: unknown })?.histogram)
      ? (payload as { histogram: unknown[] }).histogram
      : Array.isArray((response as { histogram?: unknown })?.histogram)
        ? (response as { histogram: unknown[] }).histogram
        : [];

    const item = (histList as Array<{ var?: string; variable?: string; grouping_var?: string | null; bins?: unknown; counts?: unknown }>).find((entry) => {
      const entryCode = String(entry?.var ?? entry?.variable ?? '');
      const matchesCode = entryCode === code || entryCode.toLowerCase() === code.toLowerCase();
      return matchesCode && !entry?.grouping_var;
    })
      ?? (histList as Array<{ var?: string; variable?: string; bins?: unknown; counts?: unknown }>).find((entry) => {
        const entryCode = String(entry?.var ?? entry?.variable ?? '');
        return entryCode === code || entryCode.toLowerCase() === code.toLowerCase();
      })
      ?? histList[0];

    const bins = (item as { bins?: unknown })?.bins;
    const counts = (item as { counts?: unknown })?.counts;
    if (!item || !Array.isArray(bins) || !Array.isArray(counts) || !bins.length) {
      const backendError = this.extractTransientHistogramError(response, payload);
      if (backendError) {
        return { data: null, error: backendError };
      }
      const fallback = kind === 'processed'
        ? 'No histogram data available for this variable after preprocessing. The federated histogram preview returned no bins—often because preprocessing removed too many rows or the execution engine reported an error.'
        : 'No histogram data available for this variable.';
      return { data: null, error: fallback };
    }

    const numericCounts = counts.map((count: unknown) => {
      if (count === null || count === undefined) return null;
      const value = typeof count === 'number' ? count : Number(count);
      return Number.isFinite(value) ? value : null;
    });
    if (!numericCounts.some((count) => count !== null && count > 0)) {
      return {
        data: null,
        error: 'Histogram counts are unavailable (privacy threshold or insufficient data after preprocessing).',
      };
    }

    const variable = this.statisticBlockVariable(block);
    const binsWithLabels = this.mapBinsToEnumLabels(bins, variable?.enumerations);
    const binLabels = binsWithLabels.map((bin) => String(bin));
    const clipped = shouldClipNullEdges(binLabels)
      ? clipHistogramNullEdges(binLabels, numericCounts)
      : { bins: binLabels, counts: numericCounts };
    if (!clipped.bins.length || !clipped.counts.length) {
      return {
        data: null,
        error: 'Histogram counts are unavailable (privacy threshold or insufficient data after preprocessing).',
      };
    }

    return {
      data: {
        bins: clipped.bins,
        counts: clipped.counts,
        variableName: block.name,
        variableType: this.statisticBlockType(kind, block),
      },
      error: '',
    };
  }

  private buildDistributionState(featurewise: any[], response: unknown): Pick<SummaryView,
    'showDistributions' | 'distributionSubTab' | 'nonNominalVariables' | 'nominalVariables' |
    'chartsForBoxPlot' | 'chartsForNominal' | 'activeBoxPlotIndex' | 'activeNominalIndex'
  > {
    const selectedVars = this.expStudioService.selectedVariables() as VariableRow[];
    const unique = Array.from(new Map(selectedVars.map((v) => [v.code, v])).values());

    const varsWithCounts = new Set<string>();
    for (const item of featurewise) {
      if (item.data && item.data.counts && Object.keys(item.data.counts).length > 0) {
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

    const datasetLabels = this.expStudioService.getDatasetLabelMap();
    const chartsForBoxPlot = nonNominalVariables.map((v) => {
      const perVarResp = {
        ...(response as Record<string, unknown>),
        result: {
          ...((response as { result?: Record<string, unknown> })?.result ?? {}),
          featurewise: featurewise.filter(
            (row: any) => row.variable === v.code && row.dataset !== 'all datasets'
          ),
          dataset_labels: datasetLabels,
        },
      };
      return this.chartBuilder.getChartsForAlgorithm('describe', perVarResp);
    });

    const chartsForNominal = nominalVariables.map((v) => {
      const varData = featurewise.filter((row: any) => row.variable === v.code);
      const varLabel = this.variableLabel(v);
      const enumMap = this.getEnumLabelMap(v);
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
        fold: this.formatOutlierBound(data['fold']),
        lowerBound: this.formatOutlierBound(data['lower_bound']),
        upperBound: this.formatOutlierBound(data['upper_bound']),
        lowerOutliers: this.formatInteger(data['lower_outlier_count'], '-'),
        upperOutliers: this.formatInteger(data['upper_outlier_count'], '-'),
        totalOutliers: this.formatInteger(data['total_outlier_count'], '-'),
        outlierPercentage: this.formatOutlierPercentage(data['total_outlier_percentage']),
      };
    });
  }

  private variableLabelForCode(code: string): string {
    const variable = this.preprocessingVariables.find((item) => item.code === code);
    return variable ? this.variableLabel(variable) : code;
  }

  /** Canonical (painted + exported) pivot cell: fixed 2 decimals, no grouping. */
  private formatNumber(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'N/A';
    const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(n)) return String(value);
    return n.toFixed(2);
  }

  /** Outlier preview bounds keep the old 6-decimal preview precision. */
  private formatOutlierBound(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  private formatInteger(value: unknown, empty = 'N/A'): string {
    if (value === null || value === undefined || value === '') return empty;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    return String(Math.round(n));
  }

  private formatPercent(pct: number, digits?: number): string {
    const d = digits ?? (pct >= 10 || pct === 0 ? 0 : 1);
    return `${pct.toFixed(d)}%`;
  }

  private formatOutlierPercentage(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(num)) return '-';
    return this.formatPercent(num, 2);
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

  /** Build the exaflow config for one card, or null when it is not yet complete. */
  buildTransformationConfigForDraft(draft: TransformationColumnDraft): Record<string, unknown> | null {
    const code = draft.code.trim();
    if (!code) return null;
    const rules: Record<string, BackendFilter> = {};
    for (const r of draft.rules) {
      const value = r.value.trim();
      if (value && r.filter) rules[value] = r.filter;
    }
    if (!Object.keys(rules).length) return null;
    const config: Record<string, unknown> = {
      code,
      strategy: 'filter_rules',
      rules,
    };
    const def = draft.defaultEnumeration.trim();
    if (def) config['default_enumeration'] = def;
    return config;
  }

  /**
   * Payload for the shared store: one object for a single column (legacy shape) or
   * an array for two+. Incomplete cards drop out, and a duplicate-name card never
   * reaches the store (only the first occurrence of a code is kept).
   */
  private transformationConfigPayload(): Record<string, unknown> | Record<string, unknown>[] | null {
    const seen = new Set<string>();
    const configs: Record<string, unknown>[] = [];
    for (const config of this.transformationConfigs()) {
      const code = String(config['code'] ?? '').trim();
      if (code) {
        if (seen.has(code)) continue;
        seen.add(code);
      }
      configs.push(config);
    }
    if (!configs.length) return null;
    return configs.length === 1 ? configs[0] : configs;
  }

  onTransformationChange(): void {
    // Transformation is written into APPLIED_DESCRIPTIVE_PREPROCESSING on edit (it
    // does not wait for the shared Apply preprocessing button). The Pending/Applied
    // chip derives from the live drafts, so no separate applied snapshot is kept.
    this.expStudioService.setTransformationPreprocessing(this.transformationConfigPayload());
    this.emitProgressState();
    this.cdr.markForCheck();
  }

  /** Placeholder (null-count) rows for one card so Preview shows the category shape. */
  private placeholderRowsForDraft(draft: TransformationColumnDraft): Array<{ value: string; count: number | null }> {
    const configuredValues = draft.rules.map((r) => r.value.trim()).filter((v) => v.length > 0);
    const rows: Array<{ value: string; count: number | null }> = configuredValues.map((value) => ({ value, count: null }));
    const def = draft.defaultEnumeration.trim();
    if (def && !configuredValues.includes(def)) {
      rows.push({ value: def, count: null });
    }
    return rows;
  }

  refreshTransformationStatistics(): void {
    // One stats table per named card; counts come from a single describe over all columns.
    const placeholderBlocks = this.transformationDrafts
      .filter((draft) => draft.code.trim().length > 0)
      .map((draft) => ({ code: draft.code.trim(), rows: this.placeholderRowsForDraft(draft) }));
    const configs = this.transformationConfigs();

    if (!configs.length) {
      this.transformationStatistics = placeholderBlocks;
      this.transformationStatisticsError = this.transformationRulesNeedFilters
        ? 'Each named category needs a filter before counts can be loaded.'
        : '';
      this.isTransformationStatsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    const columnCodes = configs.map((config) => String(config['code'] ?? '').trim()).filter(Boolean);
    const columnSet = new Set(columnCodes);
    const sourceCodes = Array.from(
      new Set(
        [
          ...configs.flatMap((config) =>
            Object.values((config['rules'] as Record<string, BackendFilter>) ?? {}).flatMap((filter) =>
              this.expStudioService.filterVariableCodes(filter)
            )
          ),
          ...this.expStudioService.selectedVariables().map((v) => String(v?.code ?? '')),
        ]
          .map((code) => String(code).trim())
          .filter((code) => !!code && !columnSet.has(code))
      )
    );

    if (!sourceCodes.length) {
      this.transformationStatistics = placeholderBlocks;
      this.transformationStatisticsError =
        'Category filters must reference at least one data-model variable before counts can be loaded.';
      this.isTransformationStatsLoading = false;
      this.cdr.markForCheck();
      return;
    }

    const requestId = ++this.transformationStatsRequestId;
    this.isTransformationStatsLoading = true;
    this.transformationStatisticsError = '';
    this.transformationStatistics = placeholderBlocks;
    this.cdr.markForCheck();

    const preprocessing = this.expStudioService.getAppliedDescriptivePreprocessing();
    this.expStudioService
      .loadDescriptiveOverview(columnCodes, preprocessing, sourceCodes)
      .subscribe({
        next: (response) => {
          if (requestId !== this.transformationStatsRequestId) return;
          if (!response) {
            this.transformationStatisticsError = 'Failed to load category counts.';
            this.isTransformationStatsLoading = false;
            this.cdr.markForCheck();
            return;
          }
          this.transformationStatistics = configs.map((config) => {
            const code = String(config['code'] ?? '').trim();
            const rules = (config['rules'] as Record<string, BackendFilter>) ?? {};
            const def = String(config['default_enumeration'] ?? '').trim();
            return {
              code,
              rows: this.buildTransformationStatisticsFromDescribe(response, code, Object.keys(rules), def),
            };
          });
          const hasAnyCount = this.transformationStatistics.some((block) =>
            block.rows.some((row) => typeof row.count === 'number' && Number.isFinite(row.count))
          );
          this.transformationStatisticsError = hasAnyCount
            ? ''
            : 'No counts were returned (privacy threshold or insufficient data after preprocessing).';
          this.isTransformationStatsLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (requestId !== this.transformationStatsRequestId) return;
          this.transformationStatisticsError = 'Failed to load category counts.';
          this.isTransformationStatsLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private buildTransformationStatisticsFromDescribe(
    response: unknown,
    columnCode: string,
    configuredValues: string[],
    defaultEnumeration: string
  ): Array<{ value: string; count: number | null }> {
    const featurewise = getFeaturewiseDescribeRows(response);
    const row =
      featurewise.find(
        (item: { variable?: string; dataset?: string }) =>
          item?.variable === columnCode && String(item?.dataset ?? '') === 'all datasets'
      ) ??
      featurewise.find((item: { variable?: string }) => item?.variable === columnCode);
    const counts = (row as { data?: { counts?: Record<string, number> } })?.data?.counts ?? {};
    const ordered = [...configuredValues];
    if (defaultEnumeration && !ordered.includes(defaultEnumeration)) {
      ordered.push(defaultEnumeration);
    }
    Object.keys(counts).forEach((key) => {
      if (!ordered.includes(key)) ordered.push(key);
    });
    return ordered.map((value) => {
      const raw = counts[value];
      const count = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      return { value, count };
    });
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

  private validatePendingRules(): Record<string, string> {
    return {
      ...this.validatePendingMissingRules(),
      ...this.validatePendingOutlierRules(),
      ...this.validatePendingLongitudinalRules(),
    };
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
    this.successMessage = '';
    this.clearOutlierPreview();
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
        this.userPreprocessingApplied = true;
      }
    } else {
      this.ensureDefaultRulesForCurrentSelection(currentCodes);
      this.ensureOutlierDefaultsForCurrentSelection();
      // No persisted config means this session has no explicit apply yet.
      this.userPreprocessingApplied = false;
    }
    this.preprocessingValidationErrors = Object.fromEntries(
      Object.entries(this.preprocessingValidationErrors).filter(([code]) => currentCodes.has(code))
    );
    const outlierCodes = this.currentOutlierPreprocessingCodeSet();
    this.outlierValidationErrors = Object.fromEntries(
      Object.entries(this.outlierValidationErrors).filter(([code]) => outlierCodes.has(code))
    );
    this.sectionOpen.update((open) => ({ ...open, processed: false }));
    this.successMessage = '';
    this.ensureLongitudinalDefaults();
    this.updatePreprocessingStatus();
    this.syncAppliedPreprocessingForCurrentSelection();
    if (this.preprocessingStatus === 'applied') {
      this.fetchProcessedSummaryForAppliedPreprocessing();
    } else {
      this.processedSummary = this.createEmptySummary(false);
      this.processedSummaryKey = '';
    }
  }

  private fetchProcessedSummaryForAppliedPreprocessing(): void {
    if (this.preprocessingStatus !== 'applied') return;

    const preprocessing = this.expStudioService.getAppliedDescriptivePreprocessing();
    if (!preprocessing) return;

    const variableCodes = this.preprocessingVariables.map((variable) => variable.code);
    if (!variableCodes.length) return;

    const nextKey = this.buildProcessedSummaryKey(variableCodes, preprocessing);
    if (nextKey === this.processedSummaryKey) return;

    this.processedSummaryKey = nextKey;
    const previousProcessedSummary = this.processedSummary;
    this.processedSummary = {
      ...this.createEmptySummary(true),
      activeTab: previousProcessedSummary.activeTab,
      selectedStatisticKey: previousProcessedSummary.selectedStatisticKey,
    };
    this.cdr.markForCheck();

    this.expStudioService.loadDescriptiveOverview(variableCodes, preprocessing).subscribe({
      next: (response) => {
        this.processedSummary = this.buildSummaryFromResponse(response, 'processed');
        this.preprocessingStatus = 'applied';
        this.refreshActiveHistogramPreview('processed');
        this.emitProgressState();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.processedSummary = this.createEmptySummary(false);
        this.processedSummaryKey = '';
        this.cdr.markForCheck();
      },
    });
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
    const nextApplied = this.cloneRules(this.appliedPreprocessingRules);
    const nextPending = this.cloneRules(this.pendingPreprocessingRules);

    currentCodes.forEach((code) => {
      const strategy = String(strategies[code] ?? '');
      const action = this.isMissingAction(strategy) ? strategy : 'no_action';
      const rule: PreprocessingRule = action === 'no_action'
        ? this.emptyRule(code)
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
          ...(existingPending && this.serializeRule(existingPending) !== this.serializeRule(rule)
            ? existingPending
            : this.defaultRule(code)),
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

    this.hydrateAppliedTransformation(preprocessing);
  }

  private hydrateAppliedTransformation(preprocessing: PreprocessingConfig): void {
    const persisted = preprocessing['categorical_column_creator'];
    if (!persisted) return;
    const creators = Array.isArray(persisted) ? persisted : [persisted];
    const drafts = creators
      .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
      .map((creator) =>
        this.draftFromCreatorConfig(
          creator as { code?: unknown; rules?: Record<string, BackendFilter>; default_enumeration?: unknown }
        )
      );
    if (drafts.length) {
      this.transformationDrafts = drafts;
    }
  }

  /** Rebuild one editable card from a persisted categorical_column_creator config. */
  private draftFromCreatorConfig(creator: {
    code?: unknown;
    rules?: Record<string, BackendFilter>;
    default_enumeration?: unknown;
  }): TransformationColumnDraft {
    const rules = creator.rules ?? {};
    return {
      id: ++transformationDraftSeq,
      code: creator.code == null ? '' : String(creator.code),
      defaultEnumeration: creator.default_enumeration == null ? '' : String(creator.default_enumeration),
      rules: Object.entries(rules).map(([value, filter]) => ({ value, filter: filter ?? null })),
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
    const nextPending = this.cloneRules(this.pendingPreprocessingRules);
    let changed = false;
    currentCodes.forEach((code) => {
      if (!nextPending[code] && !this.appliedPreprocessingRules[code]) {
        nextPending[code] = this.defaultRule(code);
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
        this.preprocessingStatus === 'applied' && !this.userPreprocessingApplied
          ? 'none'
          : this.preprocessingStatus,
      transformationStatusLabel: this.transformationStatusLabel,
    });
  }

  private persistAppliedDescriptivePreprocessing(preprocessing: PreprocessingConfig | null): void {
    this.expStudioService.setAppliedDescriptivePreprocessing(preprocessing);
    this.expStudioService.setTransformationPreprocessing(this.transformationConfigPayload());
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
    const rule = this.appliedPreprocessingRules[variableCode];
    return !!rule?.enabled && rule.action !== 'no_action';
  }

  private hasAppliedLongitudinalPreprocessing(variableCode: string): boolean {
    if (!this.isLongitudinalModel || !this.appliedLongitudinalEnabled) return false;
    if (!this.appliedLongitudinalVisit1 || !this.appliedLongitudinalVisit2) return false;
    return !!this.appliedLongitudinalStrategies[variableCode];
  }

  private hasAppliedOutlierPreprocessing(variableCode: string): boolean {
    return !!this.appliedOutlierRules[variableCode]?.enabled;
  }

  private mergeRulesForCurrentSelection(
    base: Record<string, PreprocessingRule>,
    source: Record<string, PreprocessingRule>
  ): Record<string, PreprocessingRule> {
    const next = this.cloneRules(base);
    this.currentPreprocessingCodeSet().forEach((code) => {
      next[code] = source[code] ? { ...source[code] } : this.defaultRule(code);
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

  // For Missing Values the default action is `drop` (NA removal): rows with
  // missing values are removed. Adding a variable does not create a pending
  // change — the default is implicit, and the user can opt into a different
  // imputation strategy (mean, median, constant) when needed.
  private defaultRule(variableCode: string): PreprocessingRule {
    return { variableCode, action: 'drop', value: '', enabled: true };
  }

  private defaultOutlierRule(variableCode: string): OutlierRule {
    return createDefaultOutlierRule(variableCode, false);
  }

  private emptyRule(variableCode: string): PreprocessingRule {
    return { variableCode, action: 'no_action', value: '', enabled: false };
  }

  private cloneRules(rules: Record<string, PreprocessingRule>): Record<string, PreprocessingRule> {
    return Object.fromEntries(
      Object.entries(rules).map(([code, rule]) => [code, { ...rule }])
    );
  }

  private serializeRule(rule: PreprocessingRule | undefined): string {
    const normalized = rule ?? this.emptyRule('');
    return JSON.stringify({
      action: normalized.action,
      value: normalized.value,
      enabled: normalized.enabled,
    });
  }

  private buildSelectionKey(
    variables: VariableRow[],
    filters: VariableRow[],
    filterLogic: unknown,
    appliedPreprocessing: unknown
  ): string {
    return JSON.stringify({
      variables: variables.map((variable) => variable.code).sort(),
      filters: filters.map((variable) => variable.code).sort(),
      filterLogic,
      appliedPreprocessing,
    });
  }

  private isNumericVariable(variable: VariableRow): boolean {
    return ['real', 'int', 'integer', 'numeric', 'number'].includes(String(variable.type ?? '').toLowerCase());
  }

  isCategoricalVariable(variable: VariableRow): boolean {
    return String(variable.type ?? '').toLowerCase() === 'nominal' || !!variable.enumerations?.length;
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

  private mapBinsToEnumLabels(
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
      if (label !== undefined) {
        mapped += 1;
        return label;
      }
      return bin;
    });

    return mapped > 0 ? mappedBins : bins;
  }

  private getEnumLabelMap(variable: VariableRow | undefined): Map<string, string> {
    const enums = Array.isArray(variable?.enumerations) ? variable.enumerations : [];
    const map = new Map<string, string>();
    enums.forEach((item) => {
      const raw = item?.code ?? item?.label ?? item?.name;
      if (raw === null || raw === undefined) return;
      const key = String(raw);
      const label = String(item?.label ?? item?.name ?? raw);
      map.set(key, label);
    });
    return map;
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

  private pivotByDataset(
    items: any[],
    variableList: VariableRow[],
    datasetOrder: string[]
  ): PivotBlock[] {
    const byVar: Record<string, any[]> = {};
    for (const item of items || []) {
      const arr = byVar[item.variable] || (byVar[item.variable] = []);
      arr.push(item);
    }

    const result: PivotBlock[] = [];
    for (const [varCode, arr] of Object.entries(byVar)) {
      const matched = variableList.find((v) => v.code === varCode);
      const varName = matched ? this.variableLabel(matched) : varCode;
      const enumMap = this.getEnumLabelMap(matched);
      const byDataset: Record<string, any> = {};
      for (const entry of arr) byDataset[entry.dataset] = entry.data || {};

      const countsKeys = new Set<string>();
      for (const ds of datasetOrder) {
        const counts = byDataset[ds]?.counts ?? {};
        Object.keys(counts).forEach((key) => countsKeys.add(String(key)));
      }

      let rows: Array<{ metric: string; values: Record<string, string> }> = [];
      if (countsKeys.size > 0) {
        const baseMetrics = [
          { key: 'num_datapoints', label: 'Datapoints' },
          { key: 'num_missing', label: 'Missing' },
          { key: 'num_total', label: 'Total' },
        ];
        rows = baseMetrics.map((metric) => {
          const values: Record<string, string> = {};
          for (const ds of datasetOrder) {
            const raw =
              metric.key === 'num_datapoints' ? byDataset[ds]?.num_dtps :
                metric.key === 'num_missing' ? byDataset[ds]?.num_na :
                  byDataset[ds]?.num_total;
            values[ds] = this.formatInteger(raw);
          }
          return { metric: metric.label, values };
        });

        const orderedKeys = Array.from(enumMap.keys()).filter((key) => countsKeys.has(key));
        const remainingKeys = Array.from(countsKeys).filter((key) => !enumMap.has(key));
        orderedKeys.concat(remainingKeys).forEach((key) => {
          const label = enumMap.get(key) ?? key;
          const values: Record<string, string> = {};
          for (const ds of datasetOrder) {
            values[ds] = this.formatInteger(byDataset[ds]?.counts?.[key]);
          }
          rows.push({ metric: label, values });
        });
      } else {
        const isCategorical = !!matched && this.isCategoricalVariable(matched);
        const countKeys = new Set(['num_datapoints', 'num_missing', 'num_total']);
        const metrics = isCategorical
          ? this.metricOrder.filter((metric) => countKeys.has(metric.key))
          : this.metricOrder;
        rows = metrics.map((metric) => {
          const values: Record<string, string> = {};
          for (const ds of datasetOrder) {
            const raw =
              metric.key === 'num_datapoints' ? byDataset[ds]?.num_dtps :
                metric.key === 'num_missing' ? byDataset[ds]?.num_na :
                  metric.key === 'num_total' ? byDataset[ds]?.num_total :
                    metric.key === 'std' ? byDataset[ds]?.std :
                      metric.key === 'q2' ? byDataset[ds]?.q2 :
                        byDataset[ds]?.[metric.key];
            values[ds] = countKeys.has(metric.key) ? this.formatInteger(raw) : this.formatNumber(raw);
          }
          return { metric: metric.label, values };
        });
      }
      result.push({ code: varCode, name: varName, columns: datasetOrder, rows });
    }
    return result;
  }

  private statisticBlockKey(block: PivotBlock): string {
    return block.code ?? block.name;
  }

  private statisticBlockType(kind: SummaryKind, block: PivotBlock): StatisticVariableType {
    const summary = this.getSummary(kind);
    const variable = this.statisticBlockVariable(block);
    if (variable && summary.nominalVariables.some((item) => item.code === variable.code)) return 'nominal';
    if (variable && this.isCategoricalVariable(variable)) return 'nominal';
    const numericMetrics = new Set(['Mean', 'Standard Deviation', 'Minimum', 'Q1', 'Median', 'Q3', 'Maximum']);
    return block.rows.some((row) => numericMetrics.has(row.metric)) ? 'numeric' : 'nominal';
  }

  private statisticMetricText(block: PivotBlock, metric: string): string {
    const row = block.rows.find((item) => item.metric === metric);
    if (!row) return 'N/A';
    const dataset = block.columns.includes('all datasets') ? 'all datasets' : block.columns[0];
    return row.values[dataset] ?? 'N/A';
  }

  private statisticMetricNumber(block: PivotBlock, metric: string): number {
    const value = Number(this.statisticMetricText(block, metric).replace(/,/g, ''));
    return Number.isFinite(value) ? value : 0;
  }

  private statisticMissingValue(block: PivotBlock): number {
    return Math.round(this.statisticMetricNumber(block, 'Missing'));
  }

  private nextStatisticSelection(data: PivotBlock[], currentKey: string | null): string | null {
    if (!data.length) return null;
    if (currentKey && data.some((block) => this.statisticBlockKey(block) === currentKey)) return currentKey;
    return this.statisticBlockKey(data[0]);
  }

}
