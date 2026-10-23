import { PreprocessingGroup, VariableRow } from '../data-handling.models';

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
