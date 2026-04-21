import { AuthService } from './../../services/auth.service';
import { Component, OnInit, OnDestroy, computed, effect, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ExperimentDetailsComponent } from './experiment-detail/experiment-detail.component';
import { ExperimentsListComponent } from './experiment-list/experiment-list.component';
import { ExperimentsDashboardService } from './../../services/experiments-dashboard.service';
import { Experiment } from '../../models/experiments-dashboard.model';
import { ExperimentsCompareComponent } from './experiments-compare/experiments-compare.component';
import { ActivatedRoute } from '@angular/router';
import { ErrorService } from '../../services/error.service';
import { ExperimentStudioService } from '../../services/experiment-studio.service';
import { Subject, takeUntil } from 'rxjs';
import { ExperimentsDashboardGuideComponent } from './guide/experiments-dashboard-guide.component';

@Component({
  selector: 'app-experiments-dashboard',
  templateUrl: './experiments-dashboard.component.html',
  styleUrls: ['./experiments-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterModule,
    CommonModule,
    FormsModule,
    ExperimentDetailsComponent,
    ExperimentsListComponent,
    ExperimentsCompareComponent,
    ExperimentsDashboardGuideComponent
  ]
})
export class ExperimentsDashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  public experimentsService = inject(ExperimentsDashboardService);
  private experimentStudioService = inject(ExperimentStudioService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private errorService = inject(ErrorService);

  selectedExperiment = signal<Experiment | null>(null);

  isConfirmingDelete = false;
  experimentToDeleteId: string | null = null;

  currentUserEmail = computed(() => this.authService.authState().user?.email ?? null);
  compareIds = signal<string[]>([]);
  compareMode = signal(false);
  private sharedExperimentId = signal<string | null>(null);
  private sharedFetchInFlight = signal<string | null>(null);

  // Greeting name: default "researcher"
  greetingName = computed(() => {
    const user = this.authService.authState().user;
    return this.deriveGreetingName(user);
  });
  errorMessage = computed(() => this.errorService.error());
  readonly pathologyAccessWarning = this.experimentStudioService.pathologyAccessWarning;
  readonly dismissedPathologyWarning = signal(false);
  readonly visiblePathologyAccessWarning = computed(() => {
    const warning = this.pathologyAccessWarning();
    return warning && !this.dismissedPathologyWarning() ? warning : null;
  });
  private destroy$ = new Subject<void>();

  constructor() { }

  hasDeepLink = signal(false);

  ngOnInit(): void {
    this.errorService.clearError();
    this.dismissedPathologyWarning.set(false);
    this.experimentStudioService.getAllDataModels()
      .pipe(takeUntil(this.destroy$))
      .subscribe();

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const expId = params.get('experiment');
      if (expId) {
        this.sharedExperimentId.set(expId);
        this.hasDeepLink.set(true);
      }
    });
  }

  private selectSharedExperimentEffect = effect(
    () => {
      const targetId = this.sharedExperimentId();
      const list = this.experimentsService.experiments();

      if (!targetId) return;

      const found = list.find(e => e.id === targetId);
      if (!found) {
        if (this.sharedFetchInFlight() === targetId) return;

        this.sharedFetchInFlight.set(targetId);
        this.experimentsService.fetchExperimentById(targetId).subscribe({
          next: (exp) => {
            this.experimentsService.upsertExperiment(exp);
            this.selectedExperiment.set(exp);
            this.compareMode.set(false);
            this.compareIds.set([]);
            this.sharedExperimentId.set(null);
            this.sharedFetchInFlight.set(null);
          },
          error: (err) => {
            console.warn('[SharedLink] Experiment not found for id', targetId, err);
            this.errorService.setError('Shared experiment not found or inaccessible.');
            this.sharedExperimentId.set(null);
            this.sharedFetchInFlight.set(null);
          }
        });
        return;
      }

      // set selected experiment
      this.selectedExperiment.set(found);

      // not in compare mode
      this.compareMode.set(false);
      this.compareIds.set([]);

      this.sharedExperimentId.set(null);
    }
  );

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  dismissError() {
    this.errorService.clearError();
  }

  dismissPathologyWarning() {
    this.dismissedPathologyWarning.set(true);
  }

  private deriveGreetingName(user: any | null): string {
    if (!user) {
      return 'researcher';
    }

    const raw =
      (user.fullname as string | undefined) ||
      (user.username as string | undefined) ||
      '';

    const trimmed = raw.trim();
    if (!trimmed) {
      return 'researcher';
    }

    const lower = trimmed.toLowerCase();
    // if no user name or anonymous, set it to generic
    if (lower === 'anonymous' || lower === 'anon') {
      return 'researcher';
    }

    // keep only first name for casual greeting
    const firstPart = trimmed.split(' ')[0];
    return firstPart || 'researcher';
  }

  // COMPARE MODE

  toggleCompareMode() {
    const isOn = this.compareMode();

    if (isOn) {
      // turn OFF -> clear
      this.compareMode.set(false);
      this.compareIds.set([]);
    } else {
      // turn ON -> set selected
      const current = this.selectedExperiment();
      this.compareMode.set(true);
      this.compareIds.set(current ? [current.id] : []);
    }
  }

  readonly experimentsForCompare = computed(() => {
    const ids = this.compareIds();
    const list = this.experimentsService.experiments();
    return list.filter(exp => ids.includes(exp.id));
  });

  // click on list row
  onExperimentSelected(experiment: Experiment) {
    this.selectedExperiment.set(experiment);

    // if in compare mode, toggle comparison list
    if (this.compareMode()) {
      const ids = this.compareIds();
      if (ids.includes(experiment.id)) {
        this.compareIds.set(ids.filter(id => id !== experiment.id));
      } else {
        this.compareIds.set([...ids, experiment.id]);
      }
    }
  }

  onRunExperiment(expId: string) {
    this.router.navigate(['/experiment-studio'], {
      queryParams: { experimentId: expId, mode: 'edit' }
    });
  }

  onEditExperiment(expId: string) {
    this.router.navigate(['/experiment-studio'], {
      queryParams: { experimentId: expId, mode: 'edit' }
    });
  }

  onNameUpdated(update: { id: string; name: string }) {
    const current = this.selectedExperiment();
    if (current?.id === update.id) {
      this.selectedExperiment.set({ ...current, name: update.name });
    }
  }

  goToNewExperiment() {
    this.router.navigate(['/experiment-studio']);
  }

  onDeleteRequested() {
    const experiment = this.selectedExperiment();
    if (!experiment) return;

    this.experimentToDeleteId = experiment.id;
    this.isConfirmingDelete = true;
  }

  onDeleteFromList(expId: string) {
    this.experimentToDeleteId = expId;

    const current = this.selectedExperiment();
    if (!current || current.id !== expId) {
      const found = this.experimentsService
        .experiments()
        .find(e => e.id === expId);
      if (found) this.selectedExperiment.set(found);
    }
    this.isConfirmingDelete = true;
  }

  confirmDelete(expId: string) {
    if (!expId) return;

    this.experimentsService.deleteExperiment(expId);

    if (this.selectedExperiment()?.id === expId) {
      this.selectedExperiment.set(null);
    }

    this.compareIds.set(this.compareIds().filter(id => id !== expId));

    this.experimentToDeleteId = null;
    this.isConfirmingDelete = false;
  }

  cancelDelete() {
    this.isConfirmingDelete = false;
    this.experimentToDeleteId = null;
  }
}
