/** Shared helpers for labeling and enriching experiment results in the dashboard. */

export interface LabeledItem {
  code: string;
  label: string;
}

/**
 * Map a list of codes to `{ code, label }` pairs, falling back to the raw code
 * when the label map has no entry for it.
 */
export function withLabels(
  codes: string[] | undefined | null,
  labelMap: Record<string, string>
): LabeledItem[] {
  return (codes ?? []).map((code) => ({ code, label: labelMap[code] ?? code }));
}

/**
 * Inject human-readable variable names into PCA results so the heatmap does
 * not fall back to Var1/Var2. Returns the result unchanged for non-PCA
 * algorithms or when no labels are available.
 */
export function enrichPcaResult<T>(
  result: T,
  algorithmName: string,
  variableLabels: string[],
  covariateLabels: string[]
): T {
  if (algorithmName !== 'pca' && algorithmName !== 'pca_with_transformation') return result;
  const allNames = [...variableLabels, ...covariateLabels];
  if (allNames.length === 0) return result;
  return { ...result, variable_names: allNames };
}

/** `3 datasets`, `1 dataset`. */
export function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** `y ~ x1, x2`, or the plain list when either side is empty. */
export function formulaLine(y: string[], x: string[], xSeparator = ', '): string {
  if (y.length && x.length) return `${y.join(', ')} ~ ${x.join(xSeparator)}`;
  return [...y, ...x].join(', ');
}

/** A result's `n_obs` as a grouped count, or '' when absent or not a positive number. */
export function rowsUsedLabel(nObs: unknown): string {
  if (typeof nObs !== 'number' || !Number.isFinite(nObs) || nObs <= 0) return '';
  return new Intl.NumberFormat('en-US').format(nObs);
}
