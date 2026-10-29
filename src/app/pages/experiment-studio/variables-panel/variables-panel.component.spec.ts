import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DataModel, D3HierarchyNode } from '../../../models/data-model.interface';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { VariablesPanelComponent } from './variables-panel.component';
import { VariableHistogramService } from './variable-histogram.service';
import { VariableSelectionService } from './variable-selection.service';

describe('VariablesPanelComponent', () => {
  let studio: {
    selectedDataModel: ReturnType<typeof signal<DataModel | null>>;
    selectedVariables: ReturnType<typeof signal<D3HierarchyNode[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    availableDatasets: ReturnType<typeof signal<{ code: string; label: string }[]>>;
    unavailableVariables: ReturnType<typeof signal<ReadonlyMap<string, readonly string[]>>>;
    getAllDataModels: Mock;
    categorizeDataModels: Mock;
    getAlgorithmResults: Mock;
    clearSelectionsForDataModelChange: Mock;
    editingExistingExperiment: () => boolean;
  };
  let csvExport: { exportHistogramCsv: Mock };

  beforeEach(() => {
    studio = {
      selectedDataModel: signal<DataModel | null>(null),
      selectedVariables: signal<D3HierarchyNode[]>([]),
      selectedDatasets: signal<string[]>(['dataset-a']),
      availableDatasets: signal<{ code: string; label: string }[]>([]),
      unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
      getAllDataModels: vi.fn().mockReturnValue(of([])),
      categorizeDataModels: vi.fn().mockReturnValue({ crossSectional: [], longitudinal: [] }),
      getAlgorithmResults: vi.fn().mockReturnValue(of({ result: { histogram: [] } })),
      clearSelectionsForDataModelChange: vi.fn(),
      editingExistingExperiment: () => false,
    };
    csvExport = { exportHistogramCsv: vi.fn() };

    TestBed.configureTestingModule({
      imports: [VariablesPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ExperimentStudioGuideStateService, useValue: { setSelectedHierarchyNode: vi.fn() } },
        { provide: PdfExportService, useValue: { exportHistogramPdf: vi.fn() } },
        { provide: CsvExportService, useValue: csvExport },
      ],
    });
    // Only the two toolbar sections the outside-click handling measures against.
    TestBed.overrideComponent(VariablesPanelComponent, {
      set: {
        template: '<div #contextSection class="ctx"><span class="ctx-inner"></span></div>'
          + '<div #searchSection class="search"><input class="search-input" /></div>',
      },
    });
    localStorage.removeItem('metadata_browser_mode');
  });

  function create() {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const injector = fixture.debugElement.injector;
    return {
      fixture,
      component: fixture.componentInstance,
      selection: injector.get(VariableSelectionService),
      histogram: injector.get(VariableHistogramService),
    };
  }

  it('reports a dataset count in the context chip title', () => {
    const { component } = create();
    studio.selectedDataModel.set({ code: 'stroke', label: 'Stroke 3.7' } as DataModel);
    studio.selectedDatasets.set(['ds-a', 'ds-b']);

    expect(component.studyContextTitle()).toBe('Stroke 3.7 · 2 datasets');
  });

  it('points to the dataset gate in the context chip title when none are selected', () => {
    const { component } = create();
    studio.selectedDataModel.set({ code: 'stroke', label: 'Stroke 3.7' } as DataModel);
    studio.selectedDatasets.set([]);

    expect(component.studyContextTitle()).toBe('Stroke 3.7 · Select datasets');
  });

  it('toggles the context popover open and closed', () => {
    const { component } = create();
    expect(component.contextOpen()).toBe(false);
    component.toggleContext();
    expect(component.contextOpen()).toBe(true);
    component.toggleContext();
    expect(component.contextOpen()).toBe(false);
  });

  it('closes the context sheet on a click inside the host but outside the context section', () => {
    const { fixture, component } = create();
    component.toggleContext();
    fixture.detectChanges();

    component.onDocumentClick({ target: fixture.nativeElement.querySelector('.search') } as unknown as MouseEvent);
    expect(component.contextOpen()).toBe(false);
  });

  it('keeps the context sheet open on a click inside the context section', () => {
    const { fixture, component } = create();
    component.toggleContext();
    fixture.detectChanges();

    component.onDocumentClick({ target: fixture.nativeElement.querySelector('.ctx-inner') } as unknown as MouseEvent);
    expect(component.contextOpen()).toBe(true);
  });

  it('closes the context popover on Escape', () => {
    const { component } = create();
    component.toggleContext();
    component.onDocumentKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.contextOpen()).toBe(false);
  });

  it('toggles the search popover', () => {
    const { component } = create();
    expect(component.searchExpanded()).toBe(false);
    component.toggleSearch();
    expect(component.searchExpanded()).toBe(true);
    component.toggleSearch();
    expect(component.searchExpanded()).toBe(false);
  });

  it('collapses the search bar on an outside document click', () => {
    const { fixture, component } = create();
    component.toggleSearch();
    fixture.detectChanges();

    component.onDocumentClick({ target: document.createElement('span') } as unknown as MouseEvent);
    expect(component.searchExpanded()).toBe(false);
  });

  it('keeps the search bar open on an inside click', () => {
    const { fixture, component } = create();
    component.toggleSearch();
    fixture.detectChanges();

    component.onDocumentClick({ target: fixture.nativeElement.querySelector('.search-input') } as unknown as MouseEvent);
    expect(component.searchExpanded()).toBe(true);
  });

  it('collapses the search bar on Escape', () => {
    const { component } = create();
    component.toggleSearch();
    component.onDocumentKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.searchExpanded()).toBe(false);
  });

  it('collapses the search bar only for a real pathology change', () => {
    const { component } = create();
    const stroke = { code: 'stroke', label: 'Stroke', version: '3.7' } as DataModel;
    studio.selectedDataModel.set(stroke);
    component.toggleSearch();

    component.onDataModelChange({ ...stroke });
    expect(component.searchExpanded()).toBe(true);
  });

  it('toggles the histogram export menu open and closed', () => {
    const { component } = create();
    expect(component.exportMenuOpen()).toBe(false);
    component.toggleExportMenu();
    expect(component.exportMenuOpen()).toBe(true);
    component.toggleExportMenu();
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('closes the export menu when a format is chosen', () => {
    const { component } = create();
    component.toggleExportMenu();
    component.exportHistogramCsv();
    expect(component.exportMenuOpen()).toBe(false);

    component.toggleExportMenu();
    component.exportHistogramPdf();
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('closes the export menu on an outside document click', () => {
    const { component } = create();
    component.toggleExportMenu();
    component.onDocumentClick({ target: document.createElement('span') } as unknown as MouseEvent);
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('keeps the export menu open on a click inside the export group', () => {
    const { component } = create();
    component.toggleExportMenu();
    const group = document.createElement('div');
    group.className = 'histogram-export-group';
    const item = document.createElement('button');
    group.appendChild(item);

    component.onDocumentClick({ target: item } as unknown as MouseEvent);
    expect(component.exportMenuOpen()).toBe(true);
  });

  it('closes the export menu on Escape', () => {
    const { component } = create();
    component.toggleExportMenu();
    component.onDocumentKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('exports the census of a selected group as CSV', () => {
    const { component, selection, histogram } = create();
    const root = {
      code: 'stroke',
      label: 'Stroke 3.7',
      children: [
        { code: 'g', label: 'G', children: [{ code: 'a', label: 'A' }] },
        { code: 'h', label: 'H', children: [{ code: 'b', label: 'B' }, { code: 'c', label: 'C' }] },
      ],
    };
    selection.select(root);

    expect(component.isExportDisabled()).toBe(false);
    component.exportHistogramCsv();
    expect(csvExport.exportHistogramCsv).toHaveBeenCalledWith(
      { bins: ['H', 'G'], counts: [2, 1], groups: undefined },
      'Stroke 3.7'
    );
    expect(histogram.groupHistogramMeta()?.groupCount).toBe(2);
    expect(component.detailsPanelSubtitle()).toBe('2 groups in this view');
  });

  it('keeps export disabled for a group of variables only', () => {
    const { component, selection } = create();
    selection.select({ code: 'g1', label: 'Acute treatment', children: [{ code: 'a', label: 'A' }, { code: 'b', label: 'B' }] });

    expect(component.detailsPanelSubtitle()).toBe('2 variables in this group');
    expect(component.isExportDisabled()).toBe(true);
  });

  it('titles the details panel with the selected node', () => {
    const { component, selection } = create();
    expect(component.detailsPanelTitle()).toBe('Select a variable');
    expect(component.detailsPanelSubtitle()).toBe('');
    selection.select({ code: 'age', label: ' Age ', description: ' Age at visit ' });
    expect(component.detailsPanelTitle()).toBe('Age');
    expect(component.detailsPanelSubtitle()).toBe('Age at visit');
  });

  it('defaults the metadata browser mode to bubble map', () => {
    const { component } = create();
    expect(component.metadataBrowserMode()).toBe('bubble');
  });

  it('persists metadata browser mode changes', () => {
    const { component } = create();
    component.setMetadataBrowserMode('collapsible');

    expect(component.metadataBrowserMode()).toBe('collapsible');
    expect(component.metadataBrowserModeIndex()).toBe(2);
    expect(localStorage.getItem('metadata_browser_mode')).toBe('collapsible');
  });

  it('falls back to the bubble map for an invalid saved metadata browser mode', () => {
    localStorage.setItem('metadata_browser_mode', 'columns');
    const { component } = create();
    expect(component.metadataBrowserMode()).toBe('bubble');
  });

  it('includes collapsible tree as an alternative metadata browser mode', () => {
    const { component } = create();
    expect(component.metadataBrowserModes.map((mode) => mode.value)).toEqual(['bubble', 'ontology', 'collapsible']);
  });
});
