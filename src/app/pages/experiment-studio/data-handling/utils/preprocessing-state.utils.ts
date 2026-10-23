import { PreprocessingGroup, PreprocessingRule, VariableRow } from '../data-handling.models';

/**
 * The rule a preprocessing step compares against what the run uses: the user's edit
 * when there is one; otherwise the step default, but only while nothing is applied
 * for the variable (an applied rule with no edit is simply unchanged).
 */
export function pendingOrDefault<R>(pending: R | undefined, applied: R | undefined, stepDefault: () => R): R | undefined {
  return pending ?? (applied ? undefined : stepDefault());
}

/** The rail's state groups, in display order. */
const PREPROCESSING_GROUPS: ReadonlyArray<Omit<PreprocessingGroup, 'variables'>> = [
  { key: 'pending', title: 'Pending' },
  { key: 'applied', title: 'Applied preprocessing' },
  { key: 'default', title: 'Default (NA removal)' },
  { key: 'not-applied', title: 'Not applied' },
];

/**
 * Groups a step's variables by their state for the variable rail, keeping each group in
 * the variables' order and dropping empty groups.
 */
export function groupPreprocessingVariables(
  variables: readonly VariableRow[],
  stateOf: (variable: VariableRow) => PreprocessingGroup['key'],
): PreprocessingGroup[] {
  const byState = new Map<PreprocessingGroup['key'], VariableRow[]>();
  for (const variable of variables) {
    const key = stateOf(variable);
    byState.set(key, [...(byState.get(key) ?? []), variable]);
  }
  return PREPROCESSING_GROUPS.filter((group) => byState.has(group.key)).map((group) => ({ ...group, variables: byState.get(group.key)! }));
}

/** The missing-values step default for a variable: drop rows with a missing value. */
export function defaultMissingRule(variableCode: string): PreprocessingRule {
  return { variableCode, action: 'drop', value: '', enabled: true };
}

/** "No handling": what an absent rule compares as. */
export function emptyMissingRule(variableCode: string): PreprocessingRule {
  return { variableCode, action: 'no_action', value: '', enabled: false };
}

/** Whether a rule is the step default (drop, enabled, no fill value). */
export function isDefaultMissingRule(rule: PreprocessingRule | undefined): boolean {
  if (!rule) return false;
  return rule.enabled === true && rule.action === 'drop' && (rule.value === undefined || rule.value === '');
}

/** Comparable form of a missing-values rule (an absent rule is "no handling"). */
export function serializeMissingRule(rule: PreprocessingRule | undefined): string {
  const normalized = rule ?? emptyMissingRule('');
  return JSON.stringify({ action: normalized.action, value: normalized.value, enabled: normalized.enabled });
}

/** A shallow copy of each rule, so edits to one map never reach the other. */
export function cloneMissingRules(rules: Record<string, PreprocessingRule>): Record<string, PreprocessingRule> {
  return Object.fromEntries(Object.entries(rules).map(([code, rule]) => [code, { ...rule }]));
}
