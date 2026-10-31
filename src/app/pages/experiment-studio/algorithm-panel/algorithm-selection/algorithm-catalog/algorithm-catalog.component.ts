import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ExperimentStudioService } from '../../../../../services/experiment-studio.service';
import { AlgorithmConfig } from '../../../../../models/algorithm-definition.model';
import { runnableCount } from '../../utils/algorithm-catalog.utils';
import { AlgorithmRunService } from '../../experiment-result/algorithm-run.service';
import { AlgorithmStudioSubstepService } from '../../algorithm-studio-substep.service';
import { AlgorithmCatalogService } from '../algorithm-catalog.service';
import { AlgorithmConfigFormService } from '../algorithm-config-form.service';

/** The method catalog: search, the Runnable/All switch, and the method groups to pick from. */
@Component({
  selector: 'aside[app-algorithm-catalog]',
  templateUrl: './algorithm-catalog.component.html',
  styleUrl: './algorithm-catalog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmCatalogComponent {
  private readonly studio = inject(ExperimentStudioService);
  private readonly configForm = inject(AlgorithmConfigFormService);
  private readonly run = inject(AlgorithmRunService);
  private readonly substep = inject(AlgorithmStudioSubstepService);
  protected readonly catalog = inject(AlgorithmCatalogService);
  protected readonly selectedAlgorithm = this.studio.selectedAlgorithm;
  protected readonly categoryRunnableCount = runnableCount;

  onSearchInput(event: Event): void {
    this.catalog.algoSearchQuery.set((event.target as HTMLInputElement)?.value ?? '');
  }

  /** Selects the method; its details and parameters render beside the catalog, so nothing scrolls. */
  onAlgorithmClick(algorithm: AlgorithmConfig): void {
    this.configForm.resetForNewAlgorithm();
    // Use service method so it enriches configSchema and persists to sessionStorage
    this.studio.setAlgorithm(algorithm);
    this.run.clearRunState();
    this.substep.set('parameters');
  }
}
