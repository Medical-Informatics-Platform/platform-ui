import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { AlgorithmRoleAssignmentComponent } from '../algorithm-role-assignment/algorithm-role-assignment.component';
import { AlgorithmCatalogComponent } from './algorithm-catalog/algorithm-catalog.component';
import { AlgorithmParametersComponent } from './algorithm-parameters/algorithm-parameters.component';
import { AlgorithmCatalogService } from './algorithm-catalog.service';

/**
 * The algorithm card: role assignment, the method catalog, and the selected method's details
 * and parameters. Attached to the card element the panel renders, so the DOM and its anchors
 * are unchanged; the panel projects the run bar at the bottom of the card.
 */
@Component({
  selector: 'section[app-algorithm-selection]',
  imports: [AlgorithmRoleAssignmentComponent, AlgorithmCatalogComponent, AlgorithmParametersComponent],
  templateUrl: './algorithm-selection.component.html',
  styleUrl: './algorithm-selection.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmSelectionComponent {
  protected readonly catalog = inject(AlgorithmCatalogService);
  protected readonly selectedAlgorithm = inject(ExperimentStudioService).selectedAlgorithm;
  protected readonly selectedAlgorithmDocumentation = computed(() => this.selectedAlgorithm()?.documentation?.trim() ?? '');
  protected readonly selectedAlgorithmCategory = computed(() => this.selectedAlgorithm()?.category?.trim() ?? '');
}
