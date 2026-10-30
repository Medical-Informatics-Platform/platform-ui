import { CreatorName, newStepId } from '../../../../core/transformation-steps.utils';
import { CategoryFilter, TransformationColumnDraft } from '../data-handling.models';

/** What the type chooser and the card headers say about each column creator. */
export const CREATOR_CHOOSER_COPY: Record<CreatorName, { icon: string; title: string; subtitle: string }> = {
  categorical_column_creator: {
    icon: 'fas fa-tags',
    title: 'Nominal column from rules',
    subtitle: 'Name categories and pick each one\'s records with a filter — e.g. MMSE below 24 → ‘impaired’',
  },
  kmeans_cluster_creator: {
    icon: 'fas fa-diagram-project',
    title: 'K-means cluster column',
    subtitle: 'Group records by similarity and use the cluster as a nominal variable',
  },
  pca_column_creator: {
    icon: 'fas fa-chart-line',
    title: 'PCA component columns',
    subtitle: 'Project numerical variables onto principal components',
  },
};

/** A blank "Create new categorical column" card, open on its editor; its id is the store step id. */
export function emptyTransformationDraft(id = newStepId()): TransformationColumnDraft {
  return { id, code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null };
}

/**
 * The exaflow config of one derived column (`filter_rules` strategy). Exaflow names the
 * created column with `new_column_names`; the draft keeps `code` as the editable UI name only.
 */
export type TransformationColumnConfig = {
  new_column_names: string[];
  strategy: 'filter_rules';
  rules: Record<string, CategoryFilter>;
  default_enumeration?: string;
};

/** A card's chip: Applied, Duplicate name, Column in use, Not applied or Not set. */
export interface TransformationDraftStatus {
  label: 'Applied' | 'Duplicate name' | 'Column in use' | 'Not applied' | 'Not set';
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
  const config: TransformationColumnConfig = { new_column_names: [code], strategy: 'filter_rules', rules };
  const fallback = draft.defaultEnumeration.trim();
  if (fallback) config.default_enumeration = fallback;
  return config;
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
