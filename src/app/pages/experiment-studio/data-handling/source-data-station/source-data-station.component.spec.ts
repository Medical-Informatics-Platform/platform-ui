import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DataHandlingComponent } from '../data-handling.component';
import { DATA_HANDLING } from '../data-handling.context';
import { SectionAnchors } from '../section-anchors';
import { emptySummaryView } from '../utils/summary-view.utils';
import { SourceDataStationComponent } from './source-data-station.component';

@Component({
  imports: [SourceDataStationComponent],
  template: `<section app-source-data-station class="pipeline-node is-readonly"></section>`,
})
class HostComponent {}

describe('SourceDataStationComponent', () => {
  function render(recordsOut: number | null) {
    const dh = {
      recordsOut: { source: recordsOut },
      sectionOpen: signal({ source: false }),
      howTo: { source: { title: '', steps: [] } },
      sourceSummary: emptySummaryView(false),
      isStepOpen: () => false,
      onStepHeaderClick: vi.fn(),
      toggleStep: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent }, SectionAnchors],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { dh, el: fixture.nativeElement as HTMLElement, anchors: TestBed.inject(SectionAnchors) };
  }

  it('renders the read-only step header into the host section', () => {
    const { el } = render(1200);
    const header = el.querySelector('section.pipeline-node > header.pipeline-node-header')!;
    expect(header.querySelector('h3')?.textContent?.trim()).toBe('Raw data');
    expect(header.querySelector('.pipeline-records-out-value')?.textContent).toBe((1200).toLocaleString());
    expect(header.querySelector('.pipeline-status-badge.readonly')?.textContent).toContain('Read only');
  });

  it('hides Records out until the source count is known', () => {
    const { el } = render(null);
    expect(el.querySelector('.pipeline-records-out')).toBeNull();
  });

  it('toggles from the title and the header, and keeps the workspace out while folded', () => {
    const { dh, el, anchors } = render(10);
    (el.querySelector('.pipeline-node-toggle') as HTMLButtonElement).click();
    expect(dh.toggleStep).toHaveBeenCalledWith('source');
    expect(dh.onStepHeaderClick).toHaveBeenCalledWith('source', expect.any(MouseEvent));
    expect(el.querySelector('.summary-workspace')).toBeNull();
    expect(anchors.get('source')?.nativeElement.getAttribute('data-guide')).toBe('analysis-source-summary');
  });
});
