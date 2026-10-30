import { FormControl, FormGroup, Validators } from '@angular/forms';
import { prettifyLabel as toHumanLabel } from '../../../../core/algorithm-mappers';
import {
  omitEmptyOptionalParameters,
  serializeAlgorithmParameterValue,
} from '../../../../core/algorithm-parameter.utils';
import { AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { buildFormControl } from '../../../shared/utils/form-control.factory';
import {
  AlgorithmParameterField,
  CodeLabelOption,
  EnrichedParameterField,
  ParameterOption,
  StudioVariable,
} from '../algorithm-panel.models';

/** Parameter values the form starts from when neither the stored config nor the backend has one. */
const UI_DEFAULTS: Readonly<Record<string, unknown>> = {
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

/** Number fields that take decimals although the backend does not type them `real`. */
const DECIMAL_KEYS = new Set(['alpha', 'tol', 'mu']);

/** `String(raw)` when `raw` holds a non-blank value, else null. */
export function nonBlankString(raw: unknown): string | null {
  return raw !== null && raw !== undefined && String(raw).trim() !== '' ? String(raw) : null;
}

/** The primitive an option stands for: code, value, name or label of an object option. */
function optionValue(option: ParameterOption | null | undefined): unknown {
  if (option && typeof option === 'object') {
    return option.code ?? option.value ?? option.name ?? option.label ?? String(option);
  }
  return option;
}

/** What an option shows: label, then name, then the option itself. */
export function optionLabel(option: ParameterOption | null | undefined): string {
  const shown = option && typeof option === 'object' ? option.label ?? option.name ?? option : option;
  return shown === null || shown === undefined ? '' : String(shown);
}

/** Whether a number field accepts decimals (else it is integer-only and steps by 1). */
export function allowsDecimal(field: Pick<AlgorithmParameterField, 'key' | 'types'>): boolean {
  return !!field.types?.includes('real') || DECIMAL_KEYS.has(field.key);
}

/** Backend metadata has no advanced flag yet; the heuristic mirrors the review handoff. */
export function isAdvancedField(field: AlgorithmParameterField): boolean {
  return field.advanced ?? (field.default !== undefined && !field.required);
}

export function isCoxRegressionAlgorithm(algorithmName: string | null | undefined): boolean {
  return algorithmName === 'cox_regression_classical' || algorithmName === 'cox_regression_stacked';
}

/** Label of a group field (`groupA` / `groupB`) names the covariate the groups come from. */
export function parameterFieldLabel(field: EnrichedParameterField, firstCovariate: StudioVariable | undefined): string {
  let base = field.label ?? field.key;
  if (field.key === 'groupA' || field.key === 'groupB') {
    const covName = firstCovariate?.label || firstCovariate?.name || firstCovariate?.code;
    if (covName) base = `${base} (${covName})`;
  }
  return base;
}

/** The selected y / x variables as options, for `input_var_names` parameters (x when no role is named). */
function variableOptionsForRoles(roles: readonly string[], y: readonly StudioVariable[], x: readonly StudioVariable[]): CodeLabelOption[] {
  const roleList = roles.length ? roles : ['x'];
  return roleList.flatMap((role) => {
    const selected = role === 'y' ? y : role === 'x' ? x : [];
    return selected
      .map((item) => {
        const code = item?.code;
        if (code === null || code === undefined || code === '') return null;
        return { code: String(code), label: String(item?.label ?? item?.name ?? code) };
      })
      .filter((item): item is CodeLabelOption => !!item);
  });
}

/** Enumerations of the first variable in `role` (x for "x", y otherwise). */
function enumOptionsForRole(role: string | null | undefined, y: readonly StudioVariable[], x: readonly StudioVariable[]): ParameterOption[] {
  const selected = role === 'x' ? x[0] : y[0];
  return Array.isArray(selected?.enumerations) ? [...selected.enumerations] : [];
}

/** Distinct enumeration codes of the variable `varCode` among the selected variables. */
export function enumOptionsForVariableCode(varCode: string | null | undefined, variables: readonly StudioVariable[]): CodeLabelOption[] {
  if (!varCode) return [];
  const variable = variables.find((item) => String(item?.code) === String(varCode));
  if (!variable) return [];

  const enumerations = Array.isArray(variable.enumerations) ? variable.enumerations : [];
  const seen = new Set<string>();
  return enumerations
    .map((entry): CodeLabelOption | null => {
      const record = entry && typeof entry === 'object' ? entry : null;
      const code = nonBlankString(record?.code ?? record?.value ?? record?.name ?? record?.label);
      if (code === null || seen.has(code)) return null;
      seen.add(code);
      return { code, label: String(record?.label ?? record?.name ?? code) };
    })
    .filter((item): item is CodeLabelOption => !!item);
}

/** Selection context the parameter schema is enriched with. */
export interface ParameterSchemaContext {
  y: readonly StudioVariable[];
  x: readonly StudioVariable[];
  /** Live or stored `event_var` (Cox), which decides the `positive_class` options. */
  eventVarCode: string | null;
  /** Cross-validation is on and the method can toggle it: adds a Folds field when the schema has none. */
  withCrossValidationFolds: boolean;
}

/**
 * The algorithm's parameters as the form shows them: options from the selected variables
 * (`input_var_names`, `input_var_CDE_enums`, `category_order`, `positive_class`, y/x
 * placeholders, the y enumerations as a fallback for empty selects), a human label, a
 * description, and the Cox `positive_class` rules.
 */
export function enrichParameterSchema(algorithm: AlgorithmConfig, context: ParameterSchemaContext): EnrichedParameterField[] {
  const schema: AlgorithmParameterField[] = (algorithm.configSchema ?? []).map((field) => ({ ...field }));
  const { y, x } = context;
  const yVar = y[0];
  const xVar = x[0];
  const positiveClassOptions = enumOptionsForVariableCode(context.eventVarCode, [...y, ...x]);
  const isCox = isCoxRegressionAlgorithm(algorithm.name);

  const enriched = schema.map((field): EnrichedParameterField => {
    let options: ParameterOption[] = field.options ?? [];
    const enumSource = Array.isArray(field.enumSource) ? field.enumSource : [];

    if (field.enumType === 'input_var_names') {
      options = variableOptionsForRoles(enumSource, y, x);
    } else if (field.enumType === 'input_var_CDE_enums') {
      options = enumOptionsForRole(enumSource[0], y, x);
    } else if (field.key === 'category_order' && yVar?.enumerations?.length) {
      options = [...yVar.enumerations];
    } else if (field.key === 'positive_class' && positiveClassOptions.length) {
      options = positiveClassOptions;
    }

    // Placeholder substitution for enums
    if (Array.isArray(options) && options.length === 1) {
      const placeholder = options[0];
      if (placeholder === 'y' && yVar?.enumerations?.length) {
        options = [...yVar.enumerations];
      } else if (placeholder === 'x' && xVar?.enumerations?.length) {
        options = [...xVar.enumerations];
      }
    }

    // Fallback for empty select fields (not input_var_names — those list y/x variables)
    if (
      field.type === 'select' &&
      field.enumType !== 'input_var_names' &&
      (!options || options.length === 0) &&
      yVar?.enumerations?.length
    ) {
      options = [...yVar.enumerations];
    }

    const defaultValue = field.key === 'category_order' && Array.isArray(options) && options.length > 0
      ? options.map((option) => optionValue(option))
      : field.default;
    const label = field.label?.trim() || toHumanLabel(field.key);
    const desc =
      field.key === 'positive_class' && isCox
        ? 'Event level mapped to 1; other observed levels are mapped to 0.'
        : field.desc ?? field.description ?? '';
    const type = field.key === 'positive_class' && positiveClassOptions.length ? 'select' : field.type;
    const required =
      (field.key === 'positive_class' && isCox) ||
      field.required === true ||
      String(field.required ?? '').trim().toLowerCase() === 'true';

    return { ...field, label, desc, options, default: defaultValue, type, required };
  });

  if (context.withCrossValidationFolds && !enriched.some((field) => field.key === 'n_splits')) {
    enriched.push({
      key: 'n_splits',
      label: 'Folds',
      desc: 'Number of parts the data is split into; each part is held out once.',
      type: 'number',
      min: 2,
      default: 5,
    });
  }

  return enriched;
}

/** Identity of a built form: the form is rebuilt only when this changes. */
export function parameterFormSignature(algorithmName: string, crossValidation: boolean, schema: readonly AlgorithmParameterField[]): string {
  return JSON.stringify({
    algorithmName,
    crossValidation,
    fields: schema.map((field) => ({
      key: field.key,
      type: field.type,
      required: field.required,
      options: (field.options ?? []).map((option) => optionValue(option)),
    })),
  });
}

/**
 * The parameter form: one control per field, starting from the stored value, then the
 * backend default, then {@link UI_DEFAULTS}. Integer-only number fields get a pattern
 * validator. Controls that start valid are marked touched.
 */
export function buildParameterForm(schema: readonly EnrichedParameterField[], stored: Record<string, unknown>): FormGroup {
  const group: Record<string, FormControl> = {};

  schema.forEach((field) => {
    const storedValue = stored?.[field.key];
    const initialValue = storedValue !== undefined
      ? storedValue
      : field.default ?? UI_DEFAULTS[field.key] ?? (field.type === 'checkbox' ? false : '');
    const control = buildFormControl(field, initialValue);

    if (field.type === 'number' && !allowsDecimal(field)) {
      const integerPattern = Validators.pattern(/^-?\d+$/);
      const existingValidator = control.validator;
      control.setValidators(existingValidator ? [existingValidator, integerPattern] : [integerPattern]);
      control.updateValueAndValidity({ emitEvent: false });
    }

    group[field.key] = control;
  });

  const form = new FormGroup(group, { updateOn: 'change' });
  Object.values(form.controls).forEach((control) => {
    if (control.valid) {
      control.markAsTouched({ onlySelf: true });
    }
  });
  return form;
}

/** Form values as the request sends them: numbers parsed, enum values as codes, empty optionals dropped. */
export function normalizeParameterValues(values: Record<string, unknown>, schema: readonly EnrichedParameterField[]): Record<string, unknown> {
  const normalized = { ...values };
  schema
    .filter((field) => field?.type === 'number')
    .forEach((field) => {
      const key = String(field.key);
      const value = normalized[key];
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) normalized[key] = parsed;
    });

  schema.forEach((field) => {
    const key = String(field.key);
    if (!(key in normalized)) return;
    if (field?.type === 'select' || field?.type === 'multi-select' || key === 'positive_class') {
      normalized[key] = serializeAlgorithmParameterValue(normalized[key], field);
    }
  });

  return omitEmptyOptionalParameters(normalized, [...schema]);
}

/** A multi-select control value as a list of strings (arrays as is, comma-separated strings split). */
export function multiSelectValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === 'string' && value.trim() !== '') {
    return value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
  }
  return [];
}
