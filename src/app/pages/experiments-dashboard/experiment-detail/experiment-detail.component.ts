import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, output, inject } from '@angular/core';
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
import { preprocessingStepsToRecord } from '../experiments-dashboard.mapper';

@Component({
  selector: 'app-experiment-details',
  templateUrl: './experiment-detail.component.html',
  styleUrl: './experiment-detail.component.css',
  imports: [CommonModule, AlgorithmResultComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentDetailsComponent {
  private dashboardService = inject(ExperimentsDashboardService);
  private expStudioService = inject(ExperimentStudioService);
  private pdfExport = inject(ResultsPdfExportService);
  private router = inject(Router);
  private labelService = inject(ExperimentLabelService);

  selectedExperiment = input<Experiment | null>(null);

  readonly run = output<string>();
  readonly deleteExperiment = output<void>();
  readonly nameUpdated = output<{
    id: string;
    name: string;
}>();

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
    const y = this.fullExperimentSignal()?.analysis?.algorithm?.y;
    if (Array.isArray(y)) return y[0] ?? null;
    return y ?? null;
  });
  readonly xVar = computed(() => {
    const x = this.fullExperimentSignal()?.analysis?.algorithm?.x;
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

  constructor() {
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

  readonly filterPreview = computed(() => {
    const logic =
      this.fullExperimentSignal()?.analysis?.inputdata?.filters ??
      this.selectedExperiment()?.filterLogic;
    if (!logic || !Array.isArray((logic as any).rules) || !(logic as any).rules.length) return '';
    return this.formatFilterNode(logic);
  });
  readonly preprocessingPreview = computed(() => {
    const preprocessing =
      preprocessingStepsToRecord(this.fullExperimentSignal()?.analysis?.preprocessing) ??
      this.selectedExperiment()?.preprocessing ??
      null;
    const summary = this.expStudioService.formatPreprocessingConfig(preprocessing, this.labelMap());
    return summary === 'none' ? '' : summary;
  });

  readonly preprocessingEntries = computed(() => {
    const preprocessing =
      preprocessingStepsToRecord(this.fullExperimentSignal()?.analysis?.preprocessing) ??
      this.selectedExperiment()?.preprocessing ??
      null;
    return this.expStudioService.formatPreprocessingEntries(preprocessing, this.labelMap());
  });

  readonly parameterEntries = computed(() => {
    const fullExperiment = this.fullExperimentSignal();
    const params = fullExperiment?.analysis?.algorithm?.parameters ?? {};
    const algoName = fullExperiment?.analysis?.algorithm?.name ?? this.experimentalAlgorithmName();
    const schema = this.expStudioService.backendAlgorithms()[algoName]?.configSchema ?? [];
    const labelByKey = new Map(
      schema.map((field: any) => [String(field.key), String(field.label ?? field.key)])
    );

    return Object.entries(params)
      .filter(([, value]) => !this.isEmptyParameterValue(value))
      .map(([key, value]) => ({
        key,
        label: labelByKey.get(key) ?? this.humanizeParameterKey(key),
        value: this.formatParameterValue(value, key),
      }));
  });

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

    const paramData = fullExperiment?.analysis?.algorithm?.parameters || {};
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

    const algoCode = fullExperiment?.analysis?.algorithm?.name ?? this.experimentalAlgorithmName();
    const algoConfig = this.expStudioService.backendAlgorithms()[algoCode];
    const algoLabel = algoConfig?.label || algoCode;

    this.pdfExport.exportExperimentPdf({
      filename,
      details: {
        experimentName: baseName,
        createdBy: this.selectedExperiment()?.author ?? null,
        createdAt: this.selectedExperiment()?.dateCreated ?? null,
        algorithm: algoLabel,
        params: fullExperiment?.analysis?.algorithm?.parameters ?? null,
        preprocessing: this.preprocessingPreview() || 'none',
        domain: this.domainLabel(),
        datasets: (this.selectedExperiment()?.datasets ?? []).map(code => this.labelMap()[code] || code),
        variables: this.variablesWithLabels().map((v) => v.label),
        covariates: this.covariatesWithLabels().map((c) => c.label),
        filters: this.filterPreview() ? [this.filterPreview()] : this.filtersWithLabels().map((f) => f.label),
        transformations,
        mipVersion: this.selectedExperiment()?.mipVersion ?? fullExperiment?.mipVersion ?? null,
      },
      algorithmKey: fullExperiment?.analysis?.algorithm?.name ?? this.experimentalAlgorithmName(),
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
    // TODO: The 'emit' function requires a mandatory void argument
    this.deleteExperiment.emit();
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
        .map(([key, nestedValue]) => `${this.humanizeParameterKey(key)}: ${this.formatParameterValue(nestedValue, key)}`)
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
      const eventVar = this.fullExperimentSignal()?.analysis?.algorithm?.parameters?.['event_var'];
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
    const fullExperiment = this.fullExperimentSignal();
    const algoName = fullExperiment?.analysis?.algorithm?.name ?? this.experimentalAlgorithmName();
    const schema = this.expStudioService.backendAlgorithms()[algoName]?.configSchema ?? [];
    return schema.find((field: any) => String(field.key) === parameterKey) ?? null;
  }

  private humanizeParameterKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private formatFilterNode(node: any): string {
    if (!node) return '';

    if (Array.isArray(node.rules)) {
      const parts = node.rules
        .map((rule: any) => this.formatFilterNode(rule))
        .filter(Boolean);
      if (!parts.length) return '';

      const condition = String(node.condition || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
      const expression = parts.join(` ${condition} `);
      return parts.length > 1 ? `(${expression})` : expression;
    }

    const field = String(node.field ?? node.id ?? '');
    const label = this.labelMap()[field] ?? (field || 'Variable');
    const operator = this.filterOperatorLabel(String(node.operator ?? 'equal'));

    if (node.operator === 'is_null' || node.operator === 'is_not_null') {
      return `${label} ${operator}`;
    }

    return `${label} ${operator} ${this.formatFilterValue(field, node.value)}`;
  }

  private filterOperatorLabel(operator: string): string {
    switch (operator) {
      case 'equal':
      case '=':
        return '=';
      case 'not_equal':
      case '!=':
        return '!=';
      case 'greater':
      case '>':
        return '>';
      case 'greater_or_equal':
      case '>=':
        return '>=';
      case 'less':
      case '<':
        return '<';
      case 'less_or_equal':
      case '<=':
        return '<=';
      case 'is_null':
        return 'IS NULL';
      case 'is_not_null':
        return 'IS NOT NULL';
      default:
        return operator;
    }
  }

  private formatFilterValue(field: string, value: any): string {
    if (value === null || value === undefined || value === '') return 'value';
    const valueKey = String(value);
    return this.enumMaps()[field]?.[valueKey] ?? valueKey;
  }
}
