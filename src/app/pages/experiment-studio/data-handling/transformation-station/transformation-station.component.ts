import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { HistogramComponent } from '../../visualisations/histogram/histogram.component';
import { HowToStripComponent } from '../how-to-strip/how-to-strip.component';
import { CategoricalColumnCardComponent } from './categorical-column-card/categorical-column-card.component';
import { KMeansClusterSourceComponent } from './kmeans-cluster-source/kmeans-cluster-source.component';
import { StationActionBarComponent } from '../../shared/station-action-bar/station-action-bar.component';
import { StationCardComponent } from '../../shared/station-card/station-card.component';
import { DATA_HANDLING } from '../data-handling.context';

/**
 * Step 4 of the pipeline: the optional derived columns (nominal columns from rules and the K-means cluster column), their folded rail and the type chooser.
 * Attached to the element it renders into, so the pipeline's DOM, anchors and selectors
 * are unchanged; reads and drives the pipeline through DATA_HANDLING.
 */
@Component({
  selector: 'section[app-transformation-station]',
  imports: [StationCardComponent, StationActionBarComponent, HowToStripComponent, HistogramComponent, FormsModule, NgTemplateOutlet, KMeansClusterSourceComponent, CategoricalColumnCardComponent],
  templateUrl: './transformation-station.component.html',
  styleUrl: './transformation-station.component.css',
  // Reads the pipeline's plain fields, so it refreshes with the pipeline (see DATA_HANDLING).
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class TransformationStationComponent {
  protected readonly dh = inject(DATA_HANDLING);
}
