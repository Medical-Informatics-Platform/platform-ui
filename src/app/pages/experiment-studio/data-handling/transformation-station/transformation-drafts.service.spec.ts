import type { CategoryFilter, TransformationColumnDraft } from '../data-handling.models';
import { TransformationDraftsService } from './transformation-drafts.service';

const female = { field: 'sex', operator: 'equal', value: 'F' } as unknown as CategoryFilter;

function draft(patch: Partial<TransformationColumnDraft>, id = 1): TransformationColumnDraft {
  return { id, code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null, ...patch };
}

describe('TransformationDraftsService', () => {
  let service: TransformationDraftsService;
  beforeEach(() => (service = new TransformationDraftsService()));

  it('starts with one blank, hidden card and resets the last card instead of removing it', () => {
    expect(service.drafts.length).toBe(1);
    const [blank] = service.drafts;
    expect(service.isShown(blank)).toBe(false);
    expect(service.firstHidden()).toBe(blank);
    blank.code = 'x';
    expect(service.remove(blank.id)).toBe(true);
    expect(service.drafts.length).toBe(1);
    expect(service.drafts[0]).not.toBe(blank);
    expect(service.drafts[0].code).toBe('');
    expect(service.remove(-1)).toBe(false);
  });

  it('adds chosen cards and removes them by id', () => {
    service.add();
    expect(service.drafts.length).toBe(2);
    expect(service.isShown(service.drafts[1])).toBe(true);
    service.remove(service.drafts[0].id);
    expect(service.drafts.map((card) => card.chosen)).toEqual([true]);
  });

  it('reports each card status, new work and duplicate names', () => {
    const complete = draft({ code: 'grp', rules: [{ value: 'f', filter: female }] }, 1);
    const clash = draft({ code: 'grp', rules: [{ value: 'f', filter: female }] }, 2);
    const unfinished = draft({ code: 'other', rules: [{ value: 'f', filter: null }] }, 3);
    service.drafts = [complete, unfinished, draft({}, 4)];
    expect(service.status(complete)).toEqual({ label: 'Applied', tone: 'applied' });
    expect(service.status(unfinished)).toEqual({ label: 'Not applied', tone: 'pending' });
    expect(service.status(service.drafts[2])).toEqual({ label: 'Not set', tone: 'default' });
    expect(service.hasNewWork(complete)).toBe(false);
    expect(service.hasNewWork(unfinished)).toBe(true);
    expect(service.hasPendingChange).toBe(true);
    expect(service.rulesNeedFilters).toBe(true);
    service.drafts = [complete, clash];
    expect(service.hasDuplicateCodes).toBe(true);
    expect(service.status(clash).label).toBe('Duplicate name');
    expect(service.hasNewWork(clash)).toBe(true);
  });

  it('builds the payload from complete cards, first card per name, or null', () => {
    service.drafts = [
      draft({ code: ' grp ', defaultEnumeration: 'other', rules: [{ value: 'f', filter: female }, { value: '', filter: female }] }, 1),
      draft({ code: 'grp', rules: [{ value: 'm', filter: female }] }, 2),
      draft({ code: 'empty' }, 3),
    ];
    expect(service.configs().length).toBe(2);
    expect(service.payload()).toEqual([{ code: 'grp', strategy: 'filter_rules', rules: { f: female }, default_enumeration: 'other' }]);
    service.reset();
    expect(service.payload()).toBeNull();
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
