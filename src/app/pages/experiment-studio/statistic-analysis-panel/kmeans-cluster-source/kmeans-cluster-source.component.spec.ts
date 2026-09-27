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
    getActiveDataModelCode: jasmine.Spy;
    requestDatasets: jasmine.Spy;
    requestFilters: jasmine.Spy;
    appliedKMeansClusterCreator: jasmine.Spy;
    setKMeansClusterPreprocessing: jasmine.Spy;
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
      getActiveDataModelCode: jasmine.createSpy('getActiveDataModelCode').and.returnValue(CONTEXT.dataModel),
      requestDatasets: jasmine.createSpy('requestDatasets').and.returnValue(CONTEXT.datasets),
      requestFilters: jasmine.createSpy('requestFilters').and.returnValue(CONTEXT.filters),
      appliedKMeansClusterCreator: jasmine.createSpy('appliedKMeansClusterCreator').and.returnValue(null),
      setKMeansClusterPreprocessing: jasmine.createSpy('setKMeansClusterPreprocessing'),
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

  it('reports a failed experiment list instead of an empty picker', () => {
    dashboard.listKMeansExperiments.and.returnValue(throwError(() => new Error('offline')));

    fixture.detectChanges();

    expect(component.error()).toBe('Could not load K-means experiments.');
    expect(component.loading()).toBeFalse();
  });
});
