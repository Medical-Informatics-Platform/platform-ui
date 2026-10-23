import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../../services/experiments-dashboard.service';
import { BackendExperiment } from '../../../../models/backend-experiment.model';
import { KMeansResult } from '../../../../models/algorithm-results.model';
import {
  formatAlgorithmParameterValue,
  optionBindingValue,
} from '../../../../core/algorithm-parameter.utils';
import { isOutlierEligibleVariable } from '../../../../core/outlier-rules';
import { COLUMN_CODE_PATTERN, fitSelectedCodes, fitVariablePool } from '../../../../core/transformation-steps.utils';
import {
  KMEANS_CLUSTER_CREATOR,
  KMeansReusablePreprocessing,
  KMeansSourceContext,
  canonicalFilterKey,
  findKMeansReport,
  findReusablePreprocessing,
  isPlainObject,
  analysisSourceIsReusable,
} from '../../../../core/kmeans-cluster-source.utils';

/** Optional fit-mode creator params and their Exaflow defaults. Always-sent keys (k,
 *  enumeration_prefix, variables, new_column_names) are not listed here. */
const FIT_PARAMETER_FIELDS: KMeansParameterField[] = [
  {
    key: 'init_method',
    label: 'Initialization method',
    type: 'select',
    default: 'random_range',
    options: ['random_range', 'multi_start_random_range'],
  },
  { key: 'n_init', label: 'Number of initializations', type: 'number', types: ['int'], default: 1 },
  { key: 'tol', label: 'Convergence tolerance', type: 'number', types: ['real'], default: 0.0001 },
  { key: 'maxiter', label: 'Maximum iterations', type: 'number', types: ['int'], default: 100 },
  { key: 'random_state', label: 'Random seed', type: 'number', types: ['int'], default: 123 },
];

interface KMeansParameterField {
  key: string;
  label?: string;
  type?: string;
  types?: string[];
  required?: boolean;
  default?: unknown;
  options?: unknown[];
}

/** Stored creator config: recipe mode has reusable_preprocessing; fit mode has variables. */
type AppliedKMeansCreator = {
  new_column_names: string[];
  k: number;
  enumeration_prefix: string;
  reusable_preprocessing?: KMeansReusablePreprocessing;
  variables?: string[];
};

type SourceMode = 'result' | 'fit';

/**
 * Reuses a finished K-means run as a categorical cluster column, or fits K-means
 * directly on selected numerical variables. Each card edits one transformation step.
 */
