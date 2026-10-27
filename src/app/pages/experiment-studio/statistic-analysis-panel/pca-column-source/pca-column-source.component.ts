import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
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
import { TransformationStep, stepOutputNames } from '../../../../core/transformation-steps.utils';
import { collectVariableCodes } from '../../../../core/variable-availability.utils';
import {
  KMeansSourceContext,
  analysisSourceIsReusable,
} from '../../../../core/kmeans-cluster-source.utils';
import {
  PCA_COLUMN_CREATOR,
  PCAReusablePreprocessing,
  buildPcaCreatorParameters,
  defaultPcaColumnNames,
  findPcaRecipe,
  nextPcaColumnPrefix,
} from '../../../../core/pca-column-source.utils';

/** Exaflow column codes: an identifier, not free text. */
const CODE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type SourceMode = 'result' | 'fit';

type AppliedPcaCreator = {
  new_column_names: string[];
  selected_components: string[];
  n_components: number;
  reusable_preprocessing?: PCAReusablePreprocessing;
  variables?: string[];
};

/**
 * Reuses a finished PCA run as component score columns, or fits PCA directly on
 * selected numerical variables. Each card edits one `pca_column_creator` step.
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
  /** Recipe loaded for the selected experiment (result mode). */
  readonly loadedRecipe = signal<PCAReusablePreprocessing | null>(null);

  readonly numericVariables = computed(() =>
    (this.studio.selectedVariables() as any[]).filter((variable) => isOutlierEligibleVariable(variable))
  );

  /**
   * Fit-mode pool: numerical CDEs plus numerical outputs of earlier transformation
   * steps. The current step's own outputs are excluded.
   */
  readonly fitNumericVariables = computed(() => {
    const steps = this.studio.appliedTransformations();
    const myIndex = steps.findIndex((candidate) => candidate.id === this.stepId());
    const earlier = myIndex === -1 ? steps : steps.slice(0, myIndex);
    const earlierCodes = new Set(earlier.flatMap((step) => stepOutputNames(step)));
    const ownCodes = new Set(myIndex >= 0 ? stepOutputNames(steps[myIndex]) : []);

    const assignable = (this.studio.algorithmAssignableVariables() as any[]) ?? [];
    const seen = new Set<string>();
    const pool: any[] = [];
    for (const variable of assignable) {
      const code = String(variable?.code ?? '');
      if (!code || seen.has(code) || ownCodes.has(code)) continue;
      if (!isOutlierEligibleVariable(variable)) continue;
      if (variable?.isCreatedColumn && !earlierCodes.has(code)) continue;
      seen.add(code);
      pool.push(variable);
    }
    for (const variable of this.numericVariables()) {
      const code = String(variable.code);
      if (seen.has(code) || ownCodes.has(code)) continue;
      if (variable?.isCreatedColumn && !earlierCodes.has(code)) continue;
      seen.add(code);
      pool.push(variable);
    }
    return pool;
  });

  /**
   * CDEs start selected and created columns start unselected: mixing raw variables with
   * components already built from them is opt-in. A toggle flips the default.
   */
  readonly fitSelectedCodes = computed(() => {
    const toggled = this.excludedCodes();
    return this.fitNumericVariables()
      .filter((variable) => !!variable?.isCreatedColumn === toggled.has(String(variable.code)))
      .map((variable) => String(variable.code));
  });

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

  ngOnInit(): void {
    this.prefix.set(this.computeDefaultPrefix());
    this.loadExperiments();
  }

  setSourceMode(mode: SourceMode): void {
    this.sourceMode.set(mode);
    this.error.set(null);
    this.excludedCodes.set(new Set());
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
    this.loadedRecipe.set(null);
    this.selectedComponents.set([]);
    this.columnNamesById.set({});
    this.error.set(null);
    if (!uuid) return;

    this.applying.set(true);
    this.dashboard.getExperimentResult(uuid).subscribe({
      next: (response) => {
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
        this.applying.set(false);
        this.error.set('Could not load the PCA result.');
      },
    });
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
    this.studio.upsertTransformation(step);
  }

  private validateNames(names: string[]): boolean {
    for (const name of names) {
      if (!CODE_PATTERN.test(name)) {
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
