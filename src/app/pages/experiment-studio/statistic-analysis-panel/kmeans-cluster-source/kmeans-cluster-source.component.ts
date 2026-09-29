import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../../services/experiments-dashboard.service';
import { BackendExperiment } from '../../../../models/backend-experiment.model';
import { KMeansResult } from '../../../../models/algorithm-results.model';
import { isOutlierEligibleVariable } from '../../../../core/outlier-rules';
import {
  KMeansReusablePreprocessing,
  KMeansSourceContext,
  canonicalFilterKey,
  findKMeansReport,
  findReusablePreprocessing,
  kmeansSourceIsReusable,
} from '../../../../core/kmeans-cluster-source.utils';

/** Exaflow column codes: an identifier, not free text. */
const CODE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface KMeansParameterField {
  key: string;
  label?: string;
  type?: string;
  types?: string[];
  required?: boolean;
  default?: unknown;
  options?: unknown[];
}

/**
 * Reuses a finished K-means run as a categorical cluster column: the picker lists the
 * experiments whose source context (data model, datasets, filters) still matches the
 * draft, and applying one stores its replayable preprocessing on the studio.
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

  readonly numericVariables = computed(() =>
    (this.studio.selectedVariables() as any[]).filter((variable) => isOutlierEligibleVariable(variable))
  );

  readonly runSelectedCodes = computed(() => {
    const excluded = this.runExcludedCodes();
    return this.numericVariables()
      .map((variable) => String(variable.code))
      .filter((code) => !excluded.has(code));
  });

  /** K-means parameters from the algorithm catalog. Closed until Parameters is opened. */
  readonly parameterFields = computed((): KMeansParameterField[] => {
    const schema = this.studio.backendAlgorithms()?.['kmeans']?.configSchema ?? [];
    return schema.filter((field): field is KMeansParameterField =>
      !!field?.key && ['number', 'select', 'text'].includes(field.type)
    );
  });

  /** Closed Parameters row. Same values `parameterOverrides()` will send, so a trimmed or invalid draft is not listed. */
  readonly parameterSummary = computed(() => {
    const overrides = this.parameterOverrides();
    const changed = this.parameterFields()
      .filter((field) => field.key in overrides)
      .map((field) => {
        const value = String(overrides[field.key]);
        const option = (field.options ?? []).find((opt) => this.optionValue(opt) === value);
        return `${field.label || field.key} ${option === undefined ? value || '—' : this.optionLabel(option)}`;
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
      parameters: this.parameterOverrides(),
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
    return this.experiments().filter((experiment) => kmeansSourceIsReusable(experiment, context));
  });

  readonly hiddenCount = computed(() => this.experiments().length - this.compatible().length);

  readonly applied = computed(() => this.studio.appliedKMeansClusterCreator());

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

  /** Cluster count the applied column carries, or null when the record is malformed. */
  clusterCount(): number | null {
    return this.applied()?.reusable_preprocessing.cluster_choices?.length || null;
  }

  /** The clustering variables of the applied column, for the summary line. */
  clusterVariables(): string[] {
    const variables = this.applied()?.reusable_preprocessing?.cluster_variables;
    return Array.isArray(variables) ? variables : [];
  }

  apply(): void {
    const code = this.code().trim();
    if (!this.selectedUuid() || !code) return;
    if (!CODE_PATTERN.test(code)) {
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

  remove(): void {
    this.error.set(null);
    this.selectedUuid.set(null);
    this.studio.setKMeansClusterPreprocessing(null);
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
    const overrides = this.parameterOverrides();
    const request$ = Object.keys(overrides).length
      ? this.studio.loadKMeansReport(codes, overrides)
      : this.studio.loadKMeansReport(codes);
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
          // Keys only, never values: enough to see which envelope the backend used.
          console.warn('[KMeans] report has no reusable_preprocessing; response keys:',
            Object.keys((response as Record<string, unknown>) ?? {}));
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
    if (!CODE_PATTERN.test(code)) {
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

  optionValue(option: unknown): string {
    if (option && typeof option === 'object') {
      const record = option as Record<string, unknown>;
      return String(record['code'] ?? record['value'] ?? record['label'] ?? '');
    }
    return String(option);
  }

  optionLabel(option: unknown): string {
    if (option && typeof option === 'object') {
      const record = option as Record<string, unknown>;
      return String(record['label'] ?? record['name'] ?? record['code'] ?? '');
    }
    return String(option);
  }

  /** Values the user changed. Unchanged fields stay on the catalog default. */
  private parameterOverrides(): Record<string, unknown> {
    const overrides: Record<string, unknown> = {};
    for (const field of this.parameterFields()) {
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

  private store(code: string, reusablePreprocessing: KMeansReusablePreprocessing): void {
    this.error.set(null);
    this.selectedUuid.set(null);
    this.studio.setKMeansClusterPreprocessing({ code, reusable_preprocessing: reusablePreprocessing });
    this.runRequested.emit();
  }
}
