/**
 * Pure helpers for the shared data summary (the variable rail and the statistics table that
 * every Data Handling stage previews its records with). No Angular, no DOM.
 */

/** Rail order: the order the variables were selected in, or most missing first. */
export type RailOrder = 'selection' | 'missing';

/**
 * Header text of the rail. `shown` is the number of variables the search leaves, `total` the
 * number in the summary.
 * - shown === total: "1 variable", "3 variables"
 * - otherwise:       "2 of 5 variables", "1 of 4 variables", "0 of 5 variables"
 */
export function railCountLabel(shown: number, total: number): string {
  void shown;
  void total;
  throw new Error('not implemented');
}

/**
 * A new array ordered by missing share, largest first. `shareOf` returns the share (0..1) or
 * null when the item has no statistics; null items go last. Items with the same share keep
 * their original order. The input array is not changed.
 */
export function orderByMissing<T>(items: readonly T[], shareOf: (item: T) => number | null): T[] {
  void items;
  void shareOf;
  throw new Error('not implemented');
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
  void key;
  void index;
  void count;
  throw new Error('not implemented');
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
  void columns;
  void isRollup;
  throw new Error('not implemented');
}
