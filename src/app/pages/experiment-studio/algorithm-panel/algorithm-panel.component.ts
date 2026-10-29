import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { AlgorithmConfig } from '../../../models/algorithm-definition.model';
import { OUTLIER_STRATEGIES, OUTLIER_TAILS } from '../../../core/outlier-rules';
import { AlgorithmRoleAssignmentComponent } from './algorithm-role-assignment/algorithm-role-assignment.component';
import { availabilityRequirementText } from './utils/algorithm-availability-text.utils';
import { runnableCount } from './utils/algorithm-catalog.utils';
import { allowsDecimal, isAdvancedField, optionLabel } from './utils/algorithm-parameter-form.utils';
import { tooltipPosition } from './utils/tooltip-position.utils';
import { AlgorithmCatalogService } from './algorithm-selection/algorithm-catalog.service';
import { AlgorithmConfigFormService } from './algorithm-selection/algorithm-config-form.service';
import { AlgorithmRunService } from './experiment-result/algorithm-run.service';
import { AlgorithmStudioSubstepService } from './algorithm-studio-substep.service';
import { AlgorithmRunRequirement, AlgorithmStudioSubstep, OutlierReportVariable } from './algorithm-panel.models';

@Component({
  selector: 'app-algorithm-panel',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AlgorithmRoleAssignmentComponent,
  ],
  providers: [
    AlgorithmStudioSubstepService,
    AlgorithmCatalogService,
    AlgorithmConfigFormService,
    AlgorithmRunService,
  ],
  templateUrl: './algorithm-panel.component.html',
  styleUrl: './algorithm-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmPanelComponent {
  private readonly studio = inject(ExperimentStudioService);
  private readonly studioNavigation = inject(ExperimentStudioNavigationService);
  private readonly substep = inject(AlgorithmStudioSubstepService);
  protected readonly catalog = inject(AlgorithmCatalogService);
  protected readonly form = inject(AlgorithmConfigFormService);
  protected readonly run = inject(AlgorithmRunService);

  /** Studio: setup (roles + methods), then parameters (configure + run). Results live in the Execution step. */
  readonly studioSubstep = this.substep.current;
  readonly studioSubstepChange = outputFromObservable(this.substep.changed$);

  /** Read by the studio's run button. */
  readonly canRun = this.run.canRun;
  readonly runDisabledReason = this.run.runDisabledReason;

  protected readonly selectedAlgorithm = this.studio.selectedAlgorithm;
  protected readonly selectedAlgorithmDocumentation = computed(() => this.selectedAlgorithm()?.documentation?.trim() ?? '');
  protected readonly selectedAlgorithmCategory = computed(() => this.selectedAlgorithm()?.category?.trim() ?? '');
  /** Assignable pool drives the role-assignment UI (shown without a selected algorithm). */
  protected readonly assignablePool = this.studio.algorithmAssignableVariables;

  protected readonly outlierStrategies = OUTLIER_STRATEGIES;
  protected readonly outlierTails = OUTLIER_TAILS;
  protected readonly categoryRunnableCount = runnableCount;
  protected readonly isAdvancedField = isAdvancedField;
  protected readonly optionLabel = optionLabel;
  protected readonly allowsDecimal = allowsDecimal;
  protected readonly availabilityRequirementText = availabilityRequirementText;

  setStudioSubstep(step: AlgorithmStudioSubstep): void {
    this.substep.set(step);
  }

  /** The studio's run button. */
  onClickRunExp(): void {
    this.run.runExperiment();
  }

  /** The Execution step's PDF export, with the result figures in `section`. */
  onExportResult(section: HTMLElement): void {
    this.run.exportPdf(section);
  }

  /** The Execution step's ZIP export. */
  onExportResultZip(): void {
    this.run.exportZip();
  }

  selectAlgorithm(algorithm: AlgorithmConfig): void {
    this.form.resetForNewAlgorithm();
    // Use service method so it enriches configSchema and persists to sessionStorage
    this.studio.setAlgorithm(algorithm);
    this.run.clearRunState();
  }

  onAlgorithmClick(algorithm: AlgorithmConfig): void {
    this.selectAlgorithm(algorithm);
    // Parent bookkeeping only: the details and parameters bands render from
    // selectedAlgorithm() below the row, so no substep navigation or page scroll.
    this.setStudioSubstep('parameters');
    this.catalog.hideTooltip();
  }

  onSearchInput(event: Event): void {
    this.catalog.algoSearchQuery.set((event.target as HTMLInputElement)?.value ?? '');
  }

  toggleCrossValidation(event: Event): void {
    this.form.setCrossValidation(!!(event.target as HTMLInputElement | null)?.checked);
  }

  outlierVariableLabel(variable: OutlierReportVariable): string {
    return variable?.label ?? variable?.name ?? variable?.code ?? '';
  }

  resolveRunRequirement(requirement: AlgorithmRunRequirement): void {
    if (requirement.id === 'preprocessing') {
      this.studioNavigation.goToPreprocessing();
      return;
    }
    // Availability issues are fixed on the setup board, which stays on screen above.
    this.setStudioSubstep('setup');
    requestAnimationFrame(() =>
      this.scrollStudioTargetIntoView(
        document.querySelector<HTMLElement>('[data-guide="guide-role-assignment"]'),
        true
      )
    );
  }

  /** Scrolls a studio anchor; `scroll-margin-top` on the target clears sticky chrome. */
  private scrollStudioTargetIntoView(target: HTMLElement | null, focus = false): void {
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focus) target.focus({ preventScroll: true });
  }

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
