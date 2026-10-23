import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DATA_HANDLING } from '../data-handling.context';
import type { DataHandlingComponent } from '../data-handling.component';
import { PivotBlock, SummaryKind, SummaryView } from '../data-handling.models';
import { emptySummaryView } from '../utils/summary-view.utils';
import { SummaryWorkspaceComponent } from './summary-workspace.component';

const age: PivotBlock = { code: 'age', name: 'Age', columns: ['ds1'], rows: [{ metric: 'Mean', values: { ds1: '61.2' } }] };
const sex: PivotBlock = { code: 'sex', name: 'Sex', columns: ['ds1'], rows: [{ metric: 'Count', values: { ds1: '40' } }] };

/** The slice of the pipeline the workspace reads, with just enough behaviour to render. */
function pipelineStub(selected: PivotBlock | null) {
  return {
    cohortRetention: { raw: 120, processed: 100, dropped: 20, percentage: 83.333 },
    statisticsSearch: { source: '', raw: '', processed: '' } as Record<string, string>,
    summaryExportMenuKind: signal<SummaryKind | null>(null),
    filteredStatisticBlocks: () => [age, sex],
    statisticBlocks: (_kind: SummaryKind, type: string) => (type === 'numeric' ? [age] : [sex]),
    summaryKindLabel: (kind: SummaryKind) => (kind === 'raw' ? 'Raw data' : kind === 'processed' ? 'Processed data' : 'Data'),
    summaryScopeRunLabel: () => 'Running',
    summaryGuideAnchor: () => null,
    blockCoverage: () => null,
    selectionCoverage: () => null,
    coverageSeverity: () => 'none',
    coverageTitle: () => '',
    coveragePercent: () => '',
    barWidth: () => 0,
    isStatisticBlockSelected: (_kind: SummaryKind, block: PivotBlock) => block === selected,
    selectedStatisticBlock: () => selected,
    statisticBlockTypeLabel: () => 'Numerical',
    canSplitSummaryHistogram: () => false,
    selectedSummaryChartType: () => 'numeric',
    metricGroupLabel: () => null,
    isRollupColumn: () => false,
    datasetLabel: (code: string) => code.toUpperCase(),
    displayNumber: (value: string | null | undefined) => value ?? '',
    missingShareNote: () => null,
    selectStatisticBlock: vi.fn(),
    setSummaryTab: vi.fn(),
    toggleSummaryWorkspace: vi.fn(),
    toggleSummaryExportMenu: vi.fn(),
  };
}

@Component({
  imports: [SummaryWorkspaceComponent],
  template: `<div class="workflow-section-body" app-summary-workspace
    [kind]="kind()" [summary]="summary()" [rendered]="rendered()" emptyHint="Pick some variables."></div>`,
})
class HostComponent {
  readonly kind = signal<SummaryKind>('raw');
  readonly summary = signal<SummaryView>({ ...emptySummaryView(false), data: [age, sex] });
  readonly rendered = signal(true);
}

describe('SummaryWorkspaceComponent', () => {
  async function render(selected: PivotBlock | null = age) {
    const dh = pipelineStub(selected);
    TestBed.configureTestingModule({
      providers: [{ provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent }],
    });
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    return { fixture, dh, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('renders into the section body itself', async () => {
    const { el } = await render();
    expect(el.querySelector('.workflow-section-body > section.summary-workspace')).toBeTruthy();
  });

  it('renders nothing while not rendered', async () => {
    const { fixture, host, el } = await render();
    host.rendered.set(false);
    await fixture.whenStable();
    expect(el.querySelector('.workflow-section-body')!.children.length).toBe(0);
  });

  it('lists numerical and categorical variables in their own groups', async () => {
    const { el } = await render();
    const titles = [...el.querySelectorAll('.statistics-variable-group-title')].map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
    expect(titles).toEqual(['Numerical 1', 'Categorical 1']);
    expect(el.querySelector('.statistics-variable-btn.active')?.textContent).toContain('Age');
  });

  it('selects a variable through the pipeline', async () => {
    const { dh, el } = await render();
    (el.querySelectorAll('.statistics-variable-btn')[1] as HTMLButtonElement).click();
    expect(dh.selectStatisticBlock).toHaveBeenCalledWith('raw', sex);
  });

  it('shows the Table, Charts and Histogram views and marks the active one', async () => {
    const { dh, el } = await render();
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('.summary-tabs button')];
    expect(tabs.map((t) => t.textContent!.trim())).toEqual(['Table', 'Charts', 'Histogram']);
    expect(tabs.map((t) => t.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(tabs[1].querySelector('i')?.className).toBe('fas fa-chart-simple');
    tabs[2].click();
    expect(dh.setSummaryTab).toHaveBeenCalledWith('raw', 'Histogram');
  });

  it('renders the selected variable as a statistics table', async () => {
    const { el } = await render();
    expect(el.querySelector('.statistics-table thead')?.textContent).toContain('DS1');
    expect(el.querySelector('.statistics-table td.metric-cell')?.textContent).toBe('Mean');
  });

  it('offers Close on previews but not on the Raw data snapshot', async () => {
    const { fixture, host, dh, el } = await render();
    (el.querySelector('.station-preview-close') as HTMLButtonElement).click();
    expect(dh.toggleSummaryWorkspace).toHaveBeenCalledWith('raw');
    host.kind.set('source');
    await fixture.whenStable();
    expect(el.querySelector('.station-preview-close')).toBeNull();
  });

  it('shows cohort retention on the processed preview only', async () => {
    const { fixture, host, el } = await render();
    expect(el.querySelector('.cohort-retention-strip')).toBeNull();
    host.kind.set('processed');
    await fixture.whenStable();
    expect(el.querySelector('.cohort-retention-strip')?.textContent).toContain('100 / 120 records');
    expect(el.querySelector('.cohort-retention-strip')?.textContent).toContain('83.3% retained');
  });

  it('shows a loading skeleton with a header row and three body rows', async () => {
    const { fixture, host, el } = await render();
    host.summary.set(emptySummaryView(true));
    await fixture.whenStable();
    expect(el.querySelector('[aria-label="Raw data summary loading"]')).toBeTruthy();
    expect(el.querySelectorAll('.studio-skeleton-cell.head').length).toBe(4);
    expect(el.querySelectorAll('.studio-skeleton-cell:not(.head)').length).toBe(12);
  });

  it('shows the surface-specific hint when there is no data', async () => {
    const { fixture, host, el } = await render();
    host.summary.set(emptySummaryView(false));
    await fixture.whenStable();
    expect(el.querySelector('.empty-state-block')?.textContent).toContain('Pick some variables.');
  });
});
