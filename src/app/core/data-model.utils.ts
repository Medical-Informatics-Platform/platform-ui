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
 * Statistical types an algorithm input slot (`stattypes`) can require. A slot matches a CDE
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

/** The parts of an algorithm input slot (`y` / `x` of a specification) that decide what it accepts. */
export interface InputSlotSpec {
  types?: readonly unknown[] | null;
  stattypes?: readonly unknown[] | null;
}

function lowerCaseList(values: readonly unknown[] | null | undefined): string[] {
  return Array.isArray(values)
    ? values.map((value) => String(value ?? '').trim().toLowerCase()).filter((value) => value.length > 0)
    : [];
}

/**
 * The stattypes a slot accepts, as declared by its `stattypes`.
 *
 * Compatibility: a slot without `stattypes` predates one-to-one matching, when the value `types`
 * were the only constraint and `text` meant "any categorical variable". Such a slot is read as
 * accepting every categorical type whenever `types` lists `text`, and `numerical` whenever it
 * lists `real` or `int`. A slot with neither constrains nothing (empty list).
 */
export function acceptedSlotStatTypes(slot: InputSlotSpec | null | undefined): SlotStatType[] {
  const declared = lowerCaseList(slot?.stattypes).filter((type): type is SlotStatType =>
    SLOT_STAT_TYPES.includes(type as SlotStatType)
  );
  if (declared.length > 0) return SLOT_STAT_TYPES.filter((type) => declared.includes(type));

  const types = lowerCaseList(slot?.types);
  const accepted = new Set<SlotStatType>();
  if (types.includes('real') || types.includes('int') || types.includes('integer')) accepted.add('numerical');
  if (types.includes('text') || types.includes('nominal')) CATEGORICAL_SLOT_STAT_TYPES.forEach((type) => accepted.add(type));
  return SLOT_STAT_TYPES.filter((type) => accepted.has(type));
}

/**
 * Whether an algorithm input slot accepts a CDE of `type`: its stattype must be one the slot
 * lists (exactly), and a numerical CDE must also fit the slot's value `types` (continuous needs
 * `real`; discrete needs `int` or `real`). A slot that declares nothing accepts any known type.
 */
export function specificationAcceptsVariableType(slot: InputSlotSpec | null | undefined, type: unknown): boolean {
  const stat = slotStatTypeOf(type);
  if (!stat) return false;

  const accepted = acceptedSlotStatTypes(slot);
  if (accepted.length > 0 && !accepted.includes(stat)) return false;

  const types = lowerCaseList(slot?.types);
  if (stat === 'numerical' && types.length > 0 && accepted.length > 0) {
    const normalized = normalizeVariableType(type);
    const hasReal = types.includes('real');
    const hasInt = types.includes('int') || types.includes('integer');
    return normalized === 'continuous' ? hasReal : hasInt || hasReal;
  }
  return true;
}

/**
 * The CDE types a slot takes, for requirement messages: `numerical` when both continuous and
 * discrete fit, `continuous` or `discrete` when the slot's value `types` allow only one, and
 * `nominal`, `ordinal`, `binary` as listed. Empty when the slot constrains nothing.
 */
export function acceptedVariableTypes(slot: InputSlotSpec | null | undefined): string[] {
  const accepted = acceptedSlotStatTypes(slot);
  const types = lowerCaseList(slot?.types);
  return accepted.flatMap((stat) => {
    if (stat !== 'numerical' || types.length === 0 || types.includes('real')) return [stat];
    // Without `real`, a numerical slot takes only the discrete CDEs.
    return types.includes('int') || types.includes('integer') ? ['discrete'] : [stat];
  });
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
