import type { CategoryFilter, TransformationColumnDraft } from '../data-handling.models';
import {
  draftHasWork,
  draftStatusHasNewWork,
  firstFilterCondition,
  hasUnfinishedCategory,
  transformationConfigFor,
  transformationDraftStatus,
} from './transformation-draft.utils';

const draft = (patch: Partial<TransformationColumnDraft>): TransformationColumnDraft => ({
  id: 'step-1', code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null, ...patch,
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
      new_column_names: ['c'], strategy: 'filter_rules', rules: { a: rule },
    });
  });

  it('puts a write problem first on the chip, then completeness', () => {
    const complete = draft({ code: 'c', rules: [{ value: 'a', filter: rule }] });
    expect(transformationDraftStatus(complete, null)).toEqual({ label: 'Applied', tone: 'applied' });
    expect(transformationDraftStatus(complete, 'Name already used')).toEqual({ label: 'Duplicate name', tone: 'pending' });
    expect(transformationDraftStatus(complete, 'Used by a later step: pc1')).toEqual({ label: 'Column in use', tone: 'pending' });
    expect(transformationDraftStatus(draft({ code: 'c' }), null)).toEqual({ label: 'Not applied', tone: 'pending' });
    expect(transformationDraftStatus(draft({}), null)).toEqual({ label: 'Not set', tone: 'default' });
    expect(draftStatusHasNewWork({ label: 'Duplicate name', tone: 'pending' })).toBe(true);
    expect(draftStatusHasNewWork({ label: 'Column in use', tone: 'pending' })).toBe(false);
    expect(draftStatusHasNewWork({ label: 'Applied', tone: 'applied' })).toBe(false);
  });
});