@Component({
  selector: 'app-kmeans-cluster-source',
  imports: [DatePipe, FormsModule],
  templateUrl: './kmeans-cluster-source.component.html',
  styleUrl: './kmeans-cluster-source.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KMeansClusterSourceComponent implements OnInit {
  private readonly studio = inject(ExperimentStudioService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly dashboard = inject(ExperimentsDashboardService);

  /** Store step this editor writes; the Transformation stage passes one per card. */
  readonly stepId = input.required<string>();

  /**
   * Optional uniqueness check from the Transformation stage. When the name collides,
   * apply/reuse must not call upsertTransformation.
   */
  readonly columnNameError = input<(stepId: string, name: string) => string | null>();

  /** False when a later step reads this card's outputs (station Remove uses the same gate). */
  readonly canRemove = input(true);

  /** Tooltip when Remove is disabled because of dependents. */
  readonly removeTooltip = input('Remove');

  /** 'result' = recipe / in-place report; 'fit' = direct fit on selected variables. */
  readonly sourceMode = signal<SourceMode>('result');

  readonly experiments = signal<BackendExperiment[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedUuid = signal<string | null>(null);
  readonly code = signal('kmeans_cluster');
  readonly applying = signal(false);

  /** In-place report run: pick numerical variables, run `kmeans`, reuse its result.
   *  Only opt-outs are stored, so the picks follow the variable pool: a removed variable
   *  is never sent and a newly added one starts ticked. */
  private readonly runExcludedCodes = signal<ReadonlySet<string>>(new Set());
  readonly runLoading = signal(false);
  readonly runError = signal<string | null>(null);
  readonly advancedOpen = signal(false);
  /** Edited parameter values. An absent key still means the schema default. */
  private readonly parameterDraft = signal<Record<string, string>>({});
  readonly report = signal<KMeansResult | null>(null);
  readonly reportReusable = signal<KMeansReusablePreprocessing | null>(null);

  /** Fit mode: cluster count (always sent; Exaflow has no default). */
  readonly fitK = signal(4);

  readonly numericVariables = computed(() =>
    (this.studio.selectedVariables() as any[]).filter((variable) => isOutlierEligibleVariable(variable))
  );

  /**
   * Fit-mode pool: numerical CDEs plus numerical outputs of earlier transformation
   * steps (e.g. PCA columns). The current step's own outputs are excluded.
   */
  readonly fitNumericVariables = computed(() =>
    fitVariablePool(this.studio.appliedTransformations(), this.stepId(), [
      ...((this.studio.algorithmAssignableVariables() as any[]) ?? []),
      ...this.numericVariables(),
    ])
  );

  readonly runSelectedCodes = computed(() => {
    const excluded = this.runExcludedCodes();
    return this.numericVariables()
      .map((variable) => String(variable.code))
      .filter((code) => !excluded.has(code));
  });

  /**
   * CDEs start selected and created columns start unselected: clustering raw variables
   * together with components built from them is opt-in. A toggle flips the default.
   */
  readonly fitSelectedCodes = computed(() => fitSelectedCodes(this.fitNumericVariables(), this.runExcludedCodes()));

  /** K-means parameters from the algorithm catalog. Closed until Parameters is opened. */
  readonly parameterFields = computed((): KMeansParameterField[] => {
    const schema = this.studio.backendAlgorithms()?.['kmeans']?.configSchema ?? [];
    return schema.filter((field): field is KMeansParameterField =>
      !!field?.key && ['number', 'select', 'text'].includes(field.type)
    );
  });

  /** Fit-mode optional creator parameters (Exaflow kmeans_cluster_creator defaults). */
  readonly fitParameterFields = FIT_PARAMETER_FIELDS;

  /** Closed Parameters row. Same values `parameterOverrides()` will send, so a trimmed or invalid draft is not listed. */
  readonly parameterSummary = computed(() => {
    const fields = this.sourceMode() === 'fit' ? this.fitParameterFields : this.parameterFields();
    const overrides = this.parameterOverrides(fields);
    const changed = fields
      .filter((field) => field.key in overrides)
      .map((field) => {
        const label = formatAlgorithmParameterValue(overrides[field.key], field) || '—';
        return `${field.label || field.key} ${label}`;
      });
    return changed.length ? changed.join(' · ') : 'All defaults';
  });

  /** Share-bar width (%) per cluster id. Sizes arrive as privacy intervals ("40–60"),
   *  so each bar uses the midpoint of the numbers it holds: a "0–10" cluster is not empty. */
  readonly clusterShares = computed((): Record<string, number> => {
    const clusters = this.report()?.clusters ?? [];
    const sizes = clusters.map((cluster) => {
      const bounds = (String(cluster.size_interval).replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      return bounds.length ? bounds.reduce((sum, bound) => sum + bound, 0) / bounds.length : 0;
    });
    const total = sizes.reduce((sum, size) => sum + size, 0);
    return Object.fromEntries(clusters.map((cluster, i) => [cluster.cluster_id, total ? (sizes[i] / total) * 100 : 0]));
  });

  /** Inputs a report was run on; a report from other inputs must not become a column. */
  private readonly runContextKey = computed(() => {
    const context = this.currentContext();
    return canonicalFilterKey({
      dataModel: context.dataModel,
      datasets: [...context.datasets].map(String).sort(),
      filters: context.filters ?? null,
      codes: [...this.runSelectedCodes()].sort(),
      parameters: this.parameterOverrides(this.parameterFields()),
    });
  });
  private reportContextKey: string | null = null;

  /** What the next run would send — the context a past run must match to be reusable. */
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
      analysisSourceIsReusable(experiment, 'kmeans', context));
  });

  readonly hiddenCount = computed(() => this.experiments().length - this.compatible().length);

  readonly applied = computed((): AppliedKMeansCreator | null => {
    const step = this.studio.appliedTransformations().find((candidate) => candidate.id === this.stepId());
    if (!step || step.name !== KMEANS_CLUSTER_CREATOR) return null;
    const creator = step.parameters as unknown as AppliedKMeansCreator | undefined;
    if (!isPlainObject(creator)) return null;
    const names = creator.new_column_names;
    const code = Array.isArray(names) ? String(names[0] ?? '').trim() : '';
    if (!code) return null;
    if (typeof creator.k !== 'number') return null;
    if (typeof creator.enumeration_prefix !== 'string') return null;
    // Recipe mode.
    if (isPlainObject(creator.reusable_preprocessing)) return creator;
    // Fit mode: variables required, no reusable_preprocessing.
    if (Array.isArray(creator.variables) && creator.variables.length > 0) return creator;
    return null;
  });

  /** Emitted after a creator is applied, so the stage runs it and shows the cluster column. */
  readonly runRequested = output<void>();

  constructor() {
    // Steps stay mounted, so data model, datasets, filters or picks can change under a
    // finished report; drop it rather than offer centers fitted on other data.
    effect(() => {
      const key = this.runContextKey();
      if (this.reportContextKey !== null && key !== this.reportContextKey) {
        this.reportContextKey = null;
        this.report.set(null);
        this.reportReusable.set(null);
        this.runError.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.loadExperiments();
  }

  setSourceMode(mode: SourceMode): void {
    this.sourceMode.set(mode);
    this.error.set(null);
    this.runError.set(null);
    // Result vs fit must not share parameter drafts or variable opt-outs.
    this.parameterDraft.set({});
    this.runExcludedCodes.set(new Set());
  }

  /** A failed list read must not leave the picker looking empty by design. */
  private loadExperiments(): void {
    this.loading.set(true);
    this.dashboard.listKMeansExperiments().subscribe({
      next: (experiments) => {
        this.experiments.set(experiments);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load K-means experiments.');
        this.loading.set(false);
      },
    });
  }

  /** The applied column's name (exaflow `new_column_names[0]`), or empty when none. */
  appliedColumnName(): string {
    return String(this.applied()?.new_column_names[0] ?? '').trim();
  }

  /** Cluster count the applied column carries, or null when the record is malformed. */
  clusterCount(): number | null {
    const creator = this.applied();
    if (!creator) return null;
    const choices = creator.reusable_preprocessing?.cluster_choices;
    if (Array.isArray(choices) && choices.length) return choices.length;
    return typeof creator.k === 'number' ? creator.k : null;
  }

  /** The clustering variables of the applied column, for the summary line. */
  clusterVariables(): string[] {
    const creator = this.applied();
    if (!creator) return [];
    const fromRecipe = creator.reusable_preprocessing?.cluster_variables;
    if (Array.isArray(fromRecipe)) return fromRecipe;
    return Array.isArray(creator.variables) ? creator.variables.map(String) : [];
  }

  apply(): void {
    const code = this.code().trim();
    if (!this.selectedUuid() || !code) return;
    if (!COLUMN_CODE_PATTERN.test(code)) {
      this.error.set('Use letters, digits and underscores, starting with a letter or underscore.');
      return;
    }

    this.applying.set(true);
    this.dashboard.getExperimentResult(this.selectedUuid()!).subscribe({
      next: (response) => {
        const reusable = findReusablePreprocessing(response);
        this.applying.set(false);
        if (!reusable) {
          this.error.set('This K-means result cannot be reused. Re-run the K-means experiment and try again.');
          return;
        }
        this.store(code, reusable);
      },
      error: () => {
        this.applying.set(false);
        this.error.set('Could not load the K-means result.');
      },
    });
  }

  /** Direct fit: write variables + k without a reusable_preprocessing recipe. */
  applyFit(): void {
    const code = this.code().trim();
    const variables = this.fitSelectedCodes();
    const k = this.fitK();
    if (!code || !variables.length || !Number.isFinite(k) || k < 1) return;
    if (!COLUMN_CODE_PATTERN.test(code)) {
      this.error.set('Use letters, digits and underscores, starting with a letter or underscore.');
      return;
    }
    const nameError = this.nameProblem(code);
    if (nameError) {
      this.error.set(nameError);
      return;
    }

    this.error.set(null);
    this.runError.set(null);
    this.selectedUuid.set(null);
    this.studio.upsertTransformation({
      id: this.stepId(),
      name: KMEANS_CLUSTER_CREATOR,
      parameters: {
        new_column_names: [code],
        variables,
        k: Math.trunc(k),
        enumeration_prefix: 'cluster_',
        ...this.parameterOverrides(this.fitParameterFields),
      },
    });
    this.runRequested.emit();
  }

  remove(): void {
    if (!this.canRemove()) return;
    this.error.set(null);
    this.selectedUuid.set(null);
    this.studio.removeTransformation(this.stepId());
  }

  toggleRunVariable(code: string): void {
    this.runExcludedCodes.update((excluded) => {
      const next = new Set(excluded);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  /** Run the K-means report on the selected numerical variables. Unchanged
   *  parameters stay on the catalog default; Advanced sends only what changed. */
  runReport(): void {
    const codes = this.runSelectedCodes();
    if (!codes.length) return;
    const overrides = this.parameterOverrides(this.parameterFields());
    const request$ = this.studio.loadKMeansReport(codes, overrides);
    if (!request$) {
      this.runError.set('K-means is not available for this workspace.');
      return;
    }

    const requestKey = this.runContextKey();
    this.runLoading.set(true);
    this.runError.set(null);
    this.report.set(null);
    this.reportReusable.set(null);
    this.reportContextKey = null;
    request$.subscribe({
      next: (response) => {
        this.runLoading.set(false);
        if (this.runContextKey() !== requestKey) {
          this.runError.set('The selection changed while K-means was running. Run the report again.');
          this.cdr.markForCheck();
          return;
        }
        const status = (response as { status?: unknown } | null)?.status;
        if (status === 'error') {
          const payload = (response as { result?: any } | null)?.result ?? {};
          this.runError.set(
            String(payload?.data ?? payload?.message ?? 'The K-means report failed.'),
          );
          this.cdr.markForCheck();
          return;
        }

        const reusable = findReusablePreprocessing(response);
        this.report.set(findKMeansReport(response) as KMeansResult | null);
        this.reportReusable.set(reusable);
        this.reportContextKey = requestKey;
        if (!reusable) {
          this.runError.set('The K-means report did not include reusable cluster centers.');
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.runLoading.set(false);
        this.runError.set('Could not run the K-means report.');
        this.cdr.markForCheck();
      },
    });
  }

  useReport(): void {
    const reusable = this.reportReusable();
    const code = this.code().trim();
    if (!reusable || !code) return;
    if (!COLUMN_CODE_PATTERN.test(code)) {
      this.runError.set('Use letters, digits and underscores, starting with a letter or underscore.');
      return;
    }
    this.runError.set(null);
    this.store(code, reusable);
  }

  parameterValue(field: KMeansParameterField): string {
    const edited = this.parameterDraft()[field.key];
    if (edited !== undefined) return edited;
    return field.default === undefined || field.default === null ? '' : String(field.default);
  }

  setParameter(key: string, value: string | number | null): void {
    this.parameterDraft.update((current) => ({
      ...current,
      [key]: value === null || value === undefined ? '' : String(value),
    }));
  }

  setFitK(value: string | number | null): void {
    const numeric = Number(value);
    this.fitK.set(Number.isFinite(numeric) && numeric >= 1 ? Math.trunc(numeric) : 1);
  }

  protected readonly optionBindingValue = optionBindingValue;

  optionLabel(option: unknown): string {
    if (option && typeof option === 'object') {
      const record = option as Record<string, unknown>;
      return String(record['label'] ?? record['name'] ?? record['code'] ?? '');
    }
    return String(option);
  }

  /** Values the user changed. Unchanged fields stay on the catalog / creator default. */
  private parameterOverrides(fields: KMeansParameterField[]): Record<string, unknown> {
    const overrides: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = this.parameterValue(field).trim();
      const fallback = field.default === undefined || field.default === null ? '' : String(field.default);
      if (raw === fallback || (raw === '' && !field.required)) continue;
      if (field.type === 'number') {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) continue;
        overrides[field.key] = field.types?.includes('int') ? Math.trunc(numeric) : numeric;
        continue;
      }
      overrides[field.key] = raw;
    }
    return overrides;
  }

  /** Why `code` cannot be written: a name collision, or a later step still reads the old column. */
  private nameProblem(code: string): string | null {
    const inUse = this.studio.outputsInUse(this.stepId(), [code]);
    return this.columnNameError()?.(this.stepId(), code)
      ?? (inUse.length ? `Used by a later step: ${inUse.join(', ')}` : null);
  }

  private store(code: string, reusablePreprocessing: KMeansReusablePreprocessing): void {
    const nameError = this.nameProblem(code);
    if (nameError) {
      this.error.set(nameError);
      this.runError.set(nameError);
      return;
    }
    this.error.set(null);
    this.runError.set(null);
    this.selectedUuid.set(null);
    // Exaflow names the created column with `new_column_names`; `k` and `enumeration_prefix`
    // are derived from the replayable preprocessing, not re-entered here.
    this.studio.upsertTransformation({
      id: this.stepId(),
      name: KMEANS_CLUSTER_CREATOR,
      parameters: {
        new_column_names: [code],
        k: reusablePreprocessing.cluster_choices.length,
        enumeration_prefix: reusablePreprocessing.enumeration_prefix,
        reusable_preprocessing: reusablePreprocessing,
      },
    });
    this.runRequested.emit();
  }
}
