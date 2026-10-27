import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { BackendExperiment } from '../../../../models/backend-experiment.model';
import { KMeansReusablePreprocessing } from '../../../../core/kmeans-cluster-source.utils';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../../services/experiments-dashboard.service';
import { KMeansClusterSourceComponent } from './kmeans-cluster-source.component';

const CONTEXT = { dataModel: 'Stroke:3.7', datasets: ['diabetes'], filters: null };

function kmeansExperiment(uuid: string, overrides: Record<string, unknown> = {}): BackendExperiment {
  return {
    uuid,
    name: `K-means ${uuid}`,
    created: '2024-01-01T00:00:00Z',
    finished: '2024-01-01T00:05:00Z',
    shared: false,
    viewed: false,
    status: 'success',
    analysis: {
      inputdata: {
        data_model: CONTEXT.dataModel,
        datasets: CONTEXT.datasets,
        filters: null,
        variables: ['age'],
      },
      algorithm: { name: 'kmeans' },
    },
    ...overrides,
  } as BackendExperiment;
}

function reusable(): KMeansReusablePreprocessing {
  return {
    enumeration_prefix: 'cluster_',
    preprocessing_name: 'kmeans_cluster_creator',
    cluster_variables: ['age', 'bmi'],
    centers: { c1: { age: 40 } },
    source_context: { data_model: CONTEXT.dataModel!, datasets: CONTEXT.datasets, input_fingerprint: 'fp' },
    available_outputs: [],
    cluster_choices: [
      { cluster_id: 'c1', label: 'Cluster 1' },
      { cluster_id: 'c2', label: 'Cluster 2' },
    ],
  };
}

