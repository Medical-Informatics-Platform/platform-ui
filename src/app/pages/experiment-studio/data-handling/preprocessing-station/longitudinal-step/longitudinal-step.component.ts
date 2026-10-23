import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DATA_HANDLING } from '../../data-handling.context';
import { PrepRailSlotDirective, PrepVariableRailComponent } from '../prep-variable-rail/prep-variable-rail.component';

/**
 * The longitudinal sub-step workspace: the variable rail and the detail panel with the
 * per-variable comparison strategy.
 * Attached to the step's workspace <section>, so the DOM and selectors are unchanged.
 */
@Component({
  selector: 'section[app-longitudinal-step]',
  imports: [FormsModule, PrepVariableRailComponent, PrepRailSlotDirective],
  templateUrl: './longitudinal-step.component.html',
  styleUrl: './longitudinal-step.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class LongitudinalStepComponent {
  protected readonly dh = inject(DATA_HANDLING);
}
