import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DATA_HANDLING } from '../../data-handling.context';
import { PrepRailSlotDirective, PrepVariableRailComponent } from '../prep-variable-rail/prep-variable-rail.component';

/**
 * The missing-values sub-step workspace: the variable rail (with coverage and the
 * current action per row, and the "Set all" batch menu) and the detail panel with the
 * action choice, fill value and the dataset coverage / distribution evidence.
 * Attached to the step's workspace <section>, so the DOM and selectors are unchanged.
 */
@Component({
  selector: 'section[app-missing-values-step]',
  imports: [FormsModule, PrepVariableRailComponent, PrepRailSlotDirective],
  templateUrl: './missing-values-step.component.html',
  styleUrl: './missing-values-step.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class MissingValuesStepComponent {
  protected readonly dh = inject(DATA_HANDLING);
}
