import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import type { TransformationStep } from '../../../../core/transformation-steps.utils';
import type { CategoryFilter, TransformationColumnDraft } from '../data-handling.models';
import { TransformationDraftsService } from './transformation-drafts.service';
import { TransformationStatisticsService } from './transformation-statistics.service';

const female = { field: 'sex', operator: 'equal', value: 'F' } as unknown as CategoryFilter;

function draft(patch: Partial<TransformationColumnDraft>): TransformationColumnDraft {
  return { id: 'n1', code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null, ...patch };
}

const complete = draft({ code: 'grp', defaultEnumeration: 'other', rules: [{ value: 'f', filter: female }] });
const kmeans: TransformationStep = {
  id: 'k1',
  name: 'kmeans_cluster_creator',
  parameters: {
    new_column_names: ['cluster'],
    variables: ['age'],
    reusable_preprocessing: { cluster_variables: ['age'], cluster_choices: [{ cluster_id: 'c1', label: 'Young' }] },
  },
};

function describeResponse(code: string, counts: Record<string, number>) {
  return { status: 'success', result: { featurewise: [{ variable: code, dataset: 'all datasets', data: { counts } }] } };
}

describe('TransformationStatisticsService', () => {
  const answers = new Subject<unknown>();
  const studio = {
    appliedTransformations: signal<TransformationStep[]>([]),
    selectedVariables: signal([{ code: 'sex' }]),
    selectedDataModel: signal(null),
    filterVariableCodes: vi.fn(() => ['sex']),
    transformationSourceCodesForInput: vi.fn((): string[] => []),
    buildTransformationDescribePreprocessing: vi.fn(() => ({})),
    loadDescriptiveOverview: vi.fn(() => answers),
    outputsInUse: vi.fn((): string[] => []),
  };
  let drafts: TransformationDraftsService;
  let service: TransformationStatisticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    studio.appliedTransformations.set([]);
    studio.transformationSourceCodesForInput.mockReturnValue([]);
    TestBed.configureTestingModule({
      providers: [TransformationDraftsService, TransformationStatisticsService, { provide: ExperimentStudioService, useValue: studio }],
    });
    drafts = TestBed.inject(TransformationDraftsService);
    service = TestBed.inject(TransformationStatisticsService);
  });

  it('shows the category shape with no counts, plus a reason, while no card forms a column', () => {
    drafts.drafts = [draft({ code: 'grp', rules: [{ value: 'f', filter: null }] })];
    service.refresh();
    expect(service.blocks()).toEqual([{ code: 'grp', rows: [{ value: 'f', count: null }] }]);
    expect(service.error()).toBe('Each derived column needs a filter on each one before counts can be loaded.');
    expect(service.loading()).toBe(false);
    expect(studio.loadDescriptiveOverview).not.toHaveBeenCalled();
    expect(service.countChart(service.blocks()[0])).toBeNull();
  });

  it('loads every column with one describe and fills the counts', () => {
    drafts.drafts = [complete];
    studio.appliedTransformations.set([kmeans]);
    studio.transformationSourceCodesForInput.mockReturnValue(['age']);
    service.refresh();
    expect(service.loading()).toBe(true);
    expect(studio.loadDescriptiveOverview).toHaveBeenCalledWith(['grp', 'cluster'], {}, ['sex', 'age']);

    answers.next(describeResponse('grp', { f: 4, other: 6 }));
    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('');
    expect(service.forColumn(' grp ')[0].rows).toEqual([{ value: 'f', count: 4 }, { value: 'other', count: 6 }]);
    expect(service.countChart(service.forColumn('grp')[0])).toMatchObject({ bins: ['f', 'other'], counts: [4, 6], variableType: 'nominal' });
    expect(service.count(complete, 'f')).toBe('4');
    expect(service.count(complete, 'missing')).toBe('—');
    // The K-means column got no counts, yet another column did, so no notice.
    expect(service.forColumn('cluster')[0].rows).toEqual([{ value: 'c1', count: null }]);
  });

  it('keeps the preprocessing check ahead of the request', () => {
    drafts.drafts = [complete];
    service.ports.hasInvalidPendingRules = () => true;
    service.refresh();
    expect(service.error()).toBe('Fix the preprocessing rules before loading category counts.');
    expect(service.loading()).toBe(false);
    expect(studio.loadDescriptiveOverview).not.toHaveBeenCalled();
  });

  it('drops the counts when an edit invalidates them, keeping K-means tables', () => {
    drafts.drafts = [complete];
    studio.appliedTransformations.set([kmeans]);
    service.countsDraftId.set('n1');
    service.blocks.set([{ code: 'grp', rows: [] }, { code: 'cluster', rows: [] }]);
    service.invalidate();
    expect(service.countsDraftId()).toBeNull();
    expect(service.blocks().map((block) => block.code)).toEqual(['cluster']);
    // Nothing was loaded for a card: another invalidate changes nothing.
    service.blocks.set([{ code: 'grp', rows: [] }]);
    service.invalidate();
    expect(service.blocks().length).toBe(1);
  });

  it('describes an applied K-means column as a categorical one', () => {
    studio.appliedTransformations.set([kmeans]);
    service.ports.variableLabel = (code) => (code === 'age' ? 'Age at visit' : code);
    expect(service.kmeansColumnView('cluster')).toEqual({
      code: 'cluster',
      lead: 'Each record is assigned to the nearest of these clusters, using Age at visit.',
      foot: '1 cluster from Age at visit · covers every record that has those variables',
      rules: { c1: 'Nearest cluster — Young' },
    });
    expect(service.kmeansColumnView('grp')).toBeNull();
    service.blocks.set([{ code: 'cluster', rows: [] }]);
    expect(service.showsRuleColumnCounts()).toBe(false);
    service.blocks.set([{ code: 'grp', rows: [] }]);
    expect(service.showsRuleColumnCounts()).toBe(true);
  });
});
