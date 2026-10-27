/**
 * One ordered list of column-creating preprocessing steps (categorical, K-means,
 * and the future PCA), replacing the per-name map the applied-preprocessing store
 * used to keep. Ports the Exaflow contract where every column-creating step is a
 * `*_column_creator` / `kmeans_cluster_creator` step in request order.
 */

import { AnalysisPreprocessingStep } from '../models/backend-algorithms.model';
import { BackendFilter } from '../models/filters.model';

/** Applied descriptive preprocessing config: a map of step name → parameters. */
export type PreprocessingConfig = Record<string, unknown>;

export type CreatorName =
  | 'categorical_column_creator'
  | 'kmeans_cluster_creator'
  | 'pca_column_creator';

export interface TransformationStep {
  id: string;
  name: CreatorName;
  parameters: Record<string, unknown>;
}

export const CREATOR_NAMES: ReadonlySet<CreatorName> = new Set<CreatorName>([
  'categorical_column_creator',
  'kmeans_cluster_creator',
  'pca_column_creator',
]);

/**
 * Field codes a step reads from: for a categorical step the CDEs referenced inside its rule
 * filters (not the rule keys, which are enumeration labels); for K-means/PCA the clustering
 * variables.
 */
export function stepSourceVariables(step: TransformationStep): string[] {
  if (step.name === 'categorical_column_creator') {
    const rules = step.parameters['rules'];
    if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
      const codes = new Set<string>();
      for (const filter of Object.values(rules as Record<string, BackendFilter>)) {
        collectFilterFieldCodes(filter, codes);
      }
      return [...codes];
    }
    return [];
  }
  if (step.name === 'kmeans_cluster_creator') {
    const reusable = step.parameters['reusable_preprocessing'] as
      | { cluster_variables?: unknown }
      | undefined;
    const variables = reusable?.cluster_variables;
    if (Array.isArray(variables)) return variables.map((v) => String(v));
    return toArray(step.parameters['variables']);
  }
  // pca_column_creator
  const base = step.parameters['reusable_preprocessing'] as
    | { base_parameters?: { variables?: unknown } }
    | undefined;
  const variables = base?.base_parameters?.variables;
  if (Array.isArray(variables)) return variables.map((v) => String(v));
  return toArray(step.parameters['variables']);
}

/** The names the step writes, from `new_column_names`. */
export function stepOutputNames(step: TransformationStep): string[] {
  const names = step.parameters['new_column_names'];
  return Array.isArray(names) ? names.map((name) => String(name)) : [];
}

/**
 * Split backend preprocessing steps into the singleton steps (kept as a config map)
 * and the ordered column-creating transformations. Each transformation step gets a
 * fresh id so the store can reference it; the order is preserved exactly.
 */
export function splitPreprocessingSteps(
  steps: AnalysisPreprocessingStep[],
): { singletons: PreprocessingConfig; transformations: TransformationStep[] } {
  const singletons: PreprocessingConfig = {};
  const transformations: TransformationStep[] = [];

  for (const step of steps) {
    if (!CREATOR_NAMES.has(step.name as CreatorName)) {
      singletons[step.name] = step.parameters;
      continue;
    }
    transformations.push({
      id: crypto.randomUUID(),
      name: step.name as CreatorName,
      parameters: step.parameters,
    });
  }

  return { singletons, transformations };
}

function toArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

/** Collect the field codes referenced by a filter tree into the given set. */
function collectFilterFieldCodes(logic: unknown, codes: Set<string>): void {
  if (!logic || typeof logic !== 'object') return;
  const node = logic as { field?: unknown; id?: unknown; rules?: unknown };
  if (Array.isArray(node.rules)) {
    node.rules.forEach((child) => collectFilterFieldCodes(child, codes));
    return;
  }
  if (typeof node.field === 'string') {
    codes.add(node.field);
  } else if (typeof node.id === 'string') {
    codes.add(node.id);
  }
}
