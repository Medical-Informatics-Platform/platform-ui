import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { input, computed, effect, signal } from '@angular/core';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { Experiment } from '../../../models/experiments-dashboard.model';
import { BackendExperimentWithResult } from '../../../models/backend-experiment.model';
import { AlgorithmResultComponent } from '../../experiment-studio/algorithm-panel/algorithm-result/algorithm-result.component';
import { getOutputSchema } from '../../../core/algorithm-mappers';
import { SpinnerComponent } from '../../shared/spinner/spinner.component';
import { ResultsPdfExportService } from '../../../services/export-results-pdf.service';
import { Router } from '@angular/router';
import { ExperimentLabelService } from '../../../services/experiment-label.service';
import { EnumMaps } from '../../../core/algorithm-result-enum-mapper';

@Component({
  selector: 'app-experiment-details',
  templateUrl: './experiment-detail.component.html',
  styleUrls: ['./experiment-detail.component.css'],
  imports: [CommonModule, AlgorithmResultComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentDetailsComponent {
  selectedExperiment = input<Experiment | null>(null);

  @Output() run = new EventEmitter<string>();
  @Output() deleteExperiment = new EventEmitter<void>();
  @Output() nameUpdated = new EventEmitter<{ id: string; name: string }>();

  @ViewChild('resultsCard') resultsCardRef?: ElementRef<HTMLElement>;

  private resultSignal = signal<any | null>(null);
  private fullExperimentSignal = signal<BackendExperimentWithResult | null>(null);
  private loading = signal(false);
  private error = signal<string | null>(null);

  readonly experimentResult = this.resultSignal.asReadonly();
  readonly isLoading = this.loading.asReadonly();
  readonly loadError = this.error.asReadonly();

  // Use input instead of direct injection to keep it consistent with list component
  currentUserEmail = input<string | null>(null);

  isOwner = computed(() => {
    const exp = this.selectedExperiment();
    const email = this.currentUserEmail();
    if (!exp?.authorEmail || !email) return false;
    return exp.authorEmail === email;
  });

  readonly isShared = signal<boolean>(false);

  readonly copyToastVisible = signal<boolean>(false);
  readonly copyToastMessage = signal<string>('Link copied to clipboard');
  readonly isEditingName = signal<boolean>(false);
  readonly nameDraft = signal<string>('');
  readonly nameSaving = signal<boolean>(false);
  readonly nameError = signal<string | null>(null);

  private codeToLabelSignal = signal<Record<string, string>>({});
  private enumMapsSignal = signal<EnumMaps>({});
  readonly enumMaps = this.enumMapsSignal.asReadonly();
  readonly labelMap = this.codeToLabelSignal.asReadonly();
  readonly yVar = computed(() => {
    const algo = this.fullExperimentSignal()?.algorithm;
    const y = (algo as any)?.inputdata?.y;
    if (Array.isArray(y)) return y[0] ?? null;
    return y ?? null;
  });
  readonly xVar = computed(() => {
    const algo = this.fullExperimentSignal()?.algorithm;
    const x = (algo as any)?.inputdata?.x;
    if (Array.isArray(x)) return x[0] ?? null;
    return x ?? null;
  });

  readonly experimentalAlgorithmName = computed(
    () => this.selectedExperiment()?.algorithmName ?? ''
  );

  readonly outputSchema = computed(
    () => getOutputSchema(this.experimentalAlgorithmName()) ?? []
  );

  domainLabel = computed(() => {
    const domain = this.selectedExperiment()?.domain;
    return domain ? this.labelMap()[domain] || domain : 'Not specified';
  });

  readonly datasetsWithLabels = computed(() =>
    this.withLabels(this.selectedExperiment()?.datasets)
  );

  algorithmLabel = computed(() => {
    const algoCode = this.selectedExperiment()?.algorithmName;
    if (!algoCode) return 'Unknown';
    const algoConfig = this.expStudioService.backendAlgorithms()[algoCode];
    return algoConfig?.label || algoCode;
  });

  constructor(
    private dashboardService: ExperimentsDashboardService,
    private expStudioService: ExperimentStudioService,
    private pdfExport: ResultsPdfExportService,
    private router: Router,
    private labelService: ExperimentLabelService
  ) {
    // sync isShared with selectedExperiment
    effect(
      () => {
        const exp = this.selectedExperiment();
        this.isShared.set(!!exp?.isShared);
      }
    );

    // Load results for selected experiment
    effect(
      () => {
        const exp = this.selectedExperiment();

        if (!exp?.id) {
          this.resultSignal.set(null);
          this.loading.set(false);
          this.error.set(null);
          return;
        }

        this.fetchResult(exp.id);
      }
    );

    // Load label map for domain (cached by service)
    effect(
      () => {
        const domain = this.selectedExperiment()?.domain ?? null;
        this.loadLabels(domain);
        this.loadEnumMaps(domain);
      }
    );

    effect(
      () => {
        const exp = this.selectedExperiment();
        if (!this.isEditingName() && exp?.name) {
          this.nameDraft.set(exp.name);
        }
      }
    );
  }

  private loadedDomain = signal<string | null>(null);
  private loadedEnumDomain = signal<string | null>(null);

  private async loadLabels(domain: string | null) {
    if (!domain) {
      this.codeToLabelSignal.set({});
      this.loadedDomain.set(null);
      return;
    }

    if (this.loadedDomain() === domain && Object.keys(this.codeToLabelSignal()).length > 0) return;

    const map = await this.labelService.getLabelMap(domain);
    this.codeToLabelSignal.set(map);
    this.loadedDomain.set(domain);
  }

  private async loadEnumMaps(domain: string | null) {
    if (!domain) {
      this.enumMapsSignal.set({});
      this.loadedEnumDomain.set(null);
      return;
    }

    if (this.loadedEnumDomain() === domain && Object.keys(this.enumMapsSignal()).length > 0) return;

    const maps = await this.labelService.getEnumMaps(domain);
    this.enumMapsSignal.set(maps);
    this.loadedEnumDomain.set(domain);
  }

  private showCopyToast(message = 'Link copied to clipboard') {
    this.copyToastMessage.set(message);
    this.copyToastVisible.set(true);

    setTimeout(() => {
      this.copyToastVisible.set(false);
    }, 2400);
  }

  private fetchResult(uuid: string) {
    this.loading.set(true);
    this.error.set(null);

    this.dashboardService.getExperimentResult(uuid).subscribe({
      next: (res) => {
        this.fullExperimentSignal.set(res ?? null);
        const normalized = res?.result ?? res;
        this.resultSignal.set(normalized);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading experiment result', err);
        this.error.set('Failed to load results for this experiment.');
        this.loading.set(false);
      },
    });
  }

  private withLabels(codes: string[] | undefined | null) {
    const map = this.codeToLabelSignal();
    return (codes ?? []).map((code) => ({ code, label: map[code] ?? code }));
  }

  readonly variablesWithLabels = computed(() =>
    this.withLabels(this.selectedExperiment()?.variables)
  );

  readonly covariatesWithLabels = computed(() =>
    this.withLabels(this.selectedExperiment()?.covariates)
  );

  readonly filtersWithLabels = computed(() =>
    this.withLabels(this.selectedExperiment()?.filters)
  );

  /** Enriches PCA results with actual variable labels so the heatmap doesn't fall back to Var1/Var2. */
  readonly enrichedResult = computed(() => {
    const result = this.experimentResult();
    if (!result) return result;

    const algo = this.experimentalAlgorithmName();
    if (algo !== 'pca' && algo !== 'pca_with_transformation') return result;

    const allNames = [
      ...this.variablesWithLabels(),
      ...this.covariatesWithLabels(),
    ].map(v => v.label);

    if (allNames.length > 0) return { ...result, variable_names: allNames };
    return result;
  });

  onExportPdf(): void {
    const element = this.resultsCardRef?.nativeElement;
    const result = this.experimentResult();
    const fullExperiment = this.fullExperimentSignal();

    if (!element || !result) {
      console.warn('No result or element to export');
      return;
    }

    const baseName = this.selectedExperiment()?.name?.trim() || 'experiment results';
    const filename = baseName.replace(/\s+/g, '_');

    const paramData = fullExperiment?.algorithm?.parameters || {};
    const transObj = (paramData as any)?.data_transformation || {};
    const transLines: string[] = [];
    const transTypes = ['standardize', 'center', 'exp'];

    transTypes.forEach(type => {
      const vars = transObj[type];
      if (Array.isArray(vars) && vars.length > 0) {
        vars.forEach(v => {
          const label = this.labelMap()[v] || v;
          transLines.push(`${label}: ${type}`);
        });
      }
    });
    const transformations = transLines.length > 0 ? transLines : null;

    const algoCode = fullExperiment?.algorithm?.name ?? this.experimentalAlgorithmName();
    const algoConfig = this.expStudioService.backendAlgorithms()[algoCode];
    const algoLabel = algoConfig?.label || algoCode;

    this.pdfExport.exportExperimentPdf({
      filename,
      details: {
        experimentName: baseName,
        createdBy: this.selectedExperiment()?.author ?? null,
        createdAt: this.selectedExperiment()?.dateCreated ?? null,
        algorithm: algoLabel,
        params: fullExperiment?.algorithm?.parameters ?? null,
        preprocessing: 'none',
        domain: this.domainLabel(),
        datasets: (this.selectedExperiment()?.datasets ?? []).map(code => this.labelMap()[code] || code),
        variables: this.variablesWithLabels().map((v) => v.label),
        covariates: this.covariatesWithLabels().map((c) => c.label),
        filters: this.filtersWithLabels().map((f) => f.label),
        transformations,
        mipVersion: this.selectedExperiment()?.mipVersion ?? fullExperiment?.mipVersion ?? null,
      },
      algorithmKey: fullExperiment?.algorithm?.name ?? this.experimentalAlgorithmName(),
      result,
      chartContainer: element,
    });
  }

  runExperiment() {
    const id = this.selectedExperiment()?.id;
    if (!id) return;
    this.run.emit(id);
  }

  startNameEdit() {
    const exp = this.selectedExperiment();
    this.nameDraft.set(exp?.name ?? '');
    this.nameError.set(null);
    this.isEditingName.set(true);
  }

  cancelNameEdit() {
    const exp = this.selectedExperiment();
    this.nameDraft.set(exp?.name ?? '');
    this.nameError.set(null);
    this.isEditingName.set(false);
  }

  saveNameEdit() {
    const exp = this.selectedExperiment();
    if (!exp) return;

    const trimmed = this.nameDraft().trim();
    if (!trimmed) {
      this.nameError.set('Name cannot be empty.');
      return;
    }

    if (trimmed === exp.name) {
      this.isEditingName.set(false);
      this.nameError.set(null);
      return;
    }

    this.nameSaving.set(true);
    this.nameError.set(null);

    this.dashboardService.updateExperimentName(exp.id, trimmed).subscribe({
      next: () => {
        this.nameSaving.set(false);
        this.isEditingName.set(false);
        this.nameUpdated.emit({ id: exp.id, name: trimmed });
      },
      error: (err) => {
        console.error('Failed to update experiment name', err);
        this.nameSaving.set(false);
        this.nameError.set('Failed to update name.');
      },
    });
  }

  onCopyLink(): void {
    const exp = this.selectedExperiment();
    if (!exp) return;

    const url = this.buildShareUrl(exp.id);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.showCopyToast('Link copied to clipboard'),
        (err) => {
          console.warn('Failed to copy share URL:', err);
          this.showCopyToast('Could not copy link — check console.');
        }
      );
    } else {
      console.warn('Clipboard API not available, share URL:', url);
      this.showCopyToast('Clipboard not available — check console log.');
    }
  }

  onToggleShare(): void {
    const exp = this.selectedExperiment();
    if (!exp) return;

    // Safety check
    if (!this.isOwner()) {
      console.warn('Cannot share/unshare experiment owned by someone else.');
      return;
    }

    const newShared = !this.isShared();

    this.dashboardService.toggleExperimentShare(exp.id, newShared).subscribe({
      next: () => {
        this.isShared.set(newShared);
        // Toast message update
        const msg = newShared ? 'Experiment is now shared' : 'Experiment is no longer shared';
        this.showCopyToast(msg);
      },
      error: (err) => {
        console.error('Failed to toggle share:', err);
        this.showCopyToast('Failed to update share state');
      },
    });
  }

  private buildShareUrl(expId: string): string {
    const tree = this.router.createUrlTree(['/experiments-dashboard'], {
      queryParams: { experiment: expId },
    });

    const relative = this.router.serializeUrl(tree);
    const origin = window.location.origin;
    return origin + relative;
  }

  onDelete() {
    this.deleteExperiment.emit();
  }
}
