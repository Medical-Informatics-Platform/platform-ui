/**
 * Catalog-driven editor model for pipeline steps that have no dedicated station.
 *
 * Every step the engine lists in `/services/specifications/preprocessing` (the endpoint keeps that
 * name) must be selectable and configurable. Steps with a bespoke station (missing values, outlier
 * winsorizer, longitudinal, transformer, scaler and the column creators) keep it; every other step
 * gets a form built from its parameter schema, and its payload is built here so it matches the
 * schema exactly.
 *
 * The studio sorts the steps into two stages by what they do to the data:
 *  - Preprocessing tweaks an existing variable in place and keeps its meaning and range
 *    (missing values, clipping outliers).
 *  - Data transformation creates a new column, or changes what a variable means (its range, scale
 *    or type), so analyses read a different quantity than the one that was collected.
 */

import { RawParameter, RawPreprocessingStep } from '../models/backend-algorithms.model';
import { CREATOR_NAMES, CreatorName } from './transformation-steps.utils';

/** Singleton steps that own a dedicated station. Their requests are built by the panel. */
export const DEDICATED_SINGLETON_STEPS: ReadonlySet<string> = new Set([
  'missing_values_handler',
  'outlier_winsorizer',
  'longitudinal_transformer',
  'variable_transformer',
  'variable_scaler',
]);

/** The pipeline stage a step belongs to; see the file header for the rule. */
export type StepStage = 'preprocessing' | 'transformation';

/**
 * Steps edited in place that keep the variable's meaning and range: the Preprocessing stage.
 * Every other step creates a column or changes a variable's meaning, range or type and belongs to
 * the Data transformation stage. A step the engine adds later lands in Data transformation until it
 * is classified here, because most new steps derive features.
 */
const PREPROCESSING_STEPS: ReadonlySet<string> = new Set([
  'missing_values_handler',
  'outlier_winsorizer',
  'global_imputer',
  'global_winsorizer',
]);

export function stepStage(name: string): StepStage {
  return PREPROCESSING_STEPS.has(name) ? 'preprocessing' : 'transformation';
}

/**
 * Singleton steps of the Data transformation stage: every non-creator step outside the
 * Preprocessing stage. The three column creators are an ordered list of their own.
 */
export function isTransformationSingleton(name: string): boolean {
  return !CREATOR_NAMES.has(name as CreatorName) && stepStage(name) === 'transformation';
}

/** Singleton steps of the Preprocessing stage: edited in place, same meaning and range. */
export function isPreprocessingSingleton(name: string): boolean {
  return !CREATOR_NAMES.has(name as CreatorName) && stepStage(name) === 'preprocessing';
}

/**
 * One line shown on a station when its position needs explaining: the stage rule does not cover
 * every setting of the step, or the run order differs from the order of the stages.
 */
const STEP_NOTES: Readonly<Record<string, string>> = {
  missing_indicator: 'Runs before missing values are handled, so it sees the gaps that were in the data.',
  outlier_detector:
    'Flag adds a 0/1 column and keeps every value. Drop and Set missing edit the data in place instead (rows removed or values blanked).',
};

export function stepNote(name: string): string {
  return STEP_NOTES[name] ?? '';
}

/** True when a catalog step is rendered by the generic, schema-driven station. */
export function isGenericCatalogStep(name: string): boolean {
  return !DEDICATED_SINGLETON_STEPS.has(name) && !CREATOR_NAMES.has(name as CreatorName);
}

/** Which selected variables a step can act on. Unlisted steps accept any and let the engine validate. */
export type StepVariableScope = 'any' | 'numerical' | 'categorical';

const STEP_VARIABLE_SCOPE: Readonly<Record<string, StepVariableScope>> = {
  outlier_detector: 'numerical',
  global_winsorizer: 'numerical',
  one_hot_encoder: 'categorical',
  ordinal_encoder: 'categorical',
};

export function stepVariableScope(name: string): StepVariableScope {
  return STEP_VARIABLE_SCOPE[name] ?? 'any';
}

/**
 * Generic steps that must run before the missing-values steps: a missing indicator placed after
 * an imputation or drop would flag nothing. Everything else keeps its stored order.
 */
export const STEPS_BEFORE_IMPUTATION: ReadonlySet<string> = new Set(['missing_indicator']);

export type StepFieldKind =
  | 'enum'
  | 'text'
  | 'int'
  | 'real'
  | 'bool'
  /** Free list of values, typed in as comma separated text. */
  | 'list'
  /** A subset of the selected variables, sent as a list of codes. */
  | 'variables'
  /** One value per selected variable, sent as `{code: value}`. */
  | 'variable-map'
  /** Needs a dedicated editor (reusable fitted recipes, filter rules, ...). */
  | 'unsupported';

export interface StepField {
  key: string;
  label: string;
  description: string;
  kind: StepFieldKind;
  required: boolean;
  /** Scalar kind of each item of a list / each value of a variable map. */
  itemKind: 'enum' | 'text' | 'int' | 'real' | 'bool';
  options: string[];
  min: number | null;
  max: number | null;
  defaultValue: unknown;
}

