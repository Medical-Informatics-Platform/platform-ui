import { DataModel, Group, Variable } from '../models/data-model.interface';

/**
 * CDE enumeration codes.
 *
 * Every non-continuous CDE (discrete, nominal, ordinal, binary) and the `dataset` CDE carries
 * integer codes; the enumeration `label` holds the readable level. A binary CDE has exactly the
 * codes 0 and 1.
 *
 * Representation: the data catalog (platform-backend `EnumerationDTO`) sends a code as a string,
 * and every consumer that names a level (algorithm parameters such as `positive_class`, result
 * keys, enum maps) works with text codes, so the app keeps a code as the string of an integer
 * (`"1"`). A JSON number is converted to that string at the boundary. Only filter rule values
 * are sent as JSON integers, because Exaflow type-checks them against the integer column
 * (see `enumerationCodeAsInteger`).
 */

const INTEGER_CODE = /^-?\d+$/;

/** Types whose enumeration codes must be integers. */
const INTEGER_CODED_TYPES: readonly string[] = ['discrete', 'nominal', 'ordinal', 'binary'];

/**
 * Identifier columns the catalog may still hold with text codes (visit names such as `BL`).
 * Their codes are not reported as contract violations.
 */
const IDENTIFIER_VARIABLE_CODES: readonly string[] = ['subjectid', 'subjectcode', 'visitid'];

const BINARY_CODES: readonly string[] = ['0', '1'];

/** Legacy `type` values from before the single-type CDE contract, and what they became. */
const LEGACY_TYPE_MAP: Readonly<Record<string, string>> = {
  real: 'continuous',
  float: 'continuous',
  integer: 'discrete',
  int: 'discrete',
  text: 'nominal',
};

interface EnumerationLike {
  code?: unknown;
  label?: unknown;
  [key: string]: unknown;
}

interface VariableLike {
  code?: unknown;
  type?: unknown;
  enumerations?: unknown;
  isCreatedColumn?: unknown;
}

function normalizedType(type: unknown): string {
  return String(type ?? '').trim().toLowerCase();
}

/** The code as the app holds it: trimmed text; a JSON number becomes its decimal string. */
export function normalizeEnumerationCode(code: unknown): string {
  if (typeof code === 'number') return Number.isFinite(code) ? String(code) : '';
  return String(code ?? '').trim();
}

export function isIntegerEnumerationCode(code: unknown): boolean {
  return INTEGER_CODE.test(normalizeEnumerationCode(code));
}

/** A level code as the JSON integer a filter rule on an integer-coded CDE needs; null otherwise. */
export function enumerationCodeAsInteger(code: unknown): number | null {
  const text = normalizeEnumerationCode(code);
  if (!INTEGER_CODE.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/** Enumerations as a list; the catalog may hand over a `{code: label}` map. */
function enumerationList(value: unknown): EnumerationLike[] {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry && typeof entry === 'object' ? (entry as EnumerationLike) : { code: entry, label: entry }
    );
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([code, label]) => ({ code, label }));
  }
  return [];
}

function isIdentifierVariable(variable: VariableLike): boolean {
  return IDENTIFIER_VARIABLE_CODES.includes(String(variable.code ?? '').trim().toLowerCase());
}

/** Whether the variable's enumeration codes fall under the integer-code contract. */
export function requiresIntegerEnumerationCodes(variable: VariableLike | null | undefined): boolean {
  if (!variable || variable.isCreatedColumn === true) return false;
  return INTEGER_CODED_TYPES.includes(normalizedType(variable.type)) && !isIdentifierVariable(variable);
}

/**
 * Mirrors Exaflow's `is_integer_coded`: a categorical CDE whose declared codes are all integers
 * is an INTEGER column. Created columns (K-means clusters, rule categories) hold text codes.
 */
export function isIntegerCoded(variable: VariableLike | null | undefined): boolean {
  if (!variable || variable.isCreatedColumn === true) return false;
  if (!['nominal', 'ordinal', 'binary'].includes(normalizedType(variable.type))) return false;
  if (isIdentifierVariable(variable)) return false;
  const entries = enumerationList(variable.enumerations);
  return entries.length > 0 && entries.every((entry) => isIntegerEnumerationCode(entry.code));
}

