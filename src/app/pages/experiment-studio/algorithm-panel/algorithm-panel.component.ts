import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { AlgorithmSelectionComponent } from './algorithm-selection/algorithm-selection.component';
import { AlgorithmCatalogService } from './algorithm-selection/algorithm-catalog.service';
import { ExperimentResultComponent } from './experiment-result/experiment-result.component';
import { AlgorithmConfigFormService } from './algorithm-selection/algorithm-config-form.service';
import { AlgorithmRunService } from './experiment-result/algorithm-run.service';
import { AlgorithmStudioSubstepService } from './algorithm-studio-substep.service';
import { AlgorithmStudioSubstep } from './algorithm-panel.models';

/**
 * The studio's Algorithm step. A shell: it provides the feature services its sections share,
 * lays out the algorithm card and its readiness bar, and keeps the API the studio calls
 * (run state for the run button, the run itself, the exports and the sub-step).
 */
@Component({
  selector: 'app-algorithm-panel',
  imports: [AlgorithmSelectionComponent, ExperimentResultComponent],
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
  private readonly substep = inject(AlgorithmStudioSubstepService);
    protected readonly run = inject(AlgorithmRunService);
  /** The card shows once the studio has variables to assign. */
  protected readonly assignablePool = inject(ExperimentStudioService).algorithmAssignableVariables;

  /** Studio: setup (roles + methods), then parameters (configure + run). Results live in the Execution step. */
  readonly studioSubstep = this.substep.current;
  readonly studioSubstepChange = outputFromObservable(this.substep.changed$);

  /** Read by the studio's run button. */
  readonly canRun = this.run.canRun;
  readonly runDisabledReason = this.run.runDisabledReason;

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
}