/** Form state: strings for text-like inputs, booleans, string lists, or code→string maps. */
export type StepFormValues = Record<string, unknown>;

/** Parameter names that hold variable codes rather than free text. */
const VARIABLE_LIST_KEYS = new Set(['variables', 'columns', 'features', 'variable_names']);

function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 'True';
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function listOptions(definition: { type?: string; source?: unknown } | undefined | null): string[] {
  if (!definition || definition.type !== 'list' || !Array.isArray(definition.source)) return [];
  return definition.source.map((item) => String(item));
}

function scalarKind(type: string | undefined): StepField['itemKind'] {
  switch ((type ?? 'text').toLowerCase()) {
    case 'int':
      return 'int';
    case 'real':
    case 'float':
      return 'real';
    case 'bool':
    case 'boolean':
      return 'bool';
    default:
      return 'text';
  }
}

function buildField(key: string, raw: RawParameter): StepField {
  const type = String(raw.types?.[0] ?? 'text').toLowerCase();
  const options = listOptions(raw.enums);
  const base = {
    key,
    label: raw.label || key,
    description: raw.desc || '',
    required: raw.required === true || raw.required === 'true',
    options,
    min: toNumber(raw.min),
    max: toNumber(raw.max),
    defaultValue: raw.default ?? raw.default_value ?? null,
  };
  const multiple = raw.multiple === true || raw.multiple === 'true';

  if (type === 'dict') {
    const keys = raw.dict_keys_enums;
    const valueOptions = listOptions(raw.dict_values_enums);
    const keyedByVariable = keys?.type === 'input_var_names' || keys?.type === 'variables';
    if (!keyedByVariable) return { ...base, kind: 'unsupported', itemKind: 'text', options: [] };
    const valueType = scalarKind(raw.dict_values_type === 'boolean' ? 'bool' : raw.dict_values_type);
    return {
      ...base,
      kind: 'variable-map',
      itemKind: valueOptions.length ? 'enum' : valueType,
      options: valueOptions,
    };
  }

  const itemKind: StepField['itemKind'] = options.length ? 'enum' : scalarKind(type);
  if (type === 'filter' || type === 'json' || raw.enums?.type === 'fixed_var_CDE_enums' && multiple) {
    return { ...base, kind: 'unsupported', itemKind: 'text', options: [] };
  }
  if (multiple) {
    const namesVariables = raw.enums?.type === 'input_var_names' || raw.enums?.type === 'variables';
    return {
      ...base,
      kind: namesVariables || VARIABLE_LIST_KEYS.has(key) ? 'variables' : 'list',
      itemKind,
    };
  }
  if (itemKind === 'enum') return { ...base, kind: 'enum', itemKind };
  return { ...base, kind: itemKind, itemKind };
}

/** The fields of a step, in schema order. */
export function stepFields(spec: RawPreprocessingStep | null | undefined): StepField[] {
  const parameters = spec?.parameters ?? {};
  return Object.entries(parameters).map(([key, raw]) => buildField(key, raw as RawParameter));
}

/** A required field this form cannot fill in blocks Apply: the engine would reject the step. */
export function unsupportedRequiredFields(fields: StepField[]): StepField[] {
  return fields.filter((field) => field.kind === 'unsupported' && field.required);
}

/** Empty form: schema defaults for scalar fields, nothing selected for the rest. */
export function defaultStepValues(fields: StepField[]): StepFormValues {
  const values: StepFormValues = {};
  for (const field of fields) {
    switch (field.kind) {
      case 'bool':
        values[field.key] = field.defaultValue === null ? false : toBool(field.defaultValue);
        break;
      case 'variables':
        values[field.key] = [];
        break;
      case 'variable-map':
        values[field.key] = {};
        break;
      case 'list':
        values[field.key] = Array.isArray(field.defaultValue) ? field.defaultValue.join(', ') : '';
        break;
      case 'unsupported':
        break;
      default:
        values[field.key] = field.defaultValue === null || field.defaultValue === undefined
          ? ''
          : String(field.defaultValue);
    }
  }
  return values;
}

function parseScalar(
  kind: StepField['itemKind'],
  raw: unknown,
  field: StepField,
  label: string,
  errors: Record<string, string>,
): string | number | boolean | null {
  const text = typeof raw === 'string' ? raw.trim() : raw;
  if (kind === 'bool') return toBool(text);
  if (text === '' || text === null || text === undefined) return null;
  if (kind === 'int' || kind === 'real') {
    const n = Number(text);
    if (!Number.isFinite(n)) {
      errors[field.key] = `${label} must be a number.`;
      return null;
    }
    if (kind === 'int' && !Number.isInteger(n)) {
      errors[field.key] = `${label} must be a whole number.`;
      return null;
    }
    if (field.min !== null && n < field.min) {
      errors[field.key] = `${label} must be at least ${field.min}.`;
      return null;
    }
    if (field.max !== null && n > field.max) {
      errors[field.key] = `${label} must be at most ${field.max}.`;
      return null;
    }
    return n;
  }
  return String(text);
}

