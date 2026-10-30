import { Component, Directive, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FilterConfigModalComponent } from '../../../shared/filter-config-modal/filter-config-modal.component';
import type { DataHandlingComponent } from '../../data-handling.component';
import { DATA_HANDLING } from '../../data-handling.context';
import { TransformationDraftsService } from '../transformation-drafts.service';
import { TransformationStatisticsService } from '../transformation-statistics.service';
import type { TransformationColumnDraft, TransformationRule } from '../../data-handling.models';
import { RuleBuilderForDirective } from '../../transformation/rule-builder-registry';
import { CategoricalColumnCardComponent } from './categorical-column-card.component';

/** Stands in for the rule builder, which needs the studio's services. */
@Component({ selector: 'app-filter-config-modal', template: '' })
class FakeRuleBuilder {
  readonly variableScope = input<string>();
  readonly filterLogic = input<unknown>();
}

@Directive({ selector: 'app-filter-config-modal[ruleBuilderFor]' })
class FakeRuleBuilderFor {
  readonly ruleBuilderFor = input<TransformationRule>();
}

@Component({
  imports: [CategoricalColumnCardComponent],
  template: `<div app-categorical-column-card class="transformation-create" [draft]="draft"></div>`,
})
class HostComponent {
  draft!: TransformationColumnDraft;
}

function render(draft: Partial<TransformationColumnDraft>, nameError: string | null = null) {
  const dh = {
    onTransformationInput: vi.fn(),
    transformationRuleSummary: (rule: TransformationRule) => (rule.filter ? 'Sex is Female' : 'No rule yet'),
    toggleTransformationRule: vi.fn(),
    removeTransformationRule: vi.fn(),
    finishTransformationRule: vi.fn(),
    addTransformationRule: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: DATA_HANDLING, useValue: dh as unknown as DataHandlingComponent },
      { provide: TransformationDraftsService, useValue: { columnNameError: () => nameError } },
      { provide: TransformationStatisticsService, useValue: { count: (_draft: TransformationColumnDraft, value: string) => (value ? 3 : '—') } },
    ],
  });
  TestBed.overrideComponent(CategoricalColumnCardComponent, {
    remove: { imports: [FilterConfigModalComponent, RuleBuilderForDirective] },
    add: { imports: [FakeRuleBuilder, FakeRuleBuilderFor] },
  });
  const fixture = TestBed.createComponent(HostComponent);
  const column: TransformationColumnDraft = { id: '7', code: '', defaultEnumeration: '', rules: [], open: true, openRuleIndex: null, ...draft };
  fixture.componentInstance.draft = column;
  fixture.detectChanges();
  return { dh, column, fixture, el: fixture.nativeElement as HTMLElement };
}

const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

describe('CategoricalColumnCardComponent', () => {
  it('says why a column name cannot be used, instead of the naming hint', () => {
    const { el } = render({ code: 'age' }, 'Name already used');
    expect(el.querySelector('.transformation-hint-error')?.textContent).toContain('Name already used');
    expect(el.querySelectorAll('.transformation-hint').length).toBe(1);
  });

  it('keeps the naming hint while the name is usable', () => {
    const { el } = render({ code: 'fresh' });
    expect(el.querySelector('.transformation-hint-error')).toBeNull();
    expect(el.querySelector('.transformation-hint')?.textContent).toContain('Lowercase letters');
  });

  it('edits the name, categories and fallback on the draft and tells the pipeline', async () => {
    const { dh, column, fixture, el } = render({ rules: [{ value: 'female', filter: null }] });
    await fixture.whenStable();
    type(el.querySelector<HTMLInputElement>('#transformation-code-7')!, 'sex_group');
    const [category, fallback] = Array.from(el.querySelectorAll<HTMLInputElement>('.transformation-rule-value'));
    type(category, 'f');
    type(fallback, 'other');
    expect(column).toMatchObject({ code: 'sex_group', defaultEnumeration: 'other', rules: [{ value: 'f' }] });
    expect(dh.onTransformationInput).toHaveBeenCalledTimes(3);
  });

  it('lists the categories with a rule builder each, and focuses the one being edited', () => {
    const { dh, column, el } = render({
      rules: [
        { value: 'a', filter: null },
        { value: 'b', filter: null },
      ],
      openRuleIndex: 1,
    });
    expect(el.querySelector('.column-step-meta')?.textContent?.trim()).toBe('Editing category 2 of 2');
    expect(el.querySelector('.transformation-rules')?.classList.contains('is-focused')).toBe(true);
    expect(el.querySelectorAll('app-filter-config-modal').length).toBe(2);
    expect(el.querySelectorAll('.transformation-rule-editor.is-open').length).toBe(1);
    el.querySelector<HTMLButtonElement>('.transformation-rule-edit-link')!.click();
    expect(dh.toggleTransformationRule).toHaveBeenCalledWith(column, 0);
    el.querySelector<HTMLButtonElement>('.transformation-rule-done')!.click();
    expect(dh.finishTransformationRule).toHaveBeenCalledWith(column, 0);
  });

  it('starts empty with the first-category prompt and the fallback row', () => {
    const { dh, column, el } = render({});
    expect(el.querySelector('.column-step-meta')?.textContent?.trim()).toBe('0 categories + fallback');
    const add = el.querySelector<HTMLButtonElement>('.transformation-add-category')!;
    expect(add.textContent).toContain('Add the first category');
    add.click();
    expect(dh.addTransformationRule).toHaveBeenCalledWith(column);
    expect(el.querySelector('.transformation-rules-foot')?.textContent).toContain('records matching no rule get no value');
  });
});
