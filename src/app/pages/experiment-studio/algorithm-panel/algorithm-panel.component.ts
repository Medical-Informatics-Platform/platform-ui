import { SessionStorageService } from './../../../services/session-storage.service';
import { Component, inject, signal, computed, effect, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { buildFormControl } from '../../shared/utils/form-control.factory';
import { AlgorithmResultComponent } from './algorithm-result/algorithm-result.component';
import { getOutputSchema } from '../../../core/algorithm-mappers';
import { EchartsxModule } from 'echarts-for-angular';
import { AlgorithmConfig } from '../../../models/algorithm-definition.model';
import { ResultsPdfExportService } from '../../../services/export-results-pdf.service';
import { ErrorService } from '../../../services/error.service';
import { AuthService } from '../../../services/auth.service';
import { SpinnerComponent } from '../../shared/spinner/spinner.component';


@Component({
  selector: 'app-algorithm-panel',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AlgorithmResultComponent,
    EchartsxModule,
    SpinnerComponent
  ],
  templateUrl: './algorithm-panel.component.html',
  styleUrls: ['./algorithm-panel.component.css']
})

export class AlgorithmPanelComponent {
  pdfExport = inject(ResultsPdfExportService);
  private errorService = inject(ErrorService);
  private authService = inject(AuthService);
  Object = Object;
  experimentStudioService = inject(ExperimentStudioService);
  sessionStorage = inject(SessionStorageService);
  formBuilder = inject(FormBuilder);
  result = signal<any | null>(null);
  lastUsedAlgorithm = '';
  errorMsg = signal<string | null>(null);
  readonly isRunning = this.experimentStudioService.isRunning;

  lastExperimentUUID = this.experimentStudioService.currentExperimentUUID;
  saveAsMode = signal(false);
  saveAsName = signal('');
  loadingText = signal('Processing experiment...');
  showSuccessNotification = signal(false);
  mipVersion = (window as any).__env?.MIP_VERSION || '9.0.0';

