/**
 * The rule a preprocessing step compares against what the run uses: the user's edit
 * when there is one; otherwise the step default, but only while nothing is applied
 * for the variable (an applied rule with no edit is simply unchanged).
 */
export function pendingOrDefault<R>(pending: R | undefined, applied: R | undefined, stepDefault: () => R): R | undefined {
  return pending ?? (applied ? undefined : stepDefault());
}
