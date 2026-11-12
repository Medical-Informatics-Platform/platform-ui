import { ChangeDetectorRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { page, userEvent } from 'vitest/browser';
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

  it('shows the chart and details together with no tablist', () => {
    component.onSelectedNodeChange(tree);
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    const inspector = fixture.nativeElement.querySelector('#histogram-graph') as HTMLElement;
    expect(inspector.querySelector('#histogram-section')).not.toBeNull();
    expect(inspector.querySelector('#inspector-distribution-title')?.textContent?.trim()).toBe('Variables per group');
    expect(inspector.querySelector('#inspector-details-title')?.textContent?.trim()).toBe('Details');
    expect(inspector.querySelector('app-metadata-info-panel')).not.toBeNull();
    expect(inspector.querySelector('[role="tablist"]')).toBeNull();
  });

  describe('inspector details', () => {
    function selectNode(): HTMLElement {
      component.onSelectedNodeChange(tree);
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('keeps real headings in order: h2 panel title, h3 sections, h4 block labels', () => {
      const host = selectNode();

      expect(host.querySelector('.details-panel-title')?.tagName).toBe('H2');
      expect(host.querySelector('#inspector-details-title')?.tagName).toBe('H3');
      const blockLabel = host.querySelector('app-metadata-info-panel h4');
      expect(blockLabel?.tagName).toBe('H4');
      expect(blockLabel?.textContent?.trim()).toBe('Path');
    });

    it('renders block labels one visible level under the section titles', () => {
      const host = selectNode();

      const sectionTitle = host.querySelector<HTMLElement>('#inspector-details-title')!;
      const blockLabel = host.querySelector<HTMLElement>('app-metadata-info-panel h4')!;
      expect(getComputedStyle(sectionTitle).textTransform).toBe('uppercase');
      expect(getComputedStyle(blockLabel).textTransform).toBe('none');
      expect(parseFloat(getComputedStyle(sectionTitle).fontSize)).toBeGreaterThan(
        parseFloat(getComputedStyle(blockLabel).fontSize)
      );
    });

    it('renders the inspector metadata blocks without the card surface', () => {
      const host = selectNode();

      const blocks = Array.from(host.querySelectorAll<HTMLElement>('app-metadata-info-panel .metadata-block'));
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block.classList.contains('metadata-block-card')).toBe(false);
      }
    });

    it('hints at more content with a fade that never blocks clicks', () => {
      const host = selectNode();

      const body = host.querySelector<HTMLElement>('.details-panel-body')!;
      const fade = body.querySelector<HTMLElement>('.details-panel-fade');
      expect(fade).not.toBeNull();
      expect(fade!.getAttribute('aria-hidden')).toBe('true');
      expect(getComputedStyle(fade!).position).toBe('sticky');
      expect(getComputedStyle(fade!).pointerEvents).toBe('none');
    });

    it('reads the hierarchy path as a wrapping breadcrumb', () => {
      component.onSelectedNodeChange(tree.children[0].children[0]); // the Sex leaf
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      const path = host.querySelector<HTMLElement>('app-metadata-info-panel .metadata-path')!;
      const nodes = Array.from(path.querySelectorAll('span')).map((span) => span.textContent?.trim());
      expect(nodes).toEqual(['IST', 'Demographics', 'Sex']);
    });
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

  describe('Details collapsible', () => {
    const select = (node: any): void => {
      component.onSelectedNodeChange(node);
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
    };
    const details = (): HTMLDetailsElement =>
      fixture.nativeElement.querySelector('details.inspector-collapse') as HTMLDetailsElement;
    const row = (): HTMLElement => details().querySelector('summary') as HTMLElement;
    const body = (): HTMLElement => details().querySelector('.inspector-collapse-body') as HTMLElement;

    it('renders Details open, with the metadata visible', () => {
      select(tree.children[0]);

      expect(row().textContent).toContain('Details');
      expect(getComputedStyle(row().querySelector('h3')!).display).not.toBe('none');
      expect(row().querySelector('.inspector-collapse-chevron')!.getAttribute('aria-hidden')).toBe('true');
      expect(details().open).toBe(true);
      expect(component.detailsOpen()).toBe(true);
      expect(getComputedStyle(body()).display).not.toBe('none');
      expect(body().querySelector('app-metadata-info-panel')).not.toBeNull();
    });

    it('collapses Details when the heading row is clicked anywhere', () => {
      select(tree.children[0]);

      (row().querySelector('#inspector-details-title') as HTMLElement).click();
      fixture.detectChanges();

      expect(details().open).toBe(false);
      expect(component.detailsOpen()).toBe(false);
      expect(getComputedStyle(body()).display).toBe('none');
    });

    it('collapses Details with the keyboard when the heading row has focus', async () => {
      select(tree.children[0]);

      row().focus();
      await userEvent.keyboard('{Enter}');

      expect(details().open).toBe(false);
      expect(component.detailsOpen()).toBe(false);
    });

    it('keeps the collapsed state when another node is selected, and stays open if left open', () => {
      select(tree.children[0]);
      row().click();
      fixture.detectChanges();

      select(tree);
      expect(details().open).toBe(false);
      expect(component.detailsOpen()).toBe(false);

      row().click();
      fixture.detectChanges();
      select(tree.children[0]);
      expect(details().open).toBe(true);
      expect(getComputedStyle(body()).display).not.toBe('none');
    });

    it('does not render Details while no node is selected', () => {
      expect(fixture.nativeElement.querySelector('details.inspector-collapse')).toBeNull();
    });

    it('keeps the chevron on the Details row at 330px with no horizontal overflow', async () => {
      await page.viewport(330, 900);
      select(tree.children[0]);

      const inspector = fixture.nativeElement.querySelector('#histogram-graph') as HTMLElement;
      const rowBox = row().getBoundingClientRect();
      const chevron = row().querySelector('.inspector-collapse-chevron')!.getBoundingClientRect();

      expect(chevron.left).toBeGreaterThanOrEqual(rowBox.left);
      expect(chevron.right).toBeLessThanOrEqual(rowBox.right);
      expect(chevron.top).toBeGreaterThanOrEqual(rowBox.top - 1);
      expect(chevron.bottom).toBeLessThanOrEqual(rowBox.bottom + 1);
      expect(inspector.scrollWidth).toBeLessThanOrEqual(inspector.clientWidth + 1);

      await page.viewport(1400, 900);
    });
  });
});
