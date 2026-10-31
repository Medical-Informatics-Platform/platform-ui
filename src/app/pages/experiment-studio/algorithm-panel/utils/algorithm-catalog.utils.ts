import { AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { AlgorithmCategory } from '../algorithm-panel.models';

type GroupedAlgorithms = Record<string, AlgorithmConfig[]> | null | undefined;

/** Every whitespace-separated term must occur in label, name, description, documentation, category or flags. */
function matchesAlgorithmSearch(algorithm: AlgorithmConfig, query: string): boolean {
  if (!query) return true;
  const haystack = [
    algorithm.label,
    algorithm.name,
    algorithm.description,
    algorithm.documentation ?? '',
    algorithm.category ?? '',
    (algorithm.flags ?? []).join(' '),
  ].join(' ').toLowerCase();
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

/**
 * The catalog groups to list: search-filtered, runnable only when `onlyActive`, and with
 * runnable methods first when all are shown. Empty groups are dropped.
 */
export function filterAlgorithmCategories(
  grouped: GroupedAlgorithms,
  onlyActive: boolean,
  rawQuery: string,
): AlgorithmCategory[] {
  const query = rawQuery.trim().toLowerCase();
  const entries = Object.entries(grouped ?? {}).map(([name, algorithms]) => {
    let filtered = (algorithms ?? []).filter((algorithm) => matchesAlgorithmSearch(algorithm, query));
    if (onlyActive) {
      filtered = filtered.filter((algorithm) => !algorithm.isDisabled);
    }
    const ordered = onlyActive
      ? filtered
      : [...filtered].sort((a, b) => Number(a.isDisabled) - Number(b.isDisabled));
    return { name, algorithms: ordered };
  });
  return entries.filter((category) => category.algorithms.length > 0);
}

/** All and runnable method counts across every group. */
export function countAlgorithms(grouped: GroupedAlgorithms): { all: number; active: number } {
  const all = Object.values(grouped ?? {}).flat();
  return { all: all.length, active: all.filter((algorithm) => !algorithm.isDisabled).length };
}

export function runnableCount(category: AlgorithmCategory): number {
  return category.algorithms.filter((algorithm) => !algorithm.isDisabled).length;
}

/**
 * Next set of collapsed groups. By default a group is open only when it holds the selected
 * method or at least one runnable method; on a new selection the selected method's group
 * is revealed. Groups the user toggled are never changed. Returns `collapsed` itself when
 * nothing changes.
 */
export function nextCollapsedCategories(
  categories: readonly AlgorithmCategory[],
  selectedName: string | null,
  selectionChanged: boolean,
  collapsed: ReadonlySet<string>,
  userToggled: ReadonlySet<string>,
): ReadonlySet<string> {
  const selectedCategory = selectedName
    ? categories.find((category) =>
        category.algorithms.some((algorithm) => algorithm.name === selectedName))?.name
    : null;

  const next = new Set(collapsed);
  let changed = false;

  categories.forEach((category) => {
    if (userToggled.has(category.name)) return;
    const shouldOpen =
      category.name === selectedCategory ||
      category.algorithms.some((algorithm) => !algorithm.isDisabled);
    if (shouldOpen === !next.has(category.name)) return;
    if (shouldOpen) {
      next.delete(category.name);
    } else {
      next.add(category.name);
    }
    changed = true;
  });

  if (selectedCategory && selectionChanged && next.delete(selectedCategory)) {
    changed = true;
  }

  return changed ? next : collapsed;
}
