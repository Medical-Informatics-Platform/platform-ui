import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DataHandlingComponent } from '../../data-handling.component';
import { DATA_HANDLING } from '../../data-handling.context';
import type { MissingAction, PreprocessingRule, VariableRow } from '../../data-handling.models';
import { MissingValuesStepComponent } from './missing-values-step.component';

@Component({
  imports: [MissingValuesStepComponent],
  template: `<section app-missing-values-step class="statistics-workspace preprocessing-workspace"></section>`,
})
class HostComponent {}

const sex = { code: 'sex', label: 'Sex' } as VariableRow;

function render(rule: Partial<PreprocessingRule>, { categorical = true, coverage = null as { total: number; missing: number; share: number } | null } = {}) {
  const current: PreprocessingRule = { variableCode: 'sex', action: 'drop', value: '', enabled: true, ...rule };
  const dh = {
    // the rail
    prepSearch: { missing: '', outlier: '', longitudinal: '' },
    prepGroups: () => [{ key: 'pending', title: 'Pending', variables: [sex] }],
    filteredPrepVariables: () => [sex],
    isPrepVariableSelected: () => true,
    selectPrepVariable: vi.fn(),
    batchMenuOpen: () => null,
    toggleBatchMenu: vi.fn(),
    applyBatchMissingStrategy: vi.fn(),
    missingStrategyLabel: (action: MissingAction) => action,
    // the detail panel
    selectedPrepVariable: () => sex,
    variableLabel: (variable: VariableRow) => variable.label,
    variableTypeLabel: () => 'Categorical',
    prepVariableStateLabel: () => 'Pending',
    prepVariableHasPendingChange: () => true,
    ruleFor: vi.fn(() => current),
    missingActions: [
      { value: 'drop', label: 'Remove rows' },
      { value: 'constant', label: 'Fill with a value' },
    ],
    isMissingActionDisabled: (_variable: VariableRow, action: MissingAction) => action === 'mean',
    missingActionEffect: () => 'effect',
    onMissingActionChange: vi.fn(),
    onMissingValueChange: vi.fn(),
    isCategoricalVariable: () => categorical,
    enumOptions: () => [{ code: 'F', label: 'Female' }],
    preprocessingValidationErrors: {} as Record<string, string>,
    coverageFor: () => coverage,
    coverageSeverity: () => 'low',
    coverageTitle: () => '',
    coveragePercent: () => '10%',
    coverageByDataset: () => [],
    barWidth: () => 0,
    distributionFor: () => [],
    categoryCountsFor: () => [],
    summaryUnavailableNote: () => 'Statistics are not available.',
  };
  TestBed.configureTestingModule({ providers: [{ provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent }] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { dh, el: fixture.nativeElement as HTMLElement };
}

describe('MissingValuesStepComponent', () => {
  it('renders the rail and the selected variable with its action choices', () => {
    const { dh, el } = render({ action: 'drop' });
    expect(el.querySelector('aside.preprocessing-browser .prep-rail-action')?.textContent?.trim()).toBe('drop · not applied');
    expect(el.querySelector('.preprocessing-state-chip')?.className).toContain('state-pending');
    const choices = Array.from(el.querySelectorAll<HTMLInputElement>('.missing-choice input'));
    expect(choices.map((input) => input.checked)).toEqual([true, false]);
    choices[1].dispatchEvent(new Event('change'));
    expect(dh.onMissingActionChange).toHaveBeenCalledWith(sex, 'constant');
    expect(el.querySelector('.preprocessing-control')).toBeNull();
  });

  it('asks for a category to fill with for a categorical variable, a free value otherwise', () => {
    const categorical = render({ action: 'constant' }).el;
    expect(categorical.querySelector('.preprocessing-control select.table-select')).not.toBeNull();
    TestBed.resetTestingModule();
    const numeric = render({ action: 'constant' }, { categorical: false }).el;
    expect(numeric.querySelector('.preprocessing-control input.table-input')).not.toBeNull();
  });

  it('says when statistics are unavailable, and shows the coverage when they are', () => {
    expect(render({}).el.querySelector('.preprocessing-evidence[data-severity="none"] .preprocessing-consequence')?.textContent).toBe(
      'Statistics are not available.',
    );
    TestBed.resetTestingModule();
    const el = render({}, { coverage: { total: 100, missing: 10, share: 0.1 } }).el;
    expect(el.querySelector('.preprocessing-header-coverage')?.textContent).toBe('10 of 100 values missing');
    expect(el.querySelector('.preprocessing-evidence')?.getAttribute('data-severity')).toBe('low');
  });
});
