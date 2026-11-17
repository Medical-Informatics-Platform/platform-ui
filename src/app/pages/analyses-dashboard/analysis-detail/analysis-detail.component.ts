import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { input, computed, effect, signal } from '@angular/core';
import { AnalysesDashboardService } from '../../../services/analyses-dashboard.service';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { Analysis } from '../../../models/analyses-dashboard.model';
import { BackendAnalysisWithResult } from '../../../models/backend-analysis.model';
import { AlgorithmResultComponent } from '../../analysis-studio/algorithm-panel/algorithm-result/algorithm-result.component';
import { getOutputSchema, prettifyLabel } from '../../../core/algorithm-mappers';
import { enrichPcaResult, observationCount, pluralize, withLabels } from '../../../core/result-label.utils';
import { SpinnerComponent } from '../../shared/spinner/spinner.component';
import { AnalysisStatusComponent } from '../shared/analysis-status/analysis-status.component';
import { analysisTables, PdfExportService } from '../../../services/pdf-export.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { Router } from '@angular/router';
import { buildAnalysisShareUrl, copyShareUrl, isAnalysisOwner, SHARE_TOAST, shareToggleToast } from '../../../core/share.utils';
import { AnalysisLabelService } from '../../../services/analysis-label.service';
import { EnumMaps } from '../../../core/algorithm-result-enum-mapper';
import { parameterDefaultsFromSchema } from '../../../core/algorithm-parameter.utils';
import { formatFilterExpression } from '../../../core/filter-display.utils';
import { preprocessingStepsToRecord } from '../analyses-dashboard.mapper';

