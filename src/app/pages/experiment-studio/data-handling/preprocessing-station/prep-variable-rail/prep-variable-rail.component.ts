import { ChangeDetectionStrategy, Component, Directive, TemplateRef, computed, contentChildren, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DATA_HANDLING } from '../../data-handling.context';
import { PrepKind, VariableRow } from '../../data-handling.models';

/** Where a step's extra per-variable markup goes in a rail row. */
export type PrepRailSlotName =
  /** In the meta line, before the state chip (missing values: the coverage figure). */
  | 'lead'
  /** In the meta line, after the state chip (outliers: the on/off switch). */
  | 'trail'
  /** Below the label, across the row (the variable's current action). */
  | 'action';

export interface PrepRailSlotContext {
  $implicit: VariableRow;
}

/**
 * Marks an `<ng-template>` inside a rail as the step's markup for one slot of every
 * row, e.g. `<ng-template prepRailSlot="action" let-variable>…</ng-template>`.
 */
@Directive({ selector: 'ng-template[prepRailSlot]' })
export class PrepRailSlotDirective {
  readonly name = input.required<PrepRailSlotName>({ alias: 'prepRailSlot' });
  readonly template = inject<TemplateRef<PrepRailSlotContext>>(TemplateRef);

  static ngTemplateContextGuard(_dir: PrepRailSlotDirective, _ctx: unknown): _ctx is PrepRailSlotContext {
    return true;
  }
}

/**
 * The variable rail shared by the three preprocessing sub-steps: heading with the shown
 * count (and the step's batch menu, projected as `.batch-menu`), search, the variables
 * grouped by state (pending / applied / default / not applied) and the no-match state.
 * Each step adds its own per-row markup through `prepRailSlot` templates.
 * Attached to the step's `<aside>`, so the DOM and selectors are unchanged.
 */
@Component({
  selector: 'aside[app-prep-variable-rail]',
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './prep-variable-rail.component.html',
  styleUrl: './prep-variable-rail.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PrepVariableRailComponent {
  protected readonly dh = inject(DATA_HANDLING);

  readonly step = input.required<PrepKind>();
  readonly heading = input('Variables');
  readonly searchLabel = input.required<string>();
  /** Only the missing-values search carries an id (the guide links to it). */
  readonly searchId = input<string | null>(null);
  /** Second line of the no-match state. */
  readonly emptyHint = input.required<string>();
  /** Whether each group carries its state as `data-state` (not on the longitudinal rail). */
  readonly groupStates = input(true);

  private readonly slots = contentChildren(PrepRailSlotDirective);
  protected readonly slot = computed(() => {
    const byName = new Map(this.slots().map((slot) => [slot.name(), slot.template]));
    return (name: PrepRailSlotName) => byName.get(name) ?? null;
  });
}