  readonly selectedAlgorithm = this.experimentStudioService.selectedAlgorithm;
  readonly enumMaps = computed(() => this.experimentStudioService.getCategoricalEnumMaps());
  readonly yVar = computed(() => this.experimentStudioService.selectedVariables()[0]?.code ?? null);
  readonly xVar = computed(() => this.experimentStudioService.selectedCovariates()[0]?.code ?? null);
  readonly crossValidationEnabled = signal(false);
  private readonly crossValidationSelections: Record<string, boolean> = {};
  readonly transformationEnabled = signal(false);
  private readonly transformationSelectionsByAlgorithm: Record<string, Record<string, string>> = {};
  readonly isCrossValidationOnly = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return false;
    return this.experimentStudioService.isCrossValidationOnly(algorithm.name);
  });
  readonly canToggleTransformation = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return false;
    const baseName = this.experimentStudioService.getTransformationBase(algorithm.name) ?? algorithm.name;
    return !!this.experimentStudioService.getTransformationVariant(baseName);
  });
  readonly transformationTypes = ['standardize', 'center', 'exp'] as const;
  transformationAssignments: Record<string, string> = {};
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
  readonly labelMap = computed(() => {
    const map: Record<string, string> = {};
    const items = [
      ...this.experimentStudioService.selectedVariables(),
      ...this.experimentStudioService.selectedCovariates(),
      ...this.experimentStudioService.selectedFilters(),
    ];
    items.forEach((item) => {
      if (item?.code && item?.label) {
        map[item.code] = item.label;
      }
    });
    return map;
  });
  readonly resultAlgorithmLabel = computed(() => {
    const algoKey =
      this.experimentStudioService.lastUsedAlgorithm() ||
      this.selectedAlgorithm()?.name ||
      '';

    if (!algoKey) return 'Algorithm';

    const algoConfig = this.experimentStudioService.backendAlgorithms()[algoKey];
    return algoConfig?.label || this.prettifyLabel(algoKey);
  });
  readonly resultDisplayTitle = computed(() => {
    const explicitTitle = this.result()?.title;
    if (typeof explicitTitle === 'string' && explicitTitle.trim()) {
      return explicitTitle.trim();
    }
    return `Result ${this.resultAlgorithmLabel()}`;
  });

  readonly lastUsedSchema = signal<any[]>([]);
  readonly availableAlgorithmCategories = computed(() => {
    const grouped = this.experimentStudioService.availableGroupedAlgorithms();
    return Object.entries(grouped).map(([name, algorithms]) => ({ name, algorithms }));
  });

  // UI toggle: show only enabled algorithms
  readonly showOnlyActive = signal(false);
  readonly hasAnyVisibleAlgorithms = computed(() => {
    return this.filteredAlgorithmCategories().some(c => c.algorithms?.length > 0);
  });

  prettifyLabel(label: string): string {
    if (!label) return '';
    return label
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  prettyFieldLabel(field: any): string {
    let base = field.label ?? field.key;
    if ((field.key === 'groupA' || field.key === 'groupB')) {
      const x = this.experimentStudioService.selectedCovariates();
      if (x.length === 1) {
        const cov = x[0];
        const covName = cov?.label || cov?.name || cov?.code;
        if (covName) base = `${base} (${covName})`;
      }
    }
    return base;
  }

  // sensible defaults
  private readonly uiDefaults: Record<string, any> = {
    alpha: 0.05,
    alt_hypothesis: 'two-sided',
    mu: 0.0,
    n_splits: 5,
    k: 4,
    tol: 0.01,
    sstype: 2,
    conf_level: 0.95,
    iterations: 1000,
  };

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
    }, { allowSignalWrites: true });

    effect(() => {
      const algorithm = this.selectedAlgorithm();
      const variables = this.experimentStudioService.selectedVariables();
      if (!algorithm) {
        this.transformationEnabled.set(false);
        this.transformationAssignments = {};
        return;
      }

      const baseName =
        this.experimentStudioService.getTransformationBase(algorithm.name) ?? algorithm.name;
      const hasVariant = !!this.experimentStudioService.getTransformationVariant(baseName);

      if (!hasVariant) {
        this.transformationEnabled.set(false);
        this.transformationAssignments = {};
        return;
      }

      const storedConfigs = this.experimentStudioService.algorithmConfigurations();
      const storedData = storedConfigs?.[baseName]?.['data_transformation'];
      const fromConfig = this.extractTransformationAssignments(storedData);
      const previous = this.transformationSelectionsByAlgorithm[baseName] ?? {};

      const next: Record<string, string> = {};
      (variables ?? []).forEach((v) => {
        const code = v?.code;
        if (!code) return;
        next[code] = fromConfig[code] ?? previous[code] ?? 'none';
      });

      this.transformationAssignments = next;
      this.transformationSelectionsByAlgorithm[baseName] = { ...next };

      const hasAny = Object.values(next).some(v => v && v !== 'none');
      this.transformationEnabled.set(hasAny);
    }, { allowSignalWrites: true });

    effect(() => {
      // Establish dependencies
      this.selectedAlgorithm();
      this.experimentStudioService.selectedVariables();
      this.experimentStudioService.selectedCovariates();

      // Clear results and reset Save As mode on any selection change
      this.result.set(null);
      this.saveAsMode.set(false);
      this.saveAsName.set('');
    }, { allowSignalWrites: true });

    effect(() => {
      const groups = this.experimentStudioService.availableGroupedAlgorithms();
      if (!groups) return;
      this.availableAlgorithmCategories();
    });

    effect(() => {
      const algorithm = this.selectedAlgorithm();
      const schema = this.enrichedConfigSchema();

      if (!algorithm) {
        // if no algorithm,clean form
        this.configForm.set(new FormGroup({}));
        return;
      }

      const allConfigs = this.experimentStudioService.algorithmConfigurations();
      const stored = allConfigs?.[algorithm.name] || {};

      const group: { [key: string]: FormControl } = {};

      schema.forEach((field) => {
        // backend default
        let backendDefault =
          field.default !== undefined ? field.default : null;
        const storedValue = stored?.[field.key];

        // special treatment for alpha
        if ((backendDefault === null || backendDefault === undefined) && field.key === 'alpha') {
          backendDefault = 0.05;
        }

        // fallback value logic
        const fallback =
          storedValue !== undefined
            ? storedValue
            : field.default !== undefined && field.default !== null
              ? field.default
              : backendDefault !== undefined && backendDefault !== null
                ? backendDefault
                : this.uiDefaults[field.key] !== undefined
                  ? this.uiDefaults[field.key]
                  : field.type === 'checkbox'
                    ? false
                    : '';

        // label if missing
        const label =
          field.label && field.label.trim() !== ''
            ? field.label
            : this.prettifyLabel(field.key);

        const prettyField = {
          ...field,
          label,
          desc: field.desc ?? field.description ?? '',
        };

        const control = buildFormControl(prettyField, fallback);

        // extra validation: integer-only for numeric fields
        const isNumeric = prettyField.type === 'number';
        const allowsDecimal =
          prettyField.types?.includes('real') ||
          prettyField.key === 'alpha' ||
          prettyField.key === 'tol' ||
          prettyField.key === 'mu';

        if (isNumeric && !allowsDecimal) {
          const integerPattern = Validators.pattern(/^-?\d+$/);
          const existingValidator = control.validator;

          control.setValidators(
            existingValidator ? [existingValidator, integerPattern] : [integerPattern]
          );

          // stop events while building form
          control.updateValueAndValidity({ emitEvent: false });
        }

        group[field.key] = control;
      });

      this.configForm.set(new FormGroup(group, { updateOn: 'change' }));

      Object.values(this.configForm().controls).forEach(control => {
        if (control.valid) {
          control.markAsTouched({ onlySelf: true });
        }
      });

      this.formKey++;
    });
    effect(() => {
      const res = this.result();
      const schema = this.outputSchema();

      if (!res || !schema.length) return;

      const missing = schema.filter(field => !(field.key in res));
      if (missing.length > 0) {
        console.warn('[Validation] Missing fields from result:', missing.map(f => f.key));
      }
    });

    // Auto-expand categories when they contain available algorithms
    effect(() => {
      const categories = this.filteredAlgorithmCategories();
      const newlyAvailable = categories
        .filter(c => c.algorithms.some(a => !a.isDisabled))
        .map(c => c.name);

      if (newlyAvailable.length > 0) {
        this.openCategories.update(current => {
          const next = [...current];
          let changed = false;
          newlyAvailable.forEach(cat => {
            if (!next.includes(cat)) {
              next.push(cat);
              changed = true;
            }
          });
          return changed ? next : current;
        });
      }
    }, { allowSignalWrites: true });
  }


  configForm = signal<FormGroup>(new FormGroup({}));
  formKey = 0;

  enrichedConfigSchema = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];

    // Basic algorithm schema (shallow copy)
    const schema = (algorithm.configSchema ?? []).map(f => ({ ...f }));

    const yVar = this.experimentStudioService.selectedVariables()[0];
    const xVar = this.experimentStudioService.selectedCovariates()[0];

    const enriched = schema.map(field => {
      let options = field.options ?? [];

      // Placeholder substitution for enums
      if (Array.isArray(options) && options.length === 1) {
        const placeholder = options[0];

        if (placeholder === 'y' && yVar?.enumerations?.length) {
          options = [...yVar.enumerations];
        } else if (placeholder === 'x' && xVar?.enumerations?.length) {
          options = [...xVar.enumerations];
        }
      }

      // Fallback for empty select fields
      if (
        field.type === 'select' &&
        (!options || options.length === 0) &&
        yVar?.enumerations?.length
      ) {
        options = [...yVar.enumerations];
      }

      // Normalize label and desc
      const label = field.label?.trim() || this.prettifyLabel(field.key);
      const desc = field.desc ?? field.description ?? '';

      // Return enriched field
      return { ...field, label, desc, options };
    });

    if (this.crossValidationEnabled() && this.canToggleCrossValidation()) {
      const hasSplits = enriched.some((field) => field.key === 'n_splits');
      if (!hasSplits) {
        enriched.push({
          key: 'n_splits',
          label: 'Cross-validation folds (n_splits)',
          desc: 'Number of folds to use for cross-validation.',
          type: 'number',
          min: 2,
          default: 5,
        });
      }
    }

    return enriched;
  });

  readonly outputSchema = computed(() =>
    getOutputSchema(this.selectedAlgorithm()?.name ?? '') ?? []
  );



  readonly filteredAlgorithmCategories = computed(() => {
    const grouped = this.experimentStudioService.availableGroupedAlgorithms();
    const onlyActive = this.showOnlyActive();

    const entries = Object.entries(grouped ?? {}).map(([name, algorithms]) => {
      const filtered = onlyActive
        ? algorithms.filter(a => !a.isDisabled)
        : algorithms;

      return { name, algorithms: filtered };
    });

    return onlyActive ? entries.filter(c => c.algorithms.length > 0) : entries;
  });

  readonly algoCounts = computed(() => {
    const grouped = this.experimentStudioService.availableGroupedAlgorithms();
    const all = Object.values(grouped ?? {}).flat();
    const active = all.filter(a => !a.isDisabled);
    return { all: all.length, active: active.length };
  });

  toggleActiveOnly() {
    this.showOnlyActive.update(v => !v);
  }


  readonly experimentInfo = computed(() => {
    const selected = this.experimentStudioService.selectedAlgorithm();
    const lastRunName =
      this.experimentStudioService.lastUsedAlgorithm() || this.lastUsedAlgorithm;

    const algoName = selected?.name || lastRunName || null;

    const algoCatalog = this.experimentStudioService.backendAlgorithms();
    const algoMeta = algoName ? algoCatalog[algoName] : null;

    const displayLabel = selected?.label || algoMeta?.label || algoName || 'N/A';
    const defaultName = `Experiment for ${displayLabel}`;

    const allConfigs = this.experimentStudioService.algorithmConfigurations();
    const configs =
      (algoName && allConfigs[algoName]) || {};

    return {
      experimentName: defaultName,
      datasets: this.experimentStudioService.selectedDatasets(),
      variables: this.experimentStudioService.selectedVariables(),
      covariates: this.experimentStudioService.selectedCovariates(),
      filters: this.experimentStudioService.selectedFilters(),
      algorithmConfigs: configs,
    };
  });


  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  prettifyKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }


  get selectedVariables() {
    return this.experimentStudioService.selectedVariables();
  }

  get selectedCovariates() {
    return this.experimentStudioService.selectedCovariates();
  }

  openCategories = signal<string[]>([]);
  infoPanelOpen = false;
  tooltipVisible = false;
  tooltipPosition = { x: 0, y: 0 };
  tooltipData: any = null;

  selectAlgorithm(algorithm: AlgorithmConfig) {
    // Use service method so it enriches configSchema and persists to sessionStorage
    this.experimentStudioService.setAlgorithm(algorithm);
    this.result.set(null);
    this.errorMsg.set(null);
  }

  onAlgorithmClick(algorithm: AlgorithmConfig) {
    if (algorithm.isDisabled) {
      console.log(
        '[AlgorithmPanel] click on disabled algorithm blocked:',
        algorithm.name
      );
      return;
    }

    this.selectAlgorithm(algorithm);
  }

  onClickRunExp() {
    this.errorMsg.set(null);
    this.errorService.clearError();

    // algorithm does not run if form is invalid
    if (this.configForm() && this.configForm().invalid) {
      this.configForm().markAllAsTouched();
      console.warn('[AlgorithmPanel] Run blocked – configForm invalid');
      return;
    }

    const algo = this.experimentStudioService.selectedAlgorithm();
    this.errorMsg.set(null);
    this.errorService.clearError();
    this.loadingText.set('Processing experiment...');
    this.experimentStudioService.setRunning(true);

    if (!algo) {
      console.error('No algorithm selected in service.');
      const msg = 'Please choose an algorithm before running.';
      this.errorMsg.set(msg);
      this.experimentStudioService.setRunning(false);
      return;
    }

    const isCvOnly = this.experimentStudioService.isCrossValidationOnly(algo.name);
    const baseAlgorithmName = isCvOnly
      ? algo.name
      : this.experimentStudioService.getCrossValidationBase(algo.name) ??
      this.experimentStudioService.getTransformationBase(algo.name) ??
      algo.name;
    const cvVariant =
      this.experimentStudioService.getCrossValidationVariant(baseAlgorithmName);
    const shouldIncludeSplits =
      this.crossValidationEnabled() ||
      this.experimentStudioService.isCrossValidationOnly(algo.name);
    const useCrossValidation = shouldIncludeSplits && !!cvVariant;
    const transformationVariant =
      this.experimentStudioService.getTransformationVariant(baseAlgorithmName);
    const useTransformation = this.transformationEnabled() && !!transformationVariant;
    const effectiveAlgorithmName = useCrossValidation
      ? cvVariant
      : useTransformation
        ? transformationVariant
        : baseAlgorithmName;

    const finalAlgorithmName = isCvOnly ? algo.name : effectiveAlgorithmName;

    this.experimentStudioService.lastUsedAlgorithm.set(finalAlgorithmName);
    this.errorMsg.set(null);

    const configValues = this.configForm().getRawValue();
    if (!shouldIncludeSplits && configValues['n_splits'] !== undefined) {
      delete configValues['n_splits'];
    }
    if (useTransformation) {
      const payload = this.buildTransformationPayload();
      configValues.data_transformation = payload;
    } else if (configValues.data_transformation) {
      delete configValues.data_transformation;
    }
    this.experimentStudioService.algorithmConfigurations.set({
      ...this.experimentStudioService.algorithmConfigurations(),
      [baseAlgorithmName]: configValues,
      ...(effectiveAlgorithmName !== baseAlgorithmName ? { [effectiveAlgorithmName]: configValues } : {})
    });

    const result$ = this.experimentStudioService.runSelectedAlgorithmTransient(
      baseAlgorithmName,
      finalAlgorithmName
    );
    if (!result$) {
      const msg = 'Unable to start the run. Check your selections.';
      this.errorMsg.set(msg);
      this.result.set({
        status: 'error',
        error: msg,
      });
      this.experimentStudioService.setRunning(false);
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
          this.errorMsg.set(msg);
          this.result.set({
            status: 'error',
            error: msg,
            payload,
          });
          return;
        }

        const schema = getOutputSchema(finalAlgorithmName ?? '') ?? [];
        this.result.set({
          ...res?.result ?? { message: "No result returned" },
        });
        this.lastUsedAlgorithm = finalAlgorithmName;
        this.lastUsedSchema.set(schema);
      },
      error: () => {
        this.errorMsg.set('Unable to run experiment. Please try again.');
      },
      complete: () => {
        this.experimentStudioService.setRunning(false);
      }
    });

  }

  isRunButtonDisabled(): boolean {
    const algo = this.selectedAlgorithm();

    // if no algorithm -> disabled
    if (!algo) return true;

    // if experiment running -> disabled
    if (this.isRunning()) return true;


    if (this.configForm() && Object.keys(this.configForm().controls).length > 0) {
      return this.configForm().invalid;
    }

    return false;
  }

  toggleCrossValidation(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const enabled = !!target?.checked;
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return;
    const baseName = this.experimentStudioService.getCrossValidationBase(algorithm.name) ?? algorithm.name;
    const variant = this.experimentStudioService.getCrossValidationVariant(baseName);
    if (!variant) return;
    this.crossValidationSelections[baseName] = enabled;
    this.crossValidationEnabled.set(enabled);

    if (!enabled) {
      if (this.configForm()?.contains('n_splits')) {
        this.configForm().removeControl('n_splits');
      }

      const configs = this.experimentStudioService.algorithmConfigurations();
      const baseConfig = { ...(configs[baseName] ?? {}) };
      const variantConfig = { ...(configs[variant] ?? {}) };
      if (baseConfig['n_splits'] !== undefined) delete baseConfig['n_splits'];
      if (variantConfig['n_splits'] !== undefined) delete variantConfig['n_splits'];
      this.experimentStudioService.algorithmConfigurations.set({
        ...configs,
        [baseName]: baseConfig,
        [variant]: variantConfig,
      });
    }
  }

  toggleTransformation(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const enabled = !!target?.checked;
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return;
    const baseName = this.experimentStudioService.getTransformationBase(algorithm.name) ?? algorithm.name;
    if (!this.experimentStudioService.getTransformationVariant(baseName)) return;
    this.transformationEnabled.set(enabled);
  }

  setTransformationAssignment(variableCode: string, value: string) {
    if (!variableCode) return;
    this.transformationAssignments = {
      ...this.transformationAssignments,
      [variableCode]: value,
    };

    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return;
    const baseName = this.experimentStudioService.getTransformationBase(algorithm.name) ?? algorithm.name;
    this.transformationSelectionsByAlgorithm[baseName] = { ...this.transformationAssignments };
  }

  getTransformationAssignment(variableCode: string): string {
    return this.transformationAssignments?.[variableCode] ?? 'none';
  }

  private extractTransformationAssignments(data: any): Record<string, string> {
    if (!data || typeof data !== 'object') return {};
    const result: Record<string, string> = {};
    this.transformationTypes.forEach((type) => {
      const values = Array.isArray(data[type]) ? data[type] : [];
      values.forEach((code: any) => {
        if (code === null || code === undefined) return;
        result[String(code)] = type;
      });
    });
    return result;
  }

  private buildTransformationPayload(): Record<string, string[]> {
    const payload: Record<string, string[]> = {
      standardize: [],
      center: [],
      exp: [],
    };
    Object.entries(this.transformationAssignments).forEach(([code, choice]) => {
      if (!choice || choice === 'none') return;
      if (!payload[choice]) payload[choice] = [];
      payload[choice].push(code);
    });
    Object.keys(payload).forEach((key) => {
      if (!payload[key].length) delete payload[key];
    });
    return payload;
  }

  isAlgorithmAvailable(algorithm: string): boolean {
    return this.experimentStudioService.isAlgorithmAvailable(algorithm);
  }

  toggleInfoPanel() {
    this.infoPanelOpen = !this.infoPanelOpen;
  }

  showTooltip(algorithm: any, event: MouseEvent) {
    event.stopPropagation();
    const item = (event.currentTarget as HTMLElement)?.closest('li') || (event.currentTarget as HTMLElement);
    const rect = item.getBoundingClientRect();
    const panel = item.closest('.algorithm-panel') as HTMLElement | null;
    const panelRect = panel?.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    const offset = 12;

    // Horizontal: To the right of the sidebar panel
    let x = (panelRect?.right ?? rect.right) + offset;
    // Vertical: Aligned with the top of the hovered item
    let y = rect.top;

    this.tooltipVisible = true;
    this.tooltipData = algorithm;

    // Immediate initial placement
    this.tooltipPosition = { x, y };

    // Refinement after render
    setTimeout(() => {
      const el = document.querySelector('.tooltip') as HTMLElement | null;
      if (!el) return;

      const w = el.offsetWidth || 320;
      const h = el.offsetHeight || 200;

      // Handle horizontal overflow
      if (x + w > viewportWidth - padding) {
        x = (panelRect?.left ?? rect.left) - w - offset;
      }

      // Handle vertical overflow (shift up if it hits the bottom)
      if (y + h > viewportHeight - padding) {
        y = viewportHeight - h - padding;
      }

      // Safety: don't let it go off the top
      if (y < padding) y = padding;

      this.tooltipPosition = { x: Math.max(padding, x), y };
    }, 0);

    if (algorithm.isDisabled) {
      this.tooltipData = {
        ...algorithm,
        description: `${algorithm.description || 'No description available.'}<br><span class='unavailable-warning'> This algorithm is currently unavailable for the selected variables.</span><br>`,
      };
    }
  }

  hideTooltip() {
    this.tooltipVisible = false;
  }

  hasText(value: any): boolean {
    if (value === null || value === undefined) return false;
    const text = String(value).trim();
    return text.length > 0;
  }

  private normalizeBool(value: boolean | string | undefined | null): boolean | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return null;
  }

  getRoleRequirement(field: any, label: string): string | null {
    if (!field) return null;

    const isRequired = this.normalizeBool(field.required) === true;
    const multiple = this.normalizeBool(field.multiple);

    let count = 'optional';
    if (multiple === false) {
      count = isRequired ? 'exactly 1' : '0–1';
    } else if (isRequired) {
      count = '1+';
    }

    const types = Array.isArray(field.types) && field.types.length
      ? field.types.join(',')
      : null;

    const parts = [`${label}: ${count}`];
    if (types) {
      parts.push(`types: ${types}`);
    }

    return parts.join(' • ');
  }

  getVariableRequirement(algo?: any): string | null {
    const target = algo || this.tooltipData;
    const override = this.experimentStudioService.getAlgorithmRequirementOverrides(target);
    if (override?.y) return override.y;
    return this.getRoleRequirement(target?.inputdata?.y, 'Variable');
  }

  getCovariateRequirement(algo?: any): string | null {
    const target = algo || this.tooltipData;
    const override = this.experimentStudioService.getAlgorithmRequirementOverrides(target);
    if (override?.x) {
      if (/:\s*none$/i.test(override.x)) {
        return null;
      }
      return override.x;
    }
    return this.getRoleRequirement(target?.inputdata?.x, 'Covariate');
  }

  onSaveAs() {
    if (!this.saveAsName().trim()) {
      this.errorMsg.set('Please provide a name for the experiment.');
      return;
    }

    this.errorMsg.set(null);
    this.errorService.clearError();

    const algo = this.experimentStudioService.selectedAlgorithm();
    if (!algo) return;

    this.experimentStudioService.setRunning(true);

    const isCvOnly = this.experimentStudioService.isCrossValidationOnly(algo.name);
    const baseAlgorithmName = isCvOnly
      ? algo.name
      : this.experimentStudioService.getCrossValidationBase(algo.name) ??
      this.experimentStudioService.getTransformationBase(algo.name) ??
      algo.name;

    const cvVariant = this.experimentStudioService.getCrossValidationVariant(baseAlgorithmName);
    const shouldIncludeSplits = this.crossValidationEnabled() || this.experimentStudioService.isCrossValidationOnly(algo.name);
    const useCrossValidation = shouldIncludeSplits && !!cvVariant;
    const transformationVariant = this.experimentStudioService.getTransformationVariant(baseAlgorithmName);
    const useTransformation = this.transformationEnabled() && !!transformationVariant;
    const effectiveAlgorithmName = useCrossValidation
      ? cvVariant
      : useTransformation
        ? transformationVariant
        : baseAlgorithmName;

    const finalAlgorithmName = isCvOnly ? algo.name : effectiveAlgorithmName;

    const result$ = this.experimentStudioService.runSelectedAlgorithm(
      baseAlgorithmName,
      finalAlgorithmName,
      this.saveAsName()
    );

    this.loadingText.set('Saving experiment...');

    if (!result$) {
      this.errorMsg.set('Unable to start the save process.');
      this.experimentStudioService.setRunning(false);
      return;
    }

    result$.subscribe({
      next: (res) => {
        const status = res?.status;
        const payload = res?.result ?? {};

        if (status === 'error') {
          const msg = payload?.message || 'Failed to save experiment results.';
          this.errorMsg.set(msg);
          return;
        }

        this.saveAsMode.set(false);
        this.saveAsName.set('');
        this.result.set(null); // Return to parameters view
        this.triggerSuccessNotification();
      },
      error: () => {
        this.errorMsg.set('Failed to save experiment.');
      },
      complete: () => {
        this.experimentStudioService.setRunning(false);
      }
    });
  }

  cancelSaveAs() {
    this.saveAsMode.set(false);
    this.saveAsName.set('');
  }

  toggleSaveAsMode() {
    this.saveAsMode.update(v => !v);
    if (this.saveAsMode()) {
      this.saveAsName.set(this.experimentInfo().experimentName);
    }
  }

  backToParameters() {
    this.result.set(null);
    this.saveAsMode.set(false);
    this.saveAsName.set('');
  }

  isCategoryOpen(category: string): boolean {
    return this.openCategories().includes(category);
  }

  toggleCategory(category: string): void {
    this.openCategories.update(current => {
      if (current.includes(category)) {
        return current.filter(c => c !== category);
      } else {
        return [...current, category];
      }
    });
  }

  onExportResult(section: HTMLElement) {
    const result = this.result();
    if (!section || !result) {
      console.warn('No result or element to export');
      return;
    }

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

    const filename = info.experimentName;

    const transformations = this.transformationEnabled()
      ? Object.entries(this.transformationAssignments)
        .filter(([_, choice]) => choice && choice !== 'none')
        .map(([code, choice]) => {
          const label = this.labelMap()[code] || code;
          return `${label}: ${choice}`;
        })
        .join(', ')
      : null;

    this.pdfExport.exportExperimentPdf({
      filename,
      details: {
        experimentName: info.experimentName,
        createdBy,
        createdAt: new Date(),
        algorithm: algoLabel,
        params: info.algorithmConfigs,
        preprocessing: 'none',
        domain: this.experimentStudioService.selectedDataModel()?.code ?? null,
        datasets: (info.datasets ?? []).map(code => {
          const ds = this.experimentStudioService.availableDatasets().find(d => d.code === code);
          return ds?.label || code;
        }),
        variables: (info.variables ?? []).map((v: any) => v.label || v.name || v.code),
        covariates: (info.covariates ?? []).map((c: any) => c.label || c.name || c.code),
        filters: (info.filters ?? []).map((f: any) => f.label || f.name || f.code),
        transformations,
        mipVersion: this.mipVersion,
      },
      algorithmKey: algoKey,
      result,
      chartContainer: section,
    });
  }

  private triggerSuccessNotification() {
    this.showSuccessNotification.set(true);
    setTimeout(() => {
      this.showSuccessNotification.set(false);
    }, 4000);
  }
}
