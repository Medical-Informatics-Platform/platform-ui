import { ChangeDetectorRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { page } from 'vitest/browser';
import { ErrorService } from '../../../services/error.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { VariablesPanelComponent } from './variables-panel.component';

/** Renders the real template at a desktop width, where the step is two columns. */
describe('VariablesPanelComponent columns', () => {
  let fixture: ComponentFixture<VariablesPanelComponent>;
  let component: VariablesPanelComponent;
  let selectedVariables: ReturnType<typeof signal<any[]>>;

  const sex = { label: 'Sex', code: 'sex', type: 'nominal' };
  const tree = {
    label: 'IST',
    code: 'ist',
    children: [{ label: 'Demographics', code: 'demographics', children: [sex] }],
  };

  const query = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);
  const select = (node: unknown): void => {
    component.selectedNode = node;
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };

  beforeAll(async () => {
    await page.viewport(1400, 900);
  });

  beforeEach(() => {
    selectedVariables = signal<any[]>([]);
    TestBed.configureTestingModule({
      imports: [VariablesPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ExperimentStudioService,
          useValue: {
            selectedDataModel: signal<any>(null),
            selectedVariables,
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

  it('puts the variables of the experiment above the inspector', () => {
    const pool = query('.right-column .pool-card');
    const inspector = query('.right-column #histogram-graph');

    expect(pool.compareDocumentPosition(inspector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps a large pool from pushing the inspector down the page', () => {
    selectedVariables.set(
      Array.from({ length: 40 }, (_, index) => ({ code: `var_${index}`, label: `Variable number ${index}`, type: 'real' }))
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.pool-chip').length).toBe(40);
    expect(query('.pool-card').getBoundingClientRect().height).toBeLessThanOrEqual(220);
  });

  it('ends the browser card and the details column on the same line', () => {
    const browser = query('.bubble-chart-section').getBoundingClientRect();
    const details = query('.right-column').getBoundingClientRect();

    expect(details.left).toBeGreaterThan(browser.right); // side by side, not stacked
    expect(Math.abs(browser.bottom - details.bottom)).toBeLessThanOrEqual(1);
  });

  it('keeps the inspector inside the canvas height once details fill it', () => {
    select({
      label: 'Sex',
      code: 'sex',
      type: 'nominal',
      methodology: 'Collected at every visit. '.repeat(24),
      enumerations: Array.from({ length: 24 }, (_, index) => ({ code: `enum_${index}`, label: `Option ${index}` })),
    });

    const browser = query('.bubble-chart-section').getBoundingClientRect();
    const details = query('.right-column').getBoundingClientRect();

    expect(details.left).toBeGreaterThan(browser.right); // still two columns
    expect(details.height).toBeLessThanOrEqual(browser.height + 1); // never grows past the canvas
    expect(Math.abs(browser.bottom - details.bottom)).toBeLessThanOrEqual(1);

    const body = query('.details-panel-body') as HTMLElement;
    expect(getComputedStyle(body).overflowY).toBe('auto'); // the body scrolls inside the card
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight); // the details actually overflow it
  });

  it('draws attention to Add for a variable, not for a whole group', () => {
    select(sex);
    expect(query('.selection-toggle-btn').classList.contains('pulse-hint--variable')).toBe(true);

    select(tree);
    expect(query('.selection-toggle-btn').classList.contains('pulse-hint--variable')).toBe(false);
  });
});
