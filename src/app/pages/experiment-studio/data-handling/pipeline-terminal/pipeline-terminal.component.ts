import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * End of the Data Handling pipeline: what the next run will use, the hand-off to
 * Algorithm Selection, and the guard shown when edits are still unapplied.
 * Attached to the card element itself, so the pipeline column lays it out as before.
 */
@Component({
  selector: 'div[app-pipeline-terminal]',
  host: { class: 'pipeline-terminal-card' },
  templateUrl: './pipeline-terminal.component.html',
  styleUrl: './pipeline-terminal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineTerminalComponent {
  /** Records kept after preprocessing out of the raw cohort; null until both are known. */
  readonly retention = input<{ raw: number; processed: number } | null>(null);
  readonly variableCount = input(0);
  readonly datasetCount = input(0);
  readonly preprocessingLine = input('');
  readonly showUnappliedWarning = input(false);

  readonly continue = output<void>();
  readonly applyAndContinue = output<void>();
  readonly discardAndContinue = output<void>();
  readonly stay = output<void>();
}
