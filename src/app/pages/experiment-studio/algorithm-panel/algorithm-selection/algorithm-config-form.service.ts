import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { AlgorithmNames } from '../../../../core/constants/algorithm.constants';
import { optionBindingValue } from '../../../../core/algorithm-parameter.utils';
import {
  createDefaultOutlierRule,
  defaultFoldForStrategy,
  hydrateOutlierRules,
  isOutlierEligibleVariable,
  OutlierRule,
  OutlierStrategy,
  OutlierTail,
  serializeOutlierRules,
  validateOutlierRule,
} from '../../../../core/outlier-rules';
import {
  buildParameterForm,
  enrichParameterSchema,
  enumOptionsForVariableCode,
  isAdvancedField,
  multiSelectValues,
  nonBlankString,
  normalizeParameterValues,
  parameterFieldLabel,
  parameterFormSignature,
} from '../utils/algorithm-parameter-form.utils';
import {
  AlgorithmParameterField,
  EnrichedParameterField,
  OutlierReportVariable,
  ParameterOption,
  StudioVariable,
} from '../algorithm-panel.models';

/** outlier_report keys its rules by variable; the editor, not the form, edits them. */
const OUTLIER_RULE_KEYS = ['strategies', 'tails', 'folds'];

/**
 * The selected method's parameter form: the schema enriched with the assigned roles, the
 * reactive form built from it and persisted on every edit, cross-validation, the
 * positive_class options for the chosen event variable, and the outlier_report rules.
 * Provided by the algorithm panel.
 */
@Injectable()
export class AlgorithmConfigFormService {
  private readonly studio = inject(ExperimentStudioService);
  private readonly selectedAlgorithm = this.studio.selectedAlgorithm;

  private readonly form = signal<FormGroup>(new FormGroup({}));
  /** The selected method's parameter form; replaced when the schema it was built from changes. */
  readonly configForm = this.form.asReadonly();
  private readonly formInvalid = signal(false);
  readonly invalid = this.formInvalid.asReadonly();
  /** Signature of the built form; cleared so that picking a method always rebuilds it. */
  private readonly builtFormSignature = signal('');

  private readonly crossValidation = signal(false);
  readonly crossValidationEnabled = this.crossValidation.asReadonly();
  /** Cross-validation on/off the user chose per base method; a memory, not reactive state. */
  private readonly crossValidationChoices = new Map<string, boolean>();

  readonly isCrossValidationOnly = computed(() => {
    const algorithm = this.selectedAlgorithm();
    return !!algorithm && this.studio.isCrossValidationOnly(algorithm.name);
  });

