import { DataModel, Group, Variable } from '../models/data-model.interface';

/** Code → label for the datasets the user can pick, e.g. ExperimentStudioService.availableDatasets(). */
export type DatasetLabelSource = ReadonlyArray<{ code: string; label?: string | null }>;

/** Variable code → human labels of the selected datasets that do not contain it. */
export type UnavailableVariablesMap = ReadonlyMap<string, readonly string[]>;

export const EMPTY_UNAVAILABLE_VARIABLES: UnavailableVariablesMap = new Map<string, string[]>();

/** The dataset pseudo-variable exists in every dataset by construction and is never unavailable. */
const DATASET_VARIABLE_CODE = 'dataset';

/**
 * Which variables of the data model cannot be used with the current dataset selection.
 *
 * A variable is unavailable when at least one selected dataset has an entry in
 * `datasetsVariables` and that entry does not list the variable. A selected dataset with
 * no entry (or a model with no `datasetsVariables` at all) carries no information, so it
 * never makes a variable unavailable. An empty entry is strict: the dataset has no
 * variables, so every variable is unavailable there. The `dataset` variable is never
 * unavailable.
 *
 * @param variableCodes every variable code of the data model (leaves of the hierarchy)
 * @returns variable code → labels (falling back to codes) of the datasets lacking it,
 *          in the order the datasets were selected; only unavailable variables are present
 */
export function computeUnavailableVariables(
  datasetsVariables: DataModel['datasetsVariables'] | null | undefined,
  selectedDatasets: readonly string[] | null | undefined,
  variableCodes: Iterable<string>,
  datasetLabels: DatasetLabelSource = []
): UnavailableVariablesMap {
  if (!datasetsVariables || !selectedDatasets?.length) {
    return EMPTY_UNAVAILABLE_VARIABLES;
  }

  const labelByCode = new Map<string, string>();
  for (const dataset of datasetLabels) {
    const label = (dataset?.label ?? '').trim();
    if (dataset?.code && label) labelByCode.set(dataset.code, label);
  }

  const informative: Array<{ label: string; present: Set<string> }> = [];
  for (const code of new Set(selectedDatasets)) {
    const listed = datasetsVariables[code];
    if (!Array.isArray(listed)) continue;
    informative.push({
      label: labelByCode.get(code) ?? code,
      present: new Set(listed),
    });
  }
  if (!informative.length) {
    return EMPTY_UNAVAILABLE_VARIABLES;
  }

  const result = new Map<string, string[]>();
  for (const code of variableCodes) {
    if (!code || code.toLowerCase() === DATASET_VARIABLE_CODE || result.has(code)) continue;
    const missingIn = informative
      .filter((dataset) => !dataset.present.has(code))
      .map((dataset) => dataset.label);
    if (missingIn.length) result.set(code, missingIn);
  }
  return result;
}

/**
 * Tooltip text for an unavailable variable, e.g. "Not available in: Dataset A, Dataset B".
 * `lead` replaces "Not available in" for longer messages; '' when no dataset lacks it.
 */
export function unavailableVariableTooltip(
  datasetLabels: readonly string[] | null | undefined,
  lead = 'Not available in'
): string {
  return datasetLabels?.length ? `${lead}: ${datasetLabels.join(', ')}` : '';
}

/** Datasets lacking the node's variable; empty for groups, unknown codes and available variables. */
export function unavailableDatasetsFor(
  map: UnavailableVariablesMap | null | undefined,
  node: { code?: unknown; children?: unknown[] } | null | undefined
): readonly string[] {
  if (!map?.size || !node || (Array.isArray(node.children) && node.children.length)) return [];
  const code = node.code == null ? '' : String(node.code);
  return (code && map.get(code)) || [];
}

/** "Not available in: …" for the node's variable, '' for groups and available variables. */
export function unavailableTooltipFor(
  map: UnavailableVariablesMap | null | undefined,
  node: { code?: unknown; children?: unknown[] } | null | undefined
): string {
  return unavailableVariableTooltip(unavailableDatasetsFor(map, node));
}

export function isVariableUnavailable(
  map: UnavailableVariablesMap | null | undefined,
  node: { code?: unknown; children?: unknown[] } | null | undefined
): boolean {
  return unavailableDatasetsFor(map, node).length > 0;
}

/** Every variable code of the data model, top-level and nested in groups. */
export function collectVariableCodes(model: Pick<DataModel, 'variables' | 'groups'> | null | undefined): string[] {
  const codes: string[] = [];
  const addVariables = (variables: Variable[] | undefined): void => {
    (variables ?? []).forEach((variable) => {
      if (variable?.code) codes.push(variable.code);
    });
  };
  const visit = (groups: Group[] | undefined): void => {
    (groups ?? []).forEach((group) => {
      addVariables(group?.variables);
      visit(group?.groups);
    });
  };
  addVariables(model?.variables);
  visit(model?.groups);
  return codes;
}
