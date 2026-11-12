/**
 * Pure helpers for the shared data summary (the variable rail and the statistics table that
 * every Data Handling stage previews its records with). No Angular, no DOM.
 */
import { pluralize } from './result-label.utils';

/** Rail order: the order the variables were selected in, or most missing first. */
export type RailOrder = 'selection' | 'missing';

/**
 * Header text of the rail. `shown` is the number of variables the search leaves, `total` the
 * number in the summary.
 * - shown === total: "1 variable", "3 variables"
 * - otherwise:       "2 of 5 variables", "1 of 4 variables", "0 of 5 variables"
 */
export function railCountLabel(shown: number, total: number): string {
  return shown === total ? pluralize(total, 'variable') : `${shown} of ${total} variables`;
}

/**
 * A new array ordered by missing share, largest first. `shareOf` returns the share (0..1) or
 * null when the item has no statistics; null items go last. Items with the same share keep
 * their original order (Array.sort is stable). The input array is not changed.
 */
export function orderByMissing<T>(items: readonly T[], shareOf: (item: T) => number | null): T[] {
  // A share is 0..1, so -1 sorts the no-statistics items after every real share.
  return items
    .map((item) => ({ item, share: shareOf(item) ?? -1 }))
    .sort((a, b) => b.share - a.share)
    .map(({ item }) => item);
}

/**
 * Where a key press moves the rail selection. `index` is the selected row (-1 when none),
 * `count` the number of rows. Returns the new index, or null when the key is not a rail key
 * or the rail is empty.
 * - ArrowDown: index + 1, stops at the last row (no wrap)
 * - ArrowUp:   index - 1, stops at the first row (no wrap)
 * - Home: 0, End: count - 1
 */
export function railStep(key: string, index: number, count: number): number | null {
  if (count <= 0) {
    return null;
  }
  switch (key) {
    case 'ArrowDown':
      return Math.min(index + 1, count - 1);
    case 'ArrowUp':
      return Math.max(index - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Columns the statistics table draws. The pooled "all datasets" column repeats the only
 * dataset column when a single dataset is selected, so it is dropped then. It stays when two
 * or more dataset columns sit beside it, and when it is the only column there is.
 * Order is preserved.
 */
export function visibleSummaryColumns(
  columns: readonly string[],
  isRollup: (column: string) => boolean,
): string[] {
  const datasetColumns = columns.filter((column) => !isRollup(column));
  if (datasetColumns.length === 1) {
    return datasetColumns;
  }
  return [...columns];
}