/** What is wrong with the variable's enumeration codes; an empty list when it follows the contract. */
export function enumerationCodeIssues(variable: VariableLike | null | undefined): string[] {
  if (!variable || !requiresIntegerEnumerationCodes(variable)) return [];
  const entries = enumerationList(variable.enumerations);
  if (entries.length === 0) return [];

  const issues: string[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const nonInteger: string[] = [];
  for (const entry of entries) {
    const code = normalizeEnumerationCode(entry.code);
    if (!INTEGER_CODE.test(code)) {
      nonInteger.push(code === '' ? '(empty)' : code);
      continue;
    }
    const canonical = String(Number(code));
    if (seen.has(canonical)) duplicates.add(canonical);
    seen.add(canonical);
  }
  if (nonInteger.length > 0) {
    issues.push(`enumeration codes must be integers, got ${nonInteger.map((code) => `"${code}"`).join(', ')}`);
  }
  if (duplicates.size > 0) {
    issues.push(`duplicate enumeration codes ${Array.from(duplicates).map((code) => `"${code}"`).join(', ')}`);
  }
  if (normalizedType(variable.type) === 'binary') {
    const outside = Array.from(seen).filter((code) => !BINARY_CODES.includes(code));
    if (outside.length > 0) {
      issues.push(`binary enumeration codes must be 0 and 1, got ${outside.map((code) => `"${code}"`).join(', ')}`);
    }
  }
  return issues;
}

/** Enumerations with every code as a trimmed string; labels and other fields are untouched. */
export function normalizeEnumerations<T extends EnumerationLike>(value: unknown): T[] {
  return enumerationList(value).map((entry) => ({ ...entry, code: normalizeEnumerationCode(entry.code) }) as T);
}

/**
 * Describes an outdated CDE shape: `sql_type` / `is_categorical` fields, or a `type` from before
 * the single-type contract (`real`, `integer`, `text`). Empty when the shape is current.
 */
export function legacyCdeShapeIssues(variable: Record<string, unknown> | null | undefined): string[] {
  if (!variable) return [];
  const issues: string[] = [];
  for (const field of ['sql_type', 'sqlType', 'is_categorical', 'isCategorical']) {
    if (variable[field] !== undefined && variable[field] !== null) issues.push(`has the retired field ${field}`);
  }
  const type = normalizedType(variable['type']);
  if (type in LEGACY_TYPE_MAP) issues.push(`has the retired type "${type}"`);
  return issues;
}

function currentType(variable: Record<string, unknown>): unknown {
  const type = normalizedType(variable['type']);
  if (type in LEGACY_TYPE_MAP) return LEGACY_TYPE_MAP[type];
  const flag = variable['is_categorical'] ?? variable['isCategorical'];
  if (!type && (flag === true || String(flag).toLowerCase() === 'true' || flag === 1)) return 'nominal';
  return variable['type'];
}

export interface CdeMetadataIssue {
  dataModel: string;
  variable: string;
  message: string;
}

/**
 * The boundary for catalog metadata: returns the variable in the current shape (legacy type
 * names mapped, enumeration codes as strings) and what does not follow the contract. A variable
 * that violates the contract is kept as received so nothing disappears from the UI.
 */
export function normalizeCdeVariable<T extends object>(variable: T): { variable: T; issues: string[] } {
  const raw = variable as unknown as Record<string, unknown>;
  const issues = [...legacyCdeShapeIssues(raw)];
  const next: Record<string, unknown> = { ...raw };
  const type = currentType(raw);
  if (type !== undefined) next['type'] = type;
  for (const field of ['sql_type', 'sqlType', 'is_categorical', 'isCategorical']) delete next[field];
  if (raw['enumerations'] !== undefined && raw['enumerations'] !== null) {
    next['enumerations'] = normalizeEnumerations(raw['enumerations']);
  }
  issues.push(...enumerationCodeIssues(next as VariableLike));
  return { variable: next as unknown as T, issues };
}

function normalizeGroup(group: Group, dataModel: string, issues: CdeMetadataIssue[]): Group {
  return {
    ...group,
    variables: group.variables?.map((variable) => normalizeVariable(variable, dataModel, issues)),
    groups: group.groups?.map((child) => normalizeGroup(child, dataModel, issues)),
  };
}

function normalizeVariable(variable: Variable, dataModel: string, issues: CdeMetadataIssue[]): Variable {
  const result = normalizeCdeVariable(variable);
  for (const message of result.issues) {
    issues.push({ dataModel, variable: String(variable.code ?? variable.label ?? ''), message });
  }
  return result.variable;
}

/** Normalizes every variable of a data model (and its dataset enumerations) at load time. */
export function normalizeDataModelCdes(model: DataModel): { model: DataModel; issues: CdeMetadataIssue[] } {
  const issues: CdeMetadataIssue[] = [];
  const name = `${model.code ?? model.label ?? ''}${model.version ? ':' + model.version : ''}`;
  const next: DataModel = {
    ...model,
    variables: model.variables?.map((variable) => normalizeVariable(variable, name, issues)),
    groups: model.groups?.map((group) => normalizeGroup(group, name, issues)),
  };
  const datasets: unknown = model.datasets;
  if (Array.isArray(datasets) && datasets.some((entry) => entry && typeof entry === 'object')) {
    const asDataset = { code: 'dataset', type: 'nominal', enumerations: datasets } as VariableLike;
    for (const message of enumerationCodeIssues(asDataset)) {
      issues.push({ dataModel: name, variable: 'dataset', message });
    }
    (next as { datasets?: unknown }).datasets = normalizeEnumerations(datasets);
  }
  return { model: next, issues };
}

/** One line per data model for the user-facing notice. */
export function summarizeCdeMetadataIssues(issues: readonly CdeMetadataIssue[]): string {
  if (issues.length === 0) return '';
  const first = issues[0];
  const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : '';
  return (
    `Data model metadata does not follow the current CDE format: ${first.dataModel} · ${first.variable} ` +
    `${first.message}${more}. Values are shown as received; ask the data model owner to update the metadata.`
  );
}
