import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AlgorithmRunService } from './algorithm-run.service';

/**
 * The readiness bar at the bottom of the algorithm card: whether the run can start and why
 * the last attempt or export failed. The run button itself is the studio's; the result shows
 * in the Execution step. Attached to the bar element the panel projects into the card.
 */
@Component({
  selector: 'div[app-experiment-result]',
  templateUrl: './experiment-result.component.html',
  styleUrl: './experiment-result.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-ready]': 'run.canRun()' },
})
export class ExperimentResultComponent {
  protected readonly run = inject(AlgorithmRunService);
}
