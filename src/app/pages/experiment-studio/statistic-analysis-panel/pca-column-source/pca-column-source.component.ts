import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../../services/experiments-dashboard.service';
import { BackendExperiment } from '../../../../models/backend-experiment.model';
import { isOutlierEligibleVariable } from '../../../../core/outlier-rules';
import {
  COLUMN_CODE_PATTERN,
  TransformationStep,
  fitSelectedCodes,
  fitVariablePool,
  stepOutputNames,
} from '../../../../core/transformation-steps.utils';
import { collectVariableCodes } from '../../../../core/variable-availability.utils';
import {
  KMeansSourceContext,
  analysisSourceIsReusable,
  canonicalFilterKey,
} from '../../../../core/kmeans-cluster-source.utils';
import {
  PCA_COLUMN_CREATOR,
  PCAReusablePreprocessing,
  buildPcaCreatorParameters,
  defaultPcaColumnNames,
  findPcaRecipe,
  nextPcaColumnPrefix,
} from '../../../../core/pca-column-source.utils';

type SourceMode = 'result' | 'fit';

type AppliedPcaCreator = {
  new_column_names: string[];
  selected_components: string[];
  n_components: number;
  reusable_preprocessing?: PCAReusablePreprocessing;
  variables?: string[];
};

/**
 * Builds component score columns like the K-means card builds cluster columns: run a PCA
 * report here (no saved PCA experiment needed) and use its recipe, reuse a finished
 * compatible PCA run, or fit PCA directly on selected numerical variables. Each card edits
 * one `pca_column_creator` step.
 */
