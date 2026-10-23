import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { BackendExperiment } from '../../../../models/backend-experiment.model';
import { PCAReusablePreprocessing } from '../../../../core/pca-column-source.utils';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../../services/experiments-dashboard.service';
import { PcaColumnSourceComponent } from './pca-column-source.component';

const CONTEXT = { dataModel: 'Stroke:3.7', datasets: ['diabetes'], filters: null };

function pcaExperiment(uuid: string, overrides: Record<string, unknown> = {}): BackendExperiment {
  return {
    uuid,
    name: `PCA ${uuid}`,
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
        variables: ['age', 'bmi'],
      },
      algorithm: { name: 'pca' },
    },
    ...overrides,
  } as BackendExperiment;
}

function recipe(): PCAReusablePreprocessing {
  return {
    schema_version: '1',
    preprocessing_name: 'pca_column_creator',
    base_parameters: {
      variables: ['age', 'bmi'],
      pca_variant: 'pca',
    },
    component_choices: [
      { component_id: 'PC1', explained_variance_ratio: 0.855 },
      { component_id: 'PC2', explained_variance_ratio: 0.145 },
    ],
  };
}

describe('PcaColumnSourceComponent', () => {
  let fixture: ComponentFixture<PcaColumnSourceComponent>;
  let component: PcaColumnSourceComponent;
  let studio: {
    selectedVariables: Mock;
    selectedDataModel: Mock;
    algorithmAssignableVariables: Mock;
    getActiveDataModelCode: Mock;
    requestDatasets: Mock;
    requestFilters: Mock;
    appliedTransformations: ReturnType<typeof signal<any[]>>;
    upsertTransformation: Mock;
    outputsInUse: Mock;
    removeTransformation: Mock;
    loadPcaReport: Mock;
  };
  let dashboard: {
    listPcaExperiments: Mock;
    getExperimentResult: Mock;
  };

  beforeEach(async () => {
    studio = {
      selectedVariables: vi.fn().mockReturnValue([
        { code: 'age', label: 'Age', type: 'real' },
        { code: 'bmi', label: 'BMI', type: 'real' },
      ]),
      selectedDataModel: vi.fn().mockReturnValue({
        variables: [{ code: 'age' }, { code: 'bmi' }, { code: 'chol' }],
        groups: [],
      }),
      algorithmAssignableVariables: vi.fn().mockReturnValue([
        { code: 'age', label: 'Age', type: 'real' },
        { code: 'bmi', label: 'BMI', type: 'real' },
      ]),
      getActiveDataModelCode: vi.fn().mockReturnValue(CONTEXT.dataModel),
      requestDatasets: vi.fn().mockReturnValue(CONTEXT.datasets),
      requestFilters: vi.fn().mockReturnValue(CONTEXT.filters),
      appliedTransformations: signal([] as any[]),
      outputsInUse: vi.fn().mockReturnValue([]),
      upsertTransformation: vi.fn((step: any) => {
        const current = studio.appliedTransformations();
        const index = current.findIndex((existing) => existing.id === step.id);
        studio.appliedTransformations.set(
          index === -1 ? [...current, step] : current.map((existing, i) => (i === index ? step : existing)),
        );
      }),
      loadPcaReport: vi.fn().mockReturnValue(of({ status: 'success', result: { n_obs: 289, reusable_preprocessing: recipe() } })),
      removeTransformation: vi.fn((id: string) => {
        studio.appliedTransformations.set(studio.appliedTransformations().filter((step) => step.id !== id));
      }),
    };
    dashboard = {
      listPcaExperiments: vi.fn().mockReturnValue(of([])),
      getExperimentResult: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [PcaColumnSourceComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ExperimentsDashboardService, useValue: dashboard },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PcaColumnSourceComponent);
    fixture.componentRef.setInput('stepId', 'pca-step-1');
    component = fixture.componentInstance;
  });

  it('applying writes one pca_column_creator step through upsertTransformation', () => {
    dashboard.listPcaExperiments.mockReturnValue(of([pcaExperiment('a')]));
    dashboard.getExperimentResult.mockReturnValue(of({ result: { reusable_preprocessing: recipe() } }));
    fixture.detectChanges();

    component.onExperimentChange('a');
    component.apply();

    expect(studio.upsertTransformation).toHaveBeenCalledWith({
      id: 'pca-step-1',
      name: 'pca_column_creator',
      parameters: {
        reusable_preprocessing: recipe(),
        selected_components: ['PC1', 'PC2'],
        new_column_names: ['pca_pc1', 'pca_pc2'],
        n_components: 2,
      },
    });
  });

  it('ignores a result that arrives after another experiment was picked', () => {
    const responses: Record<string, Subject<unknown>> = { a: new Subject(), b: new Subject() };
    dashboard.listPcaExperiments.mockReturnValue(of([pcaExperiment('a'), pcaExperiment('b')]));
    dashboard.getExperimentResult.mockImplementation((uuid: string) => responses[uuid]);
    fixture.detectChanges();

    component.onExperimentChange('a');
    component.onExperimentChange('b');
    const recipeB = { ...recipe(), component_choices: [{ component_id: 'PC1', explained_variance_ratio: 0.9 }] };
    responses['b'].next({ result: { reusable_preprocessing: recipeB } });
    responses['a'].next({ result: { reusable_preprocessing: recipe() } });

    expect(component.selectedUuid()).toBe('b');
    expect(component.loadedRecipe()).toEqual(recipeB);
    expect(component.applying()).toBe(false);
  });

  it('refuses a PCA result built on created columns', () => {
    const onCreated = { ...recipe(), base_parameters: { variables: ['age', 'km_score'], pca_variant: 'pca' } };
    dashboard.listPcaExperiments.mockReturnValue(of([pcaExperiment('a')]));
    dashboard.getExperimentResult.mockReturnValue(of({ result: { reusable_preprocessing: onCreated } }));
    fixture.detectChanges();

    component.onExperimentChange('a');

    expect(component.loadedRecipe()).toBeNull();
    expect(component.error()).toContain('created');
  });

  it('fit mode offers earlier created columns unselected until the user picks them', () => {
    studio.appliedTransformations.set([
      { id: 'pca-step-0', name: 'pca_column_creator', parameters: { new_column_names: ['pca_pc1'] } },
      { id: 'pca-step-1', name: 'pca_column_creator', parameters: {} },
    ]);
    studio.algorithmAssignableVariables.mockReturnValue([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'bmi', label: 'BMI', type: 'real' },
      { code: 'pca_pc1', label: 'pca_pc1', type: 'real', isCreatedColumn: true },
    ]);
    fixture.detectChanges();
    component.setSourceMode('fit');

    expect(component.fitSelectedCodes()).toEqual(['age', 'bmi']);

    component.toggleFitVariable('pca_pc1');
    expect(component.fitSelectedCodes()).toEqual(['age', 'bmi', 'pca_pc1']);
  });

  it('fit mode applies only the components the current variables still provide', () => {
    const self = { id: 'pca-step-1', name: 'pca_column_creator', parameters: {} };
    studio.appliedTransformations.set([
      { id: 'pca-step-0', name: 'pca_column_creator', parameters: { new_column_names: ['pca_pc1'] } },
      self,
    ]);
    studio.algorithmAssignableVariables.mockReturnValue([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'bmi', label: 'BMI', type: 'real' },
      { code: 'pca_pc1', label: 'pca_pc1', type: 'real', isCreatedColumn: true },
    ]);
    fixture.detectChanges();
    component.setSourceMode('fit');
    component.toggleFitVariable('pca_pc1');
    component.toggleComponent('PC3');
    expect(component.selectedComponents()).toEqual(['PC1', 'PC2', 'PC3']);

    // The earlier step goes away outside this card, and its column leaves the pool.
    studio.appliedTransformations.set([self]);
    component.apply();

    expect(studio.upsertTransformation).toHaveBeenCalledWith(expect.objectContaining({
      parameters: expect.objectContaining({
        variables: ['age', 'bmi'],
        selected_components: ['PC1', 'PC2'],
        new_column_names: ['pca2_pc1', 'pca2_pc2'],
        n_components: 2,
      }),
    }));
  });

  it('a second card defaults to the prefix pca2', () => {
    studio.appliedTransformations.set([
      {
        id: 'pca-step-other',
        name: 'pca_column_creator',
        parameters: {
          new_column_names: ['pca_pc1', 'pca_pc2'],
          selected_components: ['PC1', 'PC2'],
          n_components: 2,
          variables: ['age', 'bmi'],
        },
      },
    ]);

    const second = TestBed.createComponent(PcaColumnSourceComponent);
    second.componentRef.setInput('stepId', 'pca-step-2');
    const other = second.componentInstance;
    second.detectChanges();

    expect(other.prefix()).toBe('pca2');
  });

  it('inner Remove does not drop a PCA step that has a K-means dependent', () => {
    studio.appliedTransformations.set([
      {
        id: 'pca-step-1',
        name: 'pca_column_creator',
        parameters: {
          new_column_names: ['pca_pc1', 'pca_pc2'],
          selected_components: ['PC1', 'PC2'],
          n_components: 2,
          variables: ['age', 'bmi'],
        },
      },
      {
        id: 'kmeans-step',
        name: 'kmeans_cluster_creator',
        parameters: {
          new_column_names: ['km'],
          reusable_preprocessing: { cluster_variables: ['pca_pc1', 'pca_pc2'] },
        },
      },
    ]);
    fixture.componentRef.setInput('canRemove', false);
    fixture.componentRef.setInput('removeTooltip', 'Used by km');
    fixture.detectChanges();

    const removeBtn = fixture.nativeElement.querySelector(
      '.pca-column-source-remove',
    ) as HTMLButtonElement | null;
    expect(removeBtn?.disabled).toBe(true);
    expect(removeBtn?.title).toContain('km');

    removeBtn?.click();
    component.remove();

    expect(studio.removeTransformation).not.toHaveBeenCalled();
    expect(studio.appliedTransformations().map((step) => step.id)).toEqual([
      'pca-step-1',
      'kmeans-step',
    ]);
  });

  it('re-applying without a column a later step reads is refused', () => {
    studio.outputsInUse.mockImplementation((id: string, next: string[]) =>
      id === 'pca-step-1' && !next.includes('pca_pc2') ? ['pca_pc2'] : [],
    );
    fixture.detectChanges();
    component.setSourceMode('fit');
    component.toggleComponent('PC2');

    component.apply();

    expect(component.error()).toBe('Used by a later step: pca_pc2');
    expect(studio.upsertTransformation).not.toHaveBeenCalled();
  });

  describe('without any prior PCA run (like the K-means report)', () => {
    it('shows the in-place report instead of a dead end', () => {
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(component.sourceMode()).toBe('result');
      expect(el.textContent).toContain('Run PCA report');
      expect(el.textContent).not.toContain('Run PCA first');
      expect(el.querySelector('#pca-column-source-experiment')).toBeNull();
      expect(component.runSelectedCodes()).toEqual(['age', 'bmi']);
    });

    it('runs PCA transiently, then stores the report recipe without a saved experiment', () => {
      fixture.detectChanges();

      component.runReport();
      fixture.detectChanges();

      expect(studio.loadPcaReport).toHaveBeenCalledWith(['age', 'bmi']);
      expect(dashboard.getExperimentResult).not.toHaveBeenCalled();
      expect(component.recipeFromReport()).toBe(true);
      expect(component.reportObservations()).toBe(289);
      expect(component.availableComponents().map((choice) => choice.component_id)).toEqual(['PC1', 'PC2']);
      expect(component.componentsStepNumber()).toBe(2);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('85.5%');

      component.apply();

      expect(studio.upsertTransformation).toHaveBeenCalledWith({
        id: 'pca-step-1',
        name: 'pca_column_creator',
        parameters: {
          reusable_preprocessing: recipe(),
          selected_components: ['PC1', 'PC2'],
          new_column_names: ['pca_pc1', 'pca_pc2'],
          n_components: 2,
        },
      });
    });

    it('needs at least two variables before it runs', () => {
      fixture.detectChanges();
      component.toggleRunVariable('bmi');

      component.runReport();

      expect(component.runSelectedCodes()).toEqual(['age']);
      expect(studio.loadPcaReport).not.toHaveBeenCalled();
    });

    it('shows the backend error of a failed report', () => {
      studio.loadPcaReport.mockReturnValue(of({ status: 'error', result: { data: 'Not enough data' } }));
      fixture.detectChanges();

      component.runReport();

      expect(component.runError()).toBe('Not enough data');
      expect(component.loadedRecipe()).toBeNull();
    });

    it('drops a report whose variables changed while it ran', () => {
      const response$ = new Subject<unknown>();
      studio.loadPcaReport.mockReturnValue(response$);
      fixture.detectChanges();

      component.runReport();
      expect(component.runLoading()).toBe(true);
      component.toggleRunVariable('bmi');
      response$.next({ status: 'success', result: { reusable_preprocessing: recipe() } });

      expect(component.loadedRecipe()).toBeNull();
      expect(component.runError()).toContain('selection changed');
    });

    it('drops a finished report recipe when the picks change afterwards', () => {
      studio.selectedVariables.mockReturnValue([
        { code: 'age', label: 'Age', type: 'real' },
        { code: 'bmi', label: 'BMI', type: 'real' },
        { code: 'chol', label: 'Chol', type: 'real' },
      ]);
      fixture.detectChanges();
      component.runReport();
      expect(component.loadedRecipe()).not.toBeNull();

      component.toggleRunVariable('chol');
      fixture.detectChanges();

      expect(component.loadedRecipe()).toBeNull();
      expect(component.recipeFromReport()).toBe(false);
      expect(component.canApply()).toBe(false);
    });

    it('reports when PCA is not available', () => {
      studio.loadPcaReport.mockReturnValue(null);
      fixture.detectChanges();

      component.runReport();

      expect(component.runError()).toBe('PCA is not available for this workspace.');
    });
  });
});
