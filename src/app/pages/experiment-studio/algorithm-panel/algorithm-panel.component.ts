import { SessionStorageService } from './../../../services/session-storage.service';
import { ChangeDetectionStrategy, Component, inject, signal, computed, effect, untracked, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { getOutputSchema, prettifyLabel as toHumanLabel } from '../../../core/algorithm-mappers';
import { optionBindingValue } from '../../../core/algorithm-parameter.utils';
import { AlgorithmAvailabilityDetail, AlgorithmConfig } from '../../../models/algorithm-definition.model';
import { experimentTables, PdfExportService } from '../../../services/pdf-export.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { formatFilterExpression } from '../../../core/filter-display.utils';
import { ErrorService } from '../../../services/error.service';
import { AuthService } from '../../../services/auth.service';
import { AlgorithmNames } from '../../../core/constants/algorithm.constants';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import {
  createDefaultOutlierRule,
  defaultFoldForStrategy,
  hydrateOutlierRules,
  isOutlierEligibleVariable,
  OUTLIER_STRATEGIES,
  OUTLIER_TAILS,
  OutlierRule,
  OutlierStrategy,
  OutlierTail,
  serializeOutlierRules,
  validateOutlierRule,
} from '../../../core/outlier-rules';
import { AlgorithmRoleAssignmentComponent } from './algorithm-role-assignment/algorithm-role-assignment.component';
import { unavailableDatasetsFor, unavailableVariableTooltip } from '../../../core/variable-availability.utils';
import { availabilityRequirementText, formatAvailabilityMessage } from './utils/algorithm-availability-text.utils';
import { countAlgorithms, filterAlgorithmCategories, nextCollapsedCategories, runnableCount } from './utils/algorithm-catalog.utils';
import {
  allowsDecimal,
  enrichParameterSchema,
  enumOptionsForVariableCode,
  isAdvancedField,
  buildParameterForm,
  multiSelectValues,
  nonBlankString,
  normalizeParameterValues,
  optionLabel,
  parameterFieldLabel,
  parameterFormSignature,
} from './utils/algorithm-parameter-form.utils';
import { buildAlgorithmNeeds, readinessText, resolveRunAlgorithmNames } from './utils/algorithm-run.utils';
import { tooltipPosition } from './utils/tooltip-position.utils';
import {
  AlgorithmNeedItem,
  AlgorithmParameterField,
  AlgorithmRunRequirement,
  AlgorithmStudioSubstep,
  EnrichedParameterField,
  ExperimentRunInfo,
  OutlierReportVariable,
  ParameterOption,
  StudioVariable,
} from './algorithm-panel.models';

@Component({
  selector: 'app-algorithm-panel',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AlgorithmRoleAssignmentComponent,
  ],
  templateUrl: './algorithm-panel.component.html',
  styleUrl: './algorithm-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class AlgorithmPanelComponent {
  pdfExport = inject(PdfExportService);
  private readonly csvExport = inject(CsvExportService);
  private errorService = inject(ErrorService);
  private authService = inject(AuthService);
  private runtimeEnvService = inject(RuntimeEnvService);
  private studioNavigation = inject(ExperimentStudioNavigationService);
  experimentStudioService = inject(ExperimentStudioService);
  sessionStorage = inject(SessionStorageService);
  lastUsedAlgorithm = '';
  errorMsg = signal<string | null>(null);
  readonly isRunning = this.experimentStudioService.isRunning;

  /** Studio: setup (roles + methods), then parameters (configure + run). Results live in the Execution step. */
  readonly studioSubstep = signal<AlgorithmStudioSubstep>('setup');
  readonly studioSubstepChange = output<AlgorithmStudioSubstep>();

  setStudioSubstep(step: AlgorithmStudioSubstep): void {
    this.studioSubstep.set(step);
    this.studioSubstepChange.emit(step);
  }

  readonly mipVersion = this.runtimeEnvService.mipVersion;

  readonly selectedAlgorithm = this.experimentStudioService.selectedAlgorithm;
  readonly selectedAlgorithmDocumentation = computed(() => this.selectedAlgorithm()?.documentation?.trim() ?? '');
  readonly selectedAlgorithmUnavailable = computed(() => {
    const algorithm = this.selectedAlgorithm();
    return !!algorithm && !this.experimentStudioService.isAlgorithmAvailable(algorithm.name);
  });
  readonly selectedAvailabilityDetails = computed(() => this.availabilityDetails(this.selectedAlgorithm()));

  readonly algorithmNeeds = computed<AlgorithmNeedItem[]>(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];
    return buildAlgorithmNeeds({
      algorithm,
      details: this.selectedAvailabilityDetails(),
      hasOutcome: this.experimentStudioService.algorithmY().length > 0,
      unavailableVariablesReason: this.unavailableRunVariablesReason(),
      requirements: this.algorithmRunRequirements(),
    });
  });

  readonly readinessText = computed(() => readinessText({
    algorithm: this.selectedAlgorithm(),
    canRun: this.canRun(),
    needs: this.algorithmNeeds(),
    y: this.experimentStudioService.algorithmY(),
    x: this.experimentStudioService.algorithmX(),
  }));

  readonly categoryRunnableCount = runnableCount;

  readonly selectedAlgorithmAvailabilitySummary = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm || !this.selectedAlgorithmUnavailable()) return '';
    const summary = this.experimentStudioService.getAlgorithmAvailability(algorithm.name).summary ?? algorithm.availability?.summary ?? '';
    return formatAvailabilityMessage(summary);
  });
  readonly algorithmRunRequirements = computed((): AlgorithmRunRequirement[] => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];

    const requirements: AlgorithmRunRequirement[] = [];

    if (this.selectedAlgorithmUnavailable()) {
      const summary = this.selectedAlgorithmAvailabilitySummary();
      requirements.push({
        id: 'availability',
        message: summary || 'Algorithm requirements are not satisfied.',
        actionLabel: this.availabilityRequirementActionLabel(algorithm.name),
      });
    }

    const preprocessingMessage = this.preprocessingRunBlockMessage();
    if (preprocessingMessage) {
      requirements.push({
        id: 'preprocessing',
        message: preprocessingMessage,
        actionLabel: 'Go to preprocessing',
      });
    }

    return requirements;
  });
  readonly selectedAlgorithmCategory = computed(() => this.selectedAlgorithm()?.category?.trim() ?? '');
  readonly yVar = computed(() => this.experimentStudioService.algorithmY()[0]?.code ?? null);
  readonly xVar = computed(() => this.experimentStudioService.algorithmX()[0]?.code ?? null);
  readonly crossValidationEnabled = signal(false);
  private readonly crossValidationSelections: Record<string, boolean> = {};
  readonly isCrossValidationOnly = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return false;
    return this.experimentStudioService.isCrossValidationOnly(algorithm.name);
  });
  readonly outlierStrategies = OUTLIER_STRATEGIES;
  readonly outlierTails = OUTLIER_TAILS;
  outlierReportRules: Record<string, OutlierRule> = {};
  outlierReportValidationErrors: Record<string, string> = {};
  readonly canToggleCrossValidation = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return false;
    if (this.experimentStudioService.isCrossValidationOnly(algorithm.name)) return false;
    const baseName = this.experimentStudioService.getCrossValidationBase(algorithm.name) ?? algorithm.name;
    return (
      !!this.experimentStudioService.getCrossValidationVariant(baseName) &&
      !!this.experimentStudioService.backendAlgorithms()[baseName]
    );
  });
  readonly isOutlierReportSelected = computed(
    () => this.selectedAlgorithm()?.name === AlgorithmNames.OUTLIER_REPORT
  );
  readonly hasAlgorithmParameterControls = computed(() => (
    this.visibleConfigSchema().length > 0 ||
    this.isOutlierReportSelected() ||
    this.canToggleCrossValidation() ||
    this.isCrossValidationOnly()
  ));
  readonly preprocessingRunBlockMessage = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return null;
    if (algorithm.name === AlgorithmNames.OUTLIER_REPORT) return null;
    if (
      this.experimentStudioService.hasAppliedDescriptivePreprocessing() ||
      this.experimentStudioService.hasRequestPreprocessingForRun(algorithm.name)
    ) return null;
    return 'Apply missing value preprocessing before running algorithms.';
  });
  private readonly formInvalid = signal(false);
  /**
   * "Remove variables not available in: …" when a variable the run uses (outcome, predictor
   * or cohort filter) is missing from a selected dataset; '' otherwise. Such variables stay
   * in the pool grayed out, so the run is blocked until the user removes them.
   */
  readonly unavailableRunVariablesReason = computed(() => {
    const map = this.experimentStudioService.unavailableVariables();
    if (!map.size) return '';
    const datasets = new Set<string>();
    for (const node of [
      ...this.experimentStudioService.algorithmY(),
      ...this.experimentStudioService.algorithmX(),
      ...this.experimentStudioService.selectedFilters(),
    ]) {
      unavailableDatasetsFor(map, { code: node?.code }).forEach((label) => datasets.add(label));
    }
    return unavailableVariableTooltip([...datasets], 'Remove variables not available in');
  });
  readonly canRun = computed(() => (
    !!this.selectedAlgorithm() &&
    !this.isRunning() &&
    !this.selectedAlgorithmUnavailable() &&
    !this.unavailableRunVariablesReason() &&
    !this.preprocessingRunBlockMessage() &&
    !this.formInvalid()
  ));
  readonly runDisabledReason = computed(() => {
    if (this.isRunning()) return 'Experiment is running';
    if (!this.selectedAlgorithm()) return 'Select an algorithm to run';
    if (this.selectedAlgorithmUnavailable()) return 'Algorithm unavailable for the current selection';
    const unavailable = this.unavailableRunVariablesReason();
    if (unavailable) return unavailable;
    const preprocessing = this.preprocessingRunBlockMessage();
    if (preprocessing) return preprocessing;
    if (this.formInvalid()) return 'Complete variable and algorithm selection to proceed';
    return 'Execute experiment';
  });
  readonly labelMap = this.experimentStudioService.variableLabelMap;

  // UI toggle: the catalog defaults to runnable methods only — each group lists just the
  // available algorithms. Switching to All re-lists unavailable methods with their reason.
  readonly showOnlyActive = signal(true);
  /** Instant text filter over label, name, description, documentation, category, and flags. */
  readonly algoSearchQuery = signal('');
  readonly hasAnyVisibleAlgorithms = computed(() => {
    return this.filteredAlgorithmCategories().some(c => c.algorithms?.length > 0);
  });

  prettyFieldLabel(field: EnrichedParameterField): string {
    return parameterFieldLabel(field, this.experimentStudioService.algorithmX()[0]);
  }

  private resolveSelectedEventVarCode(algorithmName: string | undefined): string | null {
    if (!algorithmName) return null;

    const stored = untracked(() => this.experimentStudioService.algorithmConfigurations())[algorithmName]?.['event_var'];
    return nonBlankString(this.eventVarSelection()) ?? nonBlankString(stored);
  }

  private syncEventVarSelectionFromValues(
    algorithmName: string,
    values: Record<string, unknown>
  ): void {
    if (!Object.prototype.hasOwnProperty.call(values, 'event_var')) return;
    const next = nonBlankString(values['event_var']);
    if (this.eventVarSelection() === next) return;
    this.eventVarSelection.set(next);
    this.syncPositiveClassWithEventVar(algorithmName);
  }

  private syncEventVarSelectionFromStored(stored: Record<string, unknown>): void {
    this.eventVarSelection.set(nonBlankString(stored['event_var']));
  }

  private enumOptionsForVariableCode(varCode: string | null | undefined) {
    return enumOptionsForVariableCode(varCode, [
      ...this.experimentStudioService.algorithmY(),
      ...this.experimentStudioService.algorithmX(),
    ]);
  }

  /** Live event_var from the config form; avoids reading FormGroup inside other computeds. */
  private readonly eventVarSelection = signal<string | null>(null);

  readonly selectedEventVarCode = computed(() => {
    const algorithm = this.selectedAlgorithm();
    return algorithm ? this.resolveSelectedEventVarCode(algorithm.name) : null;
  });

  readonly positiveClassOptions = computed(() =>
    this.enumOptionsForVariableCode(this.selectedEventVarCode())
  );

  constructor() {
    effect(() => {
      const algorithm = this.selectedAlgorithm();
      if (!algorithm) {
        this.crossValidationEnabled.set(false);
        return;
      }
      if (this.experimentStudioService.isCrossValidationOnly(algorithm.name)) {
        this.crossValidationEnabled.set(true);
        return;
      }
      const baseName = this.experimentStudioService.getCrossValidationBase(algorithm.name) ?? algorithm.name;
      const hasVariant = !!this.experimentStudioService.getCrossValidationVariant(baseName);
      if (!hasVariant) {
        this.crossValidationEnabled.set(false);
        return;
      }
      const stored = this.crossValidationSelections[baseName];
      const defaultValue = stored !== undefined
        ? stored
        : this.experimentStudioService.isCrossValidationAlgorithm(algorithm.name);
      this.crossValidationEnabled.set(defaultValue);
    });

    effect(() => {
      // Establish dependencies
      this.selectedAlgorithm();
      this.experimentStudioService.algorithmY();
      this.experimentStudioService.algorithmX();

      // A new selection invalidates whatever the last run produced
      this.experimentStudioService.runResult.set(null);
      this.experimentStudioService.runError.set(null);
    });

    effect(() => {
      const algorithm = this.selectedAlgorithm();
      const variables = this.outlierReportVariables();
      if (!algorithm || algorithm.name !== AlgorithmNames.OUTLIER_REPORT) {
        this.outlierReportValidationErrors = {};
        return;
      }
      const stored = untracked(() => this.experimentStudioService.algorithmConfigurations()[algorithm.name] ?? {});
      this.reconcileOutlierReportRules(variables, stored);
    });

    effect((onCleanup) => {
      const algorithm = this.selectedAlgorithm();
      const schema = this.visibleConfigSchema();

      if (!algorithm) {
        this.lastBuiltFormSchemaSignature = '';
        this.eventVarSelection.set(null);
        this.configForm.set(new FormGroup({}));
        this.formInvalid.set(false);
        return;
      }

      const schemaSignature = parameterFormSignature(algorithm.name, this.crossValidationEnabled(), schema);
      if (schemaSignature === this.lastBuiltFormSchemaSignature) {
        return;
      }
      this.lastBuiltFormSchemaSignature = schemaSignature;

      const allConfigs = untracked(() => this.experimentStudioService.algorithmConfigurations());
      const stored = allConfigs?.[algorithm.name] || {};
      this.syncEventVarSelectionFromStored(stored);

      const form = buildParameterForm(schema, stored);
      this.configForm.set(form);
      this.formInvalid.set(form.invalid);

      const statusSub = form.statusChanges.subscribe(() => this.formInvalid.set(form.invalid));
      const subscription = form.valueChanges.subscribe((values) => {
        this.syncEventVarSelectionFromValues(algorithm.name, values);
        this.persistCurrentFormConfig(
          algorithm.name,
          untracked(() => this.visibleConfigSchema())
        );
      });
      onCleanup(() => {
        subscription.unsubscribe();
        statusSub.unsubscribe();
      });

      this.formKey++;
    });
    effect(() => {
      const res = this.experimentStudioService.runResult();
      const schema = this.outputSchema();

      if (!res || !schema.length) return;

      const missing = schema.filter(field => !(field.key in res));
      if (missing.length > 0) {
        console.warn('[Validation] Missing fields from result:', missing.map(f => f.key));
      }
    });

    effect(() => {
      const categories = this.filteredAlgorithmCategories();
      const selectedName = this.selectedAlgorithm()?.name ?? null;
      untracked(() => this.syncMatchCategoryOpen(categories, selectedName));
    });
  }


  configForm = signal<FormGroup>(new FormGroup({}));
  formKey = 0;
  private lastBuiltFormSchemaSignature = '';

  enrichedConfigSchema = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];
    return enrichParameterSchema(algorithm, {
      y: this.experimentStudioService.algorithmY(),
      x: this.experimentStudioService.algorithmX(),
      eventVarCode: this.selectedEventVarCode(),
      withCrossValidationFolds: this.crossValidationEnabled() && this.canToggleCrossValidation(),
    });
  });

  readonly visibleConfigSchema = computed(() => {
    const schema = this.enrichedConfigSchema();
    if (!this.isOutlierReportSelected()) return schema;
    return schema.filter((field) => field.type !== 'dict' && !['strategies', 'tails', 'folds'].includes(String(field.key)));
  });

  readonly isAdvancedField = isAdvancedField;
  readonly optionLabel = optionLabel;
  readonly allowsDecimal = allowsDecimal;

  /** n_splits belongs to the cross-validation row, so it renders under that switch, not in the main form. */
  isCrossValidationField(field: AlgorithmParameterField): boolean {
    return field.key === 'n_splits' && (this.canToggleCrossValidation() || this.isCrossValidationOnly());
  }

  readonly primaryConfigSchema = computed(() =>
    this.visibleConfigSchema().filter((field) =>
      !this.isCrossValidationField(field) && !this.isAdvancedField(field) && this.configForm().get(field.key))
  );

  readonly advancedConfigSchema = computed(() =>
    this.visibleConfigSchema().filter((field) =>
      !this.isCrossValidationField(field) && this.isAdvancedField(field) && this.configForm().get(field.key))
  );

  readonly crossValidationConfigSchema = computed(() =>
    this.crossValidationEnabled()
      ? this.visibleConfigSchema().filter((field) => this.isCrossValidationField(field) && this.configForm().get(field.key))
      : []
  );

  readonly outlierReportVariables = computed(() => {
    const unique = new Map<string, OutlierReportVariable>();
    this.experimentStudioService.algorithmAssignableVariables().forEach((variable: StudioVariable) => {
      if (hasCode(variable)) unique.set(String(variable.code), variable);
    });
    return Array.from(unique.values()).filter((variable) => isOutlierEligibleVariable(variable));
  });

  readonly outputSchema = computed(() =>
    getOutputSchema(this.selectedAlgorithm()?.name ?? '') ?? []
  );

  readonly searchActive = computed(() => this.algoSearchQuery().trim().length > 0);

  readonly filteredAlgorithmCategories = computed(() => filterAlgorithmCategories(
    this.experimentStudioService.availableGroupedAlgorithms(),
    this.showOnlyActive(),
    this.algoSearchQuery(),
  ));

  readonly algoCounts = computed(() => countAlgorithms(this.experimentStudioService.availableGroupedAlgorithms()));

  toggleActiveOnly() {
    this.showOnlyActive.update(v => !v);
  }

  onSearchInput(event: Event): void {
    this.algoSearchQuery.set((event.target as HTMLInputElement)?.value ?? '');
  }

  clearSearch(): void {
    this.algoSearchQuery.set('');
  }

  /**
   * Collapsed Matching-method categories. A category missing from this set is open, so
   * categories coming back after a filter switch keep the state the user left them in.
   */
  private readonly collapsedMatchCategories = signal<ReadonlySet<string>>(new Set<string>());
  /** Categories the user opened/closed themselves; these are never changed automatically. */
  private readonly matchCategoryUserToggles = new Set<string>();
  private lastMatchSelectionName: string | null | undefined;

  isMatchCategoryOpen(categoryName: string): boolean {
    return !this.collapsedMatchCategories().has(categoryName);
  }

  toggleMatchCategory(categoryName: string): void {
    this.matchCategoryUserToggles.add(categoryName);
    const next = new Set(this.collapsedMatchCategories());
    if (next.has(categoryName)) {
      next.delete(categoryName);
    } else {
      next.add(categoryName);
    }
    this.collapsedMatchCategories.set(next);
  }

  /**
   * Default state: a group is open only when it holds the selected method or at least one
   * runnable method — with nothing runnable in a group it stays collapsed so the catalog
   * opens straight to what can actually be executed. Beyond that default, the group a new
   * selection lands in is revealed; groups the user toggled are never changed automatically.
   */
  private syncMatchCategoryOpen(
    categories: Array<{ name: string; algorithms: AlgorithmConfig[] }>,
    selectedName: string | null,
  ): void {
    const selectionChanged = this.lastMatchSelectionName !== selectedName;
    this.lastMatchSelectionName = selectedName;

    const next = nextCollapsedCategories(
      categories,
      selectedName,
      selectionChanged,
      this.collapsedMatchCategories(),
      this.matchCategoryUserToggles,
    );
    if (next !== this.collapsedMatchCategories()) this.collapsedMatchCategories.set(next);
  }

  algorithmUnavailableReason(algorithm: AlgorithmConfig): string {
    const availability = this.experimentStudioService.getAlgorithmAvailability(algorithm.name);
    const summary = availability?.summary || algorithm.availability?.summary || '';
    if (summary) return formatAvailabilityMessage(summary);
    const details = availability?.details?.length
      ? availability.details
      : (algorithm.availability?.details ?? []);
    const first = details.find((detail) => detail.messages.length > 0);
    return first ? formatAvailabilityMessage(first.messages[0]) : 'Unavailable';
  }


  readonly datasetsWithLabels = computed(() => {
    const codes = this.experimentStudioService.selectedDatasets();
    const labelByCode = this.experimentStudioService.getDatasetLabelMap();
    const fallbackMap = this.labelMap();
    return codes.map((code) => ({
      code,
      label: labelByCode[code] ?? fallbackMap[code] ?? toHumanLabel(code),
    }));
  });

  /** Name, roles, filters and parameters of the run the exports describe. */
  readonly experimentInfo = computed((): ExperimentRunInfo => {
    const selected = this.experimentStudioService.selectedAlgorithm();
    const lastRunName =
      this.experimentStudioService.lastUsedAlgorithm() || this.lastUsedAlgorithm;

    const algoName = selected?.name || lastRunName || null;

    const algoCatalog = this.experimentStudioService.backendAlgorithms();
    const algoMeta = algoName ? algoCatalog[algoName] : null;

    const displayLabel = selected?.label || algoMeta?.label || algoName || 'N/A';
    const allConfigs = this.experimentStudioService.algorithmConfigurations();

    return {
      experimentName: `Experiment for ${displayLabel}`,
      variables: this.experimentStudioService.algorithmY(),
      covariates: this.experimentStudioService.algorithmX(),
      filters: this.experimentStudioService.selectedFilters(),
      algorithmConfigs: (algoName && allConfigs[algoName]) || {},
    };
  });

  private syncPositiveClassWithEventVar(algorithmName: string): void {
    const positiveControl = this.configForm().get('positive_class');
    if (!positiveControl) return;

    const options = this.enumOptionsForVariableCode(this.resolveSelectedEventVarCode(algorithmName));
    if (!options.length) return;

    const allowed = new Set(options.map((option) => option.code));
    const current = positiveControl.value;
    if (
      current !== null &&
      current !== undefined &&
      String(current).trim() !== '' &&
      !allowed.has(String(current))
    ) {
      positiveControl.setValue(null, { emitEvent: false });
    }
  }

  private persistCurrentFormConfig(algorithmName: string, schema = this.visibleConfigSchema()): Record<string, unknown> {
    const values = this.normalizeFormValues(this.configForm().getRawValue(), schema);
    const nextValues = algorithmName === AlgorithmNames.OUTLIER_REPORT
      ? this.mergeOutlierReportConfig(values)
      : values;
    const allConfigs = this.experimentStudioService.algorithmConfigurations();
    const previous = allConfigs[algorithmName];
    if (previous && JSON.stringify(previous) === JSON.stringify(nextValues)) {
      return nextValues;
    }
    this.experimentStudioService.algorithmConfigurations.set({
      ...allConfigs,
      [algorithmName]: nextValues,
    });
    return nextValues;
  }

  bindOptionValue(option: ParameterOption): string {
    return optionBindingValue(option);
  }

  private normalizeFormValues(values: Record<string, unknown>, schema: readonly EnrichedParameterField[]): Record<string, unknown> {
    return normalizeParameterValues(values, schema);
  }

  private mergeOutlierReportConfig(configValues: Record<string, unknown>): Record<string, unknown> {
    if (!this.isOutlierReportSelected()) return configValues;
    delete configValues['strategies'];
    delete configValues['tails'];
    delete configValues['folds'];
    const payload = serializeOutlierRules(
      this.outlierReportRules,
      new Set(this.outlierReportVariables().map((variable) => variable.code))
    );
    return payload ? { ...configValues, ...payload } : configValues;
  }

  private persistOutlierReportConfig(): void {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm || algorithm.name !== AlgorithmNames.OUTLIER_REPORT) return;
    const visibleValues = this.normalizeFormValues(this.configForm().getRawValue(), this.visibleConfigSchema());
    const nextConfig = this.mergeOutlierReportConfig(visibleValues);
    this.experimentStudioService.algorithmConfigurations.set({
      ...this.experimentStudioService.algorithmConfigurations(),
      [algorithm.name]: nextConfig,
    });
  }

  private reconcileOutlierReportRules(variables: OutlierReportVariable[], stored: Record<string, unknown>): void {
    const allowedCodes = new Set(variables.map((variable) => variable.code));
    const hydrated = hydrateOutlierRules(stored, allowedCodes);
    const hasStoredRules = !!stored && typeof stored === 'object' && Object.keys(stored?.['strategies'] ?? {}).length > 0;
    const hasExistingRules = Object.keys(this.outlierReportRules).length > 0;
    const next: Record<string, OutlierRule> = {};

    variables.forEach((variable) => {
      const code = variable.code;
      next[code] = this.outlierReportRules[code]
        ? { ...this.outlierReportRules[code] }
        : hydrated[code]
          ? { ...hydrated[code] }
          : createDefaultOutlierRule(code, hasExistingRules || !hasStoredRules);
    });

    this.outlierReportRules = next;
    this.outlierReportValidationErrors = Object.fromEntries(
      Object.entries(this.outlierReportValidationErrors).filter(([code]) => allowedCodes.has(code))
    );
  }

  outlierReportRuleFor(variable: OutlierReportVariable): OutlierRule {
    if (!this.outlierReportRules[variable.code]) {
      this.outlierReportRules = {
        ...this.outlierReportRules,
        [variable.code]: createDefaultOutlierRule(variable.code, true),
      };
    }
    return this.outlierReportRules[variable.code];
  }

  outlierVariableLabel(variable: OutlierReportVariable): string {
    return variable?.label ?? variable?.name ?? variable?.code ?? '';
  }

  onOutlierReportEnabledChange(variable: OutlierReportVariable, enabled: boolean): void {
    const existing = this.outlierReportRuleFor(variable);
    this.outlierReportRules = {
      ...this.outlierReportRules,
      [variable.code]: { ...existing, enabled },
    };
    this.outlierReportValidationErrors = {
      ...this.outlierReportValidationErrors,
      [variable.code]: '',
    };
    this.persistOutlierReportConfig();
  }

  onOutlierReportStrategyChange(variable: OutlierReportVariable, strategy: OutlierStrategy): void {
    const existing = this.outlierReportRuleFor(variable);
    this.outlierReportRules = {
      ...this.outlierReportRules,
      [variable.code]: {
        ...existing,
        enabled: true,
        strategy,
        fold: defaultFoldForStrategy(strategy),
      },
    };
    this.outlierReportValidationErrors = {
      ...this.outlierReportValidationErrors,
      [variable.code]: '',
    };
    this.persistOutlierReportConfig();
  }

  onOutlierReportTailChange(variable: OutlierReportVariable, tail: OutlierTail): void {
    const existing = this.outlierReportRuleFor(variable);
    this.outlierReportRules = {
      ...this.outlierReportRules,
      [variable.code]: { ...existing, enabled: true, tail },
    };
    this.persistOutlierReportConfig();
  }

  onOutlierReportFoldChange(variable: OutlierReportVariable, rawValue: string | number): void {
    const existing = this.outlierReportRuleFor(variable);
    const value = String(rawValue ?? '').trim();
    const fold = value === '' ? null : Number(value);
    this.outlierReportRules = {
      ...this.outlierReportRules,
      [variable.code]: {
        ...existing,
        enabled: true,
        fold: typeof fold === 'number' && Number.isFinite(fold) ? fold : null,
      },
    };
    const error = validateOutlierRule(this.outlierReportRules[variable.code]);
    this.outlierReportValidationErrors = {
      ...this.outlierReportValidationErrors,
      [variable.code]: error ?? '',
    };
    this.persistOutlierReportConfig();
  }

  outlierReportRuleError(variable: OutlierReportVariable): string {
    const rule = this.outlierReportRuleFor(variable);
    return this.outlierReportValidationErrors[variable.code] || validateOutlierRule(rule) || '';
  }

  private validateOutlierReportConfig(): boolean {
    if (!this.isOutlierReportSelected()) return true;

    const variables = this.outlierReportVariables();
    if (!variables.length) {
      this.errorMsg.set('Select at least one numerical variable or covariate for the outlier report.');
      return false;
    }

    const errors: Record<string, string> = {};
    variables.forEach((variable) => {
      const rule = this.outlierReportRuleFor(variable);
      const error = validateOutlierRule(rule);
      if (error) errors[variable.code] = error;
    });

    this.outlierReportValidationErrors = errors;
    if (Object.keys(errors).length > 0) {
      this.errorMsg.set('Fix the outlier report configuration before running.');
      return false;
    }

    const serialized = serializeOutlierRules(
      this.outlierReportRules,
      new Set(variables.map((variable) => variable.code))
    );
    if (!serialized) {
      this.errorMsg.set('Enable at least one numerical variable for the outlier report.');
      return false;
    }

    this.persistOutlierReportConfig();
    return true;
  }


  /** Transformation grid operates on the assigned outcome variables (y). */
  get selectedVariables() {
    return this.experimentStudioService.algorithmY();
  }

  /** Assignable pool drives the role-assignment UI (shown without a selected algorithm). */
  get assignablePool() {
    return this.experimentStudioService.algorithmAssignableVariables();
  }


  readonly tooltipVisible = signal(false);
  readonly tooltipPosition = signal({ x: 0, y: 0 });
  readonly tooltipData = signal<AlgorithmConfig | null>(null);

  selectAlgorithm(algorithm: AlgorithmConfig) {
    this.lastBuiltFormSchemaSignature = '';
    this.eventVarSelection.set(null);
    // Use service method so it enriches configSchema and persists to sessionStorage
    this.experimentStudioService.setAlgorithm(algorithm);
    this.experimentStudioService.runResult.set(null);
    this.experimentStudioService.runError.set(null);
    this.errorMsg.set(null);
  }

  onAlgorithmClick(algorithm: AlgorithmConfig) {
    this.selectAlgorithm(algorithm);
    // Parent bookkeeping only: the details and parameters bands render from
    // selectedAlgorithm() below the row, so no substep navigation or page scroll.
    this.setStudioSubstep('parameters');
    this.hideTooltip();
  }

  /** Scrolls a studio anchor; `scroll-margin-top` on the target clears sticky chrome. */
  private scrollStudioTargetIntoView(target: HTMLElement | null, focus = false): void {
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focus) target.focus({ preventScroll: true });
  }

  onClickRunExp() {
    this.errorMsg.set(null);
    this.errorService.clearError();

    if (this.selectedAlgorithmUnavailable()) {
      this.errorMsg.set('This algorithm is unavailable for the current selection.');
      return;
    }

    const unavailableVariables = this.unavailableRunVariablesReason();
    if (unavailableVariables) {
      this.errorMsg.set(unavailableVariables);
      return;
    }

    const preprocessingMessage = this.preprocessingRunBlockMessage();
    if (preprocessingMessage) {
      this.errorMsg.set(preprocessingMessage);
      return;
    }

    // algorithm does not run if form is invalid
    if (this.configForm() && this.configForm().invalid) {
      this.configForm().markAllAsTouched();
      console.warn('[AlgorithmPanel] Run blocked – configForm invalid');
      return;
    }

    const algo = this.experimentStudioService.selectedAlgorithm();
    this.errorMsg.set(null);
    this.errorService.clearError();
    this.experimentStudioService.runStatusText.set('Processing experiment...');
    this.experimentStudioService.hasRunStarted.set(true);
    this.experimentStudioService.runError.set(null);
    this.experimentStudioService.runResult.set(null);
    this.experimentStudioService.runId.set(null);
    this.experimentStudioService.setRunning(true);

    if (!algo) {
      console.error('No algorithm selected in service.');
      const msg = 'Please choose an algorithm before running.';
      this.errorMsg.set(msg);
      this.experimentStudioService.setRunning(false);
      this.experimentStudioService.hasRunStarted.set(false);
      return;
    }

    if (!this.validateOutlierReportConfig()) {
      this.experimentStudioService.setRunning(false);
      return;
    }

    const {
      baseName: baseAlgorithmName,
      effectiveName: effectiveAlgorithmName,
      finalName: finalAlgorithmName,
      includeSplits: shouldIncludeSplits,
    } = resolveRunAlgorithmNames(algo.name, this.crossValidationEnabled(), this.experimentStudioService);

    this.experimentStudioService.lastUsedAlgorithm.set(finalAlgorithmName);
    this.errorMsg.set(null);

    let configValues = this.normalizeFormValues(this.configForm().getRawValue(), this.visibleConfigSchema());
    configValues = this.mergeOutlierReportConfig(configValues);
    if (!shouldIncludeSplits && configValues['n_splits'] !== undefined) {
      delete configValues['n_splits'];
    }
    this.experimentStudioService.algorithmConfigurations.set({
      ...this.experimentStudioService.algorithmConfigurations(),
      [baseAlgorithmName]: configValues,
      ...(effectiveAlgorithmName !== baseAlgorithmName ? { [effectiveAlgorithmName]: configValues } : {})
    });

    // Freeze the setup before the request leaves: the Execution step describes the run from
    // this snapshot, and parameter edits after the run must not rewrite it.
    this.experimentStudioService.captureRunSetup(finalAlgorithmName);

    const result$ = this.experimentStudioService.runSelectedAlgorithm(
      baseAlgorithmName,
      finalAlgorithmName
    );
    if (!result$) {
      const msg = 'Unable to start the run. Check your selections.';
      this.errorMsg.set(msg);
      this.experimentStudioService.setRunning(false);
      this.experimentStudioService.hasRunStarted.set(false);
      return;
    }

    result$.subscribe({
      next: (res) => {
        const status = res?.status;
        const payload = res?.result ?? {};
        if (status === 'error') {
          const msg =
            payload?.data ||
            payload?.message ||
            'The server returned an error for this run.';
          this.experimentStudioService.runError.set(msg);
          return;
        }

        const schema = getOutputSchema(finalAlgorithmName ?? '') ?? [];
        this.experimentStudioService.runResult.set({
          ...res?.result ?? { message: "No result returned" },
        });
        // Save persists this kept run, so the saved experiment is the result shown here.
        this.experimentStudioService.runId.set(res?.uuid ?? null);
        this.lastUsedAlgorithm = finalAlgorithmName;
        this.experimentStudioService.lastRunSchema.set(schema);
      },
      error: () => {
        this.experimentStudioService.runError.set('Unable to run experiment. Please try again.');
        // An errored stream never completes, so the run state is released here too.
        this.experimentStudioService.setRunning(false);
      },
      complete: () => {
        this.experimentStudioService.setRunning(false);
      }
    });

  }

  toggleCrossValidation(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const enabled = !!target?.checked;
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return;
    const baseName = this.experimentStudioService.getCrossValidationBase(algorithm.name) ?? algorithm.name;
    const variant = this.experimentStudioService.getCrossValidationVariant(baseName);
    if (!variant) return;
    const configs = this.experimentStudioService.algorithmConfigurations();
    const currentFormValues = this.configForm()?.getRawValue?.() ?? {};
    const preservedConfig = { ...(configs[baseName] ?? {}), ...currentFormValues };

    this.crossValidationSelections[baseName] = enabled;

    if (!enabled) {
      if (preservedConfig['n_splits'] !== undefined) delete preservedConfig['n_splits'];

      if (this.configForm()?.contains('n_splits')) {
        this.configForm().removeControl('n_splits');
      }

      const variantConfig = { ...(configs[variant] ?? {}) };
      if (variantConfig['n_splits'] !== undefined) delete variantConfig['n_splits'];
      this.experimentStudioService.algorithmConfigurations.set({
        ...configs,
        [baseName]: preservedConfig,
        [variant]: variantConfig,
      });
    } else {
      this.experimentStudioService.algorithmConfigurations.set({
        ...configs,
        [baseName]: preservedConfig,
        [variant]: { ...(configs[variant] ?? {}), ...preservedConfig },
      });
    }

    this.crossValidationEnabled.set(enabled);
  }

  private multiSelectValues(key: string): string[] {
    return multiSelectValues(this.configForm().get(key)?.value);
  }

  isMultiSelectOptionSelected(key: string, option: ParameterOption): boolean {
    const value = String(this.bindOptionValue(option));
    return this.multiSelectValues(key).includes(value);
  }

  toggleMultiSelectOption(key: string, option: ParameterOption): void {
    const control = this.configForm().get(key);
    if (!control) return;
    const value = String(this.bindOptionValue(option));
    const current = this.multiSelectValues(key);
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    control.setValue(next);
    control.markAsTouched();
    control.updateValueAndValidity();
  }

  isAlgorithmAvailable(algorithm: string): boolean {
    return this.experimentStudioService.isAlgorithmAvailable(algorithm);
  }

  availabilityDetails(algorithm: AlgorithmConfig | null = null): AlgorithmAvailabilityDetail[] {
    const target = algorithm ?? this.tooltipData();
    if (!target) return [];
    if (target.availability?.details?.length) return target.availability.details;
    return this.experimentStudioService.getAlgorithmAvailability(target.name).details ?? [];
  }

  readonly availabilityRequirementText = availabilityRequirementText;

  resolveRunRequirement(requirement: AlgorithmRunRequirement): void {
    if (requirement.id === 'preprocessing') {
      this.studioNavigation.goToPreprocessing();
      return;
    }
    // Availability issues are fixed on the setup board, which stays on screen above.
    this.setStudioSubstep('setup');
    requestAnimationFrame(() =>
      this.scrollStudioTargetIntoView(
        document.querySelector<HTMLElement>('[data-guide="guide-role-assignment"]'),
        true
      )
    );
  }

  private availabilityRequirementActionLabel(algorithmName: string): string {
    const failingDetail = this.experimentStudioService
      .getAlgorithmAvailability(algorithmName)
      .details
      .find((detail) => !detail.satisfied && detail.messages.length > 0);

    if (failingDetail?.role === 'x') {
      return 'Assign predictor';
    }

    return 'Assign outcome';
  }

  showTooltip(algorithm: AlgorithmConfig, event: MouseEvent) {
    event.stopPropagation();
    const item = (event.currentTarget as HTMLElement)?.closest('li') || (event.currentTarget as HTMLElement);
    const rect = item.getBoundingClientRect();
    const container = item.closest('.experiment-container') as HTMLElement | null;
    const containerRect = container?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    const offset = 12;

    this.tooltipVisible.set(true);
    this.tooltipData.set(algorithm);

    const initialPosition = tooltipPosition(rect, containerRect, { width: 320, height: 200, viewportWidth, viewportHeight, padding, offset });

    // Immediate initial placement
    this.tooltipPosition.set(initialPosition);

    // Refinement after render
    setTimeout(() => {
      const el = document.querySelector('.tooltip') as HTMLElement | null;
      if (!el) return;

      const w = el.offsetWidth || 320;
      const h = el.offsetHeight || 200;

      this.tooltipPosition.set(
        tooltipPosition(rect, containerRect, { width: w, height: h, viewportWidth, viewportHeight, padding, offset })
      );
    }, 0);
  }

  hideTooltip() {
    this.tooltipVisible.set(false);
  }

  onExportResult(section: HTMLElement) {
    const payload = this.resultExportPayload();
    if (!section || !payload) {
      console.warn('No result or element to export');
      return;
    }
    this.pdfExport.exportExperimentPdf({ ...payload, chartContainer: section });
  }

  onExportResultZip() {
    const payload = this.resultExportPayload();
    if (!payload) {
      console.warn('No result to export');
      return;
    }
    this.csvExport.exportExperimentZip({
      ...payload,
      tables: experimentTables(payload.algorithmKey, payload.result),
    }).catch((error) => {
      console.error('Result ZIP export failed:', error);
      this.errorMsg.set('Failed to export the result tables.');
    });
  }

  /** The run's setup and result, shared by the PDF report and the ZIP export. */
  private resultExportPayload() {
    const result = this.experimentStudioService.runResult();
    if (!result) return null;

    const info = this.experimentInfo();
    const algoKey =
      this.lastUsedAlgorithm ||
      this.experimentStudioService.lastUsedAlgorithm() ||
      this.experimentStudioService.selectedAlgorithm()?.name ||
      'experiment';

    const algoConfig = this.experimentStudioService.backendAlgorithms()[algoKey];
    const algoLabel = algoConfig?.label || algoKey;

    const currentUser = this.authService.currentUser;
    const createdBy =
      currentUser?.fullname || currentUser?.username || currentUser?.email || null;

    const filterLogic = this.experimentStudioService.filterLogic();
    const enumMaps = this.experimentStudioService.getCategoricalEnumMaps();
    const filterExpression = filterLogic
      ? formatFilterExpression(filterLogic, { labelMap: this.labelMap(), enumMaps })
      : '';
    const model = this.experimentStudioService.selectedDataModel();

    return {
      filename: info.experimentName,
      details: {
        experimentName: info.experimentName,
        createdBy,
        createdAt: new Date(),
        algorithm: algoLabel,
        params: info.algorithmConfigs,
        preprocessing: this.experimentStudioService
          .getEffectivePreprocessingEntries(algoKey, this.labelMap(), enumMaps)
          .map((entry) => `${entry.label}: ${entry.value}`)
          .join('\n'),
        domain: model ? [model.label || model.code, model.version].filter(Boolean).join(' ') : null,
        datasets: this.datasetsWithLabels().map((d) => d.label),
        variables: (info.variables ?? []).map(variableDisplayName),
        covariates: (info.covariates ?? []).map(variableDisplayName),
        filters: filterExpression
          ? [filterExpression]
          : (info.filters ?? []).map(variableDisplayName),
        transformations: null,
        mipVersion: this.mipVersion,
      },
      algorithmKey: algoKey,
      result,
    };
  }
}

/** How exports name a variable: label, then name, then code. */
function variableDisplayName(variable: StudioVariable): string {
  return variable.label || variable.name || variable.code || '';
}

function hasCode(variable: StudioVariable | null | undefined): variable is OutlierReportVariable {
  return !!variable?.code;
}
