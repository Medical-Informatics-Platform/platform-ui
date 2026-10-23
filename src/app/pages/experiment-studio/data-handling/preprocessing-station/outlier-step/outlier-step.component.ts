import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DATA_HANDLING } from '../../data-handling.context';
import { PrepRailSlotDirective, PrepVariableRailComponent } from '../prep-variable-rail/prep-variable-rail.component';

/**
 * The outlier-capping sub-step workspace: the numerical-variable rail (with a per-row
 * on/off switch and the "Batch" menu), the detail panel with the bounds controls, and
 * the outlier report.
 * Attached to the step's workspace <section>, so the DOM and selectors are unchanged.
 */
@Component({
  selector: 'section[app-outlier-step]',
  imports: [FormsModule, PrepVariableRailComponent, PrepRailSlotDirective],
  templateUrl: './outlier-step.component.html',
  styleUrl: './outlier-step.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class OutlierStepComponent {
  protected readonly dh = inject(DATA_HANDLING);

  /**
   * Keeps a bound's label on the strip: centred on its marker, but pinned to start or
   * end there when the marker sits within 12% of an edge.
   */
  protected boundLabelShift(pct: number | null): string {
    const at = pct ?? 0;
    if (at < 12) return 'translateX(0)';
    return at > 88 ? 'translateX(-100%)' : 'translateX(-50%)';
  }
}
