import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ExperimentStudioService } from '../../../../../services/experiment-studio.service';
import { ExperimentStudioNavigationService } from '../../../../../services/experiment-studio-navigation.service';
import { AlgorithmRunService } from '../../experiment-result/algorithm-run.service';
import { AlgorithmStudioSubstepService } from '../../algorithm-studio-substep.service';
import { AlgorithmRunRequirement } from '../../algorithm-panel.models';
import { AlgorithmCatalogService } from '../algorithm-catalog.service';
import { AlgorithmConfigFormService } from '../algorithm-config-form.service';
import { AlgorithmConfigFieldComponent } from '../algorithm-config-field/algorithm-config-field.component';
import { OutlierReportEditorComponent } from '../outlier-report-editor/outlier-report-editor.component';

/**
 * The selected method's parameters: what still blocks the run, the parameter form with its
 * Advanced fields, cross-validation, and the outlier_report editor. Read-only while the method
 * is unavailable.
 */
@Component({
  selector: 'section[app-algorithm-parameters]',
  imports: [ReactiveFormsModule, AlgorithmConfigFieldComponent, OutlierReportEditorComponent],
  templateUrl: './algorithm-parameters.component.html',
  styleUrl: './algorithm-parameters.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmParametersComponent {
  private readonly studioNavigation = inject(ExperimentStudioNavigationService);
  private readonly substep = inject(AlgorithmStudioSubstepService);
  protected readonly catalog = inject(AlgorithmCatalogService);
  protected readonly form = inject(AlgorithmConfigFormService);
  protected readonly run = inject(AlgorithmRunService);
  protected readonly selectedAlgorithm = inject(ExperimentStudioService).selectedAlgorithm;

  toggleCrossValidation(event: Event): void {
    this.form.setCrossValidation(!!(event.target as HTMLInputElement | null)?.checked);
  }

  resolveRunRequirement(requirement: AlgorithmRunRequirement): void {
    if (requirement.id === 'preprocessing') {
      this.studioNavigation.goToPreprocessing();
      return;
    }
    // Availability issues are fixed on the setup board, which stays on screen above.
    this.substep.set('setup');
    requestAnimationFrame(() =>
      scrollStudioTargetIntoView(document.querySelector<HTMLElement>('[data-guide="guide-role-assignment"]'), true)
    );
  }
}

/** Scrolls a studio anchor; `scroll-margin-top` on the target clears sticky chrome. */
function scrollStudioTargetIntoView(target: HTMLElement | null, focus = false): void {
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (focus) target.focus({ preventScroll: true });
}
