import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { HowToStripComponent } from '../how-to-strip/how-to-strip.component';
import { SectionAnchorDirective } from '../section-anchors';
import { StationActionBarComponent } from '../../shared/station-action-bar/station-action-bar.component';
import { StationCardComponent } from '../../shared/station-card/station-card.component';
import { SummaryWorkspaceComponent } from '../summary-workspace/summary-workspace.component';
import { DATA_HANDLING } from '../data-handling.context';

/**
 * Step 3 of the pipeline: preprocessing (missing values, optional outlier capping, longitudinal) and the Processed preview it feeds.
 * Attached to the element it renders into, so the pipeline's DOM, anchors and selectors
 * are unchanged; reads and drives the pipeline through DATA_HANDLING.
 */
@Component({
  selector: 'section[app-preprocessing-station]',
  imports: [StationCardComponent, StationActionBarComponent, HowToStripComponent, SummaryWorkspaceComponent, FormsModule, NgTemplateOutlet, SectionAnchorDirective],
  templateUrl: './preprocessing-station.component.html',
  styleUrl: './preprocessing-station.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PreprocessingStationComponent {
  protected readonly dh = inject(DATA_HANDLING);
}
