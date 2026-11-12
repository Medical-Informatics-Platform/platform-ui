import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ErrorService } from '../../../services/error.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { VariablesPanelComponent } from './variables-panel.component';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
describe('VariablesPanelComponent histogram split for categories', () => {
  let experimentStudioService: {
    selectedDataModel: ReturnType<typeof signal<any>>;
    selectedVariables: ReturnType<typeof signal<any[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    availableGroupedAlgorithms: ReturnType<typeof signal<any[]>>;
    getAllDataModels: Mock;
    categorizeDataModels: Mock;
    getAlgorithmResults: Mock;
    getDatasetLabelMap: Mock;
    setVariables: Mock;
    setSelectedDatasets: Mock;
    addVariableAndEnrich: Mock;
    clearSelectionsForDataModelChange: Mock;
    editingExistingExperiment: () => boolean;
    unavailableVariables: ReturnType<typeof signal<ReadonlyMap<string, readonly string[]>>>;
  };

  beforeEach(() => {
    experimentStudioService = {
      selectedDataModel: signal<any>(null),
      selectedVariables: signal<any[]>([]),
      selectedDatasets: signal<string[]>(['dataset-a']),
      availableGroupedAlgorithms: signal<any[]>([]),
      getAllDataModels: vi.fn().mockReturnValue(of([])),
      categorizeDataModels: vi.fn().mockReturnValue({
        crossSectional: [],
        longitudinal: [],
      }),
      getAlgorithmResults: vi.fn().mockReturnValue(of({ result: { histogram: [] } })),
      getDatasetLabelMap: vi.fn().mockReturnValue({ 'dataset-a': 'Dataset A' }),
      setVariables: vi.fn(),
      setSelectedDatasets: vi.fn(),
      addVariableAndEnrich: vi.fn(),
      clearSelectionsForDataModelChange: vi.fn(),
      editingExistingExperiment: () => false,
      unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
    };

    TestBed.configureTestingModule({
      imports: [VariablesPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: experimentStudioService },
        {
          provide: ExperimentStudioGuideStateService,
          useValue: {
            activeStepId: signal<string | null>(null),
            setSelectedHierarchyNode: vi.fn(),
          },
        },
        { provide: ErrorService, useValue: {} },
        { provide: PdfExportService, useValue: { exportHistogramPdf: vi.fn() } },
        { provide: CsvExportService, useValue: { exportHistogramCsv: vi.fn() } },
      ],
    });

    TestBed.overrideComponent(VariablesPanelComponent, {
      set: { template: '' },
    });
    localStorage.removeItem('metadata_browser_mode');
  });

  it('offers the split for a categorical (nominal) variable', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.plottedVariable.set({ code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'f', label: 'F' }] });

    expect(component.canSplitHistogram()).toBe(true);
  });

  it('still offers it for numeric variables and never for groups or free text', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    component.plottedVariable.set({ code: 'age', label: 'Age', type: 'real' });
    expect(component.canSplitHistogram()).toBe(true);

    component.plottedVariable.set({ code: 'notes', label: 'Notes', type: 'text' });
    expect(component.canSplitHistogram()).toBe(false);

    component.plottedVariable.set({ code: 'demo', label: 'Demographics', children: [{ code: 'age' }] });
    expect(component.canSplitHistogram()).toBe(false);

    component.plottedVariable.set(null);
    expect(component.canSplitHistogram()).toBe(false);
  });
});
