import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DataHandlingComponent } from '../data-handling.component';
import { DATA_HANDLING } from '../data-handling.context';
import { SectionAnchors } from '../section-anchors';
import { PreprocessingStationComponent } from './preprocessing-station.component';

@Component({
  imports: [PreprocessingStationComponent],
  template: `<section app-preprocessing-station class="pipeline-node preprocessing-section"></section>`,
})
class HostComponent {}

interface Options {
  outlierApplied?: boolean;
  longitudinal?: boolean;
  processed?: number | null;
}

/** The folded step (not customised, nothing open), which renders only the header and the rail. */
function render({ outlierApplied = false, longitudinal = false, processed = null }: Options = {}) {
  const dh = {
    recordsOut: { processed, filtered: processed === null ? null : 100 },
    preprocessingBadgeTone: 'default',
    preprocessingStatusLabel: 'Default (Drop NaN)',
    sectionOpen: signal({ setup: false, processed: false }),
    appliedPreprocessingSubNodes: [
      { id: 'missing', icon: 'fas fa-eraser', title: 'Missing values', subtitle: 'Drop rows with NaN', impact: '', statusTone: 'default', statusLabel: 'Default' },
    ],
    outlierSubNodeApplied: outlierApplied,
    isLongitudinalModel: longitudinal,
    expStudioService: { appliedPreprocessingConfig: () => null },
    isStepAdded: () => false,
    isStepOpen: () => false,
    onStepHeaderClick: vi.fn(),
    toggleStep: vi.fn(),
    addStep: vi.fn(),
    jumpToSubNode: vi.fn(),
    addPreprocessingSubNode: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent }, SectionAnchors],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { dh, el: fixture.nativeElement as HTMLElement };
}

describe('PreprocessingStationComponent', () => {
  it('lists the applied stages in the folded rail, each opening its sub-step', () => {
    const { dh, el } = render();
    const items = el.querySelectorAll('[aria-label="Preprocessing steps"] .pipeline-subnode-item:not(.is-ghost)');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.pipeline-subnode-status')?.getAttribute('data-tone')).toBe('default');
    (items[0].querySelector('button') as HTMLButtonElement).click();
    expect(dh.jumpToSubNode).toHaveBeenCalledWith('setup', 'missing');
  });

  it('offers only the optional stages that are not in the rail yet', () => {
    const offered = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('.pipeline-subnode-item.is-ghost .pipeline-subnode-title'), (node) => node.textContent);
    expect(offered(render({ longitudinal: true }).el)).toEqual(['Add outlier clipping', 'Add longitudinal comparison']);
    TestBed.resetTestingModule();
    const { dh, el } = render({ outlierApplied: true });
    expect(offered(el)).toEqual([]);
    expect(dh.addPreprocessingSubNode).not.toHaveBeenCalled();
  });

  it('shows the records-out count and mounts no editor or preview while the step is not added', () => {
    const { dh, el } = render({ processed: 80 });
    expect(el.querySelector('.pipeline-records-out-value')?.firstChild?.textContent).toBe('80');
    expect(el.querySelector('app-station-card, [app-summary-workspace]')).toBeNull();
    (el.querySelector('.btn-add-step') as HTMLButtonElement).click();
    expect(dh.addStep).toHaveBeenCalledWith('setup');
  });
});
