import { BackendExperiment } from '../models/backend-experiment.model';
import { BackendFilter } from '../models/filters.model';

/** Name the backend puts in reusable_preprocessing.preprocessing_name for K-means clusters. */
export const KMEANS_CLUSTER_CREATOR = 'kmeans_cluster_creator';

/** Result type of the K-means cluster report. Its reusable_preprocessing is the creator input. */
export const KMEANS_RESULT_TYPE = 'privacy_safe_cluster_report';

/** Preprocessing block stored in a K-means result that can be replayed as a cluster column. */
export interface KMeansReusablePreprocessing {
  schema_version: string;
  preprocessing_name: string;
  cluster_variables: string[];
  centers: Record<string, Record<string, number>>;
  source_context: { data_model: string; datasets: string[]; input_fingerprint: string };
  available_outputs: Record<string, unknown>[];
  cluster_choices: { cluster_id: string; label: string }[];
}

/** Parameters of the kmeans_cluster_creator preprocessing step. */
export interface KMeansClusterCreatorConfig {
  code: string;
  reusable_preprocessing: KMeansReusablePreprocessing;
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
 * Whether a finished K-means run can still provide clusters for the current draft:
 * same data model, same datasets, same cohort filters.
 */
export function kmeansSourceIsReusable(
  experiment: BackendExperiment,
  current: KMeansSourceContext
): boolean {
  const analysis = experiment?.analysis as unknown as
    | { algorithm?: { name?: unknown }; inputdata?: Record<string, unknown> }
    | undefined;
  const inputdata = analysis?.inputdata;
  if (analysis?.algorithm?.name !== 'kmeans' || experiment?.status !== 'success') return false;
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
