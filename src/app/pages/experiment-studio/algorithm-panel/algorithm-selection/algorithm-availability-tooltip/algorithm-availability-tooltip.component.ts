import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AlgorithmConfig } from '../../../../../models/algorithm-definition.model';
import { availabilityRequirementText } from '../../utils/algorithm-availability-text.utils';
import { AlgorithmCatalogService } from '../algorithm-catalog.service';

/** A method's description and the role checks behind its availability. */
@Component({
  selector: 'div[app-algorithm-availability-tooltip]',
  templateUrl: './algorithm-availability-tooltip.component.html',
  styleUrl: './algorithm-availability-tooltip.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmAvailabilityTooltipComponent {
  readonly algorithm = input<AlgorithmConfig | null>(null);
  private readonly catalog = inject(AlgorithmCatalogService);
  protected readonly details = computed(() => this.catalog.availabilityDetails(this.algorithm()));
  protected readonly availabilityRequirementText = availabilityRequirementText;
}
