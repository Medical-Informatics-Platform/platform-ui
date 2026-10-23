import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SectionAnchorDirective } from '../section-anchors';
import { SummaryWorkspaceComponent } from '../summary-workspace/summary-workspace.component';
import { DATA_HANDLING } from '../data-handling.context';

/**
 * Step 1 of the pipeline: the read-only Raw data snapshot (records out and its summary workspace).
 * Attached to the element it renders into, so the pipeline's DOM, anchors and selectors
 * are unchanged; reads and drives the pipeline through DATA_HANDLING.
 */
@Component({
  selector: 'section[app-source-data-station]',
  imports: [SummaryWorkspaceComponent, SectionAnchorDirective],
  templateUrl: './source-data-station.component.html',
  styleUrl: './source-data-station.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SourceDataStationComponent {
  protected readonly dh = inject(DATA_HANDLING);
}
