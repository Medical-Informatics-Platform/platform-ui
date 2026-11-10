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

  it('selects and adds a variable missing in one selected dataset', () => {
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
    expect(experimentStudioService.addVariableAndEnrich).toHaveBeenCalledWith(node);
  });

  it('adds every variable of a group, partially available ones included', () => {
    experimentStudioService.unavailableVariables.set(new Map([['sex_value', ['CLM CHUV']]]));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const age = { code: 'age_value', label: 'Age', type: 'real' };
    const sex = { code: 'sex_value', label: 'Sex', type: 'string' };
    component.selectedNode = { code: 'demo', label: 'Demographics', children: [age, sex] };

    expect(component.selectionToggleDisabled()).toBe(false);
    component.toggleSelectedNodeInPool();

    expect(experimentStudioService.addVariableAndEnrich).toHaveBeenCalledTimes(2);
    expect(experimentStudioService.addVariableAndEnrich).toHaveBeenCalledWith(sex);
  });

  it('lists the selected variables missing in some dataset for the note under the chart', () => {
    experimentStudioService.unavailableVariables.set(new Map([['age_value', ['CLM CHUV']]]));
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
      { code: 'sex_value', label: 'Sex', type: 'nominal' },
    ]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);

    expect(fixture.componentInstance.partialSelectedVariables()).toEqual([
      { code: 'age_value', label: 'Age', datasets: ['CLM CHUV'] },
    ]);
  });
});
