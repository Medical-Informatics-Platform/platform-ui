import { Directive, Injectable, OnChanges, OnDestroy, inject, input } from '@angular/core';
import { FilterConfigModalComponent } from '../../shared/filter-config-modal/filter-config-modal.component';
import { TransformationRule } from '../data-handling.models';

/** What the pipeline needs from a category's rule builder. */
export type RuleBuilder = Pick<FilterConfigModalComponent, 'exportFilterLogic' | 'filterError' | 'ensureFirstCondition'>;

/**
 * The live rule builder of each derived-column category, keyed by the rule it edits.
 * Provided by the Data Handling panel; builders register themselves wherever they are
 * rendered (see RuleBuilderForDirective), so the panel finds a rule's builder by the
 * rule itself rather than by its position in the template.
 */
@Injectable()
export class RuleBuilderRegistry {
  private readonly builders = new Map<TransformationRule, RuleBuilder>();

  register(rule: TransformationRule, builder: RuleBuilder): void {
    this.builders.set(rule, builder);
  }

  /** Removes the entry only if it still belongs to `builder` (a rule may have moved on). */
  unregister(rule: TransformationRule, builder: RuleBuilder): void {
    if (this.builders.get(rule) === builder) this.builders.delete(rule);
  }

  get(rule: TransformationRule): RuleBuilder | undefined {
    return this.builders.get(rule);
  }
}

/** Registers the host filter builder as the editor of `ruleBuilderFor`. */
@Directive({ selector: 'app-filter-config-modal[ruleBuilderFor]' })
export class RuleBuilderForDirective implements OnChanges, OnDestroy {
  readonly ruleBuilderFor = input.required<TransformationRule>();

  private readonly registry = inject(RuleBuilderRegistry);
  private readonly builder = inject(FilterConfigModalComponent);
  private registered: TransformationRule | null = null;

  // ngOnChanges (not an effect) so the builder is findable as soon as the view that
  // creates it has been checked, e.g. right after `detectChanges()`.
  ngOnChanges(): void {
    const rule = this.ruleBuilderFor();
    if (rule === this.registered) return;
    if (this.registered) this.registry.unregister(this.registered, this.builder);
    this.registry.register(rule, this.builder);
    this.registered = rule;
  }

  ngOnDestroy(): void {
    if (this.registered) this.registry.unregister(this.registered, this.builder);
  }
}
