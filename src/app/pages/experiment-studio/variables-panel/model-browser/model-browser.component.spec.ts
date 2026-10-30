import type { Mock } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DataModel, D3HierarchyNode } from '../../../../models/data-model.interface';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentStudioGuideStateService } from '../../guide/experiment-studio-guide-state.service';
import { ModelBrowserComponent } from './model-browser.component';
import { VariableCatalogService } from '../variable-catalog.service';
import { VariableHistogramService } from '../variable-histogram.service';
import { VariableSelectionService } from '../variable-selection.service';

describe('ModelBrowserComponent', () => {
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

    TestBed.configureTestingModule({
      imports: [ModelBrowserComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ExperimentStudioGuideStateService, useValue: { setSelectedHierarchyNode: vi.fn() } },
        VariableCatalogService,
        VariableHistogramService,
        VariableSelectionService,
      ],
    });
    // Only the two toolbar sections the outside-click handling measures against.
    TestBed.overrideComponent(ModelBrowserComponent, {
      set: {
        template: '<div #contextSection class="ctx"><span class="ctx-inner"></span></div>'
          + '<div #searchSection class="search"><input class="search-input" /></div>',
      },
    });
    localStorage.removeItem('metadata_browser_mode');
  });

  function create() {
    const fixture = TestBed.createComponent(ModelBrowserComponent);
    return { fixture, component: fixture.componentInstance };
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
