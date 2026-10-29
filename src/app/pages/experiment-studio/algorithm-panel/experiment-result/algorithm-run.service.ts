import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ErrorService } from '../../../../services/error.service';
import { AuthService } from '../../../../services/auth.service';
import { RuntimeEnvService } from '../../../../services/runtime-env.service';
import { experimentTables, PdfExportService } from '../../../../services/pdf-export.service';
import { CsvExportService } from '../../../../services/csv-export.service';
import { getOutputSchema, prettifyLabel as toHumanLabel } from '../../../../core/algorithm-mappers';
import { formatFilterExpression } from '../../../../core/filter-display.utils';
import { AlgorithmNames } from '../../../../core/constants/algorithm.constants';
import { unavailableDatasetsFor, unavailableVariableTooltip } from '../../../../core/variable-availability.utils';
import { formatAvailabilityMessage } from '../utils/algorithm-availability-text.utils';
import { buildAlgorithmNeeds, readinessText, resolveRunAlgorithmNames } from '../utils/algorithm-run.utils';
import { AlgorithmCatalogService } from '../algorithm-selection/algorithm-catalog.service';
import { AlgorithmConfigFormService } from '../algorithm-selection/algorithm-config-form.service';
import {
  AlgorithmNeedItem,
  AlgorithmRunRequirement,
  ExperimentRunInfo,
  StudioVariable,
} from '../algorithm-panel.models';

/**
 * Running the selected method and exporting its result: what still blocks the run, the
 * run request itself, its error, and the PDF and ZIP exports. Provided by the algorithm panel.
 */
@Injectable()
export class AlgorithmRunService {
  private readonly studio = inject(ExperimentStudioService);
  private readonly catalog = inject(AlgorithmCatalogService);
  private readonly configForm = inject(AlgorithmConfigFormService);
  private readonly errorService = inject(ErrorService);
  private readonly authService = inject(AuthService);
  private readonly pdfExport = inject(PdfExportService);
  private readonly csvExport = inject(CsvExportService);
  private readonly mipVersion = inject(RuntimeEnvService).mipVersion;

  /** Why the last run attempt or export failed, shown in the run bar. */
  readonly errorMsg = signal<string | null>(null);
  /** The algorithm of the last successful run; the exports name it. */
  private readonly lastRunAlgorithm = signal('');
  private readonly selectedAlgorithm = this.studio.selectedAlgorithm;
  private readonly labelMap = this.studio.variableLabelMap;

