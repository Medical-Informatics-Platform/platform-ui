import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { RawPreprocessingStep } from '../../../../models/backend-algorithms.model';
import { GenericDataTransformationStepComponent } from './generic-data-transformation-step.component';

const param = (extra: Record<string, unknown>) => ({
  label: 'L', desc: '', types: ['text'], required: false, multiple: false, default: null,
  enums: null, dict_keys_enums: null, dict_values_type: null, dict_values_enums: null, min: null, max: null,
  ...extra,
});

/** Assumed engine shape: per-variable detection mode plus a threshold. */
const detector = {
  name: 'outlier_detector', label: 'Outlier Detector', desc: 'Flags outliers.', documentation: 'Flags values far from the centre.',
  parameters: {
    strategies: param({
      label: 'Detection mode', types: ['dict'], required: true,
      dict_keys_enums: { type: 'input_var_names', source: ['variables'] },
      dict_values_enums: { type: 'list', source: ['zscore', 'robust'] },
    }),
    threshold: param({ label: 'Threshold', types: ['real'], default: 3, min: 0 }),
  },
} as unknown as RawPreprocessingStep;

const VARIABLES = [{ code: 'age', label: 'Age', type: 'real' }, { code: 'mmse', label: 'MMSE', type: 'real' }];

describe('GenericDataTransformationStepComponent', () => {
  let fixture: ComponentFixture<GenericDataTransformationStepComponent>;
  let applied: Record<string, unknown>[];
  let removed: number;
  let el: HTMLElement;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GenericDataTransformationStepComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(GenericDataTransformationStepComponent);
    el = fixture.nativeElement;
    applied = [];
    removed = 0;
    fixture.componentInstance.applyStep.subscribe((value) => applied.push(value));
    fixture.componentInstance.removeStep.subscribe(() => removed++);
    fixture.componentRef.setInput('spec', detector);
    fixture.componentRef.setInput('variables', VARIABLES);
    await settle();
  });

  it('draws nothing until the step is opened or applied: the stage menu is what adds it', () => {
    expect(el.querySelector('app-station-card')).toBeNull();
    expect(el.querySelector('.btn-add-dashed')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('draws the station once the panel opens it, and keeps it on screen when it is folded', async () => {
    fixture.componentRef.setInput('open', true);
    await settle();
    expect(el.querySelector('app-station-card')).not.toBeNull();
    expect(el.querySelector('.btn-add-dashed')).toBeNull();

    fixture.componentRef.setInput('open', false);
    await settle();
    expect(el.querySelector('app-station-card')).not.toBeNull();
  });

  it('uses the step\'s own icon on the station', async () => {
    fixture.componentRef.setInput('open', true);
    await settle();
    expect(el.querySelector('app-station-card i.fa-magnifying-glass-chart')).not.toBeNull();
  });

  it('applies the schema-shaped payload built from the form', async () => {
    fixture.componentRef.setInput('open', true);
    await settle();
    const select = el.querySelector('select[data-variable="age"]') as HTMLSelectElement;
    select.value = 'zscore';
    select.dispatchEvent(new Event('change'));
    const threshold = el.querySelector('input[data-param="threshold"]') as HTMLInputElement;
    threshold.value = '2.5';
    threshold.dispatchEvent(new Event('input'));
    await settle();

    const buttons = Array.from(el.querySelectorAll('app-station-action-bar button')) as HTMLButtonElement[];
    buttons.find((b) => b.textContent?.includes('Apply'))!.click();
    expect(applied).toEqual([{ strategies: { age: 'zscore' }, threshold: 2.5 }]);
  });

  it('blocks Apply and names the missing required field', async () => {
    fixture.componentRef.setInput('open', true);
    await settle();
    // Only the threshold is touched, so the required per-variable mode is still empty.
    const threshold = el.querySelector('input[data-param="threshold"]') as HTMLInputElement;
    threshold.value = '4';
    threshold.dispatchEvent(new Event('input'));
    await settle();
    const buttons = Array.from(el.querySelectorAll('app-station-action-bar button')) as HTMLButtonElement[];
    buttons.find((b) => b.textContent?.includes('Apply'))!.click();
    await settle();
    expect(applied).toEqual([]);
    expect(el.querySelector('.step-error')?.textContent).toContain('required');
  });

  it('hydrates from the applied parameters and removes the step', async () => {
    fixture.componentRef.setInput('applied', { strategies: { mmse: 'robust' }, threshold: 2 });
    fixture.componentRef.setInput('open', true);
    await settle();
    expect((el.querySelector('select[data-variable="mmse"]') as HTMLSelectElement).value).toBe('robust');
    expect((el.querySelector('input[data-param="threshold"]') as HTMLInputElement).value).toBe('2');
    expect(el.querySelector('.preprocessing-state-chip')?.textContent).toContain('Applied');
    (el.querySelector('.btn-remove-step-node') as HTMLButtonElement).click();
    expect(removed).toBe(1);
  });

  it('flags a required parameter it cannot edit instead of sending a broken step', async () => {
    const recipeStep = {
      name: 'x_step', label: 'X Step', desc: 'Needs a recipe.',
      parameters: { reusable_preprocessing: param({ types: ['dict'], required: true, label: 'Fitted recipe' }) },
    } as unknown as RawPreprocessingStep;
    fixture.componentRef.setInput('spec', recipeStep);
    fixture.componentRef.setInput('open', true);
    await settle();
    expect(el.querySelector('.step-feedback')?.textContent).toContain('fitted recipe');
  });
});
