import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DataHandlingComponent } from '../../data-handling.component';
import { DATA_HANDLING } from '../../data-handling.context';
import type { LongitudinalStrategy, VariableRow } from '../../data-handling.models';
import { LongitudinalStepComponent } from './longitudinal-step.component';

@Component({
  imports: [LongitudinalStepComponent],
  template: `<section app-longitudinal-step class="statistics-workspace preprocessing-workspace"></section>`,
})
class HostComponent {}

const age = { code: 'age', label: 'Age' } as VariableRow;

function render(error: string | null = null) {
  const dh = {
    prepSearch: { missing: '', outlier: '', longitudinal: '' },
    prepGroups: () => [{ key: 'applied', title: 'Applied preprocessing', variables: [age] }],
    filteredPrepVariables: () => [age],
    isPrepVariableSelected: () => true,
    selectPrepVariable: vi.fn(),
    selectedPrepVariable: () => age,
    variableLabel: (variable: VariableRow) => variable.label,
    variableTypeLabel: () => 'Numerical',
    prepVariableStateLabel: () => 'Applied',
    prepVariableHasPendingChange: () => false,
    longitudinalStrategies: [
      { value: 'first', label: 'Use visit 1' },
      { value: 'diff', label: 'Difference' },
    ],
    longitudinalStrategyFor: () => 'first',
    isLongitudinalStrategyDisabled: (_variable: VariableRow, strategy: LongitudinalStrategy) => strategy === 'diff',
    onLongitudinalStrategyChange: vi.fn(),
    preprocessingValidationErrors: (error ? { age: error } : {}) as Record<string, string>,
  };
  TestBed.configureTestingModule({ providers: [{ provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent }] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { dh, el: fixture.nativeElement as HTMLElement };
}

describe('LongitudinalStepComponent', () => {
  it('renders a rail without group states and the type label in each row', () => {
    const { el } = render();
    expect(el.querySelector('.preprocessing-variable-group')?.hasAttribute('data-state')).toBe(false);
    expect(el.querySelector('.statistics-variable-meta small')?.textContent).toBe('Numerical');
    expect(el.querySelector('.preprocessing-state-chip')?.className).toContain('state-applied');
  });

  it('offers the strategies with the unavailable ones disabled', () => {
    const { el } = render();
    expect(el.querySelector('.preprocessing-control > span')?.textContent).toBe('Strategy for Age');
    const options = Array.from(el.querySelectorAll<HTMLOptionElement>('select.table-select option'));
    expect(options.map((option) => [option.textContent, option.disabled])).toEqual([
      ['Use visit 1', false],
      ['Difference', true],
    ]);
  });
});
