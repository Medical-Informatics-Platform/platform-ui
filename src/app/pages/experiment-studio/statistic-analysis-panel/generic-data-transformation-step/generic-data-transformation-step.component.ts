import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RawPreprocessingStep } from '../../../../models/backend-algorithms.model';
import { stepIcon } from '../../../../core/step-picker.utils';
import {
  DEPENDENT_MAPS,
  StepField,
  StepFormValues,
  buildStepParameters,
  stepFields,
  stepNote,
  stepValuesFromParameters,
  unsupportedRequiredFields,
  valueOptionsForVariable,
} from '../../../../core/data-transformation-step-form.utils';
import { isOutlierEligibleVariable } from '../../../../core/outlier-rules';
import { StationActionBarComponent } from '../../shared/station-action-bar/station-action-bar.component';
import { StationCardComponent } from '../../shared/station-card/station-card.component';

/** A selected variable as the panel hands it over: only the code, label and type are read. */
interface StepVariable {
  code: string;
  label?: string;
  name?: string;
  type?: string;
}

/**
 * Station for any step the engine lists in its catalog that has no dedicated station. It renders
 * both families, in-place preprocessing (global imputer, global winsorizer) and data
 * transformation (new columns or changed meaning); the panel places each in its own stage.
 * The form is built from the step's parameter schema and the request parameters are built by
 * `buildStepParameters`, so the payload matches the engine's specification.
 * Apply and Remove are reported to the panel, which owns the applied pipeline config.
 */
