/** Name the backend puts in reusable_preprocessing.preprocessing_name for PCA columns. */
export const PCA_COLUMN_CREATOR = 'pca_column_creator';

/** Preprocessing block stored in a PCA result that can be replayed as component columns.
 *  Matches exaflow `PCAReusablePreprocessing` (schema_version "1"). */
export interface PCAReusablePreprocessing {
  schema_version: string;
  preprocessing_name: string;
  base_parameters: { variables: string[]; pca_variant: string };
  component_choices: { component_id: string; explained_variance_ratio: number }[];
}

/**
 * Read the replayable PCA preprocessing out of a stored result. Returns null unless
 * `preprocessing_name === 'pca_column_creator'` and `schema_version === '1'`.
 */
export function extractPcaRecipe(result: unknown): PCAReusablePreprocessing | null {
  const record = result as { reusable_preprocessing?: unknown } | null | undefined;
  const candidate = record?.reusable_preprocessing;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const recipe = candidate as Record<string, unknown>;
  if (recipe['preprocessing_name'] !== PCA_COLUMN_CREATOR) return null;
  if (recipe['schema_version'] !== '1') return null;
  if (!isPlainObject(recipe['base_parameters'])) return null;
  if (!Array.isArray(recipe['component_choices'])) return null;
  return candidate as PCAReusablePreprocessing;
}

/** Default column codes: `${prefix}_${componentId.toLowerCase()}` (prefix defaults to `pca` in the UI). */
export function defaultPcaColumnNames(prefix: string, componentIds: string[]): string[] {
  return componentIds.map((id) => `${prefix}_${id.toLowerCase()}`);
}

/**
 * Parameters for one `pca_column_creator` step. Always sets `n_components = selected.length`
 * and exactly one of `reusable_preprocessing` / `variables`.
 */
export function buildPcaCreatorParameters(input: {
  recipe?: PCAReusablePreprocessing;
  variables?: string[];
  selected: string[];
  names: string[];
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    selected_components: input.selected,
    new_column_names: input.names,
    n_components: input.selected.length,
  };
  if (input.recipe) {
    return { ...base, reusable_preprocessing: input.recipe };
  }
  return { ...base, variables: input.variables ?? [] };
}

/** Where a transient response can carry the recipe: the response itself, `result`, or nested `{ result }`. */
function recipeCandidates(value: unknown): unknown[] {
  const outer = (value as { result?: unknown } | null | undefined)?.result;
  return [value, outer, (outer as { result?: unknown } | null | undefined)?.result];
}

/** The reusable PCA block of a transient response, or null. */
export function findPcaRecipe(value: unknown): PCAReusablePreprocessing | null {
  for (const candidate of recipeCandidates(value)) {
    const found = extractPcaRecipe(candidate);
    if (found) return found;
  }
  return null;
}

/**
 * Next column-name prefix for a PCA card (`pca`, `pca2`, `pca3`, …), skipping prefixes
 * already used by other applied `pca_column_creator` steps.
 */
export function nextPcaColumnPrefix(usedNames: string[]): string {
  const taken = new Set<string>();
  for (const name of usedNames) {
    const match = /^(.+)_pc\d+$/i.exec(String(name).trim());
    if (match) taken.add(match[1].toLowerCase());
  }
  let n = 1;
  while (true) {
    const prefix = n === 1 ? 'pca' : `pca${n}`;
    if (!taken.has(prefix)) return prefix;
    n += 1;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
