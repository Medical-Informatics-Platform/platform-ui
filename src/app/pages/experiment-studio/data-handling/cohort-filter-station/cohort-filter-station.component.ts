import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FilterConfigModalComponent } from '../../shared/filter-config-modal/filter-config-modal.component';
import { HowToStripComponent } from '../how-to-strip/how-to-strip.component';
import { SectionAnchorDirective } from '../section-anchors';
import { StationActionBarComponent } from '../../shared/station-action-bar/station-action-bar.component';
import { StationCardComponent } from '../../shared/station-card/station-card.component';
import { SummaryWorkspaceComponent } from '../summary-workspace/summary-workspace.component';
import { DATA_HANDLING } from '../data-handling.context';

/**
 * Step 2 of the pipeline: optional cohort filtering (rule builder, preview, apply) and the Raw preview it feeds.
 * Attached to the element it renders into, so the pipeline's DOM, anchors and selectors
 * are unchanged; reads and drives the pipeline through DATA_HANDLING.
 */
@Component({
  selector: 'section[app-cohort-filter-station]',
  imports: [StationCardComponent, StationActionBarComponent, FilterConfigModalComponent, HowToStripComponent, SummaryWorkspaceComponent, SectionAnchorDirective],
  templateUrl: './cohort-filter-station.component.html',
  styleUrl: './cohort-filter-station.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CohortFilterStationComponent {
  protected readonly dh = inject(DATA_HANDLING);
}
