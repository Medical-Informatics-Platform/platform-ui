import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ErrorService } from '../../../services/error.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { VariablesPanelComponent } from './variables-panel.component';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';

describe('VariablesPanelComponent bubble selection', () => {
  let experimentStudioService: {
    selectedDataModel: ReturnType<typeof signal<any>>;
    selectedVariables: ReturnType<typeof signal<any[]>>;
    selectedCovariates: ReturnType<typeof signal<any[]>>;
    selectedFilters: ReturnType<typeof signal<any[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    availableGroupedAlgorithms: ReturnType<typeof signal<any[]>>;
    getAllDataModels: jasmine.Spy;
    categorizeDataModels: jasmine.Spy;
    getAlgorithmResults: jasmine.Spy;
    setVariables: jasmine.Spy;
    setCovariates: jasmine.Spy;
    setFilters: jasmine.Spy;
    addVariableAndEnrich: jasmine.Spy;
  };

  beforeEach(() => {
    experimentStudioService = {
      selectedDataModel: signal<any>(null),
      selectedVariables: signal<any[]>([]),
      selectedCovariates: signal<any[]>([]),
      selectedFilters: signal<any[]>([]),
      selectedDatasets: signal<string[]>(['dataset-a']),
      availableGroupedAlgorithms: signal<any[]>([]),
      getAllDataModels: jasmine.createSpy('getAllDataModels').and.returnValue(of([])),
      categorizeDataModels: jasmine.createSpy('categorizeDataModels').and.returnValue({
        crossSectional: [],
        longitudinal: [],
      }),
      getAlgorithmResults: jasmine.createSpy('getAlgorithmResults').and.returnValue(of({ result: { histogram: [] } })),
      setVariables: jasmine.createSpy('setVariables'),
      setCovariates: jasmine.createSpy('setCovariates'),
      setFilters: jasmine.createSpy('setFilters'),
      addVariableAndEnrich: jasmine.createSpy('addVariableAndEnrich'),
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
            expectedTutorialCovariate: signal<string | null>(null),
            matchesTutorialCovariate: () => false,
            setSelectedHierarchyNode: jasmine.createSpy('setSelectedHierarchyNode'),
          },
        },
        { provide: ErrorService, useValue: {} },
        { provide: PdfExportService, useValue: { exportHistogramPdf: jasmine.createSpy('exportHistogramPdf') } },
        { provide: CsvExportService, useValue: { exportHistogramCsv: jasmine.createSpy('exportHistogramCsv') } },
      ],
    });

    TestBed.overrideComponent(VariablesPanelComponent, {
      set: { template: '' },
    });
  });

  it('does not auto-add a variable on single bubble click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    const selectSpy = spyOn(component, 'onSelectedNodeChange');
    const addSpy = spyOn(component, 'addVariableFromBubble');

    component.onBubbleNodeSelected(node);

    expect(selectSpy).toHaveBeenCalledWith(node);
    expect(addSpy).not.toHaveBeenCalled();
    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
  });

  it('keeps double click as the explicit add action', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    const selectSpy = spyOn(component, 'onSelectedNodeChange');
    const addSpy = spyOn(component, 'addVariableFromBubble');

    component.onNodeDoubleClicked(node);

    expect(selectSpy).toHaveBeenCalledWith(node);
    expect(addSpy).toHaveBeenCalled();
  });
});
