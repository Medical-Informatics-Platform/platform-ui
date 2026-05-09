import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  SimpleChanges,
  OnChanges,
  Output,
  effect,
  inject,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EChartsOption } from 'echarts';
import { ExperimentStudioService, PreprocessingConfig } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { ChartRendererComponent } from '../visualisations/charts/charts-renderer/charts-renderer.component';
import { PdfExportService } from '../../../services/pdf-export.service';
import { SpinnerComponent } from '../../shared/spinner/spinner.component';
import { buildGroupedBarChart } from '../visualisations/charts/renderers/grouped-bar-chart';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { getFeaturewiseDescribeRows } from '../../../core/describe-result.utils';
import { FilterConfigModalComponent } from '../variables-panel/filter-config-modal/filter-config-modal.component';
import { CsvExportService } from '../../../services/csv-export.service';

type TabKey = 'Statistics' | 'Charts';
type SummaryKind = 'raw' | 'processed';
type DistributionSubTab = 'Numeric' | 'Nominal';
type StatisticVariableType = 'numeric' | 'nominal';
export type PreprocessingStatus = 'none' | 'pending' | 'applied';
type MissingAction = 'no_action' | 'drop' | 'mean' | 'median' | 'constant';
type LongitudinalStrategy = 'first' | 'second' | 'diff';
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

