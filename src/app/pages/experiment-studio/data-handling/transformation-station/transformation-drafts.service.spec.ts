import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import type { TransformationStep } from '../../../../core/transformation-steps.utils';
import type { CategoryFilter, TransformationColumnDraft } from '../data-handling.models';
import { TransformationDraftsService } from './transformation-drafts.service';

const female = { field: 'sex', operator: 'equal', value: 'F' } as unknown as CategoryFilter;

function draft(patch: Partial<TransformationColumnDraft>, id = 'step-1'): TransformationColumnDraft {
  return { id, code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null, ...patch };
}

function step(id: string, name: TransformationStep['name'], outputs: string[] = []): TransformationStep {
  return { id, name, parameters: outputs.length ? { new_column_names: outputs } : {} };
}

describe('TransformationDraftsService', () => {
  const studio = {
    appliedTransformations: signal<TransformationStep[]>([]),
    selectedDataModel: signal(null),
    catalogLoaded: signal(true),
    hasPreprocessingSpec: vi.fn(() => true),
    availableCreatorNames: vi.fn(() => []),
    outputsInUse: vi.fn((): string[] => []),
    transformationDependents: vi.fn((): TransformationStep[] => []),
    upsertTransformation: vi.fn(),
    removeTransformation: vi.fn(),
    clearTransformations: vi.fn(),
  };
  let service: TransformationDraftsService;

  beforeEach(() => {
    vi.clearAllMocks();
    studio.appliedTransformations.set([]);
    studio.outputsInUse.mockReturnValue([]);
    studio.transformationDependents.mockReturnValue([]);
    TestBed.configureTestingModule({
      providers: [TransformationDraftsService, { provide: ExperimentStudioService, useValue: studio }],
    });
    service = TestBed.inject(TransformationDraftsService);
  });

  it('starts empty; choosing a nominal column adds a step, a shown draft and an open card', () => {
    expect(service.drafts).toEqual([]);
    const id = service.choose('categorical_column_creator');
    expect(studio.upsertTransformation).toHaveBeenCalledWith({ id, name: 'categorical_column_creator', parameters: {} });
    expect(service.drafts.map((card) => card.id)).toEqual([id]);
    expect(service.isShown(service.drafts[0])).toBe(true);
    expect(service.isCardOpen(id)).toBe(true);
    // Other creators get a step and an open card, but no rule-editor draft.
    service.choose('kmeans_cluster_creator');
    expect(service.drafts.length).toBe(1);
  });

  it('removes a step with its draft, unless a later step still reads its columns', () => {
    const id = service.choose('categorical_column_creator');
    studio.transformationDependents.mockReturnValue([step('later', 'kmeans_cluster_creator', ['cluster'])]);
    expect(service.canRemove(id)).toBe(false);
    expect(service.removeTooltip(id)).toBe('Used by cluster');
    expect(service.remove(id)).toBe(false);
    expect(studio.removeTransformation).not.toHaveBeenCalled();

    studio.transformationDependents.mockReturnValue([]);
    service.setCardOpen(id, false);
    expect(service.remove(id)).toBe(true);
    expect(studio.removeTransformation).toHaveBeenCalledWith(id);
    expect(service.drafts).toEqual([]);
    expect(service.cardOpenState()).toEqual({});
  });

  it('reports each card status, new work and duplicate names', () => {
    const complete = draft({ code: 'grp', rules: [{ value: 'f', filter: female }] }, 'a');
    const clash = draft({ code: 'grp', rules: [{ value: 'f', filter: female }] }, 'b');
    const unfinished = draft({ code: 'other', rules: [{ value: 'f', filter: null }] }, 'c');
    service.drafts = [complete, unfinished, draft({}, 'd')];
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

  it('refuses a name another step writes, or one a later step reads', () => {
    studio.appliedTransformations.set([step('pca', 'pca_column_creator', ['pc1'])]);
    const card = draft({ code: 'pc1', rules: [{ value: 'f', filter: female }] }, 'nominal');
    service.drafts = [card];
    expect(service.columnNameError('nominal', 'pc1')).toBe('Name already used');
    expect(service.columnNameError('nominal', 'fresh')).toBeNull();
    expect(service.columnNameError('nominal', '  ')).toBeNull();
    expect(service.status(card)).toEqual({ label: 'Duplicate name', tone: 'pending' });

    studio.outputsInUse.mockReturnValue(['cluster']);
    expect(service.columnNameError('nominal', 'fresh')).toBe('Used by a later step: cluster');
    expect(service.status(draft({ code: 'fresh', rules: [{ value: 'f', filter: female }] }, 'nominal'))).toEqual({
      label: 'Column in use',
      tone: 'pending',
    });
  });

  it('lets only the first of two drafts claim a name', () => {
    service.drafts = [draft({ code: 'grp' }, 'first'), draft({ code: 'grp' }, 'second')];
    expect(service.columnNameError('first', 'grp')).toBeNull();
    expect(service.columnNameError('second', 'grp')).toBe('Name already used');
  });

  it('titles and chips every creator, and flags creators the deployment lacks', () => {
    const nominal = draft({ code: 'grp' }, 'n');
    service.drafts = [nominal];
    expect(service.stepTitle(step('n', 'categorical_column_creator'))).toBe('Nominal column · grp');
    expect(service.stepTitle(step('k', 'kmeans_cluster_creator', ['cluster']))).toBe('K-means cluster column · cluster');
    expect(service.stepTitle(step('p', 'pca_column_creator'))).toBe('PCA component columns');
    expect(service.stepStatus(step('k', 'kmeans_cluster_creator', ['cluster']))).toEqual({ label: 'Applied', tone: 'applied' });
    expect(service.stepStatus(step('k', 'kmeans_cluster_creator'))).toEqual({ label: 'Not set', tone: 'default' });
    studio.hasPreprocessingSpec.mockReturnValue(false);
    expect(service.isCreatorAvailable('pca_column_creator')).toBe(false);
    expect(service.stepStatus(step('p', 'pca_column_creator'))).toEqual({ label: 'Unavailable', tone: 'pending' });
    studio.catalogLoaded.set(false);
    expect(service.isCreatorAvailable('pca_column_creator')).toBe(true);
  });

  it('builds a config only from complete cards', () => {
    service.drafts = [
      draft({ code: ' grp ', defaultEnumeration: 'other', rules: [{ value: 'f', filter: female }, { value: '', filter: female }] }, 'a'),
      draft({ code: 'empty' }, 'b'),
    ];
    expect(service.configs()).toEqual([
      { new_column_names: ['grp'], strategy: 'filter_rules', rules: { f: female }, default_enumeration: 'other' },
    ]);
  });

  it('clears the store steps, drafts and open state on reset', () => {
    service.choose('categorical_column_creator');
    service.reset();
    expect(studio.clearTransformations).toHaveBeenCalled();
    expect(service.drafts).toEqual([]);
    expect(service.cardOpenState()).toEqual({});
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
