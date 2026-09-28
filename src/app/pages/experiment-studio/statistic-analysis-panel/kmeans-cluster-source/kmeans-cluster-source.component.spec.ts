import { provideZonelessChangeDetection } from '@angular/core';
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
    schema_version: '1',
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
    selectedVariables: jasmine.Spy;
    getActiveDataModelCode: jasmine.Spy;
    requestDatasets: jasmine.Spy;
    requestFilters: jasmine.Spy;
    appliedKMeansClusterCreator: jasmine.Spy;
    setKMeansClusterPreprocessing: jasmine.Spy;
    loadKMeansReport: jasmine.Spy;
  };
  let dashboard: {
    listKMeansExperiments: jasmine.Spy;
    getExperimentResult: jasmine.Spy;
  };

  function html(): HTMLElement {
    return fixture.nativeElement;
  }

  beforeEach(async () => {
    studio = {
      selectedVariables: jasmine.createSpy('selectedVariables').and.returnValue([]),
      getActiveDataModelCode: jasmine.createSpy('getActiveDataModelCode').and.returnValue(CONTEXT.dataModel),
      requestDatasets: jasmine.createSpy('requestDatasets').and.returnValue(CONTEXT.datasets),
      requestFilters: jasmine.createSpy('requestFilters').and.returnValue(CONTEXT.filters),
      appliedKMeansClusterCreator: jasmine.createSpy('appliedKMeansClusterCreator').and.returnValue(null),
      setKMeansClusterPreprocessing: jasmine.createSpy('setKMeansClusterPreprocessing'),
      loadKMeansReport: jasmine.createSpy('loadKMeansReport').and.returnValue(of({})),
    };
    dashboard = {
      listKMeansExperiments: jasmine.createSpy('listKMeansExperiments').and.returnValue(of([])),
      getExperimentResult: jasmine.createSpy('getExperimentResult').and.returnValue(of({})),
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
    component = fixture.componentInstance;
  });

  it('lists only compatible experiments and reports the hidden count', () => {
    dashboard.listKMeansExperiments.and.returnValue(
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
    dashboard.listKMeansExperiments.and.returnValue(of([kmeansExperiment('a')]));
    fixture.detectChanges();
    component.selectedUuid.set('a');
    dashboard.getExperimentResult.and.returnValue(of({ result: { reusable_preprocessing: reusable() } }));

    component.apply();

    expect(studio.setKMeansClusterPreprocessing).toHaveBeenCalledWith({
      code: 'kmeans_cluster',
      reusable_preprocessing: reusable(),
    });
    expect(component.error()).toBeNull();
  });

  it('apply() refuses a result without reusable_preprocessing', () => {
    dashboard.listKMeansExperiments.and.returnValue(of([kmeansExperiment('a')]));
    fixture.detectChanges();
    component.selectedUuid.set('a');
    dashboard.getExperimentResult.and.returnValue(of({ result: { clusters: [] } }));

    component.apply();

    expect(component.error()).toBe(
      'This K-means result cannot be reused. Re-run the K-means experiment and try again.',
    );
    expect(studio.setKMeansClusterPreprocessing).not.toHaveBeenCalled();
  });

  it('apply() rejects a column name that is not an identifier', () => {
    dashboard.listKMeansExperiments.and.returnValue(of([kmeansExperiment('a')]));
    fixture.detectChanges();
    component.selectedUuid.set('a');
    component.code.set('1st column');

    component.apply();

    expect(component.error()).toBe(
      'Use letters, digits and underscores, starting with a letter or underscore.',
    );
    expect(dashboard.getExperimentResult).not.toHaveBeenCalled();
    expect(studio.setKMeansClusterPreprocessing).not.toHaveBeenCalled();
  });

  it('remove() drops the applied cluster column', () => {
    studio.appliedKMeansClusterCreator.and.returnValue({ code: 'kmeans_cluster', reusable_preprocessing: reusable() });

    component.remove();

    expect(studio.setKMeansClusterPreprocessing).toHaveBeenCalledWith(null);
  });

  it('asks the stage to run the creator once the column is applied', () => {
    dashboard.listKMeansExperiments.and.returnValue(of([kmeansExperiment('a')]));
    fixture.detectChanges();
    component.selectedUuid.set('a');
    dashboard.getExperimentResult.and.returnValue(of({ result: { reusable_preprocessing: reusable() } }));
    const runs: number[] = [];
    component.runRequested.subscribe(() => runs.push(1));

    component.apply();

    expect(runs.length).toBe(1);
  });

  it('reports a failed experiment list instead of an empty picker', () => {
    dashboard.listKMeansExperiments.and.returnValue(throwError(() => new Error('offline')));

    fixture.detectChanges();

    expect(component.error()).toBe('Could not load K-means experiments.');
    expect(component.loading()).toBeFalse();
  });

  it('offers the in-place K-means report when the user has no finished run', () => {
    dashboard.listKMeansExperiments.and.returnValue(of([]));

    fixture.detectChanges();

    expect(html().textContent).toContain('Run K-means here');
    expect(html().textContent).toContain('Run K-means report');
  });

  it('runs the K-means report in place and stores its reusable preprocessing', () => {
    studio.selectedVariables.and.returnValue([{ code: 'age', label: 'Age', type: 'real' }]);
    const reusablePreprocessing = reusable();
    studio.loadKMeansReport.and.returnValue(of({
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

    expect(studio.loadKMeansReport).toHaveBeenCalledWith(['age']);
    expect(component.report()?.selected_k).toBe(2);
    expect(component.reportReusable()).toBe(reusablePreprocessing);

    component.useReport();
    expect(studio.setKMeansClusterPreprocessing).toHaveBeenCalledWith({
      code: 'kmeans_cluster',
      reusable_preprocessing: reusablePreprocessing,
    });
  });
});
