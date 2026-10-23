import type { CategoryFilter, TransformationColumnDraft } from '../data-handling.models';
import { draftHasWork, firstFilterCondition, hasUnfinishedCategory, transformationConfigFor } from './transformation-draft.utils';

const draft = (patch: Partial<TransformationColumnDraft>): TransformationColumnDraft => ({
  id: 1, code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null, ...patch,
});
const rule = { field: 'age', operator: 'greater_or_equal', value: 60 } as unknown as CategoryFilter;

describe('transformation draft utils', () => {
  it('finds the first condition depth first, or null', () => {
    const nested = { condition: 'AND', rules: [{ condition: 'OR', rules: [] }, { condition: 'OR', rules: [rule] }] };
    expect(firstFilterCondition(nested)).toEqual({ field: 'age', operator: 'greater_or_equal', value: 60 });
    expect(firstFilterCondition(null)).toBeNull();
    expect(firstFilterCondition({ condition: 'AND', rules: [] })).toBeNull();
  });

  it('tells touched and unfinished cards apart', () => {
    expect(draftHasWork(draft({}))).toBe(false);
    expect(draftHasWork(draft({ defaultEnumeration: ' x ' }))).toBe(true);
    expect(draftHasWork(draft({ rules: [{ value: '', filter: rule }] }))).toBe(true);
    expect(hasUnfinishedCategory(draft({ rules: [{ value: 'a', filter: rule }] }))).toBe(false);
    expect(hasUnfinishedCategory(draft({ rules: [{ value: ' ', filter: rule }] }))).toBe(true);
  });

  it('builds a config only with a name and a complete category', () => {
    expect(transformationConfigFor(draft({ rules: [{ value: 'a', filter: rule }] }))).toBeNull();
    expect(transformationConfigFor(draft({ code: 'c', rules: [{ value: 'a', filter: null }] }))).toBeNull();
    expect(transformationConfigFor(draft({ code: ' c ', rules: [{ value: ' a ', filter: rule }] }))).toEqual({
      code: 'c', strategy: 'filter_rules', rules: { a: rule },
    });
  });
});