  private readonly selectedAlgorithmAvailabilitySummary = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm || !this.catalog.selectedAlgorithmUnavailable()) return '';
    const summary = this.studio.getAlgorithmAvailability(algorithm.name).summary ?? algorithm.availability?.summary ?? '';
    return formatAvailabilityMessage(summary);
  });

  readonly preprocessingRunBlockMessage = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return null;
    if (algorithm.name === AlgorithmNames.OUTLIER_REPORT) return null;
    if (
      this.studio.hasAppliedDescriptivePreprocessing() ||
      this.studio.hasRequestPreprocessingForRun(algorithm.name)
    ) return null;
    return 'Apply missing value preprocessing before running algorithms.';
  });

  /** Problems the user fixes elsewhere in the studio, each with the action that gets there. */
  readonly algorithmRunRequirements = computed((): AlgorithmRunRequirement[] => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];

    const requirements: AlgorithmRunRequirement[] = [];
    if (this.catalog.selectedAlgorithmUnavailable()) {
      requirements.push({
        id: 'availability',
        message: this.selectedAlgorithmAvailabilitySummary() || 'Algorithm requirements are not satisfied.',
        actionLabel: this.availabilityRequirementActionLabel(algorithm.name),
      });
    }
    const preprocessingMessage = this.preprocessingRunBlockMessage();
    if (preprocessingMessage) {
      requirements.push({ id: 'preprocessing', message: preprocessingMessage, actionLabel: 'Go to preprocessing' });
    }
    return requirements;
  });

  /**
   * "Remove variables not available in: …" when a variable the run uses (outcome, predictor
   * or cohort filter) is missing from a selected dataset; '' otherwise. Such variables stay
   * in the pool grayed out, so the run is blocked until the user removes them.
   */
  readonly unavailableRunVariablesReason = computed(() => {
    const map = this.studio.unavailableVariables();
    if (!map.size) return '';
    const datasets = new Set<string>();
    for (const node of [
      ...this.studio.algorithmY(),
      ...this.studio.algorithmX(),
      ...this.studio.selectedFilters(),
    ]) {
      unavailableDatasetsFor(map, { code: node?.code }).forEach((label) => datasets.add(label));
    }
    return unavailableVariableTooltip([...datasets], 'Remove variables not available in');
  });

  readonly algorithmNeeds = computed<AlgorithmNeedItem[]>(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];
    return buildAlgorithmNeeds({
      algorithm,
      details: this.catalog.availabilityDetails(algorithm),
      hasOutcome: this.studio.algorithmY().length > 0,
      unavailableVariablesReason: this.unavailableRunVariablesReason(),
      requirements: this.algorithmRunRequirements(),
    });
  });

  readonly canRun = computed(() => (
    !!this.selectedAlgorithm() &&
    !this.studio.isRunning() &&
    !this.catalog.selectedAlgorithmUnavailable() &&
    !this.unavailableRunVariablesReason() &&
    !this.preprocessingRunBlockMessage() &&
    !this.configForm.invalid()
  ));

  readonly runDisabledReason = computed(() => {
    if (this.studio.isRunning()) return 'Experiment is running';
    if (!this.selectedAlgorithm()) return 'Select an algorithm to run';
    if (this.catalog.selectedAlgorithmUnavailable()) return 'Algorithm unavailable for the current selection';
    const unavailable = this.unavailableRunVariablesReason();
    if (unavailable) return unavailable;
    const preprocessing = this.preprocessingRunBlockMessage();
    if (preprocessing) return preprocessing;
    if (this.configForm.invalid()) return 'Complete variable and algorithm selection to proceed';
    return 'Execute experiment';
  });

  readonly readinessText = computed(() => readinessText({
    algorithm: this.selectedAlgorithm(),
    canRun: this.canRun(),
    needs: this.algorithmNeeds(),
    y: this.studio.algorithmY(),
    x: this.studio.algorithmX(),
  }));

  private readonly outputSchema = computed(() => getOutputSchema(this.selectedAlgorithm()?.name ?? '') ?? []);

  private readonly datasetsWithLabels = computed(() => {
    const labelByCode = this.studio.getDatasetLabelMap();
    const fallbackMap = this.labelMap();
    return this.studio.selectedDatasets().map((code) => ({
      code,
      label: labelByCode[code] ?? fallbackMap[code] ?? toHumanLabel(code),
    }));
  });

  /** Name, roles, filters and parameters of the run the exports describe. */
  private readonly experimentInfo = computed((): ExperimentRunInfo => {
    const selected = this.studio.selectedAlgorithm();
    const lastRunName = this.studio.lastUsedAlgorithm() || this.lastRunAlgorithm();
    const algoName = selected?.name || lastRunName || null;
    const algoMeta = algoName ? this.studio.backendAlgorithms()[algoName] : null;
    const displayLabel = selected?.label || algoMeta?.label || algoName || 'N/A';
    const allConfigs = this.studio.algorithmConfigurations();

    return {
      experimentName: `Experiment for ${displayLabel}`,
      variables: this.studio.algorithmY(),
      covariates: this.studio.algorithmX(),
      filters: this.studio.selectedFilters(),
      algorithmConfigs: (algoName && allConfigs[algoName]) || {},
    };
  });

  constructor() {
    effect(() => {
      // Establish dependencies
      this.selectedAlgorithm();
      this.studio.algorithmY();
      this.studio.algorithmX();

      // A new selection invalidates whatever the last run produced
      this.studio.runResult.set(null);
      this.studio.runError.set(null);
    });

    effect(() => {
      const res = this.studio.runResult();
      const schema = this.outputSchema();
      if (!res || !schema.length) return;

      const missing = schema.filter((field) => !(field.key in res));
      if (missing.length > 0) {
        console.warn('[Validation] Missing fields from result:', missing.map((field) => field.key));
      }
    });
  }

  /** Drops the previous run's result and errors, as picking another method does. */
  clearRunState(): void {
    this.studio.runResult.set(null);
    this.studio.runError.set(null);
    this.errorMsg.set(null);
  }

  /** Sends the selected method with its parameters, unless something still blocks the run. */
  runExperiment(): void {
    this.errorMsg.set(null);
    this.errorService.clearError();

    if (this.catalog.selectedAlgorithmUnavailable()) {
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
    const form = this.configForm.configForm();
    if (form.invalid) {
      form.markAllAsTouched();
      console.warn('[AlgorithmPanel] Run blocked – configForm invalid');
      return;
    }

    const algo = this.studio.selectedAlgorithm();
    this.errorMsg.set(null);
    this.errorService.clearError();
    this.studio.runStatusText.set('Processing experiment...');
    this.studio.hasRunStarted.set(true);
    this.studio.runError.set(null);
    this.studio.runResult.set(null);
    this.studio.runId.set(null);
    this.studio.setRunning(true);

    if (!algo) {
      console.error('No algorithm selected in service.');
      this.errorMsg.set('Please choose an algorithm before running.');
      this.studio.setRunning(false);
      this.studio.hasRunStarted.set(false);
      return;
    }

    const outlierReportError = this.configForm.validateOutlierReportForRun();
    if (outlierReportError) {
      this.errorMsg.set(outlierReportError);
      this.studio.setRunning(false);
      return;
    }

    const {
      baseName: baseAlgorithmName,
      effectiveName: effectiveAlgorithmName,
      finalName: finalAlgorithmName,
      includeSplits: shouldIncludeSplits,
    } = resolveRunAlgorithmNames(algo.name, this.configForm.crossValidationEnabled(), this.studio);

    this.studio.lastUsedAlgorithm.set(finalAlgorithmName);
    this.errorMsg.set(null);

    const configValues = this.configForm.runParameterValues();
    if (!shouldIncludeSplits && configValues['n_splits'] !== undefined) {
      delete configValues['n_splits'];
    }
    this.studio.algorithmConfigurations.set({
      ...this.studio.algorithmConfigurations(),
      [baseAlgorithmName]: configValues,
      ...(effectiveAlgorithmName !== baseAlgorithmName ? { [effectiveAlgorithmName]: configValues } : {})
    });

    // Freeze the setup before the request leaves: the Execution step describes the run from
    // this snapshot, and parameter edits after the run must not rewrite it.
    this.studio.captureRunSetup(finalAlgorithmName);

    const result$ = this.studio.runSelectedAlgorithm(baseAlgorithmName, finalAlgorithmName);
    if (!result$) {
      this.errorMsg.set('Unable to start the run. Check your selections.');
      this.studio.setRunning(false);
      this.studio.hasRunStarted.set(false);
      return;
    }

    result$.subscribe({
      next: (res) => {
        const payload = res?.result ?? {};
        if (res?.status === 'error') {
          this.studio.runError.set(payload?.data || payload?.message || 'The server returned an error for this run.');
          return;
        }

        const schema = getOutputSchema(finalAlgorithmName ?? '') ?? [];
        this.studio.runResult.set({ ...res?.result ?? { message: "No result returned" } });
        // Save persists this kept run, so the saved experiment is the result shown here.
        this.studio.runId.set(res?.uuid ?? null);
        this.lastRunAlgorithm.set(finalAlgorithmName);
        this.studio.lastRunSchema.set(schema);
      },
      error: () => {
        this.studio.runError.set('Unable to run experiment. Please try again.');
        // An errored stream never completes, so the run state is released here too.
        this.studio.setRunning(false);
      },
      complete: () => {
        this.studio.setRunning(false);
      }
    });
  }

  /** Exports the shown result and its setup as a PDF report, with the figures in `section`. */
  exportPdf(section: HTMLElement): void {
    const payload = this.resultExportPayload();
    if (!section || !payload) {
      console.warn('No result or element to export');
      return;
    }
    this.pdfExport.exportExperimentPdf({ ...payload, chartContainer: section });
  }

  /** Exports the shown result's tables and setup as a ZIP of CSV files. */
  exportZip(): void {
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

  private availabilityRequirementActionLabel(algorithmName: string): string {
    const failingDetail = this.studio
      .getAlgorithmAvailability(algorithmName)
      .details
      .find((detail) => !detail.satisfied && detail.messages.length > 0);
    return failingDetail?.role === 'x' ? 'Assign predictor' : 'Assign outcome';
  }

  /** The run's setup and result, shared by the PDF report and the ZIP export. */
  private resultExportPayload() {
    const result = this.studio.runResult();
    if (!result) return null;

    const info = this.experimentInfo();
    const algoKey =
      this.lastRunAlgorithm() ||
      this.studio.lastUsedAlgorithm() ||
      this.studio.selectedAlgorithm()?.name ||
      'experiment';

    const algoLabel = this.studio.backendAlgorithms()[algoKey]?.label || algoKey;

    const currentUser = this.authService.currentUser;
    const createdBy = currentUser?.fullname || currentUser?.username || currentUser?.email || null;

    const filterLogic = this.studio.filterLogic();
    const enumMaps = this.studio.getCategoricalEnumMaps();
    const filterExpression = filterLogic
      ? formatFilterExpression(filterLogic, { labelMap: this.labelMap(), enumMaps })
      : '';
    const model = this.studio.selectedDataModel();

    return {
      filename: info.experimentName,
      details: {
        experimentName: info.experimentName,
        createdBy,
        createdAt: new Date(),
        algorithm: algoLabel,
        params: info.algorithmConfigs,
        preprocessing: this.studio
          .getEffectivePreprocessingEntries(algoKey, this.labelMap(), enumMaps)
          .map((entry) => `${entry.label}: ${entry.value}`)
          .join('\n'),
        domain: model ? [model.label || model.code, model.version].filter(Boolean).join(' ') : null,
        datasets: this.datasetsWithLabels().map((dataset) => dataset.label),
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
