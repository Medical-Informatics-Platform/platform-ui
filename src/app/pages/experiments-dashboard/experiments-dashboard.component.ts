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
import { ExperimentFolderComponent } from './experiment-folder/experiment-folder.component';
import { ExperimentFoldersService } from '../../services/experiment-folders.service';

@Component({
  selector: 'app-experiments-dashboard',
  templateUrl: './experiments-dashboard.component.html',
  styleUrl: './experiments-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterModule,
    CommonModule,
    FormsModule,
    ExperimentDetailsComponent,
    ExperimentsListComponent,
    ExperimentsCompareComponent,
    ExperimentsDashboardGuideComponent,
    ExperimentFolderComponent
  ]
})
export class ExperimentsDashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  public experimentsService = inject(ExperimentsDashboardService);
  private experimentStudioService = inject(ExperimentStudioService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private errorService = inject(ErrorService);
  readonly foldersService = inject(ExperimentFoldersService);

  selectedExperiment = signal<Experiment | null>(null);

  isConfirmingDelete = false;
  experimentToDeleteId: string | null = null;

  currentUserEmail = computed(() => this.authService.authState().user?.email ?? null);
  compareIds = signal<string[]>([]);
  compareMode = signal(false);
  /** Folder canvas owns the centre pane while set; it never coexists with detail or compare. */
  selectedFolderId = signal<string | null>(null);
  /**
   * The folder the open compare set came from. The id is what travels: the workspace reads the
   * way back off it, and reads the folder's sets off the same service the canvas edits.
   */
  compareOriginFolderId = signal<string | null>(null);
  private sharedExperimentId = signal<string | null>(null);
  private sharedFetchInFlight = signal<string | null>(null);
  errorMessage = computed(() => this.errorService.error());
  readonly pathologyAccessWarning = this.experimentStudioService.pathologyAccessWarning;
  readonly dismissedPathologyWarning = signal(false);
  readonly visiblePathologyAccessWarning = computed(() => {
    const warning = this.pathologyAccessWarning();
    return warning && !this.dismissedPathologyWarning() ? warning : null;
  });
  private destroy$ = new Subject<void>();

  constructor() {
    // Folders are a per-user frontend cache; the email only exists once the session resolves.
    effect(() => {
      this.foldersService.useUserScope(this.currentUserEmail());
    });

    effect(() => {
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
            this.selectedFolderId.set(null);
            this.compareMode.set(false);
            this.compareIds.set([]);
            this.compareOriginFolderId.set(null);
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
      this.selectedFolderId.set(null);

      // not in compare mode
      this.compareMode.set(false);
      this.compareIds.set([]);
      this.compareOriginFolderId.set(null);

      this.sharedExperimentId.set(null);
    });
  }

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

  // COMPARE MODE

  toggleCompareMode() {
    const isOn = this.compareMode();

    if (isOn) {
      // turn OFF -> clear
      this.compareMode.set(false);
      this.compareIds.set([]);
      this.compareOriginFolderId.set(null);
    } else {
      // turn ON -> set selected
      const current = this.selectedExperiment();
      // The canvas and the workspace both own the centre pane, and the canvas branch is
      // checked first: opening compare has to give the folder up or the button flips while
      // the pane stays put.
      this.selectedFolderId.set(null);
      this.compareOriginFolderId.set(null);
      this.compareMode.set(true);
      this.compareIds.set(current ? [current.id] : []);
    }
  }

  /** Order follows `compareIds`, so a folder keeps its numbered order in the workspace and
   *  manual picks keep the order they were clicked in. */
  readonly experimentsForCompare = computed(() => {
    const ids = this.compareIds();
    const list = this.experimentsService.experiments();
    return ids
      .map((id) => list.find((exp) => exp.id === id))
      .filter((exp): exp is Experiment => !!exp);
  });

  // click on list row
  onExperimentSelected(experiment: Experiment) {
    this.selectedExperiment.set(experiment);
    this.selectedFolderId.set(null);

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

  onFolderSelected(folderId: string | null) {
    this.selectedFolderId.set(folderId);
    // A folder opened from the strip is a fresh look, not a compare back-path.
    this.compareOriginFolderId.set(null);
    if (!folderId) return;

    // The canvas replaces both other centre-pane views, so leave compare mode cleanly.
    this.compareMode.set(false);
    this.compareIds.set([]);
    this.selectedExperiment.set(null);
  }

  /**
   * Handoff to the compare workspace. Members on another page are fetched and upserted
   * first: `experimentsForCompare` only resolves the loaded page, so without this an
   * off-page member would vanish from the comparison. The folder id rides along, so its
   * sets section the workspace — including sets made after this handoff.
   */
  onFolderCompare(memberIds: string[]) {
    if (memberIds.length < 2) return;

    const originFolderId = this.selectedFolderId();

    this.experimentsService.hydrateExperiments(memberIds).subscribe({
      next: (experiments) => {
        this.selectedFolderId.set(null);
        this.selectedExperiment.set(null);
        this.compareMode.set(true);
        this.compareIds.set(experiments.map((exp) => exp.id));
        this.compareOriginFolderId.set(originFolderId);
      },
      error: (err) => {
        console.error('[Folders] Compare handoff failed', err);
        this.errorService.setError('Could not load the experiments in this folder.');
      },
    });
  }

  /** Go back to the folder the compare set was built from; a deleted folder is simply no way back. */
  onBackToOriginFolder() {
    const folderId = this.compareOriginFolderId();
    if (!folderId || !this.foldersService.folderById(folderId)) return;
    this.onFolderSelected(folderId);
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

    // Membership is removed only after the backend confirms the delete: the delete
    // request is optimistic and can roll back, and folder membership must not be lost
    // on a failed delete.
    this.experimentsService.deleteExperiment(expId, (deletedId) => {
      this.foldersService.pruneExperiment(deletedId);
    });

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
