import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DataHandlingComponent } from '../data-handling.component';
import { DATA_HANDLING } from '../data-handling.context';
import { TransformationStationComponent } from './transformation-station.component';
import { TransformationDraftsService } from './transformation-drafts.service';

@Component({
  imports: [TransformationStationComponent],
  template: `<section app-transformation-station class="pipeline-node preprocessing-section"></section>`,
})
class HostComponent {}

/** The folded step (not added), which renders only the header and the rail. */
function render(nodes: Array<{ id: string; title: string }>, applied = false) {
  const dh = {
    transformationStatusLabel: applied ? 'Applied' : 'Not in run yet',
    transformationBadgeLabel: applied ? '1 column' : 'Optional',
    sectionOpen: signal({ transformation: false }),
    appliedTransformationSubNodes: nodes.map((node) => ({ ...node, icon: 'fas fa-square-plus', subtitle: '', statusTone: 'applied', statusLabel: 'Applied' })),
    isStepAdded: () => false,
    isStepOpen: () => false,
    onStepHeaderClick: vi.fn(),
    toggleStep: vi.fn(),
    removeStep: vi.fn(),
    jumpToSubNode: vi.fn(),
    addTransformationSubNode: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent },
      { provide: TransformationDraftsService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { dh, el: fixture.nativeElement as HTMLElement };
}

describe('TransformationStationComponent', () => {
  it('lists the applied derived columns in the folded rail, each opening its card', () => {
    const { dh, el } = render([{ id: 'draft-1', title: 'sex_group' }], true);
    expect(el.querySelector('.pipeline-status-badge')?.className).toContain('applied');
    const item = el.querySelector('[aria-label="Data transformation steps"] .pipeline-subnode-item:not(.is-ghost)')!;
    expect(item.textContent).toContain('sex_group');
    item.querySelector('button')!.click();
    expect(dh.jumpToSubNode).toHaveBeenCalledWith('transformation', 'draft-1');
  });

  it('offers to add a derived column and mounts no cards while the step is not added', () => {
    const { dh, el } = render([]);
    expect(el.querySelector('.pipeline-status-badge')?.className).toContain('optional');
    el.querySelector<HTMLButtonElement>('[title="Add and open a derived column"]')!.click();
    expect(dh.addTransformationSubNode).toHaveBeenCalled();
    expect(el.querySelector('app-station-card, .btn-remove-step-node')).toBeNull();
  });
});
