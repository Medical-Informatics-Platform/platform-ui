import { ChangeDetectorRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { ErrorService } from '../../../services/error.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
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
      { label: 'Demographics', code: 'demographics', children: [{ label: 'Sex', code: 'sex', type: 'nominal' }] },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VariablesPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ExperimentStudioService,
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
            editingExistingExperiment: () => false,
            unavailableVariables: signal<ReadonlyMap<string, readonly string[]>>(new Map()),
          },
        },
        {
          provide: ExperimentStudioGuideStateService,
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

  it('tells the user how to add a first variable without naming one view', () => {
    const empty = fixture.nativeElement.querySelector('.pool-card .parameter-empty') as HTMLElement;

    expect(empty.textContent).toContain('No variables yet');
    expect(empty.textContent).toContain('Add');
    expect(empty.textContent?.toLowerCase()).not.toContain('map');
  });

  describe('Split by', () => {
    const sex = { code: 'sex', label: 'Sex', type: 'nominal', enumerations: [{ code: 'F' }, { code: 'M' }] };

    function selectAge(): void {
      component.onSelectedNodeChange({ code: 'age', label: 'Age', type: 'real' });
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
    }

    it('shows the split choices as radio pills and splits on click', () => {
      const service = TestBed.inject(ExperimentStudioService) as unknown as {
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
      const service = TestBed.inject(ExperimentStudioService) as unknown as {
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