@Component({
  selector: 'app-generic-data-transformation-step',
  imports: [FormsModule, StationCardComponent, StationActionBarComponent],
  templateUrl: './generic-data-transformation-step.component.html',
  styleUrl: './generic-data-transformation-step.component.css',
  host: { '[attr.data-step]': 'spec().name', '[class.is-idle]': '!shown()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericDataTransformationStepComponent {
  readonly spec = input.required<RawPreprocessingStep>();
  /** Variables the step may act on: the experiment's selected, non-derived variables. */
  readonly variables = input<StepVariable[]>([]);
  /** Parameters in the applied config, or null when the step is not part of the run. */
  readonly applied = input<Record<string, unknown> | null>(null);
  readonly open = input(false);
  readonly busy = input(false);

  readonly openChange = output<boolean>();
  readonly applyStep = output<Record<string, unknown>>();
  readonly removeStep = output<void>();

  protected readonly note = computed(() => stepNote(this.spec().name));
  protected readonly icon = computed(() => stepIcon(this.spec().name));
  protected readonly fields = computed(() => stepFields(this.spec()));
  protected readonly blockedFields = computed(() => unsupportedRequiredFields(this.fields()));
  protected readonly values = signal<StepFormValues>({});
  protected readonly started = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly docOpen = signal(false);

  /** Content key of the applied parameters, so an unrelated config change keeps the draft. */
  private readonly appliedKey = computed(() => JSON.stringify(this.applied()));
  private readonly codes = computed(() => new Set(this.variables().map((variable) => variable.code)));
  private readonly numericalCodes = computed(() =>
    new Set(this.variables().filter((variable) => isOutlierEligibleVariable(variable)).map((variable) => variable.code)));
  private readonly built = computed(() =>
    buildStepParameters(this.fields(), this.values(), this.codes(), { stepName: this.spec().name, numericalCodes: this.numericalCodes() }));

  protected readonly errors = computed(() => this.built().errors);
  protected readonly isApplied = computed(() => this.applied() !== null);
  /** The station is drawn once it is applied or the user opened it; otherwise only the add row. */
  protected readonly shown = computed(() => this.isApplied() || this.started());

  /** 1 when the form differs from what is applied (an incomplete form counts as a change). */
  protected readonly pendingCount = computed(() => {
    const draft = JSON.stringify(this.built().parameters);
    const applied = JSON.stringify(this.applied() ?? {});
    if (!this.isApplied() && Object.keys(this.built().parameters).length === 0) return 0;
    return draft === applied ? 0 : 1;
  });

  protected readonly statusLabel = computed(() => {
    if (this.pendingCount() > 0) return 'Not applied';
    return this.isApplied() ? 'Applied' : 'Not set';
  });
  protected readonly statusTone = computed<'applied' | 'pending' | 'default'>(() =>
    this.pendingCount() > 0 ? 'pending' : this.isApplied() ? 'applied' : 'default',
  );

  constructor() {
    // The form follows the applied config: a hydrated saved experiment, a Discard, or a change
    // of the selection that trims the applied step all land here.
    effect(() => {
      this.appliedKey();
      const fields = this.fields();
      untracked(() => this.values.set(stepValuesFromParameters(fields, this.applied())));
    });
    effect(() => {
      if (this.open()) untracked(() => this.started.set(true));
    });
  }

  protected toggle(): void {
    this.openChange.emit(!this.open());
  }

  protected toggleDoc(): void {
    this.docOpen.update((open) => !open);
  }

  protected variableLabel(variable: StepVariable): string {
    return variable.label || variable.name || variable.code;
  }

  /** Enum values of a per-variable row that the variable's type allows. */
  protected optionsFor(field: StepField, variable: StepVariable): string[] {
    return valueOptionsForVariable(this.spec().name, field.options, this.numericalCodes().has(variable.code));
  }

  /** Variables with a row in a per-variable map: dependent maps list only the variables that need them. */
  protected rowsFor(field: StepField): StepVariable[] {
    const rule = (DEPENDENT_MAPS[this.spec().name] ?? []).find((candidate) => candidate.key === field.key);
    if (!rule) return this.variables();
    const governing = (this.values()[rule.on] ?? {}) as Record<string, string>;
    return this.variables().filter((variable) => governing[variable.code] === rule.value);
  }

  protected isDependent(field: StepField): boolean {
    return (DEPENDENT_MAPS[this.spec().name] ?? []).some((candidate) => candidate.key === field.key);
  }

  protected optionLabel(option: string): string {
    return option.replace(/_/g, ' ');
  }

  protected scalar(field: StepField): string {
    const value = this.values()[field.key];
    return typeof value === 'string' ? value : '';
  }

  protected flag(field: StepField): boolean {
    return this.values()[field.key] === true;
  }

  protected setValue(field: StepField, value: unknown): void {
    this.values.update((values) => ({ ...values, [field.key]: value }));
  }

  protected isSelected(field: StepField, code: string): boolean {
    const value = this.values()[field.key];
    return Array.isArray(value) && value.includes(code);
  }

  protected toggleVariable(field: StepField, code: string): void {
    const value = this.values()[field.key];
    const current = Array.isArray(value) ? (value as string[]) : [];
    this.setValue(field, current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  protected selectAllVariables(field: StepField): void {
    this.setValue(field, this.variables().map((variable) => variable.code));
  }

  protected clearVariables(field: StepField): void {
    this.setValue(field, []);
  }

  protected mapValue(field: StepField, code: string): string {
    const map = this.values()[field.key] as Record<string, string> | undefined;
    return map?.[code] ?? '';
  }

  protected setMapValue(field: StepField, code: string, value: string): void {
    const map = { ...((this.values()[field.key] as Record<string, string> | undefined) ?? {}) };
    if (value === '' || value === null || value === undefined) delete map[code];
    else map[code] = value;
    this.setValue(field, map);
  }

  /** Set every selected variable that accepts the value (a numerical-only mean skips nominal ones). */
  protected setAllMapValues(field: StepField, value: string): void {
    const accepting = value === ''
      ? this.variables()
      : this.variables().filter((variable) => this.optionsFor(field, variable).includes(value));
    this.setValue(field, Object.fromEntries(accepting.map((variable) => [variable.code, value])));
  }

  protected discard(): void {
    this.showErrors.set(false);
    this.values.set(stepValuesFromParameters(this.fields(), this.applied()));
  }

  protected commitOrClose(): void {
    if (this.pendingCount() === 0) {
      this.openChange.emit(false);
      return;
    }
    if (this.blockedFields().length) return;
    if (Object.keys(this.errors()).length) {
      this.showErrors.set(true);
      return;
    }
    this.showErrors.set(false);
    this.applyStep.emit(this.built().parameters);
  }

  protected remove(): void {
    this.started.set(false);
    this.showErrors.set(false);
    this.removeStep.emit();
    this.openChange.emit(false);
  }
}
