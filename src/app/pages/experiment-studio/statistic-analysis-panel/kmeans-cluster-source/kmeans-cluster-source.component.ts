import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../../services/experiments-dashboard.service';
import { BackendExperiment } from '../../../../models/backend-experiment.model';
import {
  KMeansReusablePreprocessing,
  KMeansSourceContext,
  extractReusablePreprocessing,
  kmeansSourceIsReusable,
} from '../../../../core/kmeans-cluster-source.utils';

/** Exaflow column codes: an identifier, not free text. */
const CODE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
  private readonly dashboard = inject(ExperimentsDashboardService);

  readonly experiments = signal<BackendExperiment[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedUuid = signal<string | null>(null);
  readonly code = signal('kmeans_cluster');
  readonly applying = signal(false);

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
        const reusable = extractReusablePreprocessing(response?.result ?? response);
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

  private store(code: string, reusablePreprocessing: KMeansReusablePreprocessing): void {
    this.error.set(null);
    this.selectedUuid.set(null);
    this.studio.setKMeansClusterPreprocessing({ code, reusable_preprocessing: reusablePreprocessing });
  }
}
