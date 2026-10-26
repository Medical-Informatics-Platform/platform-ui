import { ChangeDetectorRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { ErrorService } from '../../../services/error.service';
import { AnalysisStudioService } from '../../../services/analysis-studio.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { AnalysisStudioGuideStateService } from '../guide/analysis-studio-guide-state.service';
import { HistogramGraphComponent } from './histogram-graph/histogram-graph.component';
import { VariablesPanelComponent } from './variables-panel.component';

/** Renders the real template (the logic spec next to this file blanks it). */
describe('VariablesPanelComponent data exploration layout', () => {
  let fixture: ComponentFixture<VariablesPanelComponent>;
  let component: VariablesPanelComponent;

  const tree = {
    label: 'IST',
    code: 'ist',
    children: [
      {
        label: 'Demographics',
        code: 'demographics',
        children: [{ label: 'Sex', code: 'sex', type: 'nominal' }],
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VariablesPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AnalysisStudioService,
          useValue: {
            selectedDataModel: signal<any>(null),
            selectedVariables: signal<any[]>([]),
            selectedDatasets: signal<string[]>(['dataset-a']),
            availableGroupedAlgorithms: signal<any[]>([]),
            getAllDataModels: vi.fn().mockReturnValue(of([])),
            categorizeDataModels: vi.fn().mockReturnValue({ crossSectional: [], longitudinal: [] }),
            getAlgorithmResults: vi.fn().mockReturnValue(of({ result: { histogram: [] } })),
            getDatasetLabelMap: vi.fn().mockReturnValue({ 'dataset-a': 'Dataset A' }),
            setVariables: vi.fn(),
            setSelectedDatasets: vi.fn(),
            addVariableAndEnrich: vi.fn(),
            clearSelectionsForDataModelChange: vi.fn(),
            editingExistingAnalysis: () => false,
            unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
          },
        },
        {
          provide: AnalysisStudioGuideStateService,
          useValue: { activeStepId: signal<string | null>(null), setSelectedHierarchyNode: vi.fn() },
        },
        { provide: ErrorService, useValue: {} },
        { provide: PdfExportService, useValue: { exportHistogramPdf: vi.fn() } },
        { provide: CsvExportService, useValue: { exportHistogramCsv: vi.fn() } },
      ],
    });
    localStorage.removeItem('metadata_browser_mode');

    fixture = TestBed.createComponent(VariablesPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Loading an empty model list clears the view on init, so the tree goes in afterwards.
    component.d3Data = tree;
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  });

  it('names each browser view next to its icon when the column is wide', () => {
    const column = fixture.nativeElement.querySelector('.bubble-column') as HTMLElement;
    column.style.width = '900px';
    const names = Array.from(fixture.nativeElement.querySelectorAll('.metadata-mode-btn span')) as HTMLElement[];

    expect(names.map((name) => name.textContent?.trim())).toEqual(['Map', 'List', 'Tree']);
    for (const name of names) {
      expect(getComputedStyle(name).display).not.toBe('none');
    }
  });

  it('keeps the toolbar on one row in a narrow column: icons only, names stay accessible', () => {
    const column = fixture.nativeElement.querySelector('.bubble-column') as HTMLElement;
    column.style.width = '520px';
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.metadata-mode-btn')) as HTMLElement[];

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Map', 'List', 'Tree']);
    for (const button of buttons) {
      expect(getComputedStyle(button.querySelector('span')!).display).toBe('none');
    }
  });

  it('draws the group overview as horizontal bars so group names stay readable', () => {
    component.selectedNode = tree;
    component.groupHistogramData.set({ bins: ['Demographics'], counts: [1], variableName: 'IST' });
    fixture.detectChanges();

    const chart = fixture.debugElement.query(By.directive(HistogramGraphComponent));
    expect(chart).not.toBeNull();
    expect((chart.componentInstance as HistogramGraphComponent).horizontal()).toBe(true);
  });

  it('shows the chart with no tablist and no Details section', () => {
    component.onSelectedNodeChange(tree);
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    const inspector = fixture.nativeElement.querySelector('#histogram-graph') as HTMLElement;
    expect(inspector.querySelector('#histogram-section')).not.toBeNull();
    expect(inspector.querySelector('#inspector-distribution-title')?.textContent?.trim()).toBe('Variables per group');
    expect(inspector.querySelector('#inspector-details-title')).toBeNull();
    expect(inspector.querySelector('details')).toBeNull();
    expect(inspector.querySelector('[role="tablist"]')).toBeNull();
  });

  describe('inspector details', () => {
    function selectNode(): HTMLElement {
      component.onSelectedNodeChange(tree);
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('keeps real headings in order: h2 panel title, h3 sections', () => {
      const host = selectNode();

      expect(host.querySelector('.details-panel-title')?.tagName).toBe('H2');
      expect(host.querySelector('#inspector-distribution-title')?.tagName).toBe('H3');
    });

    it('scrolls the column only, never the inspector body inside it', () => {
      const host = selectNode();

      expect(getComputedStyle(host.querySelector<HTMLElement>('.right-column')!).overflowY).toBe('auto');
      expect(getComputedStyle(host.querySelector<HTMLElement>('.details-panel-body')!).overflowY).toBe('visible');
      expect(getComputedStyle(host.querySelector<HTMLElement>('.details-panel-header')!).position).toBe('sticky');
      expect(host.querySelector('.details-panel-fade')).toBeNull();
    });

    it('puts the path and the facts that read the chart in the header', () => {
      component.onSelectedNodeChange({ ...tree.children[0].children[0], units: 'n/a', minValue: 0, maxValue: 1 });
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.details-panel-path')?.textContent?.trim()).toBe('· IST › Demographics');
      expect(host.querySelector('.details-panel-facts')?.textContent?.trim()).toBe('nominal · n/a · 0–1');
    });

    it('shows a discrete range as integers', () => {
      component.onSelectedNodeChange({ label: 'Age', code: 'age', type: 'discrete', units: 'years', minValue: '1.0', maxValue: '150.0' });
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.details-panel-facts')?.textContent?.trim()).toBe('discrete · years · 1–150');
    });

    it('counts what a group holds and what its button will add', () => {
      const host = selectNode();

      expect(host.querySelector('.details-panel-path')).toBeNull(); // the root has no ancestors
      expect(host.querySelector('.details-panel-facts')?.textContent?.trim()).toBe('1 group · 1 variable');
      const button = host.querySelector<HTMLButtonElement>('.selection-toggle-btn')!;
      expect(button.textContent?.trim()).toBe('Add 1');
      expect(button.classList).toContain('is-bulk');
    });

    it('offers Undo after a large group add, restoring the list from before the click', () => {
      const service = TestBed.inject(AnalysisStudioService) as unknown as {
        selectedVariables: ReturnType<typeof signal<any[]>>;
        setVariables: ReturnType<typeof vi.fn>;
      };
      const picked = { code: 'v0', label: 'V0', type: 'real' };
      service.selectedVariables.set([picked]);
      const big = {
        label: 'Big', code: 'big',
        children: Array.from({ length: 25 }, (_, i) => ({ code: `v${i}`, label: `V${i}`, type: 'real' })),
      };
      component.onSelectedNodeChange(big);
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.selection-toggle-btn')?.textContent?.trim()).toBe('Add 24 more');
      host.querySelector<HTMLButtonElement>('.selection-toggle-btn')!.click();
      fixture.detectChanges();

      const undo = host.querySelector<HTMLElement>('.bulk-add-undo')!;
      expect(undo.getAttribute('role')).toBe('status');
      expect(undo.textContent).toContain('Added 24 variables');
      undo.querySelector<HTMLButtonElement>('.bulk-add-undo-btn')!.click();
      fixture.detectChanges();

      expect(service.setVariables).toHaveBeenLastCalledWith([picked]); // the hand-picked one stays
      expect(host.querySelector('.bulk-add-undo')).toBeNull();
    });

    it('offers no Undo for a small add', () => {
      const host = selectNode();
      host.querySelector<HTMLButtonElement>('.selection-toggle-btn')!.click();
      fixture.detectChanges();

      expect(host.querySelector('.bulk-add-undo')).toBeNull();
    });
  });

  it('tells the user how to add a first variable without naming one view', () => {
    const hint = fixture.nativeElement.querySelector('.pool-card .pool-card-hint') as HTMLElement;

    expect(hint.textContent).toContain('Add');
    expect(hint.textContent?.toLowerCase()).not.toContain('map');
  });

  describe('Split by', () => {
    const sex = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F' }, { code: 'M' }] };

    function selectAge(): void {
      component.onSelectedNodeChange({ code: 'age', label: 'Age', type: 'real' });
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
    }

    it('shows the split choices as radio pills and splits on click', () => {
      const service = TestBed.inject(AnalysisStudioService) as unknown as {
        selectedVariables: ReturnType<typeof signal<any[]>>;
        getAlgorithmResults: ReturnType<typeof vi.fn>;
      };
      service.selectedVariables.set([{ code: 'age', label: 'Age', type: 'real' }, sex]);
      selectAge();

      const host = fixture.nativeElement as HTMLElement;
      const pills = Array.from(host.querySelectorAll<HTMLLabelElement>('.split-pill'));
      expect(pills.map((pill) => pill.textContent?.trim())).toEqual(['None', 'Dataset', 'Sex']);
      expect(host.querySelector('#histogram-split-select')).toBeNull();
      expect(pills[0].querySelector('input')!.checked).toBe(true);

      pills[2].querySelector('input')!.click();
      expect(component.histogramSplit()).toBe('sex');
      expect(service.getAlgorithmResults.mock.calls.at(-1)?.[5]).toEqual(['sex']);
    });

    it('falls back to a select when there are more split choices than pills', () => {
      const service = TestBed.inject(AnalysisStudioService) as unknown as {
        selectedVariables: ReturnType<typeof signal<any[]>>;
      };
      const nominal = Array.from({ length: 6 }, (_, i) => ({
        code: `n${i}`, label: `N${i}`, type: 'nominal', enumerations: [{ code: 'a' }, { code: 'b' }],
      }));
      service.selectedVariables.set([{ code: 'age', label: 'Age', type: 'real' }, ...nominal]);
      selectAge();

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('#histogram-split-select')).not.toBeNull();
      expect(host.querySelector('.split-pill')).toBeNull();
    });
  });
});
