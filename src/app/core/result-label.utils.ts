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
 * Inject human-readable variable names into a saved PCA result so the heatmap and the weights
 * table do not show raw codes. Labels the result's own `variables` (request order); results
 * saved before the engine returned them fall back to the run's variable labels.
 */
export function enrichPcaResult<T>(result: T, algorithmName: string, variables: LabeledItem[]): T {
  if (algorithmName !== 'pca' || !result || typeof result !== 'object') return result;
  const codes = (result as { variables?: unknown }).variables;
  const names = Array.isArray(codes)
    ? codes.map((code) => variables.find((item) => item.code === String(code))?.label ?? String(code))
    : variables.map((item) => item.label);
  return names.length ? { ...result, variable_names: names } : result;
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

/** A result's `n_obs` as a count grouped like the result figures (27 308, narrow no-break space),
 *  or '' when absent or not a positive number. */
export function rowsUsedLabel(nObs: unknown): string {
  if (typeof nObs !== 'number' || !Number.isFinite(nObs) || nObs <= 0) return '';
  return nObs.toLocaleString('en-US').replace(/,/g, '\u202f');
}

/** Top-level `n_obs`, or the first nested one (one-way ANOVA keeps it on `anova_table`). */
export function observationCount(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  for (const value of [result, ...Object.values(result)]) {
    const label = value && typeof value === 'object' ? rowsUsedLabel((value as { n_obs?: unknown }).n_obs) : '';
    if (label) return label;
  }
  return '';
}