@Component({
  selector: 'app-pca-column-source',
  imports: [DatePipe, FormsModule],
  templateUrl: './pca-column-source.component.html',
  styleUrl: './pca-column-source.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PcaColumnSourceComponent implements OnInit {
  private readonly studio = inject(ExperimentStudioService);
  private readonly dashboard = inject(ExperimentsDashboardService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Store step this editor writes; the Transformation stage passes one per card. */
  readonly stepId = input.required<string>();

  /**
   * Optional uniqueness check from the Transformation stage. When a name collides,
   * apply must not call upsertTransformation.
   */
  readonly columnNameError = input<(stepId: string, name: string) => string | null>();

  /** False when a later step reads this card's outputs (station Remove uses the same gate). */
  readonly canRemove = input(true);

  /** Tooltip when Remove is disabled because of dependents. */
  readonly removeTooltip = input('Remove');

  readonly sourceMode = signal<SourceMode>('result');
  readonly experiments = signal<BackendExperiment[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedUuid = signal<string | null>(null);
  readonly applying = signal(false);
  readonly prefix = signal('pca');
  /** Selected component ids, in display order. */
  readonly selectedComponents = signal<string[]>([]);
  /** Editable column name per selected component id. */
  readonly columnNamesById = signal<Record<string, string>>({});
  /** Fit-mode: variables the user opted out of (same pattern as K-means). */
  private readonly excludedCodes = signal<ReadonlySet<string>>(new Set());
  /** Recipe loaded for the selected experiment, or from the in-place report (result mode). */
  readonly loadedRecipe = signal<PCAReusablePreprocessing | null>(null);

  /** In-place report run (same flow as the K-means card): pick numerical variables, run
   *  `pca`, reuse its recipe. Only opt-outs are stored, so the picks follow the variable pool. */
  private readonly runExcludedCodes = signal<ReadonlySet<string>>(new Set());
  readonly runLoading = signal(false);
  readonly runError = signal<string | null>(null);
  /** Observation count of the in-place report, once it has run. */
  readonly reportObservations = signal<number | null>(null);
  /** Context key the in-place report ran on; null when the loaded recipe is not from a report. */
  private reportContextKey: string | null = null;

  readonly numericVariables = computed(() =>
    (this.studio.selectedVariables() as any[]).filter((variable) => isOutlierEligibleVariable(variable))
  );

  /**
   * Fit-mode pool: numerical CDEs plus numerical outputs of earlier transformation
   * steps. The current step's own outputs are excluded.
   */
  readonly fitNumericVariables = computed(() =>
    fitVariablePool(this.studio.appliedTransformations(), this.stepId(), [
      ...((this.studio.algorithmAssignableVariables() as any[]) ?? []),
      ...this.numericVariables(),
    ])
  );

  /**
   * CDEs start selected and created columns start unselected: mixing raw variables with
   * components already built from them is opt-in. A toggle flips the default.
   */
  readonly fitSelectedCodes = computed(() => fitSelectedCodes(this.fitNumericVariables(), this.excludedCodes()));

  /** In-place report picks: data-model numerical variables (a recipe must replay on CDEs). */
  readonly runSelectedCodes = computed(() => {
    const excluded = this.runExcludedCodes();
    return this.numericVariables()
      .map((variable) => String(variable.code))
      .filter((code) => !excluded.has(code));
  });

  /** Inputs a report was run on; a report from other inputs must not become columns. */
  private readonly runContextKey = computed(() => {
    const context = this.currentContext();
    return canonicalFilterKey({
      dataModel: context.dataModel,
      datasets: [...context.datasets].map(String).sort(),
      filters: context.filters ?? null,
      codes: [...this.runSelectedCodes()].sort(),
    });
  });

  /** True when the result-mode recipe came from the in-place report (steps are numbered 1–3). */
  readonly recipeFromReport = signal(false);

  /** Components available in the active mode. */
  readonly availableComponents = computed((): Array<{ component_id: string; explained_variance_ratio?: number }> => {
    if (this.sourceMode() === 'result') {
      return this.loadedRecipe()?.component_choices ?? [];
    }
    const n = this.fitSelectedCodes().length;
    return Array.from({ length: n }, (_, index) => ({ component_id: `PC${index + 1}` }));
  });

  /** Selected components the active mode still provides (the fit pool can shrink after a pick). */
  readonly validSelectedComponents = computed(() => {
    const available = new Set(this.availableComponents().map((choice) => choice.component_id));
    return this.selectedComponents().filter((id) => available.has(id));
  });

  currentContext(): KMeansSourceContext {
    return {
      dataModel: this.studio.getActiveDataModelCode() || null,
      datasets: this.studio.requestDatasets(),
      filters: this.studio.requestFilters(),
    };
  }

  readonly compatible = computed(() => {
    const context = this.currentContext();
    return this.experiments().filter((experiment) =>
      analysisSourceIsReusable(experiment, 'pca', context));
  });

  readonly hiddenCount = computed(() => this.experiments().length - this.compatible().length);

  readonly applied = computed((): AppliedPcaCreator | null => {
    const step = this.studio.appliedTransformations().find((candidate) => candidate.id === this.stepId());
    if (!step || step.name !== PCA_COLUMN_CREATOR) return null;
    const creator = step.parameters as unknown as AppliedPcaCreator | undefined;
    if (!creator || typeof creator !== 'object') return null;
    const names = creator.new_column_names;
    if (!Array.isArray(names) || !names.length) return null;
    if (!Array.isArray(creator.selected_components) || !creator.selected_components.length) return null;
    if (typeof creator.n_components !== 'number') return null;
    if (creator.reusable_preprocessing) return creator;
    if (Array.isArray(creator.variables) && creator.variables.length > 0) return creator;
    return null;
  });

  constructor() {
    // The card stays mounted, so data model, datasets, filters or picks can change under a
    // finished report; drop its recipe rather than offer components fitted on other data.
    effect(() => {
      const key = this.runContextKey();
      if (this.reportContextKey !== null && key !== this.reportContextKey) {
        this.reportContextKey = null;
        this.recipeFromReport.set(false);
        this.loadedRecipe.set(null);
        this.reportObservations.set(null);
        this.selectedComponents.set([]);
        this.columnNamesById.set({});
        this.runError.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.prefix.set(this.computeDefaultPrefix());
    this.loadExperiments();
  }

  setSourceMode(mode: SourceMode): void {
    this.sourceMode.set(mode);
    this.error.set(null);
    this.runError.set(null);
    this.excludedCodes.set(new Set());
    this.runExcludedCodes.set(new Set());
    this.clearReport();
    this.loadedRecipe.set(null);
    this.selectedUuid.set(null);
    this.selectedComponents.set([]);
    this.columnNamesById.set({});
    if (mode === 'fit') {
      this.syncFitComponents();
    }
  }

  private loadExperiments(): void {
    this.loading.set(true);
    this.dashboard.listPcaExperiments().subscribe({
      next: (experiments) => {
        this.experiments.set(experiments);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load PCA experiments.');
        this.loading.set(false);
      },
    });
  }

  private computeDefaultPrefix(): string {
    const used = this.studio.appliedTransformations()
      .filter((step) => step.id !== this.stepId() && step.name === PCA_COLUMN_CREATOR)
      .flatMap((step) => stepOutputNames(step));
    return nextPcaColumnPrefix(used);
  }

  onExperimentChange(uuid: string): void {
    this.selectedUuid.set(uuid || null);
    this.clearReport();
    this.loadedRecipe.set(null);
    this.selectedComponents.set([]);
    this.columnNamesById.set({});
    this.error.set(null);
    this.applying.set(!!uuid);
    if (!uuid) return;

    // A response for a run the user has since moved away from must not load its recipe.
    this.dashboard.getExperimentResult(uuid).subscribe({
      next: (response) => {
        if (this.selectedUuid() !== uuid) return;
        this.applying.set(false);
        const recipe = findPcaRecipe(response);
        if (!recipe) {
          this.error.set('This PCA result cannot be reused. Re-run the PCA experiment and try again.');
          return;
        }
        // The recipe's variables are sent as data-model variables; a PCA run on created
        // columns cannot be replayed here.
        const cdes = new Set(collectVariableCodes(this.studio.selectedDataModel()));
        if (cdes.size && recipe.base_parameters.variables.some((code) => !cdes.has(code))) {
          this.error.set('This PCA used created columns. Re-run it on data model variables to reuse it.');
          return;
        }
        this.loadedRecipe.set(recipe);
        this.preselectComponents(recipe.component_choices.map((choice) => choice.component_id));
      },
      error: () => {
        if (this.selectedUuid() !== uuid) return;
        this.applying.set(false);
        this.error.set('Could not load the PCA result.');
      },
    });
  }

  toggleRunVariable(code: string): void {
    this.runExcludedCodes.update((excluded) => {
      const next = new Set(excluded);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  /** Run PCA on the selected variables without saving an experiment, then offer its components. */
  runReport(): void {
    const codes = this.runSelectedCodes();
    if (codes.length < 2) return;
    const request$ = this.studio.loadPcaReport(codes);
    if (!request$) {
      this.runError.set('PCA is not available for this workspace.');
      return;
    }

    const requestKey = this.runContextKey();
    this.runLoading.set(true);
    this.runError.set(null);
    this.error.set(null);
    this.clearReport();
    this.loadedRecipe.set(null);
    this.selectedComponents.set([]);
    this.columnNamesById.set({});
    request$.subscribe({
      next: (response) => {
        this.runLoading.set(false);
        if (this.runContextKey() !== requestKey) {
          this.runError.set('The selection changed while PCA was running. Run the report again.');
          this.cdr.markForCheck();
          return;
        }
        const status = (response as { status?: unknown } | null)?.status;
        if (status === 'error') {
          const payload = (response as { result?: any } | null)?.result ?? {};
          this.runError.set(String(payload?.data ?? payload?.message ?? 'The PCA report failed.'));
          this.cdr.markForCheck();
          return;
        }
        const recipe = findPcaRecipe(response);
        if (!recipe) {
          this.runError.set('The PCA report did not include reusable components.');
          this.cdr.markForCheck();
          return;
        }
        this.reportContextKey = requestKey;
        this.recipeFromReport.set(true);
        this.reportObservations.set(this.findObservationCount(response));
        this.loadedRecipe.set(recipe);
        this.preselectComponents(recipe.component_choices.map((choice) => choice.component_id));
        this.cdr.markForCheck();
      },
      error: () => {
        this.runLoading.set(false);
        this.runError.set('Could not run the PCA report.');
        this.cdr.markForCheck();
      },
    });
  }

  private clearReport(): void {
    this.reportContextKey = null;
    this.recipeFromReport.set(false);
    this.reportObservations.set(null);
  }

  private findObservationCount(response: unknown): number | null {
    const outer = (response as { result?: any } | null)?.result;
    for (const candidate of [response, outer, outer?.result]) {
      const n = (candidate as { n_obs?: unknown } | null | undefined)?.n_obs;
      if (typeof n === 'number' && Number.isFinite(n)) return n;
    }
    return null;
  }

  /** Number shown on the Select components step (Name follows it). */
  componentsStepNumber(): number {
    if (this.sourceMode() === 'fit' || this.recipeFromReport()) return 2;
    return 1;
  }

  toggleFitVariable(code: string): void {
    this.excludedCodes.update((excluded) => {
      const next = new Set(excluded);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    this.syncFitComponents();
  }

  /** Rebuild fit-mode components (PC1..PCn) and keep a sensible default selection. */
  private syncFitComponents(): void {
    const ids = this.availableComponents().map((choice) => choice.component_id);
    const previous = new Set(this.selectedComponents());
    const kept = ids.filter((id) => previous.has(id));
    if (kept.length) {
      this.setSelectedComponents(kept);
    } else {
      this.preselectComponents(ids);
    }
  }

  private preselectComponents(ids: string[]): void {
    if (!ids.length) {
      this.setSelectedComponents([]);
      return;
    }
    // PC1+PC2 when both exist; PC1 alone otherwise.
    const defaults = ids.length >= 2 ? ids.slice(0, 2) : ids.slice(0, 1);
    this.setSelectedComponents(defaults);
  }

  toggleComponent(componentId: string): void {
    const current = this.selectedComponents();
    if (current.includes(componentId)) {
      this.setSelectedComponents(current.filter((id) => id !== componentId));
    } else {
      const order = this.availableComponents().map((choice) => choice.component_id);
      this.setSelectedComponents(order.filter((id) => id === componentId || current.includes(id)));
    }
  }

  private setSelectedComponents(ids: string[]): void {
    this.selectedComponents.set(ids);
    const names = defaultPcaColumnNames(this.prefix(), ids);
    this.columnNamesById.set(Object.fromEntries(ids.map((id, index) => [id, names[index]])));
  }

  setPrefix(value: string): void {
    this.prefix.set(value);
    const ids = this.selectedComponents();
    const names = defaultPcaColumnNames(value, ids);
    this.columnNamesById.set(Object.fromEntries(ids.map((id, index) => [id, names[index]])));
  }

  setColumnName(componentId: string, value: string): void {
    this.columnNamesById.update((current) => ({ ...current, [componentId]: value }));
  }

  columnNameFor(componentId: string): string {
    return this.columnNamesById()[componentId] ?? '';
  }

  varianceLabel(ratio: number | undefined): string {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '';
    return `${(ratio * 100).toFixed(1)}%`;
  }

  apply(): void {
    if (this.sourceMode() === 'fit') {
      this.applyFit();
      return;
    }
    this.applyResult();
  }

  private applyResult(): void {
    const recipe = this.loadedRecipe();
    const selected = this.validSelectedComponents();
    const names = selected.map((id) => this.columnNameFor(id).trim());
    if (!recipe || !selected.length || names.some((name) => !name)) return;
    if (!this.validateNames(names)) return;
    this.store(buildPcaCreatorParameters({ recipe, selected, names }));
  }

  private applyFit(): void {
    const variables = this.fitSelectedCodes();
    const selected = this.validSelectedComponents();
    const names = selected.map((id) => this.columnNameFor(id).trim());
    if (variables.length < 2 || !selected.length || names.some((name) => !name)) return;
    if (!this.validateNames(names)) return;
    this.store(buildPcaCreatorParameters({ variables, selected, names }));
  }

  /** Writes this card's step, unless a later step reads a column the new parameters drop. */
  private store(parameters: Record<string, unknown>): void {
    const step = { id: this.stepId(), name: PCA_COLUMN_CREATOR, parameters } as TransformationStep;
    const inUse = this.studio.outputsInUse(step.id, stepOutputNames(step));
    if (inUse.length) {
      this.error.set(`Used by a later step: ${inUse.join(', ')}`);
      return;
    }
    this.error.set(null);
    this.runError.set(null);
    this.clearReport();
    this.studio.upsertTransformation(step);
  }

  private validateNames(names: string[]): boolean {
    for (const name of names) {
      if (!COLUMN_CODE_PATTERN.test(name)) {
        this.error.set('Use letters, digits and underscores, starting with a letter or underscore.');
        return false;
      }
    }
    if (new Set(names).size !== names.length) {
      this.error.set('Column names must be unique.');
      return false;
    }
    for (const name of names) {
      const nameError = this.columnNameError()?.(this.stepId(), name) ?? null;
      if (nameError) {
        this.error.set(nameError);
        return false;
      }
    }
    return true;
  }

  remove(): void {
    if (!this.canRemove()) return;
    this.error.set(null);
    this.selectedUuid.set(null);
    this.loadedRecipe.set(null);
    this.clearReport();
    this.studio.removeTransformation(this.stepId());
  }

  appliedVariables(): string[] {
    const creator = this.applied();
    if (!creator) return [];
    const fromRecipe = creator.reusable_preprocessing?.base_parameters?.variables;
    if (Array.isArray(fromRecipe)) return fromRecipe;
    return Array.isArray(creator.variables) ? creator.variables.map(String) : [];
  }

  canApply(): boolean {
    const selected = this.validSelectedComponents();
    const names = selected.map((id) => this.columnNameFor(id).trim());
    if (!selected.length || names.some((name) => !name)) return false;
    if (this.sourceMode() === 'fit') return this.fitSelectedCodes().length >= 2;
    return !!this.loadedRecipe();
  }
}
