import type { CategoryFilter, TransformationColumnDraft } from '../data-handling.models';
import { TransformationDraftsService } from './transformation-drafts.service';

const female = { field: 'sex', operator: 'equal', value: 'F' } as unknown as CategoryFilter;

function draft(patch: Partial<TransformationColumnDraft>, id = 'step-1'): TransformationColumnDraft {
  return { id, code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null, ...patch };
}

describe('TransformationDraftsService', () => {
  let service: TransformationDraftsService;
  beforeEach(() => (service = new TransformationDraftsService()));

  it('starts empty, shows chosen or touched cards, and resets to no cards', () => {
    expect(service.drafts).toEqual([]);
    expect(service.isShown(draft({}))).toBe(false);
    expect(service.isShown(draft({ chosen: true }))).toBe(true);
    expect(service.isShown(draft({ code: 'x' }))).toBe(true);
    service.drafts = [draft({ code: 'x' })];
    service.reset();
    expect(service.drafts).toEqual([]);
  });

  it('reports pending work, missing rules and duplicate names', () => {
    const complete = draft({ code: 'grp', rules: [{ value: 'f', filter: female }] }, 'a');
    const clash = draft({ code: 'grp', rules: [{ value: 'f', filter: female }] }, 'b');
    const unfinished = draft({ code: 'other', rules: [{ value: 'f', filter: null }] }, 'c');
    service.drafts = [complete, draft({}, 'd')];
    expect(service.hasPendingChange).toBe(false);
    expect(service.hasAnyWork).toBe(true);
    service.drafts = [complete, unfinished];
    expect(service.hasPendingChange).toBe(true);
    expect(service.rulesNeedFilters).toBe(true);
    service.drafts = [complete, clash];
    expect(service.hasDuplicateCodes).toBe(true);
    expect(service.hasPendingChange).toBe(true);
  });

  it('builds the configs of complete cards with new_column_names', () => {
    service.drafts = [
      draft({ code: ' grp ', defaultEnumeration: 'other', rules: [{ value: 'f', filter: female }, { value: '', filter: female }] }, 'a'),
      draft({ code: 'empty' }, 'b'),
    ];
    expect(service.configs()).toEqual([
      { new_column_names: ['grp'], strategy: 'filter_rules', rules: { f: female }, default_enumeration: 'other' },
    ]);
  });

  it('opens a new category and keeps the open editor on its category when another is removed', () => {
    const card = draft({ rules: [{ value: 'a', filter: null }] });
    expect(service.addRule(card)).toBe(1);
    expect(card.openRuleIndex).toBe(1);
    service.removeRule(card, 0);
    expect(card.openRuleIndex).toBe(0);
    service.removeRule(card, 0);
    expect(card.openRuleIndex).toBeNull();
    expect(card.rules).toEqual([]);
  });
});
