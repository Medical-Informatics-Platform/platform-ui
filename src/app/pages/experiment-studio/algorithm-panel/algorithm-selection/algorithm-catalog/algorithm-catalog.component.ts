import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ExperimentStudioService } from '../../../../../services/experiment-studio.service';
import { AlgorithmConfig } from '../../../../../models/algorithm-definition.model';
import { runnableCount } from '../../utils/algorithm-catalog.utils';
import { tooltipPosition } from '../../utils/tooltip-position.utils';
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
    this.catalog.hideTooltip();
  }

  /** Opens the availability tooltip beside a method. Nothing in the catalog calls it at the moment. */
  showTooltip(algorithm: AlgorithmConfig, event: MouseEvent): void {
    event.stopPropagation();
    const item = (event.currentTarget as HTMLElement)?.closest('li') || (event.currentTarget as HTMLElement);
    const rect = item.getBoundingClientRect();
    const container = item.closest('.experiment-container') as HTMLElement | null;
    const containerRect = container?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    const offset = 12;

    this.catalog.tooltipVisible.set(true);
    this.catalog.tooltipData.set(algorithm);

    // Immediate initial placement
    this.catalog.tooltipPosition.set(
      tooltipPosition(rect, containerRect, { width: 320, height: 200, viewportWidth, viewportHeight, padding, offset })
    );

    // Refinement after render
    setTimeout(() => {
      const el = document.querySelector('.tooltip') as HTMLElement | null;
      if (!el) return;
      const w = el.offsetWidth || 320;
      const h = el.offsetHeight || 200;
      this.catalog.tooltipPosition.set(
        tooltipPosition(rect, containerRect, { width: w, height: h, viewportWidth, viewportHeight, padding, offset })
      );
    }, 0);
  }
}
