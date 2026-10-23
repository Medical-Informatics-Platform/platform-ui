import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
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

  it('does not auto-add a variable on single bubble click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    const selectSpy = vi.spyOn(component, 'onSelectedNodeChange').mockReturnValue(undefined);
    const addSpy = vi.spyOn(component, 'addVariableFromBubble').mockReturnValue(undefined);

    component.onBubbleNodeSelected(node);

    expect(selectSpy).toHaveBeenCalledWith(node);
    expect(addSpy).not.toHaveBeenCalled();
    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
  });

  it('keeps double click as the explicit add action', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    const selectSpy = vi.spyOn(component, 'onSelectedNodeChange').mockReturnValue(undefined);
    const addSpy = vi.spyOn(component, 'addVariableFromBubble').mockReturnValue(undefined);

    component.onNodeDoubleClicked(node);

    expect(selectSpy).toHaveBeenCalledWith(node);
    expect(addSpy).toHaveBeenCalled();
  });

  it('adds the selected node when it is not in the pool', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedNode = { code: 'age_value', label: 'Age', type: 'real' };

    component.toggleSelectedNodeInPool();

    expect(experimentStudioService.addVariableAndEnrich).toHaveBeenCalledWith({
      code: 'age_value',
      label: 'Age',
      type: 'real',
    });
    expect(experimentStudioService.setVariables).not.toHaveBeenCalled();
  });

  it('removes the selected node when it is already in the pool', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedNode = { code: 'age_value', label: 'Age', type: 'real' };

    component.toggleSelectedNodeInPool();

    expect(experimentStudioService.setVariables).toHaveBeenCalledWith([
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
  });

  it('ignores clicks, double clicks and search picks on an unavailable variable', () => {
    experimentStudioService.unavailableVariables.set(new Map([['age_value', ['Dataset A']]]));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };
    const selectSpy = vi.spyOn(component, 'onSelectedNodeChange').mockReturnValue(undefined);

    component.onBubbleNodeSelected(node);
    component.onMetadataBrowserNodeSelected(node);
    component.onNodeDoubleClicked(node);

    expect(selectSpy).not.toHaveBeenCalled();
    expect(component.highlightNode).toBeNull();
    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
  });

  it('adds only the available variables of a group', () => {
    experimentStudioService.unavailableVariables.set(new Map([['sex_value', ['Dataset A']]]));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const age = { code: 'age_value', label: 'Age', type: 'real' };
    const sex = { code: 'sex_value', label: 'Sex', type: 'string' };
    component.selectedNode = { code: 'demo', label: 'Demographics', children: [age, sex] };

    component.toggleSelectedNodeInPool();

    expect(experimentStudioService.addVariableAndEnrich).toHaveBeenCalledTimes(1);
    expect(experimentStudioService.addVariableAndEnrich).toHaveBeenCalledWith(age);
  });

  it('disables Add when every variable of the selection is unavailable', () => {
    experimentStudioService.unavailableVariables.set(new Map([['age_value', ['Dataset A']]]));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedNode = { code: 'age_value', label: 'Age', type: 'real' };

    expect(component.selectionToggleDisabled()).toBe(true);
    expect(component.selectionToggleTitle()).toBe('Not available in the selected datasets');
    component.toggleSelectedNodeInPool();
    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
  });

  it('still removes a pooled variable that became unavailable', () => {
    experimentStudioService.selectedVariables.set([{ code: 'age_value', label: 'Age', type: 'real' }]);
    experimentStudioService.unavailableVariables.set(new Map([['age_value', ['Dataset A']]]));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedNode = { code: 'age_value', label: 'Age', type: 'real' };

    expect(component.selectionToggleDisabled()).toBe(false);
    component.toggleSelectedNodeInPool();
    expect(experimentStudioService.setVariables).toHaveBeenCalledWith([]);
  });

  it('ignores the pool toggle when no datasets are selected', () => {
    experimentStudioService.selectedDatasets.set([]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedNode = { code: 'age_value', label: 'Age', type: 'real' };

    component.toggleSelectedNodeInPool();

    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
    expect(experimentStudioService.setVariables).not.toHaveBeenCalled();
  });

  it('auto-selects all available datasets on a fresh session with no valid selection', () => {
    experimentStudioService.selectedDatasets.set([]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.availableDatasets = [
      { code: 'ds-a', label: 'Dataset A' },
      { code: 'ds-b', label: 'Dataset B' },
    ];

    component.ensureDatasetsSelected();

    expect(experimentStudioService.setSelectedDatasets).toHaveBeenCalledWith(['ds-a', 'ds-b']);
  });

  it('keeps a valid existing selection instead of re-selecting all', () => {
    experimentStudioService.selectedDatasets.set(['ds-b']);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.availableDatasets = [
      { code: 'ds-a', label: 'Dataset A' },
      { code: 'ds-b', label: 'Dataset B' },
    ];

    component.ensureDatasetsSelected();

    expect(experimentStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('does not auto-select datasets when editing an existing experiment', () => {
    experimentStudioService.selectedDatasets.set([]);
    experimentStudioService.editingExistingExperiment = () => true;
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.availableDatasets = [{ code: 'ds-a', label: 'Dataset A' }];

    component.ensureDatasetsSelected();

    expect(experimentStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('reports a dataset count in the context chip title', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedDataModel.set({ code: 'stroke', label: 'Stroke 3.7' } as any);
    experimentStudioService.selectedDatasets.set(['ds-a', 'ds-b']);

    expect(component.contextChipTitle).toBe('Stroke 3.7 · 2 datasets');
  });

  it('points to the dataset gate in the context chip title when none are selected', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedDataModel.set({ code: 'stroke', label: 'Stroke 3.7' } as any);
    experimentStudioService.selectedDatasets.set([]);

    expect(component.contextChipTitle).toBe('Stroke 3.7 · Select datasets');
  });

  it('toggles the context popover open and closed', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.contextOpen()).toBe(false);

    component.toggleContext();
    expect(component.contextOpen()).toBe(true);

    component.toggleContext();
    expect(component.contextOpen()).toBe(false);
  });

  it('reports the selected dataset count from the studio service', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.selectedDatasetCount()).toBe(1);

    experimentStudioService.selectedDatasets.set(['dataset-a', 'dataset-b']);
    expect(component.selectedDatasetCount()).toBe(2);
  });

  it('closes the context sheet on a click inside the host but outside the context section', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleContext();
    expect(component.contextOpen()).toBe(true);

    const contextSection = document.createElement('div');
    const sibling = document.createElement('div');
    document.body.appendChild(contextSection);
    document.body.appendChild(sibling);
    try {
      component.contextSection = { nativeElement: contextSection } as unknown as ElementRef;
      component.onDocumentClickForContext({ target: sibling } as unknown as MouseEvent);
      expect(component.contextOpen()).toBe(false);
    } finally {
      contextSection.remove();
      sibling.remove();
    }
  });

  it('keeps the context sheet open on a click inside the context section', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleContext();

    const contextSection = document.createElement('div');
    const inner = document.createElement('span');
    contextSection.appendChild(inner);
    document.body.appendChild(contextSection);
    try {
      component.contextSection = { nativeElement: contextSection } as unknown as ElementRef;
      component.onDocumentClickForContext({ target: inner } as unknown as MouseEvent);
      expect(component.contextOpen()).toBe(true);
    } finally {
      contextSection.remove();
    }
  });

  it('closes the context popover on Escape', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleContext();

    component.onDocumentKeydownForContext(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.contextOpen()).toBe(false);
  });

  it('toggles the search popover', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.searchExpanded()).toBe(false);

    component.toggleSearch();
    expect(component.searchExpanded()).toBe(true);

    component.toggleSearch();
    expect(component.searchExpanded()).toBe(false);
  });

  it('collapses the search bar on an outside document click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleSearch();
    expect(component.searchExpanded()).toBe(true);

    const searchEl = document.createElement('div');
    document.body.appendChild(searchEl);
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    try {
      component.searchSection = { nativeElement: searchEl } as unknown as ElementRef;
      component.onDocumentClickForContext({ target: outside } as unknown as MouseEvent);
      expect(component.searchExpanded()).toBe(false);
    } finally {
      searchEl.remove();
      outside.remove();
    }
  });

  it('keeps the search bar open on an inside click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleSearch();

    const searchEl = document.createElement('div');
    const inner = document.createElement('input');
    searchEl.appendChild(inner);
    document.body.appendChild(searchEl);
    try {
      component.searchSection = { nativeElement: searchEl } as unknown as ElementRef;
      component.onDocumentClickForContext({ target: inner } as unknown as MouseEvent);
      expect(component.searchExpanded()).toBe(true);
    } finally {
      searchEl.remove();
    }
  });

  it('collapses the search bar on Escape', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleSearch();

    component.onDocumentKeydownForContext(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.searchExpanded()).toBe(false);
  });

  it('toggles the histogram export menu open and closed', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.exportMenuOpen()).toBe(false);

    component.toggleExportMenu();
    expect(component.exportMenuOpen()).toBe(true);

    component.toggleExportMenu();
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('closes the export menu when a format is chosen', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleExportMenu();

    component.exportHistogramCsv();
    expect(component.exportMenuOpen()).toBe(false);

    component.toggleExportMenu();
    component.exportHistogramPdf();
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('closes the export menu on an outside document click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleExportMenu();

    const group = document.createElement('div');
    group.className = 'histogram-export-group';
    document.body.appendChild(group);
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    try {
      component.onDocumentClickForContext({ target: outside } as unknown as MouseEvent);
      expect(component.exportMenuOpen()).toBe(false);
    } finally {
      group.remove();
      outside.remove();
    }
  });

  it('keeps the export menu open on a click inside the export group', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleExportMenu();

    const group = document.createElement('div');
    group.className = 'histogram-export-group';
    const item = document.createElement('button');
    group.appendChild(item);
    document.body.appendChild(group);
    try {
      component.onDocumentClickForContext({ target: item } as unknown as MouseEvent);
      expect(component.exportMenuOpen()).toBe(true);
    } finally {
      group.remove();
    }
  });

  it('closes the export menu on Escape', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleExportMenu();

    component.onDocumentKeydownForContext(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('defaults the metadata browser mode to bubble map', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserMode()).toBe('bubble');
  });

  it('persists metadata browser mode changes', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    component.setMetadataBrowserMode('collapsible');

    expect(component.metadataBrowserMode()).toBe('collapsible');
    expect(component.metadataBrowserModeIndex()).toBe(2);
    expect(localStorage.getItem('metadata_browser_mode')).toBe('collapsible');
  });

  it('falls back to the bubble map for an invalid saved metadata browser mode', () => {
    localStorage.setItem('metadata_browser_mode', 'columns');

    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserMode()).toBe('bubble');
  });

  it('includes collapsible tree as an alternative metadata browser mode', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserModes.map((mode) => mode.value)).toEqual(['bubble', 'ontology', 'collapsible']);
  });

  it('resets selected-node details to the histogram tab on variable selection', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    component.setActiveDetailsTab('info');
    component.onSelectedNodeChange(node);

    expect(component.activeDetailsTab()).toBe('histogram');
  });

  it('defaults a group selection to the Chart tab', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const group = {
      code: 'acute_treatment',
      label: 'Acute treatment',
      children: [{ code: 'age_value', label: 'Age', type: 'real' }],
    };

    component.setActiveDetailsTab('info');
    component.onSelectedNodeChange(group);

    expect(component.activeDetailsTab()).toBe('histogram');
  });

  it('offers Dataset plus selected nominal variables as splits and hides them for nominal plots', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    experimentStudioService.selectedVariables.set([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F' }, { code: 'M' }] },
    ]);

    component.onSelectedNodeChange({ code: 'age', label: 'Age', type: 'real' });
    expect(component.canSplitHistogram()).toBe(true);
    expect(component.histogramSplitOptions().map((option) => option.code)).toEqual(['dataset', 'sex']);

    component.onSelectedNodeChange({ code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F' }, { code: 'M' }] });
    expect(component.canSplitHistogram()).toBe(false);
  });

  it('offers an unavailable split grayed out and disabled, and keeps an active one', () => {
    const sex = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F' }, { code: 'M' }] };
    experimentStudioService.selectedVariables.set([{ code: 'age', label: 'Age', type: 'real' }, sex]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.onSelectedNodeChange({ code: 'age', label: 'Age', type: 'real' });
    component.histogramSplit.set('sex');
    TestBed.tick();

    experimentStudioService.unavailableVariables.set(new Map([['sex', ['Dataset B']]]));
    TestBed.tick();

    const option = component.histogramSplitOptions().find((item) => item.code === 'sex');
    expect(option).toEqual(expect.objectContaining({ disabled: true, unavailable: true, title: 'Not available in: Dataset B' }));
    expect(component.histogramSplit()).toBe('sex');

    const requests = experimentStudioService.getAlgorithmResults.mock.calls.length;
    const select = document.createElement('select');
    select.innerHTML = '<option value="sex">Sex</option>';
    select.value = 'sex';
    component.histogramSplit.set('');
    component.onHistogramSplitChange({ target: select } as unknown as Event);
    expect(component.histogramSplit()).toBe('');
    expect(experimentStudioService.getAlgorithmResults.mock.calls.length).toBe(requests + 1);
    expect(experimentStudioService.getAlgorithmResults.mock.calls.at(-1)?.[5]).toBeUndefined();
  });

  it('caps Dataset split by the selected dataset count, not the enumeration map', () => {
    experimentStudioService.getDatasetLabelMap.mockReturnValue(
      Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`ds${i}`, `D${i}`]))
    );
    experimentStudioService.selectedDatasets.set(['ds0', 'ds1']);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.onSelectedNodeChange({ code: 'age', label: 'Age', type: 'real' });
    expect(component.histogramSplitOptions().find((option) => option.code === 'dataset')?.disabled).toBe(false);

    experimentStudioService.selectedDatasets.set(Array.from({ length: 9 }, (_, i) => `ds${i}`));
    expect(component.histogramSplitOptions().find((option) => option.code === 'dataset')?.disabled).toBe(true);
  });

  it('re-requests the histogram with grouping when split by dataset', async () => {
    experimentStudioService.getAlgorithmResults.mockImplementation(() => of({
      result: {
        histogram: [
          { var: 'age_value', grouping_var: null, grouping_enum: null, bins: ['0', '10'], counts: [12, 8] },
          { var: 'age_value', grouping_var: 'dataset', grouping_enum: 'dataset-a', bins: ['0', '10'], counts: [7, 5] },
        ],
      },
    }));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.d3Data = { code: 'stroke', label: 'Stroke 3.7' };
    component.onSelectedNodeChange({ code: 'age_value', label: 'Age', type: 'real' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    component.onHistogramSplitChange({ target: { value: 'dataset' } } as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(experimentStudioService.getAlgorithmResults).toHaveBeenLastCalledWith(
      'histogram',
      ['age_value'],
      null,
      undefined,
      undefined,
      ['dataset']
    );
    expect(
      component.histogramData(),
      `data=${JSON.stringify(component.histogramData())} split=${component.histogramSplit()} empty=${component.emptyChartMessage()} err=${component.errorMessage()}`
    ).toEqual(expect.objectContaining({
      counts: [12, 8],
      splitLabel: 'Dataset',
      groups: [expect.objectContaining({ key: 'dataset-a', label: 'Dataset A', counts: [7, 5] })],
    }));
  });

  it('drops a split whose variable leaves the pool and re-requests the unsplit histogram', async () => {
    experimentStudioService.getAlgorithmResults.mockImplementation(() => of({ result: { histogram: [] } }));
    experimentStudioService.selectedVariables.set([
      { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F' }, { code: 'M' }] },
    ]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.onSelectedNodeChange({ code: 'age_value', label: 'Age', type: 'real' });
    component.onHistogramSplitChange({ target: { value: 'sex' } } as unknown as Event);
    expect(component.histogramSplit()).toBe('sex');

    experimentStudioService.selectedVariables.set([]);
    TestBed.tick();

    expect(component.histogramSplit()).toBe('');
    expect(experimentStudioService.getAlgorithmResults).toHaveBeenLastCalledWith(
      'histogram',
      ['age_value'],
      null,
      undefined,
      undefined,
      undefined
    );
  });

  it('warns when privacy-null edge bins were trimmed on a numeric histogram', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.plottedVariable.set({ code: 'age_value', label: 'Age', type: 'real' });
    component.histogramData.set({
      bins: ['0', '10', '20', '30'],
      counts: [null, 8, 12, null],
      variableName: 'Age',
    });

    expect(component.histogramPrivacyTrimNote()).toContain('Values below 10 / above 30 hidden');
  });

  it('does not warn about trimmed edges on a nominal histogram', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.plottedVariable.set({
      code: 'sex',
      label: 'Sex',
      type: 'nominal',
      enumerations: [{ code: 'F' }, { code: 'M' }],
    });
    component.histogramData.set({
      bins: ['F', 'M'],
      counts: [null, 8],
      variableName: 'Sex',
    });

    expect(component.histogramPrivacyTrimNote()).toBeNull();
  });

  it('collapses consecutive duplicate breadcrumb labels', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.d3Data = {
      code: 'stroke',
      label: 'Stroke 3.7',
      children: [
        { code: 'inr', label: 'INR', type: 'real' },
      ],
    };

    const path = component.getPathNodes({ code: 'stroke', label: 'Stroke 3.7' });
    expect(path.map((node) => node.label)).toEqual(['Stroke 3.7']);
  });

  it('builds a group census chart for the pathology root', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const root = {
      code: 'stroke',
      label: 'Stroke 3.7',
      children: [
        { code: 'g1', label: 'Acute treatment', children: [{ code: 'a', label: 'A', value: 1 }] },
        { code: 'g2', label: 'Hospitalization', children: [{ code: 'b', label: 'B', value: 1 }, { code: 'c', label: 'C', value: 1 }] },
      ],
    };
    component.d3Data = root;
    component.onSelectedNodeChange(root);

    expect(component.groupHistogramData()).toEqual({
      bins: ['Hospitalization', 'Acute treatment'],
      counts: [2, 1],
      variableName: 'Stroke 3.7',
    });
    expect(component.groupHistogramMeta()?.groupCount).toBe(2);
    expect(component.detailsPanelSubtitle()).toBe('2 groups in this view');
  });

  it('prompts to pick a variable when a group holds only variables', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const group = {
      code: 'g1',
      label: 'Acute treatment',
      children: [
        { code: 'a', label: 'A', type: 'real' },
        { code: 'b', label: 'B', type: 'real' },
      ],
    };
    component.d3Data = { code: 'stroke', label: 'Stroke 3.7', children: [group] };

    component.onSelectedNodeChange(group);

    expect(component.groupHistogramData()).toBeNull();
    expect(component.emptyChartMessage()).toBe(
      'Please select one of the variables in the representation on the left to see its histogram in the selected centers.',
    );
    expect(component.errorMessage()).toBeNull();
    expect(component.isLoadingHistogram()).toBe(false);
    expect(component.detailsPanelSubtitle()).toBe('2 variables in this group');
    expect(component.isExportDisabled()).toBe(true);
  });

  function flushLeafHistogram(component: VariablesPanelComponent): Promise<void> {
    component.d3Data = { code: 'stroke', label: 'Stroke 3.7' };
    component.onSelectedNodeChange({ code: 'age_value', label: 'Age', type: 'real' });
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('shows a neutral empty message when a leaf has no distribution data', async () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    await flushLeafHistogram(component);

    expect(component.emptyChartMessage()).toBe('No distribution for this selection.');
    expect(component.errorMessage()).toBeNull();
    expect(component.isLoadingHistogram()).toBe(false);
  });

  it('shows the backend insufficient-data message neutrally instead of as an error', async () => {
    experimentStudioService.getAlgorithmResults
      .mockReturnValue(of({ result: { data: 'insufficient data' } }));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    await flushLeafHistogram(component);

    expect(component.emptyChartMessage()).toBe('This variable does not have sufficient data.');
    expect(component.errorMessage()).toBeNull();
  });

  it('keeps a red error message when the histogram request fails', async () => {
    experimentStudioService.getAlgorithmResults
      .mockReturnValue(throwError(() => new Error('network')));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    await flushLeafHistogram(component);

    expect(component.errorMessage()).toBe('Error loading histogram. Please try again.');
    expect(component.emptyChartMessage()).toBeNull();
  });
});
