import { pluralize } from '../../../../core/result-label.utils';

/**
 * One-line summary of what a group holds, without zero counts:
 * "4 groups, 21 variables", "2 variables", "1 group, 1 variable", "No variables".
 */
export function groupContentsLabel(groupCount: number, variableCount: number): string {
  if (groupCount === 0 && variableCount === 0) {
    return 'No variables';
  }
  if (groupCount === 0) {
    return pluralize(variableCount, 'variable');
  }
  return `${pluralize(groupCount, 'group')}, ${pluralize(variableCount, 'variable')}`;
}
