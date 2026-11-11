/**
 * The "Add a step" menu of the Preprocessing and Data transformation stages.
 *
 * A stage used to list one dashed row per step it could still add. With every step of the engine's
 * catalog on offer that list grew to nine rows, so the stage now shows one add row that opens a
 * menu, and the menu sorts the steps by what the user wants to do with the data.
 */

/** One step of the menu. `id` is the engine's step name; the panel maps it to the station to open. */
export interface StepPickerOption {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
}

/** Steps that serve the same purpose, under one plain-language label. */
export interface StepPickerGroup {
  key: string;
  label: string;
  options: StepPickerOption[];
}

/**
 * A step the stage can still add. `label` and `desc` come from the engine's catalog and are used
 * for the steps this file has no copy for; `icon` overrides the icon of `stepIcon`.
 */
export interface StepCandidate {
  name: string;
  label?: string;
  desc?: string;
  icon?: string;
}

/** Font Awesome classes of a pipeline step, by engine name. Unlisted names get the branch icon. */
const ICONS: Readonly<Record<string, string>> = {
  outlier_winsorizer: 'fas fa-line-chart',
  global_imputer: 'fas fa-fill-drip',
  global_winsorizer: 'fas fa-compress',
  variable_transformer: 'fas fa-arrow-up-right-dots',
  variable_scaler: 'fas fa-ruler-horizontal',
  one_hot_encoder: 'fas fa-table-columns',
  ordinal_encoder: 'fas fa-arrow-down-1-9',
  missing_indicator: 'fas fa-flag',
  outlier_detector: 'fas fa-magnifying-glass-chart',
  longitudinal_transformer: 'fas fa-code-compare',
};

const FALLBACK_ICON = 'fas fa-code-branch';

export function stepIcon(name: string): string {
  return ICONS[name] ?? FALLBACK_ICON;
}

/** Menu copy for the steps whose station has a hand-written title and subtitle. */
const COPY: Readonly<Record<string, { title: string; subtitle: string }>> = {
  outlier_winsorizer: {
    title: 'Outlier Handling',
    subtitle: 'Cap extreme values so a few outliers do not skew results. Numerical variables only.',
  },
  variable_transformer: {
    title: 'Variable Transforms',
    subtitle: 'Reshape skewed values with log, square root, Yeo-Johnson or quantile. Numerical variables only.',
  },
  variable_scaler: {
    title: 'Variable Scaling',
    subtitle: 'Bring numerical variables to a comparable range: standard, robust, min-max or max absolute.',
  },
  longitudinal_transformer: {
    title: 'Longitudinal Transformation',
    subtitle: 'Compare two visits per variable. Required for two-visit pathologies.',
  },
};

/** Steps that serve the same purpose, in the order the menu shows the groups. */
const GROUP_TABLE: ReadonlyArray<{ key: string; label: string; steps: readonly string[] }> = [
  { key: 'missing', label: 'Fill missing values', steps: ['global_imputer'] },
  { key: 'outliers', label: 'Cap outliers', steps: ['outlier_winsorizer', 'global_winsorizer'] },
  { key: 'reshape', label: 'Reshape and scale', steps: ['variable_transformer', 'variable_scaler'] },
  { key: 'encode', label: 'Encode categories', steps: ['one_hot_encoder', 'ordinal_encoder'] },
  { key: 'flag', label: 'Flag records', steps: ['missing_indicator', 'outlier_detector'] },
  { key: 'visits', label: 'Compare visits', steps: ['longitudinal_transformer'] },
  { key: 'create', label: 'Create a column', steps: ['categorical_column_creator', 'kmeans_cluster_creator', 'pca_column_creator'] },
];

/** Where a step named in no group ends up. */
const OTHER_GROUP: { key: string; label: string } = { key: 'other', label: 'More steps' };

function toOption(candidate: StepCandidate): StepPickerOption {
  const copy = COPY[candidate.name];
  return {
    id: candidate.name,
    icon: candidate.icon ?? stepIcon(candidate.name),
    title: copy?.title ?? candidate.label ?? candidate.name,
    subtitle: copy?.subtitle ?? candidate.desc ?? '',
  };
}

/**
 * The menu for the given steps: one group per purpose, in a fixed order, each holding its steps in
 * the order they were given. A group without a step is left out.
 */
export function stepPickerGroups(candidates: StepCandidate[]): StepPickerGroup[] {
  const options = candidates.map(toOption);

  const groups: StepPickerGroup[] = [];
  for (const { key, label, steps } of GROUP_TABLE) {
    const groupOptions = options.filter((option) => steps.includes(option.id));
    if (groupOptions.length > 0) {
      groups.push({ key, label, options: groupOptions });
    }
  }

  const grouped = new Set(GROUP_TABLE.flatMap((group) => group.steps));
  const other = options.filter((option) => !grouped.has(option.id));
  if (other.length > 0) {
    groups.push({ key: OTHER_GROUP.key, label: OTHER_GROUP.label, options: other });
  }

  return groups;
}
