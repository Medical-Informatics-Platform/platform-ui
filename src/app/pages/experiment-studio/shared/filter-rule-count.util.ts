/**
 * Count the leaf rules in a QueryBuilder-style filter logic tree.
 *
 * The tree shape is:
 *   { condition: 'AND'|'OR', rules: [ { ... }, ... ] }
 * where a rule is either a leaf (no nested `rules` array) or a group with its
 * own `rules` array. This helper returns the total number of leaf rules.
 */
export function countFilterRules(node: any): number {
  if (!node || !Array.isArray(node.rules)) return 0;
  return node.rules.reduce((count: number, rule: any) => {
    if (rule?.condition && Array.isArray(rule.rules)) {
      return count + countFilterRules(rule);
    }
    return count + 1;
  }, 0);
}
