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

/**
 * Statistical types an algorithm input slot (`types`) can require. A slot matches a CDE
 * one-to-one: `numerical` accepts continuous and discrete, and `nominal`, `ordinal` and `binary`
 * each accept only their own CDE type. A nominal CDE never satisfies a binary or ordinal slot,
 * and nothing is converted between the categorical types.
 */
export type SlotStatType = 'numerical' | 'nominal' | 'ordinal' | 'binary';

export const CATEGORICAL_SLOT_STAT_TYPES: readonly SlotStatType[] = ['nominal', 'ordinal', 'binary'];
const SLOT_STAT_TYPES: readonly SlotStatType[] = ['numerical', ...CATEGORICAL_SLOT_STAT_TYPES];

function normalizeVariableType(type: unknown): string {
  return String(type ?? '').trim().toLowerCase();
}

export function isNumericalVariableType(type: unknown): boolean {
  return NUMERICAL_VARIABLE_TYPES.includes(normalizeVariableType(type));
}

export function isCategoricalVariableType(type: unknown): boolean {
  return CATEGORICAL_VARIABLE_TYPES.includes(normalizeVariableType(type));
}

/** The slot stattype a CDE type satisfies; null for a type the contract does not know. */
export function slotStatTypeOf(type: unknown): SlotStatType | null {
  const normalized = normalizeVariableType(type);
  if (isNumericalVariableType(normalized)) return 'numerical';
  return isCategoricalVariableType(normalized) ? (normalized as SlotStatType) : null;
}

/**
 * A categorical CDE without enumerations holds free text (e.g. a subject id).
 * Exaflow's request validator rejects it as an algorithm input.
 */
export function isFreeTextCde(variable: { type?: unknown; enumerations?: unknown[] | null } | null | undefined): boolean {
  return isCategoricalVariableType(variable?.type) && !variable?.enumerations?.length;
}

/** The part of an algorithm input slot (`y` / `x` of a specification) that decides what it accepts. */
export interface InputSlotSpec {
  /** Statistical types the slot accepts: `numerical`, `nominal`, `ordinal`, `binary`. */
  types?: readonly unknown[] | null;
}

function lowerCaseList(values: readonly unknown[] | null | undefined): string[] {
  return Array.isArray(values)
    ? values.map((value) => String(value ?? '').trim().toLowerCase()).filter((value) => value.length > 0)
    : [];
}

/** The statistical types a slot accepts, as declared by its `types`; empty when it constrains nothing. */
export function acceptedSlotStatTypes(slot: InputSlotSpec | null | undefined): SlotStatType[] {
  const declared = lowerCaseList(slot?.types);
  return SLOT_STAT_TYPES.filter((type) => declared.includes(type));
}

/**
 * Whether an algorithm input slot accepts a CDE of `type`: its statistical type must be one the
 * slot lists (exactly; `numerical` takes continuous and discrete). A slot that declares nothing
 * accepts any known type.
 */
export function specificationAcceptsVariableType(slot: InputSlotSpec | null | undefined, type: unknown): boolean {
  const stat = slotStatTypeOf(type);
  if (!stat) return false;
  const accepted = acceptedSlotStatTypes(slot);
  return accepted.length === 0 || accepted.includes(stat);
}

/** The statistical types a slot takes, for requirement messages. Empty when the slot constrains nothing. */
export function acceptedVariableTypes(slot: InputSlotSpec | null | undefined): string[] {
  return acceptedSlotStatTypes(slot);
}

/** `numerical`, `nominal`, `ordinal`, `binary` as readable text: "numerical, nominal or binary". */
export function formatSlotStatTypes(types: readonly string[]): string {
  const list = [...types];
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
}

/** What a variable of this type is called in a requirement message: its CDE type, or "unknown". */
export function describeVariableType(type: unknown): string {
  return normalizeVariableType(type) || 'unknown';
}

/**
 * Dataset code → readable label for one data model, from the catalog's `datasets` list and the
 * `dataset` CDE enumerations. Dataset codes are numeric ("12"); the label ("EDSD") is the name
 * users know, so anything that shows or searches datasets goes through this map.
 */
export function datasetLabelsOf(model: DataModel | null | undefined): Map<string, string> {
  const labels = new Map<string, string>();
  const add = (entry: unknown): void => {
    if (!entry || typeof entry !== 'object') return;
    const { code, label } = entry as { code?: unknown; label?: unknown };
    const key = code == null ? '' : String(code).trim();
    const text = label == null ? '' : String(label).trim();
    if (key && text && !labels.has(key)) labels.set(key, text);
  };
  const visit = (variables: unknown, groups: unknown): void => {
    for (const variable of Array.isArray(variables) ? variables : []) {
      if (String(variable?.code ?? '').toLowerCase() === 'dataset') {
        (Array.isArray(variable.enumerations) ? variable.enumerations : []).forEach(add);
      }
    }
    for (const group of Array.isArray(groups) ? groups : []) visit(group?.variables, group?.groups);
  };
  (Array.isArray(model?.datasets) ? (model.datasets as unknown[]) : []).forEach(add);
  visit(model?.variables, model?.groups);
  return labels;
}
