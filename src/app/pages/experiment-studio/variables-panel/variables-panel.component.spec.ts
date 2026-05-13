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
    setSelectedDatasets: jasmine.Spy;
    setFilterLogic: jasmine.Spy;
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
      setSelectedDatasets: jasmine.createSpy('setSelectedDatasets'),
      setFilterLogic: jasmine.createSpy('setFilterLogic'),
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
    localStorage.removeItem('metadata_browser_mode');
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

  it('defaults the metadata browser mode to ontology tree', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserMode()).toBe('ontology');
  });

  it('persists metadata browser mode changes', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    component.setMetadataBrowserMode('collapsible');

    expect(component.metadataBrowserMode()).toBe('collapsible');
    expect(localStorage.getItem('metadata_browser_mode')).toBe('collapsible');
  });

  it('falls back to ontology tree for an invalid saved metadata browser mode', () => {
    localStorage.setItem('metadata_browser_mode', 'columns');

    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserMode()).toBe('ontology');
  });

  it('includes collapsible tree as an alternative metadata browser mode', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserModes.map((mode) => mode.value)).toEqual(['ontology', 'collapsible', 'bubble']);
  });

  it('resets selected-node details to the histogram tab on variable selection', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    component.setActiveDetailsTab('info');
    component.onSelectedNodeChange(node);

    expect(component.activeDetailsTab()).toBe('histogram');
  });

  it('switches grouped histogram variants without changing metadata state', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const data = { bins: ['A'], counts: [1], variableName: 'Age' };

    component.histogramVariants.set([
      { key: 'overall', label: 'Overall', data },
      { key: 'group:female', label: 'Sex: Female', data: { ...data, variableName: 'Female age' } },
    ]);
    component.setActiveDetailsTab('info');

    component.onHistogramVariantChange({ target: { value: 'group:female' } } as unknown as Event);

    expect(component.histogramData()?.variableName).toBe('Female age');
    expect(component.activeDetailsTab()).toBe('info');
  });
});
