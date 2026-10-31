import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DataModel, D3HierarchyNode } from '../../../models/data-model.interface';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { VariablesPanelComponent } from './variables-panel.component';
import { VariableCatalogService } from './variable-catalog.service';

describe('VariablesPanelComponent', () => {
  let studio: {
    selectedDataModel: ReturnType<typeof signal<DataModel | null>>;
    selectedVariables: ReturnType<typeof signal<D3HierarchyNode[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    availableDatasets: ReturnType<typeof signal<{ code: string; label: string }[]>>;
    unavailableVariables: ReturnType<typeof signal<ReadonlyMap<string, readonly string[]>>>;
    getAllDataModels: Mock;
    categorizeDataModels: Mock;
    convertToD3Hierarchy: Mock;
    updateAvailableDatasets: Mock;
    setSelectedDatasets: Mock;
    getAlgorithmResults: Mock;
    clearSelectionsForDataModelChange: Mock;
    editingExistingExperiment: () => boolean;
  };

  beforeEach(() => {
    studio = {
      selectedDataModel: signal<DataModel | null>(null),
      selectedVariables: signal<D3HierarchyNode[]>([]),
      selectedDatasets: signal<string[]>([]),
      availableDatasets: signal<{ code: string; label: string }[]>([]),
      unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
      getAllDataModels: vi.fn().mockReturnValue(of([])),
      categorizeDataModels: vi.fn().mockReturnValue({ crossSectional: [], longitudinal: [] }),
      convertToD3Hierarchy: vi.fn().mockReturnValue({ hierarchy: { code: 'root', label: 'Root', children: [] } }),
      updateAvailableDatasets: vi.fn(),
      setSelectedDatasets: vi.fn(),
      getAlgorithmResults: vi.fn().mockReturnValue(of({ result: { histogram: [] } })),
      clearSelectionsForDataModelChange: vi.fn(),
      editingExistingExperiment: () => false,
    };

    TestBed.configureTestingModule({
      imports: [VariablesPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ExperimentStudioGuideStateService, useValue: { setSelectedHierarchyNode: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(VariablesPanelComponent, { set: { template: '' } });
  });

  it('loads the data models on init', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    fixture.detectChanges();
    expect(studio.getAllDataModels).toHaveBeenCalledTimes(1);
  });

  it('provides its own catalog to the children', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const catalog = fixture.debugElement.injector.get(VariableCatalogService);
    expect(catalog).toBeInstanceOf(VariableCatalogService);
    expect(() => TestBed.inject(VariableCatalogService)).toThrow();
  });

  it('loads the hierarchy when a data model is selected', async () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    fixture.detectChanges();
    studio.selectedDataModel.set({ code: 'dementia', version: '0.1', label: 'Dementia' } as DataModel);
    await fixture.whenStable();
    expect(studio.convertToD3Hierarchy).toHaveBeenCalled();
    const catalog = fixture.debugElement.injector.get(VariableCatalogService);
    expect(catalog.hierarchy()?.code).toBe('root');
  });
});
