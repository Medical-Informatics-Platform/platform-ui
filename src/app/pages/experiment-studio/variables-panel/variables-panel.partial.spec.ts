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
describe('VariablesPanelComponent partially available variables', () => {
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

  it('shows a variable missing in one selected dataset but does not add it', () => {
    experimentStudioService.unavailableVariables.set(new Map([['age_value', ['CLM CHUV']]]));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };
    const selectSpy = vi.spyOn(component, 'onSelectedNodeChange').mockImplementation((selected: any) => {
      component.selectedNode = selected;
    });

    component.onBubbleNodeSelected(node);
    expect(selectSpy).toHaveBeenCalledWith(node);

    component.onMetadataBrowserNodeSelected(node);
    expect(component.highlightNode).toEqual(node);

    component.onNodeDoubleClicked(node);
    component.toggleSelectedNodeInPool();
    component.addVariableFromBubble();
    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
    expect(component.selectionToggleDisabled()).toBe(true);
  });

  it('names the datasets lacking the plotted variable for the note under the chart', () => {
    experimentStudioService.unavailableVariables.set(new Map([['age_value', ['CLM CHUV', 'Dataset B']]]));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    component.plottedVariable.set({ code: 'age_value', label: 'Age', type: 'real' });
    expect(component.plottedVariableMissingIn()).toEqual(['CLM CHUV', 'Dataset B']);

    component.plottedVariable.set({ code: 'sex_value', label: 'Sex', type: 'nominal' });
    expect(component.plottedVariableMissingIn()).toEqual([]);

    component.plottedVariable.set(null);
    expect(component.plottedVariableMissingIn()).toEqual([]);
  });
});
