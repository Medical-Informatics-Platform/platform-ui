import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AlgorithmStudioSubstep } from './algorithm-panel.models';

/**
 * The algorithm studio's sub-step: setup (roles and method), then parameters. Provided by the
 * algorithm panel, which re-emits every change as its `studioSubstepChange` output.
 */
@Injectable()
export class AlgorithmStudioSubstepService {
  private readonly step = signal<AlgorithmStudioSubstep>('setup');
  private readonly changes = new Subject<AlgorithmStudioSubstep>();

  readonly current = this.step.asReadonly();
  readonly changed$ = this.changes.asObservable();

  set(step: AlgorithmStudioSubstep): void {
    this.step.set(step);
    this.changes.next(step);
  }
}
