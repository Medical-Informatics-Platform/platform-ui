import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilterConfigModalComponent } from '../../../shared/filter-config-modal/filter-config-modal.component';
import { DATA_HANDLING } from '../../data-handling.context';
import { TransformationColumnDraft, TransformationRule } from '../../data-handling.models';
import { RuleBuilderForDirective } from '../../transformation/rule-builder-registry';

/**
 * The editor body of one "Nominal column" card: the column name, the ordered categories
 * with their rules (each with its own rule builder, registered for its rule through
 * [ruleBuilderFor]), and the fallback value. The card chrome, status, counts chart and
 * apply bar stay with the transformation station.
 * Attached to the card's `div.transformation-create`, so the DOM and selectors are unchanged.
 */
@Component({
  selector: 'div[app-categorical-column-card]',
  imports: [FormsModule, FilterConfigModalComponent, RuleBuilderForDirective],
  templateUrl: './categorical-column-card.component.html',
  styleUrl: './categorical-column-card.component.css',
  // Reads the pipeline's plain fields (and edits the draft in place), so it refreshes with the pipeline.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CategoricalColumnCardComponent {
  protected readonly dh = inject(DATA_HANDLING);

  /** The pipeline's draft, edited in place (the pipeline owns and persists the list). */
  readonly draft = input.required<TransformationColumnDraft>();

  protected rename(code: string): void {
    this.draft().code = code;
    this.dh.onTransformationInput();
  }

  protected setCategory(rule: TransformationRule, value: string): void {
    rule.value = value;
    this.dh.onTransformationInput();
  }

  protected setFallback(value: string): void {
    this.draft().defaultEnumeration = value;
    this.dh.onTransformationInput();
  }
}
