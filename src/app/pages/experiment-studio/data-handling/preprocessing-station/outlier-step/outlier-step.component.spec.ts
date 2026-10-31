import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { DataHandlingComponent } from '../../data-handling.component';
import { DATA_HANDLING } from '../../data-handling.context';
import type { VariableRow } from '../../data-handling.models';
import { OutlierStepComponent } from './outlier-step.component';

@Component({
  imports: [OutlierStepComponent],
  template: `<section app-outlier-step class="statistics-workspace preprocessing-workspace outlier-preprocessing-workspace"></section>`,
})
class HostComponent {}

const age = { code: 'age', label: 'Age' } as VariableRow;

function render({ enabled = true, loPct = 5 as number | null, hiPct = 95 as number | null } = {}) {
  const rule = { variableCode: 'age', enabled, strategy: 'iqr', tail: 'both', fold: 1.5 };
  const dh = {
    prepSearch: { missing: '', outlier: '', longitudinal: '' },
    prepGroups: () => [{ key: 'not-applied', title: 'Not applied', variables: [age] }],
    filteredPrepVariables: () => [age],
    isPrepVariableSelected: () => true,
    selectPrepVariable: vi.fn(),
    batchMenuOpen: () => null,
    toggleBatchMenu: vi.fn(),
    toggleAllOutliers: vi.fn(),
    outlierRuleSummary: () => 'IQR × 1.5',
    onOutlierEnabledChange: vi.fn(),
    selectedPrepVariable: () => age,
    variableLabel: (variable: VariableRow) => variable.label,
    prepVariableStateLabel: () => 'Not applied',
    prepVariableHasPendingChange: () => false,
    outlierRuleFor: vi.fn(() => rule),
    outlierStrategies: [
      { value: 'iqr', label: 'IQR' },
      { value: 'zscore', label: 'Z-score' },
    ],
    outlierTails: [{ value: 'both', label: 'Both' }],
    outlierTailDisplay: (tail: string) => tail,
    outlierFoldDisplay: () => 'Fold',
    onOutlierStrategyChange: vi.fn(),
    onOutlierTailChange: vi.fn(),
    onOutlierFoldChange: vi.fn(),
    outlierRuleError: () => null,
    outlierBoundsView: () => ({
      loLabel: '10', hiLabel: '90', loPct, hiPct, iqrLeft: 20, iqrWidth: 40, medianLeft: 50,
      cappedLeft: null, cappedRight: null, min: 0, note: 'note',
    }),
    distributionMapValue: () => '1',
    distributionFor: () => [],
    coverageFor: () => null,
    coveragePercent: () => '0%',
    summaryUnavailableNote: () => 'n/a',
    hasOutlierRulesForPreview: true,
    isLoadingOutlierPreview: false,
    outlierPreviewError: null,
    outlierPreviewRowsFor: () => [],
    previewOutlierReport: vi.fn(),
    barWidth: () => 0,
  };
  TestBed.configureTestingModule({ providers: [{ provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent }] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { dh, fixture, el: fixture.nativeElement as HTMLElement };
}

describe('OutlierStepComponent', () => {
  it('puts the on/off switch in each rail row without selecting the row', () => {
    const { dh, el } = render();
    const toggle = el.querySelector<HTMLInputElement>('.preprocessing-variable-btn .toggle-switch input')!;
    expect(toggle.checked).toBe(true);
    toggle.click();
    expect(dh.onOutlierEnabledChange).toHaveBeenCalledWith(age, false);
    expect(dh.selectPrepVariable).not.toHaveBeenCalled();
    expect(el.querySelector('.prep-rail-action')?.getAttribute('data-state')).toBe('set');
  });

  it('reads the rule once and disables the controls while clipping is off', async () => {
    const { dh, fixture, el } = render({ enabled: false });
    expect(el.querySelector('.preprocessing-detail-section > .preprocessing-consequence')?.textContent).toContain('Turn on clipping');
    const methods = Array.from(el.querySelectorAll<HTMLButtonElement>('[aria-label="Outlier method"] button'));
    expect(methods.map((button) => [button.disabled, button.getAttribute('aria-checked')])).toEqual([
      [true, 'true'],
      [true, 'false'],
    ]);
    // once per rail row (switch + action line) and once for the detail panel
    expect(dh.outlierRuleFor).toHaveBeenCalledTimes(3);
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('.outlier-fold-input')?.disabled).toBe(true);
    expect(el.querySelector('.prep-rail-action')?.getAttribute('data-state')).toBe('off');
  });

  it('keeps the bound labels on the strip near its edges', () => {
    const shift = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.bounds-labels span'), (span) => span.style.transform);
    expect(shift(render().el)).toEqual(['translateX(0px)', 'translateX(-100%)']);
    TestBed.resetTestingModule();
    expect(shift(render({ loPct: 30, hiPct: 88 }).el)).toEqual(['translateX(-50%)', 'translateX(-50%)']);
    TestBed.resetTestingModule();
    expect(shift(render({ loPct: null, hiPct: 50 }).el)).toEqual(['translateX(0px)', 'translateX(-50%)']);
  });
});
