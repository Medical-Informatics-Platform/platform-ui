import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DataHandlingComponent } from '../../data-handling.component';
import { DATA_HANDLING } from '../../data-handling.context';
import type { PreprocessingGroup, VariableRow } from '../../data-handling.models';
import { PrepRailSlotDirective, PrepVariableRailComponent } from './prep-variable-rail.component';

const age = { code: 'age', label: 'Age' } as VariableRow;
const sex = { code: 'sex', label: 'Sex' } as VariableRow;

@Component({
  imports: [PrepVariableRailComponent, PrepRailSlotDirective],
  template: `
    <aside app-prep-variable-rail class="statistics-browser preprocessing-browser" [step]="step" heading="Variables · action"
      searchLabel="Search preprocessing variables" [searchId]="searchId" [groupStates]="groupStates" emptyHint="Clear the search.">
      <div class="batch-menu">batch</div>
      <ng-template prepRailSlot="lead" let-variable><small class="lead">{{ variable.code }}</small></ng-template>
      <ng-template prepRailSlot="action" let-variable><span class="prep-rail-action">{{ variable.code }}-action</span></ng-template>
    </aside>
  `,
})
class HostComponent {
  step: 'missing' | 'longitudinal' = 'missing';
  searchId: string | null = 'preprocessing-search';
  groupStates = true;
}

function render(groups: PreprocessingGroup[], configure: (host: HostComponent) => void = () => {}) {
  const dh = {
    prepSearch: { missing: '', outlier: '', longitudinal: '' },
    prepGroups: vi.fn(() => groups),
    filteredPrepVariables: () => groups.flatMap((group) => group.variables),
    prepVariableStateLabel: (_kind: string, variable: VariableRow) => (variable === age ? 'Pending' : 'Default'),
    prepVariableHasPendingChange: (_kind: string, variable: VariableRow) => variable === age,
    isPrepVariableSelected: (_kind: string, variable: VariableRow) => variable === sex,
    selectPrepVariable: vi.fn(),
    variableLabel: (variable: VariableRow) => variable.label,
  };
  TestBed.configureTestingModule({ providers: [{ provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent }] });
  const fixture = TestBed.createComponent(HostComponent);
  configure(fixture.componentInstance);
  fixture.detectChanges();
  return { dh, el: fixture.nativeElement as HTMLElement };
}

describe('PrepVariableRailComponent', () => {
  const groups: PreprocessingGroup[] = [
    { key: 'pending', title: 'Pending', variables: [age] },
    { key: 'default', title: 'Default (NA removal)', variables: [sex] },
  ];

  it('renders the heading, count, projected batch menu and search', () => {
    const { el } = render(groups);
    const header = el.querySelector('.statistics-browser-header')!;
    expect(header.querySelector('span')?.textContent).toBe('Variables · action');
    expect(header.querySelector('small')?.textContent).toBe('2 shown');
    expect(header.querySelector('.batch-menu')?.textContent).toBe('batch');
    const search = el.querySelector('input.preprocessing-search')!;
    expect(search.id).toBe('preprocessing-search');
    expect(search.getAttribute('aria-label')).toBe('Search preprocessing variables');
  });

  it('groups the variables by state with the step slots in each row', () => {
    const { dh, el } = render(groups);
    const rendered = Array.from(el.querySelectorAll('.preprocessing-variable-group'));
    expect(rendered.map((group) => group.getAttribute('data-state'))).toEqual(['pending', 'default']);
    const [ageRow, sexRow] = Array.from(el.querySelectorAll<HTMLButtonElement>('.preprocessing-variable-btn'));
    expect(ageRow.querySelector('.statistics-variable-meta')?.firstElementChild?.className).toBe('lead');
    expect(ageRow.querySelector('.preprocessing-state-mini')?.className).toContain('state-pending');
    expect(sexRow.querySelector('.preprocessing-state-mini')?.className).toContain('state-default');
    expect(ageRow.lastElementChild?.textContent).toBe('age-action');
    expect(sexRow.classList.contains('active')).toBe(true);
    ageRow.click();
    expect(dh.selectPrepVariable).toHaveBeenCalledWith('missing', age);
    expect(dh.prepGroups).toHaveBeenCalledWith('missing');
  });

  it('can leave out the group state and search id, and shows the no-match state', () => {
    const { el } = render([], (host) => {
      host.step = 'longitudinal';
      host.searchId = null;
      host.groupStates = false;
    });
    expect(el.querySelector('input.preprocessing-search')?.hasAttribute('id')).toBe(false);
    expect(el.querySelector('.empty-state-block span')?.textContent).toBe('Clear the search.');
    TestBed.resetTestingModule();
    const withGroups = render(groups, (host) => (host.groupStates = false)).el;
    expect(withGroups.querySelector('.preprocessing-variable-group')?.hasAttribute('data-state')).toBe(false);
  });
});