@Component({
  selector: 'app-analysis-details',
  templateUrl: './analysis-detail.component.html',
  styleUrl: './analysis-detail.component.css',
  imports: [CommonModule, AlgorithmResultComponent, SpinnerComponent, AnalysisStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisDetailsComponent {
  private dashboardService = inject(AnalysesDashboardService);
  private analysisStudioService = inject(AnalysisStudioService);
  private pdfExport = inject(PdfExportService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private labelService = inject(AnalysisLabelService);

  selectedAnalysis = input<Analysis | null>(null);

  readonly run = output<string>();
  readonly deleteAnalysis = output<void>();
  readonly nameUpdated = output<{
    id: string;
    name: string;
}>();

  @ViewChild('resultsCard') resultsCardRef?: ElementRef<HTMLElement>;

  private resultRequestId = 0;
  private resultSignal = signal<any | null>(null);
  private fullAnalysisSignal = signal<BackendAnalysisWithResult | null>(null);
  private loading = signal(false);
  private error = signal<string | null>(null);

  readonly analysisResult = this.resultSignal.asReadonly();
  readonly isLoading = this.loading.asReadonly();
  readonly loadError = this.error.asReadonly();

  // Use input instead of direct injection to keep it consistent with list component
  currentUserEmail = input<string | null>(null);

  isOwner = computed(() => isAnalysisOwner(this.currentUserEmail(), this.selectedAnalysis()?.authorEmail));

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
    const y = this.fullAnalysisSignal()?.analysisRequest?.algorithm?.y;
    if (Array.isArray(y)) return y[0] ?? null;
    return y ?? null;
  });
  readonly xVar = computed(() => {
    const x = this.fullAnalysisSignal()?.analysisRequest?.algorithm?.x;
    if (Array.isArray(x)) return x[0] ?? null;
    return x ?? null;
  });

  readonly analysisAlgorithmName = computed(
    () => this.selectedAnalysis()?.algorithmName ?? ''
  );

  readonly outputSchema = computed(
    () => getOutputSchema(this.analysisAlgorithmName()) ?? []
  );

  domainLabel = computed(() => {
    const domain = this.selectedAnalysis()?.domain;
    return domain ? this.labelMap()[domain] || domain : 'Not specified';
  });

  readonly datasetsWithLabels = computed(() =>
    withLabels(this.selectedAnalysis()?.datasets, this.codeToLabelSignal())
  );

  algorithmLabel = computed(() => {
    const algoCode = this.selectedAnalysis()?.algorithmName;
    if (!algoCode) return 'Unknown';
    const algoConfig = this.analysisStudioService.backendAlgorithms()[algoCode];
    return algoConfig?.label || algoCode;
  });

  constructor() {
    // sync isShared with selectedAnalysis
    effect(
      () => {
        const analysis = this.selectedAnalysis();
        this.isShared.set(!!analysis?.isShared);
      }
    );

    // Load results for selected analysis
    effect(
      () => {
        const analysis = this.selectedAnalysis();

        if (!analysis?.id) {
          this.resultSignal.set(null);
          this.loading.set(false);
          this.error.set(null);
          return;
        }

        this.fetchResult(analysis.id);
      }
    );

    // Load label map for domain (cached by service)
    effect(
      () => {
        const domain = this.selectedAnalysis()?.domain ?? null;
        this.loadLabels(domain);
        this.loadEnumMaps(domain);
      }
    );

    effect(
      () => {
        const analysis = this.selectedAnalysis();
        if (!this.isEditingName() && analysis?.name) {
          this.nameDraft.set(analysis.name);
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

  private showCopyToast(message: string) {
    this.copyToastMessage.set(message);
    this.copyToastVisible.set(true);

    setTimeout(() => {
      this.copyToastVisible.set(false);
    }, 2400);
  }

  private fetchResult(uuid: string) {
    this.loading.set(true);
    this.error.set(null);

    const requestId = ++this.resultRequestId;
    this.dashboardService.getAnalysisResult(uuid).subscribe({
      next: (res) => {
        if (requestId !== this.resultRequestId) return;
        this.fullAnalysisSignal.set(res ?? null);
        const normalized = res?.result ?? res;
        this.resultSignal.set(normalized);
        this.loading.set(false);
      },
      error: (err) => {
        if (requestId !== this.resultRequestId) return;
        console.error('Error loading analysis result', err);
        this.error.set('Failed to load results for this analysis.');
        this.loading.set(false);
      },
    });
  }


  readonly variablesWithLabels = computed(() =>
    withLabels(this.selectedAnalysis()?.variables, this.codeToLabelSignal())
  );

  readonly covariatesWithLabels = computed(() =>
    withLabels(this.selectedAnalysis()?.covariates, this.codeToLabelSignal())
  );

  readonly filtersWithLabels = computed(() =>
    withLabels(this.selectedAnalysis()?.filters, this.codeToLabelSignal())
  );

  readonly filterPreview = computed(() =>
    formatFilterExpression(
      this.fullAnalysisSignal()?.analysisRequest?.inputdata?.filters ?? this.selectedAnalysis()?.filterLogic,
      { labelMap: this.labelMap(), enumMaps: this.enumMaps() }
    )
  );
  readonly preprocessingPreview = computed(() => {
    const preprocessing =
      preprocessingStepsToRecord(this.fullAnalysisSignal()?.analysisRequest?.preprocessing) ??
      this.selectedAnalysis()?.preprocessing ??
      null;
    const summary = this.analysisStudioService.formatPreprocessingConfig(preprocessing, this.labelMap(), this.enumMaps());
    return summary === 'none' ? '' : summary;
  });

  readonly preprocessingEntries = computed(() => {
    const preprocessing =
      preprocessingStepsToRecord(this.fullAnalysisSignal()?.analysisRequest?.preprocessing) ??
      this.selectedAnalysis()?.preprocessing ??
      null;
    return this.analysisStudioService.formatPreprocessingEntries(preprocessing, this.labelMap(), this.enumMaps());
  });

  readonly authorLine = computed(() =>
    this.isOwner() ? 'by you' : `by ${this.selectedAnalysis()?.author || 'someone else'}`
  );

  readonly visibilityLine = computed(() => {
    if (!this.isOwner()) return 'Shared with you';
    return this.isShared() ? 'Shared' : 'Private';
  });

  readonly failedRun = computed(() => (this.selectedAnalysis()?.status || '').toLowerCase() === 'error');

  readonly failureMessage = computed(() =>
    this.loadError() || 'This run failed before it produced a result.'
  );

  readonly rowsUsed = computed(() => observationCount(this.analysisResult()));

  readonly pendingRun = computed(() => (this.selectedAnalysis()?.status || '').toLowerCase() === 'pending');

  readonly datasetCount = computed(() => pluralize(this.datasetsWithLabels().length, 'dataset'));

  readonly datasetCountLine = computed(() => `${this.domainLabel()} · ${this.datasetCount()}`);

  readonly datasetNames = computed(() =>
    this.datasetsWithLabels().map((dataset) => dataset.label).join(', ')
  );

  copyFailure(): void {
    const message = this.failureMessage();
    navigator.clipboard.writeText(message).then(
      () => this.showCopyToast('Error copied'),
      () => this.showCopyToast('Could not copy the error'),
    );
  }

  readonly runParameters = computed(() => this.fullAnalysisSignal()?.analysisRequest?.algorithm?.parameters ?? null);

  readonly hasStoredParameters = computed(() =>
    Object.values(this.fullAnalysisSignal()?.analysisRequest?.algorithm?.parameters ?? {})
      .some((value) => !this.isEmptyParameterValue(value))
  );

  /** Stored parameters, or the schema defaults when the run saved none. */
  readonly parameterEntries = computed(() => {
    const fullAnalysis = this.fullAnalysisSignal();
    const algoName = fullAnalysis?.analysisRequest?.algorithm?.name ?? this.analysisAlgorithmName();
    const schema = this.analysisStudioService.backendAlgorithms()[algoName]?.configSchema ?? [];
    const labelByKey = new Map(
      schema.map((field: any) => [String(field.key), String(field.label ?? field.key)])
    );
    const params = this.hasStoredParameters()
      ? fullAnalysis?.analysisRequest?.algorithm?.parameters ?? {}
      : parameterDefaultsFromSchema(schema);

    return Object.entries(params)
      .filter(([, value]) => !this.isEmptyParameterValue(value))
      .map(([key, value]) => ({
        key,
        label: labelByKey.get(key) ?? prettifyLabel(key),
        value: this.formatParameterValue(value, key),
      }));
  });

  /** Labels the variables of a PCA result so the heatmap and weights table do not show raw codes. */
  readonly enrichedResult = computed(() =>
    enrichPcaResult(
      this.analysisResult(),
      this.analysisAlgorithmName(),
      [...this.variablesWithLabels(), ...this.covariatesWithLabels()],
    )
  );

  onExportPdf(): void {
    const element = this.resultsCardRef?.nativeElement;
    const payload = this.resultExportPayload();
    if (!element || !payload) {
      console.warn('No result or element to export');
      return;
    }
    this.pdfExport.exportAnalysisPdf({ ...payload, chartContainer: element });
  }

  onExportZip(): void {
    const payload = this.resultExportPayload();
    if (!payload) {
      console.warn('No result to export');
      return;
    }
    this.csvExport.exportAnalysisZip({
      ...payload,
      tables: analysisTables(payload.algorithmKey, payload.result),
    }).catch((error) => console.error('Result ZIP export failed:', error));
  }

  /** The saved analysis's setup and result, shared by the PDF report and the ZIP export. */
  private resultExportPayload() {
    const result = this.analysisResult();
    if (!result) return null;
    const fullAnalysis = this.fullAnalysisSignal();

    const baseName = this.selectedAnalysis()?.name?.trim() || 'analysis results';
    const filename = baseName.replace(/\s+/g, '_');

    const algoCode = fullAnalysis?.analysisRequest?.algorithm?.name ?? this.analysisAlgorithmName();
    const algoConfig = this.analysisStudioService.backendAlgorithms()[algoCode];
    const algoLabel = algoConfig?.label || algoCode;

    return {
      filename,
      details: {
        analysisName: baseName,
        createdBy: this.selectedAnalysis()?.author ?? null,
        createdAt: this.selectedAnalysis()?.dateCreated ?? null,
        algorithm: algoLabel,
        params: fullAnalysis?.analysisRequest?.algorithm?.parameters ?? null,
        preprocessing: this.preprocessingPreview() || 'none',
        domain: this.domainLabel(),
        datasets: (this.selectedAnalysis()?.datasets ?? []).map(code => this.labelMap()[code] || code),
        variables: this.variablesWithLabels().map((v) => v.label),
        covariates: this.covariatesWithLabels().map((c) => c.label),
        filters: this.filterPreview() ? [this.filterPreview()] : this.filtersWithLabels().map((f) => f.label),
        transformations: null,
        mipVersion: this.selectedAnalysis()?.mipVersion ?? fullAnalysis?.mipVersion ?? null,
      },
      algorithmKey: algoCode,
      result,
    };
  }

  runAnalysis() {
    const id = this.selectedAnalysis()?.id;
    if (!id) return;
    this.run.emit(id);
  }

  startNameEdit() {
    const analysis = this.selectedAnalysis();
    this.nameDraft.set(analysis?.name ?? '');
    this.nameError.set(null);
    this.isEditingName.set(true);
  }

  cancelNameEdit() {
    const analysis = this.selectedAnalysis();
    this.nameDraft.set(analysis?.name ?? '');
    this.nameError.set(null);
    this.isEditingName.set(false);
  }

  saveNameEdit() {
    const analysis = this.selectedAnalysis();
    if (!analysis) return;

    const trimmed = this.nameDraft().trim();
    if (!trimmed) {
      this.nameError.set('Name cannot be empty.');
      return;
    }

    if (trimmed === analysis.name) {
      this.isEditingName.set(false);
      this.nameError.set(null);
      return;
    }

    this.nameSaving.set(true);
    this.nameError.set(null);

    this.dashboardService.updateAnalysisName(analysis.id, trimmed).subscribe({
      next: () => {
        this.nameSaving.set(false);
        this.isEditingName.set(false);
        this.nameUpdated.emit({ id: analysis.id, name: trimmed });
      },
      error: (err) => {
        console.error('Failed to update analysis name', err);
        this.nameSaving.set(false);
        this.nameError.set('Failed to update name.');
      },
    });
  }

  onCopyLink(): void {
    const analysis = this.selectedAnalysis();
    if (!analysis) return;

    copyShareUrl(buildAnalysisShareUrl(this.router, analysis.id)).then((message) => this.showCopyToast(message));
  }

  onToggleShare(): void {
    const analysis = this.selectedAnalysis();
    if (!analysis) return;

    // Safety check
    if (!this.isOwner()) {
      console.warn('Cannot share/unshare analysis owned by someone else.');
      return;
    }

    const newShared = !this.isShared();

    this.dashboardService.toggleAnalysisShare(analysis.id, newShared).subscribe({
      next: () => {
        this.isShared.set(newShared);
        this.showCopyToast(shareToggleToast(newShared));
      },
      error: (err) => {
        console.error('Failed to toggle share:', err);
        this.showCopyToast(SHARE_TOAST.toggleFailed);
      },
    });
  }


  onDelete() {
    this.deleteAnalysis.emit();
  }

  private isEmptyParameterValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
    return false;
  }

  private formatParameterValue(value: unknown, parameterKey?: string): string {
    if (Array.isArray(value)) {
      return value.map((item) => this.formatParameterValue(item, parameterKey)).join(', ');
    }

    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => !this.isEmptyParameterValue(nestedValue))
        .map(([key, nestedValue]) => `${prettifyLabel(key)}: ${this.formatParameterValue(nestedValue, key)}`)
        .join('; ');
    }

    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return this.formatParameterScalarValue(value, parameterKey);
  }

  private formatParameterScalarValue(value: unknown, parameterKey?: string): string {
    const raw = String(value);
    const label = this.resolveParameterEnumLabel(raw, parameterKey);
    return label || raw;
  }

  private resolveParameterEnumLabel(value: string, parameterKey?: string): string | null {
    const enumMaps = this.enumMaps();
    const schemaField = this.parameterSchemaField(parameterKey);
    const enumSource = Array.isArray(schemaField?.enumSource) ? schemaField.enumSource : [];

    if (enumSource.includes('x') || parameterKey === 'groupA' || parameterKey === 'groupB') {
      const targetMap = enumMaps[this.xVar() ?? ''];
      if (targetMap?.[value]) return targetMap[value];
    }

    if (parameterKey === 'positive_class') {
      const eventVar = this.fullAnalysisSignal()?.analysisRequest?.algorithm?.parameters?.['event_var'];
      if (typeof eventVar === 'string' && enumMaps[eventVar]?.[value]) {
        return enumMaps[eventVar][value];
      }
    }

    if (enumSource.includes('y') || parameterKey === 'positive_class' || parameterKey === 'category_order') {
      const targetMap = enumMaps[this.yVar() ?? ''];
      if (targetMap?.[value]) return targetMap[value];
    }

    const matches = Object.values(enumMaps)
      .map((map) => map[value])
      .filter((label): label is string => !!label);

    const unique = Array.from(new Set(matches));
    return unique.length === 1 ? unique[0] : null;
  }

  private parameterSchemaField(parameterKey?: string): any | null {
    if (!parameterKey) return null;
    const fullAnalysis = this.fullAnalysisSignal();
    const algoName = fullAnalysis?.analysisRequest?.algorithm?.name ?? this.analysisAlgorithmName();
    const schema = this.analysisStudioService.backendAlgorithms()[algoName]?.configSchema ?? [];
    return schema.find((field: any) => String(field.key) === parameterKey) ?? null;
  }

}
