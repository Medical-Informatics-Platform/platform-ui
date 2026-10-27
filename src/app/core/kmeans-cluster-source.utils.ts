import { BackendExperiment } from '../models/backend-experiment.model';
import { BackendFilter } from '../models/filters.model';

/** Name the backend puts in reusable_preprocessing.preprocessing_name for K-means clusters. */
export const KMEANS_CLUSTER_CREATOR = 'kmeans_cluster_creator';

/** Result type of the K-means cluster report. Its reusable_preprocessing is the creator input. */
export const KMEANS_RESULT_TYPE = 'privacy_safe_cluster_report';

/** Preprocessing block stored in a K-means result that can be replayed as a cluster column.
 *  Matches exaflow `KMeansReusablePreprocessing` (no schema_version, has enumeration_prefix). */
export interface KMeansReusablePreprocessing {
  enumeration_prefix: string;
  preprocessing_name: string;
  cluster_variables: string[];
  centers: Record<string, Record<string, number>>;
  source_context: { data_model: string; datasets: string[]; input_fingerprint: string };
  available_outputs: Record<string, unknown>[];
  cluster_choices: { cluster_id: string; label: string }[];
}

/** Clustering variable codes from a stored creator: recipe `cluster_variables` or fit `variables`. */
export function kmeansCreatorVariables(
  creator: Record<string, unknown> | null | undefined,
): string[] {
  const reusable = creator?.['reusable_preprocessing'];
  if (isPlainObject(reusable) && Array.isArray(reusable['cluster_variables'])) {
    return reusable['cluster_variables'].map((code) => String(code).trim()).filter((code) => !!code);
  }
  const variables = creator?.['variables'];
  return Array.isArray(variables)
    ? variables.map((code) => String(code).trim()).filter((code) => !!code)
    : [];
}

/**
 * Cluster category ids/labels: recipe `cluster_choices`, or synthetic
 * `${enumeration_prefix || 'cluster_'}${1..k}` for fit mode.
 */
export function kmeansCreatorClusterChoices(
  creator: Record<string, unknown> | null | undefined,
): Array<{ cluster_id: string; label: string }> {
  const reusable = creator?.['reusable_preprocessing'];
  if (isPlainObject(reusable) && Array.isArray(reusable['cluster_choices'])) {
    return reusable['cluster_choices']
      .filter(isPlainObject)
      .map((choice) => ({
        cluster_id: String(choice['cluster_id'] ?? '').trim(),
        label: String(choice['label'] ?? '').trim(),
      }))
      .filter((choice) => !!choice.cluster_id);
  }
  const k = typeof creator?.['k'] === 'number' ? creator['k'] : 0;
  if (!Number.isFinite(k) || k < 1) return [];
  const prefix = typeof creator?.['enumeration_prefix'] === 'string' && creator['enumeration_prefix']
    ? creator['enumeration_prefix']
    : 'cluster_';
  return Array.from({ length: Math.floor(k) }, (_, index) => {
    const id = `${prefix}${index + 1}`;
    return { cluster_id: id, label: id };
  });
}

/** Source of the data the current draft experiment runs on. */
export interface KMeansSourceContext {
  dataModel: string | null;
  datasets: string[];
  filters: BackendFilter | null | undefined;
}

/**
 * Stable JSON stringification: object keys sorted recursively, array order kept.
 * Mirrors Exaflow's fingerprint (json.dumps(..., sort_keys=True)), which ignores
 * key order but not list order. Undefined object values are dropped, as they are
 * when the request is serialized; a top-level `undefined` counts as `null`.
 */
export function canonicalFilterKey(filters: unknown): string {
  return JSON.stringify(sortKeys(filters));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, item]) => [key, sortKeys(item)])
    );
  }
  return value ?? null;
}

/**
 * Whether a finished analysis run can still provide a recipe for the current draft:
 * matching algorithm, same data model, same datasets, same cohort filters.
 */
export function analysisSourceIsReusable(
  experiment: BackendExperiment,
  algorithmName: string,
  current: KMeansSourceContext,
): boolean {
  const analysis = experiment?.analysis as unknown as
    | { algorithm?: { name?: unknown }; inputdata?: Record<string, unknown> }
    | undefined;
  const inputdata = analysis?.inputdata;
  if (analysis?.algorithm?.name !== algorithmName || experiment?.status !== 'success') return false;
  if (!inputdata || inputdata['data_model'] !== current.dataModel) return false;

  const sourceDatasets = (Array.isArray(inputdata['datasets']) ? inputdata['datasets'] : [])
    .map(String)
    .sort();
  return sourceDatasets.join('\u0000') === [...current.datasets].map(String).sort().join('\u0000')
    && canonicalFilterKey(inputdata['filters']) === canonicalFilterKey(current.filters);
}

/**
 * Read the replayable preprocessing out of a stored K-means result. Returns null
 * for results saved before the feature existed or with an unexpected shape.
 */
export function extractReusablePreprocessing(result: unknown): KMeansReusablePreprocessing | null {
  const record = result as { result_type?: unknown; reusable_preprocessing?: unknown } | null | undefined;
  // The report contract is privacy_safe_cluster_report. Legacy results without the
  // marker are still accepted; a different declared type is never reusable.
  if (record?.result_type !== undefined && record.result_type !== KMEANS_RESULT_TYPE) {
    return null;
  }
  const candidate = record?.reusable_preprocessing;

  if (!isPlainObject(candidate)) {
    return null;
  }
  // The creator contract names the block; tolerate legacy blocks that lack the name.
  if (candidate['preprocessing_name'] !== undefined
    && candidate['preprocessing_name'] !== KMEANS_CLUSTER_CREATOR) {
    return null;
  }
  if (!Array.isArray(candidate['cluster_variables']) || !Array.isArray(candidate['cluster_choices'])
    || !isPlainObject(candidate['centers'])) {
    return null;
  }
  // The creator names the cluster categories with this prefix; a block without it cannot replay.
  if (typeof candidate['enumeration_prefix'] !== 'string' || !candidate['enumeration_prefix']) {
    return null;
  }

  return candidate as unknown as KMeansReusablePreprocessing;
}

/** Where a transient response can carry the report: the response itself, the backend's
 *  `result`, or a stored `{ result }` nested inside it. */
function reportCandidates(value: unknown): unknown[] {
  const outer = (value as { result?: unknown } | null | undefined)?.result;
  return [value, outer, (outer as { result?: unknown } | null | undefined)?.result];
}

/** The reusable block of a transient K-means response, or null. */
export function findReusablePreprocessing(value: unknown): KMeansReusablePreprocessing | null {
  for (const candidate of reportCandidates(value)) {
    const found = extractReusablePreprocessing(candidate);
    if (found) return found;
  }
  return null;
}

/** The cluster report of a transient K-means response, for display. */
export function findKMeansReport(value: unknown): Record<string, unknown> | null {
  const found = reportCandidates(value).find((candidate) =>
    isPlainObject(candidate) && Array.isArray(candidate['clusters']) && candidate['selected_k'] !== undefined);
  return (found as Record<string, unknown> | undefined) ?? null;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
