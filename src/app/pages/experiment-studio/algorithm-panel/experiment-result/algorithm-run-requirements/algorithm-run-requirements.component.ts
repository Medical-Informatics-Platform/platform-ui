import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ExperimentStudioNavigationService } from '../../../../../services/experiment-studio-navigation.service';
import { AlgorithmStudioSubstepService } from '../../algorithm-studio-substep.service';
import { AlgorithmRunRequirement } from '../../algorithm-panel.models';
import { AlgorithmRunService } from '../algorithm-run.service';

/** What the selected method still needs before it can run, each with the action that fixes it. */
@Component({
  selector: 'ul[app-algorithm-run-requirements]',
  templateUrl: './algorithm-run-requirements.component.html',
  styleUrl: './algorithm-run-requirements.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmRunRequirementsComponent {
  private readonly studioNavigation = inject(ExperimentStudioNavigationService);
  private readonly substep = inject(AlgorithmStudioSubstepService);
  protected readonly run = inject(AlgorithmRunService);

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
