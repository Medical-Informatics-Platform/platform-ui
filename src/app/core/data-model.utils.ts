import { DataModel } from '../models/data-model.interface';
import { EnumMaps } from './algorithm-result-enum-mapper';

/**
 * Find a data model by its "code:version" string (e.g. "Stroke:3.7").
 * Returns null when no model matches or the input is empty.
 */
export function findDataModelByCodeVersion(
  codeVersion: string,
  models: DataModel[]
): DataModel | null {
  if (!codeVersion) return null;
  const [code, version] = codeVersion.split(':');
  return (
    models.find((m) => m.code === code && String(m.version) === String(version)) ?? null
  );
}

/**
 * Build an enum-map (variable code -> { enumCode -> label }) from a converted
 * D3 hierarchy's variables. Variables without enumerations or without a code
 * are skipped; empty enum maps are dropped.
 */
export function buildEnumMapForVariables(
  allVariables: Array<{ code?: unknown; enumerations?: Array<{ code?: unknown; label?: unknown; name?: unknown }> }>
): EnumMaps {
  const maps: EnumMaps = {};
  for (const v of allVariables) {
    const enums = Array.isArray(v.enumerations) ? v.enumerations : [];
    if (!enums.length) continue;

    const code = String(v.code ?? '');
    if (!code) continue;

    const enumMap: Record<string, string> = {};
    for (const e of enums) {
      const raw = e?.code ?? e?.label ?? e?.name;
      if (raw === null || raw === undefined) continue;
      const key = String(raw);
      enumMap[key] = String(e?.label ?? e?.name ?? raw);
    }

    if (Object.keys(enumMap).length > 0) {
      maps[code] = enumMap;
    }
  }
  return maps;
}

/**
 * Count the leaf nodes in a (possibly nested) tree. A node without children
 * counts as one leaf.
 */
export function countLeafNodes(node: unknown): number {
  const children = (node as { children?: unknown[] } | null | undefined)?.children;
  if (!children || children.length === 0) {
    return 1;
  }
  return children.reduce((total: number, child) => total + countLeafNodes(child), 0);
}

/**
 * CDE variable types. `type` is the only typing field a CDE carries: numerical
 * `continuous`/`discrete`, categorical `nominal`/`ordinal`/`binary`.
 */
export const NUMERICAL_VARIABLE_TYPES: readonly string[] = ['continuous', 'discrete'];
export const CATEGORICAL_VARIABLE_TYPES: readonly string[] = ['nominal', 'ordinal', 'binary'];

/** Algorithm specifications still declare input `types` as `real`, `int`, or `text`. */
const SPECIFICATION_TYPE_BY_VARIABLE_TYPE: Readonly<Record<string, string>> = {
  continuous: 'real',
  discrete: 'int',
  nominal: 'text',
  ordinal: 'text',
  binary: 'text',
};

function normalizeVariableType(type: unknown): string {
  return String(type ?? '').trim().toLowerCase();
}

export function isNumericalVariableType(type: unknown): boolean {
  return NUMERICAL_VARIABLE_TYPES.includes(normalizeVariableType(type));
}

export function isCategoricalVariableType(type: unknown): boolean {
  return CATEGORICAL_VARIABLE_TYPES.includes(normalizeVariableType(type));
}

/**
 * A categorical CDE without enumerations holds free text (e.g. a subject id).
 * Exaflow's request validator rejects it as an algorithm input.
 */
export function isFreeTextCde(variable: { type?: unknown; enumerations?: unknown[] | null } | null | undefined): boolean {
  return isCategoricalVariableType(variable?.type) && !variable?.enumerations?.length;
}

/**
 * Whether an algorithm input declaring `specTypes` accepts a CDE of `type`:
 * continuous → real, discrete → int (also accepted by real slots), categorical → text.
 */
export function specificationAcceptsVariableType(specTypes: readonly string[], type: unknown): boolean {
  const specType = SPECIFICATION_TYPE_BY_VARIABLE_TYPE[normalizeVariableType(type)];
  if (!specType) return false;
  return specTypes.includes(specType) || (specType === 'int' && specTypes.includes('real'));
}
