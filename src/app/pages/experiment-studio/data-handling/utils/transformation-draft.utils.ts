import { CategoryFilter, TransformationColumnDraft } from '../data-handling.models';

let transformationDraftSeq = 0;

/** Ids are unique per page load; they key the stage's cards and their template tracking. */
export function nextTransformationDraftId(): number {
  return ++transformationDraftSeq;
}

/** A blank "Create new categorical column" card with a fresh id, open on its editor. */
export function emptyTransformationDraft(): TransformationColumnDraft {
  return { id: nextTransformationDraftId(), code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null };
}

/** The exaflow config of one derived column (`filter_rules` strategy). */
export type TransformationColumnConfig = {
  code: string;
  strategy: 'filter_rules';
  rules: Record<string, CategoryFilter>;
  default_enumeration?: string;
};

/** A card's chip: Applied, Duplicate name, Not applied or Not set. */
export interface TransformationDraftStatus {
  label: 'Applied' | 'Duplicate name' | 'Not applied' | 'Not set';
  tone: 'applied' | 'pending' | 'default';
}

/** A draft counts as touched once the user typed any column name, default, or rule. */
export function draftHasWork(draft: TransformationColumnDraft): boolean {
  return (
    draft.code.trim().length > 0 ||
    draft.defaultEnumeration.trim().length > 0 ||
    draft.rules.some((rule) => rule.value.trim().length > 0 || !!rule.filter)
  );
}

/** A category without a name or a rule is left out of the saved column. */
export function hasUnfinishedCategory(draft: TransformationColumnDraft): boolean {
  return draft.rules.some((rule) => !rule.value.trim() || !rule.filter);
}

/** The exaflow config for one card, or null while it has no name or no complete category. */
export function transformationConfigFor(draft: TransformationColumnDraft): TransformationColumnConfig | null {
  const code = draft.code.trim();
  if (!code) return null;
  const rules: Record<string, CategoryFilter> = {};
  for (const rule of draft.rules) {
    const value = rule.value.trim();
    if (value && rule.filter) rules[value] = rule.filter;
  }
  if (!Object.keys(rules).length) return null;
  const config: TransformationColumnConfig = { code, strategy: 'filter_rules', rules };
  const fallback = draft.defaultEnumeration.trim();
  if (fallback) config.default_enumeration = fallback;
  return config;
}

/**
 * Per-card chip: Applied only when every category is complete and the name is unique
 * among `all`. An unfinished row is omitted from the saved column, so it must not leave
 * the chip on Applied.
 */
export function transformationDraftStatus(
  draft: TransformationColumnDraft,
  all: readonly TransformationColumnDraft[],
): TransformationDraftStatus {
  const code = draft.code.trim();
  const isDuplicate = !!code && all.some((other) => other !== draft && other.code.trim() === code);
  if (!hasUnfinishedCategory(draft) && transformationConfigFor(draft)) {
    return isDuplicate ? { label: 'Duplicate name', tone: 'pending' } : { label: 'Applied', tone: 'applied' };
  }
  if (draftHasWork(draft) || isDuplicate) return { label: 'Not applied', tone: 'pending' };
  return { label: 'Not set', tone: 'default' };
}

/** Two columns cannot share a name: exaflow errors when `code` already exists. */
export function hasDuplicateColumnCodes(drafts: readonly TransformationColumnDraft[]): boolean {
  const codes = drafts.map((draft) => draft.code.trim()).filter((code) => code.length > 0);
  return new Set(codes).size !== codes.length;
}

/** The first condition of a (possibly nested) rule group, depth first. */
export function firstFilterCondition(filter: unknown): { field: string; operator: string; value: unknown } | null {
  if (!filter || typeof filter !== 'object') return null;
  const node = filter as { field?: unknown; operator?: unknown; value?: unknown; rules?: unknown[] };
  if (node.field) {
    return { field: String(node.field), operator: String(node.operator ?? ''), value: node.value };
  }
  for (const rule of Array.isArray(node.rules) ? node.rules : []) {
    const found = firstFilterCondition(rule);
    if (found) return found;
  }
  return null;
}