describe('KMeansClusterSourceComponent', () => {
  let fixture: ComponentFixture<KMeansClusterSourceComponent>;
  let component: KMeansClusterSourceComponent;
  let studio: {
    selectedVariables: Mock;
    algorithmAssignableVariables: Mock;
    getActiveDataModelCode: Mock;
    requestDatasets: Mock;
    requestFilters: Mock;
    appliedKMeansClusterCreator: Mock;
    setKMeansClusterPreprocessing: Mock;
    appliedTransformations: ReturnType<typeof signal<any[]>>;
    upsertTransformation: Mock;
    outputsInUse: Mock;
    removeTransformation: Mock;
    loadKMeansReport: Mock;
    backendAlgorithms: ReturnType<typeof signal<Record<string, { configSchema?: unknown[] }>>>;
  };
  let dashboard: {
    listKMeansExperiments: Mock;
    getExperimentResult: Mock;
  };

  function html(): HTMLElement {
    return fixture.nativeElement;
  }

  beforeEach(async () => {
    studio = {
      selectedVariables: vi.fn().mockReturnValue([]),
      algorithmAssignableVariables: vi.fn().mockReturnValue([]),
      getActiveDataModelCode: vi.fn().mockReturnValue(CONTEXT.dataModel),
      requestDatasets: vi.fn().mockReturnValue(CONTEXT.datasets),
      requestFilters: vi.fn().mockReturnValue(CONTEXT.filters),
      appliedKMeansClusterCreator: vi.fn().mockReturnValue(null),
      setKMeansClusterPreprocessing: vi.fn(),
      appliedTransformations: signal([] as any[]),
      outputsInUse: vi.fn().mockReturnValue([]),
      upsertTransformation: vi.fn((step: any) => {
        const current = studio.appliedTransformations();
        const index = current.findIndex((existing) => existing.id === step.id);
        studio.appliedTransformations.set(
          index === -1 ? [...current, step] : current.map((existing, i) => (i === index ? step : existing)),
        );
      }),
      removeTransformation: vi.fn((id: string) => {
        studio.appliedTransformations.set(studio.appliedTransformations().filter((step) => step.id !== id));
      }),
      loadKMeansReport: vi.fn().mockReturnValue(of({})),
      backendAlgorithms: signal({}),
    };
    dashboard = {
      listKMeansExperiments: vi.fn().mockReturnValue(of([])),
      getExperimentResult: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [KMeansClusterSourceComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ExperimentsDashboardService, useValue: dashboard },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(KMeansClusterSourceComponent);
    fixture.componentRef.setInput('stepId', 'kmeans-step-1');
    component = fixture.componentInstance;
  });

  it('lists only compatible experiments and reports the hidden count', () => {
    dashboard.listKMeansExperiments.mockReturnValue(
      of([
        kmeansExperiment('a'),
        // Different datasets → hidden.
        kmeansExperiment('b', { analysis: { inputdata: { data_model: CONTEXT.dataModel, datasets: ['other'], filters: null, variables: [] }, algorithm: { name: 'kmeans' } } }),
        // Different data model → hidden.
        kmeansExperiment('c', { analysis: { inputdata: { data_model: 'Other:1', datasets: CONTEXT.datasets, filters: null, variables: [] }, algorithm: { name: 'kmeans' } } }),
      ]),
    );

    fixture.detectChanges();

    expect(component.compatible().map((experiment) => experiment.uuid)).toEqual(['a']);
    expect(component.hiddenCount()).toBe(2);
    expect(html().querySelectorAll('select option').length).toBe(1);
    expect(html().textContent).toContain('2 K-means experiments hidden');
  });

  it('apply() stores a valid reusable_preprocessing under the default code', () => {
    dashboard.listKMeansExperiments.mockReturnValue(of([kmeansExperiment('a')]));
    fixture.detectChanges();
    component.selectedUuid.set('a');
    dashboard.getExperimentResult.mockReturnValue(of({ result: { reusable_preprocessing: reusable() } }));

    component.apply();

    expect(studio.upsertTransformation).toHaveBeenCalledWith({
      id: 'kmeans-step-1',
      name: 'kmeans_cluster_creator',
      parameters: {
        new_column_names: ['kmeans_cluster'],
        k: 2,
        enumeration_prefix: 'cluster_',
        reusable_preprocessing: reusable(),
      },
    });
    expect(component.error()).toBeNull();
  });

  it('apply() refuses a result without reusable_preprocessing', () => {
    dashboard.listKMeansExperiments.mockReturnValue(of([kmeansExperiment('a')]));
    fixture.detectChanges();
    component.selectedUuid.set('a');
    dashboard.getExperimentResult.mockReturnValue(of({ result: { clusters: [] } }));

    component.apply();

    expect(component.error()).toBe(
      'This K-means result cannot be reused. Re-run the K-means experiment and try again.',
    );
    expect(studio.upsertTransformation).not.toHaveBeenCalled();
  });

  it('apply() rejects a column name that is not an identifier', () => {
    dashboard.listKMeansExperiments.mockReturnValue(of([kmeansExperiment('a')]));
    fixture.detectChanges();
    component.selectedUuid.set('a');
    component.code.set('1st column');

    component.apply();

    expect(component.error()).toBe(
      'Use letters, digits and underscores, starting with a letter or underscore.',
    );
    expect(dashboard.getExperimentResult).not.toHaveBeenCalled();
    expect(studio.upsertTransformation).not.toHaveBeenCalled();
  });

  it('apply() and useReport() refuse a colliding column name without upserting', () => {
    dashboard.listKMeansExperiments.mockReturnValue(of([kmeansExperiment('a')]));
    fixture.componentRef.setInput('columnNameError', () => 'Name already used');
    fixture.detectChanges();
    component.selectedUuid.set('a');
    dashboard.getExperimentResult.mockReturnValue(of({ result: { reusable_preprocessing: reusable() } }));

    component.apply();

    expect(component.error()).toBe('Name already used');
    expect(studio.upsertTransformation).not.toHaveBeenCalled();

    studio.upsertTransformation.mockClear();
    component.reportReusable.set(reusable());
    component.useReport();

    expect(component.runError()).toBe('Name already used');
    expect(studio.upsertTransformation).not.toHaveBeenCalled();
  });

  it('remove() drops the applied cluster column', () => {
    studio.appliedTransformations.set([{
      id: 'kmeans-step-1',
      name: 'kmeans_cluster_creator',
      parameters: {
        new_column_names: ['kmeans_cluster'],
        k: 2,
        enumeration_prefix: 'cluster_',
        reusable_preprocessing: reusable(),
      },
    }]);

    component.remove();

    expect(studio.removeTransformation).toHaveBeenCalledWith('kmeans-step-1');
  });

  it('inner Remove is a no-op when canRemove is false', () => {
    studio.appliedTransformations.set([{
      id: 'kmeans-step-1',
      name: 'kmeans_cluster_creator',
      parameters: {
        new_column_names: ['kmeans_cluster'],
        k: 2,
        enumeration_prefix: 'cluster_',
        reusable_preprocessing: reusable(),
      },
    }]);
    fixture.componentRef.setInput('canRemove', false);
    fixture.componentRef.setInput('removeTooltip', 'Used by later');
    fixture.detectChanges();

    component.remove();

    expect(studio.removeTransformation).not.toHaveBeenCalled();
  });

  it('asks the stage to run the creator once the column is applied', () => {
    dashboard.listKMeansExperiments.mockReturnValue(of([kmeansExperiment('a')]));
    fixture.detectChanges();
    component.selectedUuid.set('a');
    dashboard.getExperimentResult.mockReturnValue(of({ result: { reusable_preprocessing: reusable() } }));
    const runs: number[] = [];
    component.runRequested.subscribe(() => runs.push(1));

    component.apply();

    expect(runs.length).toBe(1);
  });

  it('reports a failed experiment list instead of an empty picker', () => {
    dashboard.listKMeansExperiments.mockReturnValue(throwError(() => new Error('offline')));

    fixture.detectChanges();

    expect(component.error()).toBe('Could not load K-means experiments.');
    expect(component.loading()).toBe(false);
  });

  it('offers the in-place K-means report when the user has no finished run', () => {
    dashboard.listKMeansExperiments.mockReturnValue(of([]));

    fixture.detectChanges();

    expect(html().textContent).toContain('Choose the numerical variables to group by');
    expect(html().textContent).toContain('Run K-means report');
  });

  it('runs the K-means report in place and stores its reusable preprocessing', () => {
    studio.selectedVariables.mockReturnValue([{ code: 'age', label: 'Age', type: 'real' }]);
    const reusablePreprocessing = reusable();
    studio.loadKMeansReport.mockReturnValue(of({
      result_type: 'privacy_safe_cluster_report',
      selected_k: 2,
      k_selection: 'manual',
      n_obs_interval: '100–200',
      clusters: [
        { cluster_id: 'c1', label: 'Cluster 1', size_interval: '40–60', center: { age: 40 }, profile: [], interpretation: 'Younger', quality: { compactness: null } },
      ],
      elbow: null,
      reusable_preprocessing: reusablePreprocessing,
    }));

    fixture.detectChanges();
    component.runReport();

    expect(studio.loadKMeansReport).toHaveBeenCalledWith(['age'], {});
    expect(component.report()?.selected_k).toBe(2);
    expect(component.reportReusable()).toBe(reusablePreprocessing);

    component.useReport();
    expect(studio.upsertTransformation).toHaveBeenCalledWith({
      id: 'kmeans-step-1',
      name: 'kmeans_cluster_creator',
      parameters: {
        new_column_names: ['kmeans_cluster'],
        k: 2,
        enumeration_prefix: 'cluster_',
        reusable_preprocessing: reusablePreprocessing,
      },
    });
  });

  it('keeps catalog defaults until Parameters changes one', () => {
    studio.selectedVariables.mockReturnValue([{ code: 'age', label: 'Age', type: 'real' }]);
    studio.backendAlgorithms.set({
      kmeans: {
        configSchema: [
          { key: 'k_selection', label: 'K selection', type: 'select', required: true, default: 'manual', options: ['manual', 'elbow'] },
          { key: 'k', label: 'Number of clusters', type: 'number', types: ['int'], required: false, default: 4 },
        ],
      },
    });

    fixture.detectChanges();

    const advanced = html().querySelector('.kmeans-cluster-source-advanced') as HTMLButtonElement;
    expect(advanced.querySelector('.kmeans-params-label')?.textContent?.trim()).toBe('Parameters');
    // Closed, the row says whether the run departs from the catalog.
    expect(advanced.querySelector('.kmeans-params-summary')?.textContent?.trim()).toBe('All defaults');
    expect(html().querySelector('.kmeans-cluster-source-params')).toBeNull();

    advanced.click();
    fixture.detectChanges();

    const k = html().querySelector<HTMLInputElement>('#kmeans-param-k');
    expect(k?.value).toBe('4');
    k!.value = '3';
    k!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.parameterSummary()).toBe('Number of clusters 3');

    component.runReport();
    expect(studio.loadKMeansReport).toHaveBeenCalledWith(['age'], { k: 3 });

    k!.value = ' 4 ';
    k!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.parameterSummary()).toBe('All defaults');

    k!.value = 'nope';
    k!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.parameterSummary()).toBe('All defaults');
  });

  it('sizes each cluster share bar from the interval midpoint', () => {
    studio.selectedVariables.mockReturnValue([{ code: 'age', label: 'Age', type: 'real' }]);
    studio.loadKMeansReport.mockReturnValue(of({
      result_type: 'privacy_safe_cluster_report',
      selected_k: 2,
      k_selection: 'manual',
      n_obs_interval: '100–200',
      clusters: [
        { cluster_id: 'c1', label: 'Cluster 1', size_interval: '40–60', center: { age: 40 }, profile: [], interpretation: 'Younger', quality: { compactness: null } },
        { cluster_id: 'c2', label: 'Cluster 2', size_interval: '120–140', center: { age: 60 }, profile: [], interpretation: 'Older', quality: { compactness: null } },
      ],
      elbow: null,
      reusable_preprocessing: reusable(),
    }));

    fixture.detectChanges();
    component.runReport();

    // Privacy intervals arrive as "40–60", so the bar is sized off the midpoint: 50 of 180.
    expect(component.clusterShares()['c1']).toBeCloseTo((50 / 180) * 100, 5);
    expect(component.clusterShares()['c2']).toBeCloseTo((130 / 180) * 100, 5);

    fixture.detectChanges();
    expect(html().querySelectorAll('.kmeans-cluster-report-bar > span').length).toBe(2);
  });

  it('setSourceMode clears parameterDraft and runExcludedCodes', () => {
    (component as any).parameterDraft.set({ k: '5', maxiter: '50' });
    (component as any).runExcludedCodes.set(new Set(['age']));

    component.setSourceMode('fit');

    expect((component as any).parameterDraft()).toEqual({});
    expect((component as any).runExcludedCodes().size).toBe(0);
    expect(component.sourceMode()).toBe('fit');
  });

  it('fit mode stores variables without reusable_preprocessing', () => {
    studio.selectedVariables.mockReturnValue([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'bmi', label: 'BMI', type: 'real' },
    ]);
    studio.algorithmAssignableVariables.mockReturnValue([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'bmi', label: 'BMI', type: 'real' },
    ]);

    fixture.detectChanges();
    component.sourceMode.set('fit');
    component.code.set('km_fit');
    component.fitK.set(3);
    // Deselect nothing — both numerical CDEs start selected.
    component.applyFit();

    expect(studio.upsertTransformation).toHaveBeenCalledWith({
      id: 'kmeans-step-1',
      name: 'kmeans_cluster_creator',
      parameters: {
        new_column_names: ['km_fit'],
        variables: ['age', 'bmi'],
        k: 3,
        enumeration_prefix: 'cluster_',
      },
    });
    const params = studio.upsertTransformation.mock.calls[0][0].parameters;
    expect(params).not.toHaveProperty('reusable_preprocessing');
  });

  it('fit mode offers earlier created columns unselected until the user picks them', () => {
    studio.appliedTransformations.set([
      { id: 'pca-step', name: 'pca_column_creator', parameters: { new_column_names: ['pca_pc1'] } },
      { id: 'kmeans-step-1', name: 'kmeans_cluster_creator', parameters: {} },
    ]);
    studio.selectedVariables.mockReturnValue([{ code: 'age', label: 'Age', type: 'real' }]);
    studio.algorithmAssignableVariables.mockReturnValue([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'pca_pc1', label: 'pca_pc1', type: 'real', isCreatedColumn: true },
    ]);

    fixture.detectChanges();
    component.setSourceMode('fit');

    expect(component.fitNumericVariables().map((variable) => variable.code)).toEqual(['age', 'pca_pc1']);
    expect(component.fitSelectedCodes()).toEqual(['age']);

    component.toggleRunVariable('pca_pc1');
    expect(component.fitSelectedCodes()).toEqual(['age', 'pca_pc1']);
  });

  it('two fit-mode components with different stepId values write two steps', () => {
    studio.selectedVariables.mockReturnValue([{ code: 'age', label: 'Age', type: 'real' }]);
    studio.algorithmAssignableVariables.mockReturnValue([
      { code: 'age', label: 'Age', type: 'real' },
    ]);

    fixture.detectChanges();
    component.sourceMode.set('fit');
    component.code.set('km_a');
    component.fitK.set(2);
    component.applyFit();

    const second = TestBed.createComponent(KMeansClusterSourceComponent);
    second.componentRef.setInput('stepId', 'kmeans-step-2');
    const other = second.componentInstance;
    second.detectChanges();
    other.sourceMode.set('fit');
    other.code.set('km_b');
    other.fitK.set(4);
    other.applyFit();

    expect(studio.appliedTransformations().map((step) => step.id)).toEqual([
      'kmeans-step-1',
      'kmeans-step-2',
    ]);
    expect(studio.appliedTransformations().map((step) => step.parameters['new_column_names'])).toEqual([
      ['km_a'],
      ['km_b'],
    ]);
    for (const step of studio.appliedTransformations()) {
      expect(step.parameters).not.toHaveProperty('reusable_preprocessing');
      expect(step.parameters['variables']).toEqual(['age']);
      expect(step.parameters['enumeration_prefix']).toBe('cluster_');
    }
  });

  it('renaming a cluster column a later step reads is refused', () => {
    studio.selectedVariables.mockReturnValue([{ code: 'age', label: 'Age', type: 'real' }]);
    studio.outputsInUse.mockImplementation((id: string, next: string[]) =>
      id === 'kmeans-step-1' && !next.includes('km') ? ['km'] : [],
    );
    fixture.detectChanges();
    component.sourceMode.set('fit');
    component.code.set('km_renamed');

    component.applyFit();

    expect(component.error()).toBe('Used by a later step: km');
    expect(studio.upsertTransformation).not.toHaveBeenCalled();
  });
});