  readonly canToggleCrossValidation = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return false;
    if (this.studio.isCrossValidationOnly(algorithm.name)) return false;
    const baseName = this.studio.getCrossValidationBase(algorithm.name) ?? algorithm.name;
    return !!this.studio.getCrossValidationVariant(baseName) && !!this.studio.backendAlgorithms()[baseName];
  });

  readonly isOutlierReportSelected = computed(
    () => this.selectedAlgorithm()?.name === AlgorithmNames.OUTLIER_REPORT
  );

  /** Live event_var from the config form; avoids reading FormGroup inside other computeds. */
  private readonly eventVarSelection = signal<string | null>(null);

  readonly selectedEventVarCode = computed(() => {
    const algorithm = this.selectedAlgorithm();
    return algorithm ? this.resolveSelectedEventVarCode(algorithm.name) : null;
  });

  readonly positiveClassOptions = computed(() => this.enumOptionsForVariableCode(this.selectedEventVarCode()));

  readonly enrichedConfigSchema = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];
    return enrichParameterSchema(algorithm, {
      y: this.studio.algorithmY(),
      x: this.studio.algorithmX(),
      eventVarCode: this.selectedEventVarCode(),
      withCrossValidationFolds: this.crossValidation() && this.canToggleCrossValidation(),
    });
  });

  /** The fields the form shows; outlier_report's rule dictionaries belong to its editor. */
  readonly visibleConfigSchema = computed(() => {
    const schema = this.enrichedConfigSchema();
    if (!this.isOutlierReportSelected()) return schema;
    return schema.filter((field) => field.type !== 'dict' && !OUTLIER_RULE_KEYS.includes(String(field.key)));
  });

  readonly primaryConfigSchema = computed(() =>
    this.visibleConfigSchema().filter((field) =>
      !this.isCrossValidationField(field) && !isAdvancedField(field) && this.form().get(field.key))
  );

  readonly advancedConfigSchema = computed(() =>
    this.visibleConfigSchema().filter((field) =>
      !this.isCrossValidationField(field) && isAdvancedField(field) && this.form().get(field.key))
  );

  readonly crossValidationConfigSchema = computed(() =>
    this.crossValidation()
      ? this.visibleConfigSchema().filter((field) => this.isCrossValidationField(field) && this.form().get(field.key))
      : []
  );

  readonly hasAlgorithmParameterControls = computed(() => (
    this.visibleConfigSchema().length > 0 ||
    this.isOutlierReportSelected() ||
    this.canToggleCrossValidation() ||
    this.isCrossValidationOnly()
  ));

  /** Numerical variables of the assignable pool, once each: the outlier_report rows. */
  readonly outlierReportVariables = computed(() => {
    const unique = new Map<string, OutlierReportVariable>();
    this.studio.algorithmAssignableVariables().forEach((variable: StudioVariable) => {
      if (hasCode(variable)) unique.set(String(variable.code), variable);
    });
    return Array.from(unique.values()).filter((variable) => isOutlierEligibleVariable(variable));
  });

  /** Per-variable outlier_report rules, keyed by variable code. */
  private readonly outlierReportRules = signal<Record<string, OutlierRule>>({});
  /** Fold errors shown under each outlier_report rule, keyed by variable code. */
  private readonly outlierReportValidationErrors = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      const algorithm = this.selectedAlgorithm();
      if (!algorithm) {
        this.crossValidation.set(false);
        return;
      }
      if (this.studio.isCrossValidationOnly(algorithm.name)) {
        this.crossValidation.set(true);
        return;
      }
      const baseName = this.studio.getCrossValidationBase(algorithm.name) ?? algorithm.name;
      if (!this.studio.getCrossValidationVariant(baseName)) {
        this.crossValidation.set(false);
        return;
      }
      const stored = this.crossValidationChoices.get(baseName);
      this.crossValidation.set(stored ?? this.studio.isCrossValidationAlgorithm(algorithm.name));
    });

    effect(() => {
      const algorithm = this.selectedAlgorithm();
      const variables = this.outlierReportVariables();
      if (!algorithm || algorithm.name !== AlgorithmNames.OUTLIER_REPORT) {
        this.outlierReportValidationErrors.set({});
        return;
      }
      const stored = untracked(() => this.studio.algorithmConfigurations()[algorithm.name] ?? {});
      this.reconcileOutlierReportRules(variables, stored);
    });

    effect((onCleanup) => {
      const algorithm = this.selectedAlgorithm();
      const schema = this.visibleConfigSchema();

      if (!algorithm) {
        this.builtFormSignature.set('');
        this.eventVarSelection.set(null);
        this.form.set(new FormGroup({}));
        this.formInvalid.set(false);
        return;
      }

      const schemaSignature = parameterFormSignature(algorithm.name, this.crossValidation(), schema);
      if (schemaSignature === untracked(this.builtFormSignature)) {
        return;
      }
      this.builtFormSignature.set(schemaSignature);

      const stored = untracked(() => this.studio.algorithmConfigurations())?.[algorithm.name] || {};
      this.eventVarSelection.set(nonBlankString(stored['event_var']));

      const form = buildParameterForm(schema, stored);
      this.form.set(form);
      this.formInvalid.set(form.invalid);

      const statusSub = form.statusChanges.subscribe(() => this.formInvalid.set(form.invalid));
      const subscription = form.valueChanges.subscribe((values) => {
        this.syncEventVarSelectionFromValues(algorithm.name, values);
        this.persistCurrentFormConfig(algorithm.name, untracked(() => this.visibleConfigSchema()));
      });
      onCleanup(() => {
        subscription.unsubscribe();
        statusSub.unsubscribe();
      });
    });
  }

  /** Forgets the built form and event variable so the next method starts from its stored config. */
  resetForNewAlgorithm(): void {
    this.builtFormSignature.set('');
    this.eventVarSelection.set(null);
  }

  /** n_splits belongs to the cross-validation row, so it renders under that switch, not in the main form. */
  isCrossValidationField(field: AlgorithmParameterField): boolean {
    return field.key === 'n_splits' && (this.canToggleCrossValidation() || this.isCrossValidationOnly());
  }

  fieldLabel(field: EnrichedParameterField): string {
    return parameterFieldLabel(field, this.studio.algorithmX()[0]);
  }

  bindOptionValue(option: ParameterOption): string {
    return optionBindingValue(option);
  }

  isMultiSelectOptionSelected(key: string, option: ParameterOption): boolean {
    return multiSelectValues(this.form().get(key)?.value).includes(String(this.bindOptionValue(option)));
  }

  toggleMultiSelectOption(key: string, option: ParameterOption): void {
    const control = this.form().get(key);
    if (!control) return;
    const value = String(this.bindOptionValue(option));
    const current = multiSelectValues(control.value);
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    control.setValue(next);
    control.markAsTouched();
    control.updateValueAndValidity();
  }

  /** Switches between the base method and its cross-validation variant, carrying the parameters over. */
  setCrossValidation(enabled: boolean): void {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return;
    const baseName = this.studio.getCrossValidationBase(algorithm.name) ?? algorithm.name;
    const variant = this.studio.getCrossValidationVariant(baseName);
    if (!variant) return;
    const configs = this.studio.algorithmConfigurations();
    const preservedConfig = { ...(configs[baseName] ?? {}), ...this.form().getRawValue() };

    this.crossValidationChoices.set(baseName, enabled);

    if (!enabled) {
      if (preservedConfig['n_splits'] !== undefined) delete preservedConfig['n_splits'];
      if (this.form().contains('n_splits')) this.form().removeControl('n_splits');

      const variantConfig = { ...(configs[variant] ?? {}) };
      if (variantConfig['n_splits'] !== undefined) delete variantConfig['n_splits'];
      this.studio.algorithmConfigurations.set({
        ...configs,
        [baseName]: preservedConfig,
        [variant]: variantConfig,
      });
    } else {
      this.studio.algorithmConfigurations.set({
        ...configs,
        [baseName]: preservedConfig,
        [variant]: { ...(configs[variant] ?? {}), ...preservedConfig },
      });
    }

    this.crossValidation.set(enabled);
  }

  /** The parameters a run sends: the visible form values, plus the outlier_report rules. */
  runParameterValues(): Record<string, unknown> {
    return this.mergeOutlierReportConfig(normalizeParameterValues(this.form().getRawValue(), this.visibleConfigSchema()));
  }

  // --- outlier_report rules ---

  /** The variable's rule; a variable without one reads as an enabled default rule. */
  outlierReportRuleFor(variable: OutlierReportVariable): OutlierRule {
    return this.outlierReportRules()[variable.code] ?? createDefaultOutlierRule(variable.code, true);
  }

  outlierReportRuleError(variable: OutlierReportVariable): string {
    return this.outlierReportValidationErrors()[variable.code] || validateOutlierRule(this.outlierReportRuleFor(variable)) || '';
  }

  onOutlierReportEnabledChange(variable: OutlierReportVariable, enabled: boolean): void {
    this.patchOutlierRule(variable, { enabled }, () => '');
  }

  onOutlierReportStrategyChange(variable: OutlierReportVariable, strategy: OutlierStrategy): void {
    this.patchOutlierRule(variable, { enabled: true, strategy, fold: defaultFoldForStrategy(strategy) }, () => '');
  }

  onOutlierReportTailChange(variable: OutlierReportVariable, tail: OutlierTail): void {
    this.patchOutlierRule(variable, { enabled: true, tail });
  }

  onOutlierReportFoldChange(variable: OutlierReportVariable, rawValue: string | number): void {
    const value = String(rawValue ?? '').trim();
    const fold = value === '' ? null : Number(value);
    this.patchOutlierRule(
      variable,
      { enabled: true, fold: typeof fold === 'number' && Number.isFinite(fold) ? fold : null },
      (rule) => validateOutlierRule(rule) ?? '',
    );
  }

  /**
   * Checks the outlier_report rules before a run and persists them when they pass.
   * Returns the message that blocks the run, or null (always null for other methods).
   */
  validateOutlierReportForRun(): string | null {
    if (!this.isOutlierReportSelected()) return null;

    const variables = this.outlierReportVariables();
    if (!variables.length) {
      return 'Select at least one numerical variable or covariate for the outlier report.';
    }

    // Every listed variable runs with a rule, so the defaults it reads as become real rules.
    this.outlierReportRules.update((rules) => {
      const complete = { ...rules };
      variables.forEach((variable) => { complete[variable.code] ??= createDefaultOutlierRule(variable.code, true); });
      return complete;
    });

    const errors: Record<string, string> = {};
    variables.forEach((variable) => {
      const error = validateOutlierRule(this.outlierReportRuleFor(variable));
      if (error) errors[variable.code] = error;
    });

    this.outlierReportValidationErrors.set(errors);
    if (Object.keys(errors).length > 0) {
      return 'Fix the outlier report configuration before running.';
    }

    const serialized = serializeOutlierRules(
      this.outlierReportRules(),
      new Set(variables.map((variable) => variable.code))
    );
    if (!serialized) {
      return 'Enable at least one numerical variable for the outlier report.';
    }

    this.persistOutlierReportConfig();
    return null;
  }

  private resolveSelectedEventVarCode(algorithmName: string): string | null {
    const stored = untracked(() => this.studio.algorithmConfigurations())[algorithmName]?.['event_var'];
    return nonBlankString(this.eventVarSelection()) ?? nonBlankString(stored);
  }

  private syncEventVarSelectionFromValues(algorithmName: string, values: Record<string, unknown>): void {
    if (!Object.prototype.hasOwnProperty.call(values, 'event_var')) return;
    const next = nonBlankString(values['event_var']);
    if (this.eventVarSelection() === next) return;
    this.eventVarSelection.set(next);
    this.syncPositiveClassWithEventVar(algorithmName);
  }

  private enumOptionsForVariableCode(varCode: string | null | undefined) {
    return enumOptionsForVariableCode(varCode, [...this.studio.algorithmY(), ...this.studio.algorithmX()]);
  }

  /** Clears a positive_class that is not a level of the newly chosen event variable. */
  private syncPositiveClassWithEventVar(algorithmName: string): void {
    const positiveControl = this.form().get('positive_class');
    if (!positiveControl) return;

    const options = this.enumOptionsForVariableCode(this.resolveSelectedEventVarCode(algorithmName));
    if (!options.length) return;

    const allowed = new Set(options.map((option) => option.code));
    const current = positiveControl.value;
    if (
      current !== null &&
      current !== undefined &&
      String(current).trim() !== '' &&
      !allowed.has(String(current))
    ) {
      positiveControl.setValue(null, { emitEvent: false });
    }
  }

  private persistCurrentFormConfig(algorithmName: string, schema: readonly EnrichedParameterField[]): void {
    const values = normalizeParameterValues(this.form().getRawValue(), schema);
    const nextValues = algorithmName === AlgorithmNames.OUTLIER_REPORT
      ? this.mergeOutlierReportConfig(values)
      : values;
    const allConfigs = this.studio.algorithmConfigurations();
    const previous = allConfigs[algorithmName];
    if (previous && JSON.stringify(previous) === JSON.stringify(nextValues)) return;
    this.studio.algorithmConfigurations.set({ ...allConfigs, [algorithmName]: nextValues });
  }

  private mergeOutlierReportConfig(configValues: Record<string, unknown>): Record<string, unknown> {
    if (!this.isOutlierReportSelected()) return configValues;
    OUTLIER_RULE_KEYS.forEach((key) => delete configValues[key]);
    const payload = serializeOutlierRules(
      this.outlierReportRules(),
      new Set(this.outlierReportVariables().map((variable) => variable.code))
    );
    return payload ? { ...configValues, ...payload } : configValues;
  }

  private persistOutlierReportConfig(): void {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm || algorithm.name !== AlgorithmNames.OUTLIER_REPORT) return;
    this.studio.algorithmConfigurations.set({
      ...this.studio.algorithmConfigurations(),
      [algorithm.name]: this.runParameterValues(),
    });
  }

  /** One rule per listed variable: kept, else restored from the stored config, else a default. */
  private reconcileOutlierReportRules(variables: OutlierReportVariable[], stored: Record<string, unknown>): void {
    const allowedCodes = new Set(variables.map((variable) => variable.code));
    const hydrated = hydrateOutlierRules(stored, allowedCodes);
    const hasStoredRules = !!stored && typeof stored === 'object' && Object.keys(stored?.['strategies'] ?? {}).length > 0;
    const current = untracked(this.outlierReportRules);
    const enableDefaults = Object.keys(current).length > 0 || !hasStoredRules;
    const next: Record<string, OutlierRule> = {};

    variables.forEach(({ code }) => {
      const kept = current[code] ?? hydrated[code];
      next[code] = kept ? { ...kept } : createDefaultOutlierRule(code, enableDefaults);
    });

    this.outlierReportRules.set(next);
    this.outlierReportValidationErrors.update((errors) =>
      Object.fromEntries(Object.entries(errors).filter(([code]) => allowedCodes.has(code))));
  }

  /** Applies an edit to one rule, optionally replaces its shown error, and persists the config. */
  private patchOutlierRule(
    variable: OutlierReportVariable,
    patch: Partial<OutlierRule>,
    errorFor?: (rule: OutlierRule) => string,
  ): void {
    const rule = { ...this.outlierReportRuleFor(variable), ...patch };
    this.outlierReportRules.update((rules) => ({ ...rules, [variable.code]: rule }));
    if (errorFor) {
      this.outlierReportValidationErrors.update((errors) => ({ ...errors, [variable.code]: errorFor(rule) }));
    }
    this.persistOutlierReportConfig();
  }
}

function hasCode(variable: StudioVariable | null | undefined): variable is OutlierReportVariable {
  return !!variable?.code;
}
