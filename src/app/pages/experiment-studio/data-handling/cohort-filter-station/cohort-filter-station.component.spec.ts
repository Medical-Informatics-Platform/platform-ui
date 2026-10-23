import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DataHandlingComponent } from '../data-handling.component';
import { DATA_HANDLING } from '../data-handling.context';
import { SectionAnchors } from '../section-anchors';
import { CohortFilterStationComponent } from './cohort-filter-station.component';

@Component({
  imports: [CohortFilterStationComponent],
  template: `<section app-cohort-filter-station class="pipeline-node filter-workflow-section"></section>`,
})
class HostComponent {}

/** The folded step: rules exist but the builder is not open, so no editor is mounted. */
function render(rows: Array<{ title: string; subtitle: string }>, matchesAny = false) {
  const dh = {
    recordsOut: { filtered: 80, source: 100 },
    filterRuleCount: signal(rows.length),
    filteringStatusLabel: rows.length ? 'Applied' : 'Not in run yet',
    sectionOpen: signal({ filters: false, raw: false }),
    cohortRuleRows: rows,
    cohortMatchesAny: matchesAny,
    isStepAdded: () => false,
    isStepOpen: () => false,
    onStepHeaderClick: vi.fn(),
    toggleStep: vi.fn(),
    goToSection: vi.fn(),
    removeStep: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent }, SectionAnchors],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { dh, el: fixture.nativeElement as HTMLElement };
}

describe('CohortFilterStationComponent', () => {
  it('lists the stored rules in the folded overview, each leading back to the builder', () => {
    const { dh, el } = render([{ title: 'Age', subtitle: 'is at least 60' }], true);
    expect(el.querySelector('.pipeline-subnodes-caption')?.textContent).toContain('any of these rules');
    const items = el.querySelectorAll('[aria-label="Cohort filtering rules"] .pipeline-subnode-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Age');
    (items[0].querySelector('button') as HTMLButtonElement).click();
    expect(dh.goToSection).toHaveBeenCalledWith('filters');
  });

  it('shows only the Add condition rail when there are no rules', () => {
    const { el } = render([]);
    expect(el.querySelector('.pipeline-subnodes-caption')).toBeNull();
    expect(el.querySelector('.pipeline-subnode-item.is-ghost')?.textContent).toContain('Add condition');
    expect(el.querySelector('.pipeline-records-out')).toBeNull();
  });

  it('mounts no rule builder while the step is not added', () => {
    const { el } = render([{ title: 'Age', subtitle: '' }]);
    expect(el.querySelector('app-filter-config-modal')).toBeNull();
    const value = el.querySelector('.pipeline-records-out-value')!;
    expect(value.firstChild?.textContent).toBe('80');
    expect(value.querySelector('span')?.textContent).toBe('of 100');
  });
});
