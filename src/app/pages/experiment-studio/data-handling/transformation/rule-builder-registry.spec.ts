import { Component, forwardRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FilterConfigModalComponent } from '../../shared/filter-config-modal/filter-config-modal.component';
import { TransformationRule } from '../data-handling.models';
import { RuleBuilder, RuleBuilderForDirective, RuleBuilderRegistry } from './rule-builder-registry';

/** Stands in for the real filter builder under the directive's selector. */
@Component({
  selector: 'app-filter-config-modal',
  template: '',
  providers: [{ provide: FilterConfigModalComponent, useExisting: forwardRef(() => StubBuilderComponent) }],
})
class StubBuilderComponent {}

@Component({
  imports: [StubBuilderComponent, RuleBuilderForDirective],
  providers: [RuleBuilderRegistry],
  template: `@for (rule of rules(); track $index) {<app-filter-config-modal [ruleBuilderFor]="rule" />}`,
})
class HostComponent {
  readonly rules = signal<TransformationRule[]>([]);
}

const builder = (): RuleBuilder => ({ exportFilterLogic: () => null, filterError: signal(null), ensureFirstCondition: () => undefined }) as unknown as RuleBuilder;

describe('RuleBuilderRegistry', () => {
  it('finds a builder by its rule', () => {
    const registry = new RuleBuilderRegistry();
    const rule: TransformationRule = { value: 'a', filter: null };
    const first = builder();
    registry.register(rule, first);
    expect(registry.get(rule)).toBe(first);
    expect(registry.get({ value: 'a', filter: null })).toBeUndefined();
  });

  it('only unregisters the builder that still owns the rule', () => {
    const registry = new RuleBuilderRegistry();
    const rule: TransformationRule = { value: 'a', filter: null };
    const [first, second] = [builder(), builder()];
    registry.register(rule, first);
    registry.register(rule, second);
    registry.unregister(rule, first);
    expect(registry.get(rule)).toBe(second);
    registry.unregister(rule, second);
    expect(registry.get(rule)).toBeUndefined();
  });
});

describe('RuleBuilderForDirective', () => {
  it('registers each rendered builder for its rule, follows rule changes and unregisters on destroy', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    const registry = fixture.debugElement.injector.get(RuleBuilderRegistry);
    const a: TransformationRule = { value: 'a', filter: null };
    const b: TransformationRule = { value: 'b', filter: null };
    const c: TransformationRule = { value: 'c', filter: null };

    fixture.componentInstance.rules.set([a, b]);
    fixture.detectChanges();
    expect(registry.get(a)).toBeInstanceOf(StubBuilderComponent);
    expect(registry.get(b)).toBeInstanceOf(StubBuilderComponent);
    expect(registry.get(a)).not.toBe(registry.get(b));

    // Same row, new rule object: the builder moves over to it.
    fixture.componentInstance.rules.set([a, c]);
    fixture.detectChanges();
    expect(registry.get(b)).toBeUndefined();
    expect(registry.get(c)).toBeInstanceOf(StubBuilderComponent);

    fixture.componentInstance.rules.set([a]);
    fixture.detectChanges();
    expect(registry.get(c)).toBeUndefined();
    expect(registry.get(a)).toBeDefined();
  });
});
