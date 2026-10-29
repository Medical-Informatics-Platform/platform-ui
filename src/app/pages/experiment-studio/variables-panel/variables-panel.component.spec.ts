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
    TestBed.overrideComponent(VariablesPanelComponent, { set: { template: '' } });
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

});