export interface BuiltStepParameters {
  parameters: Record<string, unknown>;
  errors: Record<string, string>;
}

/**
 * The request parameters of a step from its form state. Empty optional fields are left out so
 * the engine's own defaults apply; a required field left empty is an error, never a guess.
 */
export function buildStepParameters(
  fields: StepField[],
  values: StepFormValues,
  selectedCodes: ReadonlySet<string> | null = null,
): BuiltStepParameters {
  const parameters: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const raw = values[field.key];
    const missing = `${field.label} is required.`;
    switch (field.kind) {
      case 'unsupported':
        break;
      case 'bool':
        // A boolean is always a decision, so it is sent.
        parameters[field.key] = toBool(raw);
        break;
      case 'variables': {
        const codes = (Array.isArray(raw) ? raw : []).map(String)
          .filter((code) => !selectedCodes || selectedCodes.has(code));
        if (codes.length) parameters[field.key] = codes;
        else if (field.required) errors[field.key] = missing;
        break;
      }
      case 'list': {
        const items = String(raw ?? '').split(',').map((item) => item.trim()).filter(Boolean);
        const parsed = items
          .map((item) => parseScalar(field.itemKind, item, field, field.label, errors))
          .filter((item) => item !== null);
        if (parsed.length) parameters[field.key] = parsed;
        else if (field.required && !errors[field.key]) errors[field.key] = missing;
        break;
      }
      case 'variable-map': {
        const map: Record<string, unknown> = {};
        for (const [code, entry] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
          if (selectedCodes && !selectedCodes.has(code)) continue;
          const value = parseScalar(field.itemKind, entry, field, `${field.label} (${code})`, errors);
          if (value !== null && value !== '') map[code] = value;
        }
        if (Object.keys(map).length) parameters[field.key] = map;
        else if (field.required) errors[field.key] = missing;
        break;
      }
      default: {
        const value = parseScalar(field.kind === 'enum' ? 'text' : field.itemKind, raw, field, field.label, errors);
        if (value !== null && value !== '') parameters[field.key] = value;
        else if (field.required && !errors[field.key]) errors[field.key] = missing;
      }
    }
  }
  return { parameters, errors };
}

/** Form state for a saved/applied step: the inverse of `buildStepParameters`. */
export function stepValuesFromParameters(
  fields: StepField[],
  parameters: Record<string, unknown> | null | undefined,
): StepFormValues {
  const values = defaultStepValues(fields);
  if (!parameters) return values;
  for (const field of fields) {
    const raw = parameters[field.key];
    if (raw === undefined || raw === null) {
      if (field.kind !== 'bool') continue;
    }
    switch (field.kind) {
      case 'bool':
        values[field.key] = raw === undefined || raw === null ? values[field.key] : toBool(raw);
        break;
      case 'variables':
        values[field.key] = Array.isArray(raw) ? raw.map(String) : [];
        break;
      case 'list':
        values[field.key] = Array.isArray(raw) ? raw.join(', ') : '';
        break;
      case 'variable-map':
        values[field.key] = raw && typeof raw === 'object' && !Array.isArray(raw)
          ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
          : {};
        break;
      case 'unsupported':
        break;
      default:
        values[field.key] = String(raw);
    }
  }
  return values;
}

/**
 * Keep a step's variable-bound parameters on the variables still selected. Returns null when a
 * required variable parameter ends up empty, so the step leaves the request instead of failing it.
 */
export function filterStepParameters(
  fields: StepField[],
  parameters: Record<string, unknown>,
  allowedCodes: ReadonlySet<string>,
): Record<string, unknown> | null {
  const next: Record<string, unknown> = { ...parameters };
  for (const field of fields) {
    const raw = parameters[field.key];
    if (field.kind === 'variables' && Array.isArray(raw)) {
      const kept = raw.filter((code) => allowedCodes.has(String(code)));
      if (kept.length) next[field.key] = kept;
      else {
        delete next[field.key];
        if (field.required) return null;
      }
    }
    if (field.kind === 'variable-map' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const kept = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).filter(([code]) => allowedCodes.has(code)),
      );
      if (Object.keys(kept).length) next[field.key] = kept;
      else {
        delete next[field.key];
        if (field.required) return null;
      }
    }
  }
  return next;
}

function humanize(text: string): string {
  return text.replace(/_/g, ' ');
}

/** Readable lines of a step's parameters for the run summary, with variable labels. */
export function summarizeStepParameters(
  parameters: Record<string, unknown> | null | undefined,
  labelMap: Record<string, string> = {},
): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(parameters ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      lines.push(`${humanize(key)}: ${value.map((item) => labelMap[String(item)] ?? String(item)).join(', ')}`);
    } else if (typeof value === 'object') {
      for (const [code, entry] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`${labelMap[code] ?? code}: ${humanize(String(entry))}`);
      }
    } else {
      lines.push(`${humanize(key)}: ${humanize(String(value))}`);
    }
  }
  return lines;
}