interface StatisticMetadata {
  label: string;
  value: string;
  severity?: 'none' | 'warning' | 'high';
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

interface PreprocessingRule {
  variableCode: string;
  action: MissingAction;
  value: string;
  enabled: boolean;
}

interface PreprocessingGroup {
  key: 'applied' | 'not-applied';
  title: string;
  variables: VariableRow[];
}

interface PreviewImpactGroup {
  title: string;
  items: string[];
}

export interface DescriptiveProgressState {
  pendingChangeCount: number;
  preprocessingStatus: PreprocessingStatus;
}

@Component({
  selector: 'app-statistic-analysis-panel',
  imports: [ChartRendererComponent, SpinnerComponent, FormsModule, FilterConfigModalComponent],
  templateUrl: './statistic-analysis-panel.component.html',
  styleUrls: ['./statistic-analysis-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatisticAnalysisPanelComponent implements OnChanges {
  @Input() processedData: PivotBlock[] = [];
  @Input() variables: unknown[] = [];
  @Input() covariates: unknown[] = [];
  @Input() filters: unknown[] = [];
  @Output() progressStateChange = new EventEmitter<DescriptiveProgressState>();
  @ViewChildren(ChartRendererComponent)
  chartRenderers!: QueryList<ChartRendererComponent>;
  @ViewChild('rawSection')
  rawSection?: ElementRef<HTMLElement>;
  @ViewChild('setupSection')
  setupSection?: ElementRef<HTMLElement>;
  @ViewChild('filtersSection')
  filtersSection?: ElementRef<HTMLElement>;
  @ViewChild('processedSection')
  processedSection?: ElementRef<HTMLElement>;

  expStudioService = inject(ExperimentStudioService);
  private chartBuilder = inject(ChartBuilderService);
  private pdfExportService = inject(PdfExportService);
  private csvExportService = inject(CsvExportService);
  private cdr = inject(ChangeDetectorRef);
  private runtimeEnvService = inject(RuntimeEnvService);
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
  preprocessingStatus: PreprocessingStatus = 'none';
  isApplyingPreprocessing = false;
  preprocessingValidationErrors: Record<string, string> = {};
  preprocessingSearch = '';
  longitudinalPreprocessingSearch = '';
  selectedMissingPreprocessingCode: string | null = null;
  selectedLongitudinalPreprocessingCode: string | null = null;
  statisticsSearch: Record<SummaryKind, string> = {
    raw: '',
    processed: '',
  };
  showPreview = false;
  successMessage = '';
  isExporting = false;
  isLoading = true;
  sectionOpen: Record<'raw' | 'setup' | 'filters' | 'processed', boolean> = {
    raw: false,
    setup: false,
    filters: true,
    processed: false,
  };
  preprocessingStepOpen: Record<'missing' | 'longitudinal', boolean> = {
    missing: true,
    longitudinal: true,
  };

  readonly missingActions: Array<{ value: MissingAction; label: string }> = [
    { value: 'drop', label: 'Remove rows' },
    { value: 'mean', label: 'Mean imputation' },
    { value: 'median', label: 'Median imputation' },
    { value: 'constant', label: 'Constant value' },
  ];

  readonly longitudinalStrategies: Array<{ value: LongitudinalStrategy; label: string }> = [
    { value: 'diff', label: 'Diff (Visit 2 - Visit 1)' },
    { value: 'first', label: 'Use visit 1' },
    { value: 'second', label: 'Use visit 2' },
  ];

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

  constructor() {
    effect(() => {
      const variables = this.expStudioService.selectedVariables();
      const covariates = this.expStudioService.selectedCovariates();
      const filters = this.expStudioService.selectedFilters();
      const filterLogic = this.expStudioService.filterLogic();
      const nextSelectionKey = this.buildSelectionKey(variables, covariates, filters, filterLogic);

      if (nextSelectionKey !== this.selectionKey) {
        this.selectionKey = nextSelectionKey;
        this.reconcilePreprocessingForSelection();
      }

      if (!variables.length && !covariates.length && !filters.length) {
        this.rawSummary = this.createEmptySummary(false);
        this.processedSummary = this.createEmptySummary(false);
        this.processedData = [];
        this.isLoading = false;
        this.expStudioService.clearDataExclusionWarnings();
        this.cdr.markForCheck();
        return;
      }

      this.fetchDescriptiveStatistics();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['processedData']) {
      this.isLoading = this.processedData.length === 0;
      this.cdr.markForCheck();
    }
  }

  get pendingChangeCount(): number {
    return this.pendingMissingChangeCount + this.pendingLongitudinalChangeCount;
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
      const pendingRule = this.pendingPreprocessingRules[code]
        ?? (this.appliedPreprocessingRules[code] ? undefined : this.defaultRule(code));
      if (this.serializeRule(pendingRule) !== this.serializeRule(this.appliedPreprocessingRules[code])) {
        return true;
      }
    }
    return false;
  }

  get pendingLongitudinalChangeCount(): number {
    if (!this.isLongitudinalModel) return 0;
    return this.serializeLongitudinalState(false) === this.serializeLongitudinalState(true) ? 0 : 1;
  }

  get preprocessingStatusLabel(): string {
    if (this.pendingChangeCount > 0) return `${this.pendingChangeCount} pending ${this.pendingChangeCount === 1 ? 'step' : 'steps'}`;
    if (this.preprocessingStatus === 'applied') return 'Preprocessing applied';
    return 'Required';
  }

  get preprocessingStatusClass(): string {
    if (this.pendingChangeCount > 0) return 'status-amber';
    if (this.preprocessingStatus === 'applied') return 'status-green';
    return 'status-neutral';
  }

  get preprocessingVariables(): VariableRow[] {
    const selectedVars = this.expStudioService.selectedVariables() as VariableRow[];
    const selectedCovars = this.expStudioService.selectedCovariates() as VariableRow[];
    return Array.from(
      new Map([...selectedVars, ...selectedCovars].map((variable) => [variable.code, variable])).values()
    ).filter((variable) => !!variable?.code);
  }

  get filteredPreprocessingVariables(): VariableRow[] {
    const query = this.preprocessingSearch.trim().toLowerCase();
    return this.filterPreprocessingVariables(query);
  }

  get filteredLongitudinalPreprocessingVariables(): VariableRow[] {
    const query = this.longitudinalPreprocessingSearch.trim().toLowerCase();
    return this.filterPreprocessingVariables(query);
  }

  private filterPreprocessingVariables(query: string): VariableRow[] {
    if (!query) return this.preprocessingVariables;
    return this.preprocessingVariables.filter((variable) => {
      const label = this.variableLabel(variable).toLowerCase();
      return label.includes(query) || String(variable.code).toLowerCase().includes(query);
    });
  }

  get preprocessingGroups(): PreprocessingGroup[] {
    return this.buildPreprocessingGroups(this.filteredPreprocessingVariables, (variable) => this.hasAppliedPreprocessing(variable.code));
  }

  get longitudinalPreprocessingGroups(): PreprocessingGroup[] {
    return this.buildPreprocessingGroups(
      this.filteredLongitudinalPreprocessingVariables,
      (variable) => this.hasAppliedLongitudinalPreprocessing(variable.code)
    );
  }

  private buildPreprocessingGroups(
    variables: VariableRow[],
    isApplied: (variable: VariableRow) => boolean
  ): PreprocessingGroup[] {
    const applied: VariableRow[] = [];
    const notApplied: VariableRow[] = [];

    variables.forEach((variable) => {
      if (isApplied(variable)) applied.push(variable);
      else notApplied.push(variable);
    });

    const groups: PreprocessingGroup[] = [
      {
        key: 'applied',
        title: 'Applied preprocessing',
        variables: applied,
      },
      {
        key: 'not-applied',
        title: 'Not applied',
        variables: notApplied,
      },
    ];
    return groups.filter((group) => group.variables.length > 0);
  }

  selectedPreprocessingVariable(): VariableRow | null {
    const filtered = this.filteredPreprocessingVariables;
    if (!filtered.length) return null;
    return filtered.find((variable) => variable.code === this.selectedMissingPreprocessingCode) ?? filtered[0];
  }

  selectPreprocessingVariable(variable: VariableRow): void {
    this.selectedMissingPreprocessingCode = variable.code;
    this.cdr.markForCheck();
  }

  isPreprocessingVariableSelected(variable: VariableRow): boolean {
    return this.selectedPreprocessingVariable()?.code === variable.code;
  }

  preprocessingVariableStateLabel(variable: VariableRow): string {
    if (this.preprocessingVariableHasPendingChange(variable)) return 'Pending';
    if (this.hasAppliedPreprocessing(variable.code)) return 'Applied';
    return 'Not applied';
  }

  preprocessingVariableHasPendingChange(variable: VariableRow): boolean {
    return this.serializeRule(this.pendingPreprocessingRules[variable.code]) !== this.serializeRule(this.appliedPreprocessingRules[variable.code]);
  }

  selectedLongitudinalPreprocessingVariable(): VariableRow | null {
    const filtered = this.filteredLongitudinalPreprocessingVariables;
    if (!filtered.length) return null;
    return filtered.find((variable) => variable.code === this.selectedLongitudinalPreprocessingCode) ?? filtered[0];
  }

  selectLongitudinalPreprocessingVariable(variable: VariableRow): void {
    this.selectedLongitudinalPreprocessingCode = variable.code;
    this.cdr.markForCheck();
  }

  isLongitudinalPreprocessingVariableSelected(variable: VariableRow): boolean {
    return this.selectedLongitudinalPreprocessingVariable()?.code === variable.code;
  }

  longitudinalVariableStateLabel(variable: VariableRow): string {
    if (this.longitudinalVariableHasPendingChange(variable)) return 'Pending';
    if (this.hasAppliedLongitudinalPreprocessing(variable.code)) return 'Applied';
    return 'Not applied';
  }

  longitudinalVariableHasPendingChange(variable: VariableRow): boolean {
    if (!this.isLongitudinalModel) return false;
    const pendingStrategy = this.pendingLongitudinalStrategies[variable.code] ?? this.defaultLongitudinalStrategy(variable);
    const appliedStrategy = this.appliedLongitudinalStrategies[variable.code] ?? this.defaultLongitudinalStrategy(variable);
    return pendingStrategy !== appliedStrategy || this.longitudinalVisitPairHasPendingChange;
  }

  get longitudinalVisitPairHasPendingChange(): boolean {
    return this.longitudinalVisit1 !== this.appliedLongitudinalVisit1 || this.longitudinalVisit2 !== this.appliedLongitudinalVisit2;
  }

  get missingPreprocessingStatusLabel(): string {
    if (this.hasPendingMissingChanges) return 'Pending';
    if (Object.values(this.appliedPreprocessingRules).some((rule) => rule.enabled && rule.action !== 'no_action')) return 'Applied';
    return 'Required';
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

  get activeFilterRuleCount(): number {
    return this.countFilterRules(this.expStudioService.filterLogic());
  }

  get filterStatusLabel(): string {
    if (this.activeFilterRuleCount > 0) {
      return `${this.activeFilterRuleCount} active ${this.activeFilterRuleCount === 1 ? 'rule' : 'rules'}`;
    }
    return 'Optional';
  }

  get filterStatusClass(): string {
    if (this.activeFilterRuleCount > 0) return 'status-green';
    return 'status-neutral';
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

  get previewImpactGroups(): PreviewImpactGroup[] {
    const currentCodes = this.currentPreprocessingCodeSet();
    const rules = Object.values(this.pendingPreprocessingRules).filter(
      (rule) => currentCodes.has(rule.variableCode) && rule.enabled && rule.action !== 'no_action'
    );
    const groups: PreviewImpactGroup[] = [];
    const missingItems = rules.map((rule) => {
      const variable = this.preprocessingVariables.find((row) => row.code === rule.variableCode);
      const label = variable ? this.variableLabel(variable) : rule.variableCode;
      const status = variable ? this.currentStatus(variable) : 'selected values';
      const action = this.missingActionLabel(rule.action).toLowerCase();
      return `${status} for ${label} will use ${action}.`;
    });
    if (missingItems.length) groups.push({ title: 'Missing Values', items: missingItems });

    const longitudinalConfig = this.buildLongitudinalPreprocessingConfig(false);
    if (longitudinalConfig) {
      groups.push({
        title: 'Longitudinal Transformation',
        items: [
          `Compare ${longitudinalConfig['visit1']} with ${longitudinalConfig['visit2']}.`,
          `${Object.keys((longitudinalConfig['strategies'] as Record<string, string>) ?? {}).length} variable strategies will be applied.`,
        ],
      });
    }
    if (!groups.length) return [{ title: 'Preprocessing', items: ['No preprocessing changes will be applied.'] }];
    groups.push({ title: 'Processed Summary', items: ['Processed Data Summary will be recalculated.'] });
    return groups;
  }

  setSummaryTab(kind: SummaryKind, tab: TabKey): void {
    this.getSummary(kind).activeTab = tab;
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
    this.getSummary(kind).selectedStatisticKey = this.statisticBlockKey(block);
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

  statisticDatapointsLabel(block: PivotBlock): string {
    const datapoints = this.statisticMetricText(block, 'Datapoints');
    if (datapoints === 'N/A') return 'Datapoints unavailable';
    const count = Number(datapoints.replace(/,/g, ''));
    return count === 1 ? '1 datapoint' : `${datapoints} datapoints`;
  }

  statisticMissingLabel(block: PivotBlock): string {
    return `${this.statisticMissingValue(block).toLocaleString()} missing`;
  }

  statisticMissingSeverity(block: PivotBlock): 'none' | 'warning' | 'high' {
    const missing = this.statisticMissingValue(block);
    if (missing <= 0) return 'none';
    const total = this.statisticMetricNumber(block, 'Total');
    if (total > 0 && missing / total >= 0.1) return 'high';
    return 'warning';
  }

  statisticMetadata(_kind: SummaryKind, block: PivotBlock): StatisticMetadata[] {
    return [
      { label: 'Datapoints', value: this.statisticMetricText(block, 'Datapoints') },
      {
        label: 'Missing',
        value: this.statisticMissingValue(block).toLocaleString(),
        severity: this.statisticMissingSeverity(block),
      },
    ];
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

  goToSection(section: 'raw' | 'setup' | 'filters' | 'processed'): void {
    this.sectionOpen = {
      raw: section === 'raw',
      setup: section === 'setup',
      filters: section === 'filters',
      processed: section === 'processed',
    };
    this.cdr.markForCheck();
    setTimeout(() => this.sectionElement(section)?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  toggleSection(section: 'raw' | 'setup' | 'filters' | 'processed'): void {
    this.sectionOpen[section] = !this.sectionOpen[section];
  }

  togglePreprocessingStep(step: 'missing' | 'longitudinal'): void {
    this.preprocessingStepOpen[step] = !this.preprocessingStepOpen[step];
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

  onRuleEnabledChange(variable: VariableRow, enabled: boolean): void {
    const existing = this.ruleFor(variable);
    const next = enabled
      ? { ...existing, enabled, action: existing.action === 'no_action' ? 'drop' : existing.action }
      : { ...existing, enabled, action: 'no_action' as MissingAction, value: '' };
    this.pendingPreprocessingRules = {
      ...this.pendingPreprocessingRules,
      [variable.code]: next,
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
    this.longitudinalVisit1 = this.appliedLongitudinalVisit1;
    this.longitudinalVisit2 = this.appliedLongitudinalVisit2;
    this.pendingLongitudinalStrategies = { ...this.appliedLongitudinalStrategies };
    this.ensureLongitudinalDefaults();
    this.preprocessingValidationErrors = {};
    this.showPreview = false;
    this.updatePreprocessingStatus();
    this.emitProgressState();
    this.cdr.markForCheck();
  }

  previewImpact(): void {
    if (this.pendingChangeCount === 0) return;
    this.showPreview = !this.showPreview;
  }

  applyPreprocessing(): void {
    this.ensureDefaultRulesForCurrentSelection();
    this.ensureLongitudinalDefaults();
    if (this.pendingChangeCount === 0) return;
    const validationErrors = this.validatePendingRules();
    if (Object.keys(validationErrors).length > 0) {
      this.preprocessingValidationErrors = validationErrors;
      this.cdr.markForCheck();
      return;
    }

    const currentCodes = this.currentPreprocessingCodeSet();
    const preprocessing = this.buildPreprocessingConfig(this.pendingPreprocessingRules, currentCodes);
    if (!preprocessing) {
      this.appliedPreprocessingRules = this.mergeRulesForCurrentSelection(
        this.appliedPreprocessingRules,
        this.pendingPreprocessingRules
      );
      this.appliedLongitudinalEnabled = this.isLongitudinalModel;
      this.appliedLongitudinalVisit1 = this.longitudinalVisit1;
      this.appliedLongitudinalVisit2 = this.longitudinalVisit2;
      this.appliedLongitudinalStrategies = { ...this.pendingLongitudinalStrategies };
      this.processedSummary = this.createEmptySummary(false);
      this.expStudioService.setAppliedDescriptivePreprocessing(null);
      this.preprocessingStatus = 'none';
      this.showPreview = false;
      this.sectionOpen.processed = false;
      this.successMessage = '';
      this.emitProgressState();
      this.cdr.markForCheck();
      return;
    }

    const variableCodes = this.preprocessingVariables.map((variable) => variable.code);
    this.isApplyingPreprocessing = true;
    this.processedSummary = this.createEmptySummary(true);
    this.goToSection('processed');
    this.preprocessingValidationErrors = {};
    this.cdr.markForCheck();

    this.expStudioService.loadDescriptiveOverview(variableCodes, preprocessing).subscribe({
      next: (response) => {
        this.processedSummary = this.buildSummaryFromResponse(response, 'processed');
        this.appliedPreprocessingRules = this.mergeRulesForCurrentSelection(
          this.appliedPreprocessingRules,
          this.pendingPreprocessingRules
        );
        this.appliedLongitudinalEnabled = this.isLongitudinalModel;
        this.appliedLongitudinalVisit1 = this.longitudinalVisit1;
        this.appliedLongitudinalVisit2 = this.longitudinalVisit2;
        this.appliedLongitudinalStrategies = { ...this.pendingLongitudinalStrategies };
        this.expStudioService.setAppliedDescriptivePreprocessing(preprocessing);
        this.preprocessingStatus = 'applied';
        this.isApplyingPreprocessing = false;
        this.showPreview = false;
        this.successMessage = '';
        this.emitProgressState();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.isApplyingPreprocessing = false;
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

  processDescriptiveStatsResults(response: unknown): void {
    this.rawSummary = this.buildSummaryFromResponse(response, 'raw');
    this.processedData = this.rawSummary.data;
  }

  variableLabel(variable: VariableRow): string {
    return variable.name ?? variable.label ?? variable.code;
  }

  variableTypeLabel(variable: VariableRow): string {
    if (this.isNumericVariable(variable)) return 'Numeric';
    if (this.isCategoricalVariable(variable)) return 'Categorical';
    return variable.type ?? 'Unknown';
  }

  currentStatus(variable: VariableRow): string {
    const allRows = this.getFeaturewiseRowsForRaw(variable.code);
    const aggregate = allRows.find((row) => row.dataset === 'all datasets') ?? allRows[0];
    const data = aggregate?.data ?? null;
    if (!data) return 'No summary available';
    const missing = Number(data.num_na ?? 0);
    if (Number.isFinite(missing) && missing > 0) return `${Math.round(missing).toLocaleString()} missing`;
    if (data.min !== undefined || data.max !== undefined) return `min ${this.fmt(data.min)} / max ${this.fmt(data.max)}`;
    if (data.counts) return `${Object.keys(data.counts).length} categories`;
    return 'No issue detected';
  }

  missingActionLabel(action: MissingAction): string {
    return this.missingActions.find((item) => item.value === action)?.label ?? 'No action';
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
        variables: summary.data,
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
          Dataset: dataset,
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
      activeBoxPlotIndex: 0,
      activeNominalIndex: 0,
      selectedStatisticKey: null,
    };
  }

  private getSummary(kind: SummaryKind): SummaryView {
    return kind === 'raw' ? this.rawSummary : this.processedSummary;
  }

  private sectionElement(section: 'raw' | 'setup' | 'filters' | 'processed'): ElementRef<HTMLElement> | undefined {
    if (section === 'raw') return this.rawSection;
    if (section === 'setup') return this.setupSection;
    if (section === 'filters') return this.filtersSection;
    return this.processedSection;
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
      ...distributionState,
    };
    return summary;
  }

  private buildDistributionState(featurewise: any[], response: unknown): Pick<SummaryView,
    'showDistributions' | 'distributionSubTab' | 'nonNominalVariables' | 'nominalVariables' |
    'chartsForBoxPlot' | 'chartsForNominal' | 'activeBoxPlotIndex' | 'activeNominalIndex'
  > {
    const selectedVars = this.expStudioService.selectedVariables() as VariableRow[];
    const selectedCovars = this.expStudioService.selectedCovariates() as VariableRow[];
    const unique = Array.from(new Map([...selectedVars, ...selectedCovars].map((v) => [v.code, v])).values());

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

    const chartsForBoxPlot = nonNominalVariables.map((v) => {
      const perVarResp = {
        ...(response as Record<string, unknown>),
        result: {
          ...((response as { result?: Record<string, unknown> })?.result ?? {}),
          featurewise: featurewise.filter(
            (row: any) => row.variable === v.code && row.dataset !== 'all datasets'
          ),
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

  private buildPreprocessingConfig(
    rules: Record<string, PreprocessingRule>,
    allowedCodes = this.currentPreprocessingCodeSet()
  ): PreprocessingConfig | null {
    const strategies: Record<string, string> = {};
    const fillValues: Record<string, string> = {};

    Object.values(rules).forEach((rule) => {
      if (!allowedCodes.has(rule.variableCode)) return;
      if (!rule.enabled || rule.action === 'no_action') return;
      strategies[rule.variableCode] = rule.action;
      if (rule.action === 'constant') fillValues[rule.variableCode] = rule.value;
    });

    const config: PreprocessingConfig = {};
    if (Object.keys(strategies).length) {
      const missingValuesHandler: Record<string, unknown> = { strategies };
      if (Object.keys(fillValues).length) missingValuesHandler['fill_values'] = fillValues;
      config['missing_values_handler'] = missingValuesHandler;
    }

    const longitudinal = this.buildLongitudinalPreprocessingConfig(rules === this.appliedPreprocessingRules, allowedCodes);
    if (longitudinal) config['longitudinal_transformer'] = longitudinal;

    return Object.keys(config).length ? config : null;
  }

  private validatePendingRules(): Record<string, string> {
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
  }

  private reconcilePreprocessingForSelection(): void {
    const currentCodes = this.currentPreprocessingCodeSet();
    this.ensureDefaultRulesForCurrentSelection(currentCodes);
    this.preprocessingValidationErrors = Object.fromEntries(
      Object.entries(this.preprocessingValidationErrors).filter(([code]) => currentCodes.has(code))
    );
    this.processedSummary = this.createEmptySummary(false);
    this.sectionOpen.processed = false;
    this.showPreview = false;
    this.successMessage = '';
    this.ensureLongitudinalDefaults();
    this.updatePreprocessingStatus();
    this.syncAppliedPreprocessingForCurrentSelection();
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

  private emitProgressState(): void {
    this.progressStateChange.emit({
      pendingChangeCount: this.pendingChangeCount,
      preprocessingStatus: this.preprocessingStatus,
    });
  }

  private syncAppliedPreprocessingForCurrentSelection(): void {
    this.expStudioService.setAppliedDescriptivePreprocessing(
      this.buildPreprocessingConfig(this.appliedPreprocessingRules)
    );
  }

  private currentPreprocessingCodeSet(): Set<string> {
    return new Set(this.preprocessingVariables.map((variable) => variable.code));
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
      strategies[variable.code] = sourceStrategies[variable.code] ?? this.defaultLongitudinalStrategy(variable);
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
          sourceStrategies[variable.code] ?? this.defaultLongitudinalStrategy(variable),
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
    return this.preprocessingVariables.some((variable) => variable.code === variableCode);
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

  private defaultRule(variableCode: string): PreprocessingRule {
    return { variableCode, action: 'drop', value: '', enabled: true };
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

  private buildSelectionKey(variables: VariableRow[], covariates: VariableRow[], filters: VariableRow[], filterLogic: unknown): string {
    return JSON.stringify({
      variables: variables.map((variable) => variable.code).sort(),
      covariates: covariates.map((variable) => variable.code).sort(),
      filters: filters.map((variable) => variable.code).sort(),
      filterLogic,
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

  private countFilterRules(node: any): number {
    if (!node || !Array.isArray(node.rules)) return 0;
    return node.rules.reduce((count: number, rule: any) => {
      if (rule?.condition && Array.isArray(rule.rules)) {
        return count + this.countFilterRules(rule);
      }
      return count + 1;
    }, 0);
  }

  private getFeaturewiseRowsForRaw(variableCode: string): any[] {
    return this.rawSummary.featurewiseRows.filter((row) => row.variable === variableCode);
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

  private fmt(v: unknown): string {
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'number') return v.toFixed(2);
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : String(v);
  }

  private fmtCount(v: unknown): string {
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'number' && Number.isFinite(v)) return String(Math.round(v));
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n)) : String(v);
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
            values[ds] = this.fmtCount(raw);
          }
          return { metric: metric.label, values };
        });

        const orderedKeys = Array.from(enumMap.keys()).filter((key) => countsKeys.has(key));
        const remainingKeys = Array.from(countsKeys).filter((key) => !enumMap.has(key));
        orderedKeys.concat(remainingKeys).forEach((key) => {
          const label = enumMap.get(key) ?? key;
          const values: Record<string, string> = {};
          for (const ds of datasetOrder) {
            values[ds] = this.fmtCount(byDataset[ds]?.counts?.[key]);
          }
          rows.push({ metric: label, values });
        });
      } else {
        const countKeys = new Set(['num_datapoints', 'num_missing', 'num_total']);
        rows = this.metricOrder.map((metric) => {
          const values: Record<string, string> = {};
          for (const ds of datasetOrder) {
            const raw =
              metric.key === 'num_datapoints' ? byDataset[ds]?.num_dtps :
                metric.key === 'num_missing' ? byDataset[ds]?.num_na :
                  metric.key === 'num_total' ? byDataset[ds]?.num_total :
                    metric.key === 'std' ? byDataset[ds]?.std :
                      metric.key === 'q2' ? byDataset[ds]?.q2 :
                        byDataset[ds]?.[metric.key];
            values[ds] = countKeys.has(metric.key) ? this.fmtCount(raw) : this.fmt(raw);
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
