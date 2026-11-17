import { AuthService } from './../../services/auth.service';
import { Component, HostListener, OnInit, OnDestroy, computed, effect, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AnalysisDetailsComponent } from './analysis-detail/analysis-detail.component';
import { AnalysesListComponent } from './analysis-list/analysis-list.component';
import { AnalysesDashboardService } from './../../services/analyses-dashboard.service';
import { Analysis } from '../../models/analyses-dashboard.model';
import { AnalysesCompareComponent } from './analyses-compare/analyses-compare.component';
import { ActivatedRoute } from '@angular/router';
import { ErrorService } from '../../services/error.service';
import { AnalysisStudioService } from '../../services/analysis-studio.service';
import { Subject, takeUntil } from 'rxjs';
import { AnalysesDashboardGuideComponent } from './guide/analyses-dashboard-guide.component';
import { StudyComponent } from './study/study.component';
import { StudiesService } from '../../services/studies.service';
import { readDashboardQuery, updateDashboardQuery } from './dashboard-query.utils';
import { statusChip } from './shared/analysis-status/analysis-status.component';

@Component({
  selector: 'app-analyses-dashboard',
  templateUrl: './analyses-dashboard.component.html',
  styleUrl: './analyses-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterModule,
    CommonModule,
    FormsModule,
    AnalysisDetailsComponent,
    AnalysesListComponent,
    AnalysesCompareComponent,
    AnalysesDashboardGuideComponent,
    StudyComponent,
  ]
})
export class AnalysesDashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  public analysesService = inject(AnalysesDashboardService);
  private analysisStudioService = inject(AnalysisStudioService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private errorService = inject(ErrorService);
  private titleService = inject(Title);
  readonly studiesService = inject(StudiesService);

  selectedAnalysis = signal<Analysis | null>(null);

  isConfirmingDelete = false;
  analysisToDeleteId: string | null = null;

  /** Sharing and ownership speak email; studies are keyed off the user the service was given. */
  currentUserEmail = computed(() => this.authService.authState().user?.email ?? null);

  readonly mobileDetailOpen = computed(() =>
    Boolean(this.selectedAnalysis() || this.selectedStudyId() || this.compareMode()),
  );
  compareIds = signal<string[]>([]);
  compareMode = signal(false);
  /** Study canvas owns the centre pane while set; it never coexists with detail or compare. */
  selectedStudyId = signal<string | null>(null);
  /**
   * The study the open comparison came from. The id is what travels: the workspace reads the
   * way back off it, and reads the study's groups off the same service the canvas edits.
   */
  compareOriginStudyId = signal<string | null>(null);
  private sharedAnalysisId = signal<string | null>(null);
  private sharedFetchInFlight = signal<string | null>(null);
  errorMessage = computed(() => this.errorService.error());
  readonly pathologyAccessWarning = this.analysisStudioService.pathologyAccessWarning;
  readonly dismissedPathologyWarning = signal(false);
  readonly visiblePathologyAccessWarning = computed(() => {
    const warning = this.pathologyAccessWarning();
    return warning && !this.dismissedPathologyWarning() ? warning : null;
  });
  private destroy$ = new Subject<void>();

  constructor() {
    // Studies belong to the signed-in user, and the session only resolves after the first render:
    // the service is told who to read for, and it reads them from PostgreSQL for that user.
    effect(() => {
      this.studiesService.setActiveUser(this.authService.authState().user ?? null);
    });

    effect(() => {
      const targetId = this.sharedAnalysisId();
      const list = this.analysesService.analyses();

      if (!targetId) return;

      const found = list.find(e => e.id === targetId);
      if (!found) {
        if (this.sharedFetchInFlight() === targetId) return;

        this.sharedFetchInFlight.set(targetId);
        this.analysesService.fetchAnalysisById(targetId).subscribe({
          next: (analysis) => {
            this.analysesService.upsertAnalysis(analysis);
            this.selectedAnalysis.set(analysis);
            this.selectedStudyId.set(null);
            this.compareMode.set(false);
            this.compareIds.set([]);
            this.compareOriginStudyId.set(null);
            this.sharedAnalysisId.set(null);
            this.sharedFetchInFlight.set(null);
          },
          error: (err) => {
            console.warn('[SharedLink] Analysis not found for id', targetId, err);
            this.errorService.setError('Shared analysis not found or inaccessible.');
            this.sharedAnalysisId.set(null);
            this.sharedFetchInFlight.set(null);
          }
        });
        return;
      }

      // set selected analysis
      this.selectedAnalysis.set(found);
      this.selectedStudyId.set(null);

      // not in compare mode
      this.compareMode.set(false);
      this.compareIds.set([]);
      this.compareOriginStudyId.set(null);

      this.sharedAnalysisId.set(null);
    });

    effect(() => {
      if (!this.allowDefaultOpen() || this.suppressDefaultOpen() || this.openedDefault) return;
      const loading = this.analysesService.isLoading();
      const list = this.analysesService.analyses();
      if (this.selectedAnalysis() || this.selectedStudyId() || this.compareMode() || this.hasDeepLink()) {
        this.openedDefault = true;
        return;
      }
      const params = readDashboardQuery();
      if (params.get('analysis') || params.get('experiment') || params.get('study') || params.get('folder') || params.get('compare')) return;
      const first = list[0];
      if (loading || !first) return;
      this.openedDefault = true;
      // At the stacked (master/detail) breakpoint a selection hides the list, so the list
      // stays the landing view there.
      if (window.matchMedia?.('(max-width: 1100px)').matches) return;
      this.onAnalysisSelected(first);
    });
  }

  hasDeepLink = signal(false);
  private readonly allowDefaultOpen = signal(false);
  private readonly suppressDefaultOpen = signal(false);
  private openedDefault = false;

  ngOnInit(): void {
    this.titleService.setTitle('Analyses · MIP');
    this.errorService.clearError();
    this.analysesService.invalidateListCache();
    this.dismissedPathologyWarning.set(false);
    this.applyUrlSelection();
    this.analysisStudioService.getAllDataModels()
      .pipe(takeUntil(this.destroy$))
      .subscribe();

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const analysisId = params.get('analysis') || params.get('experiment');
      if (analysisId) {
        this.sharedAnalysisId.set(analysisId);
        this.hasDeepLink.set(true);
      }
    });
    this.allowDefaultOpen.set(true);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:popstate')
  onDashboardPopState() {
    this.applyUrlSelection();
  }

  private syncSelectionUrl(analysisId: string) {
    updateDashboardQuery({
      analysis: analysisId,
      study: null,
      compare: null,
    });
  }

  private syncCompareUrl(ids: string[]) {
    updateDashboardQuery({
      compare: ids.length ? ids.join(',') : null,
      analysis: null,
      study: null,
    });
  }

  private applyUrlSelection() {
    const params = readDashboardQuery();
    const analysisId = params.get('analysis') || params.get('experiment');
    const studyId = params.get('study') || params.get('folder');
    const compareParam = params.get('compare');

    if (compareParam) {
      const ids = compareParam.split(',').map((id) => id.trim()).filter(Boolean);
      this.compareMode.set(ids.length > 0);
      this.compareIds.set(ids);
      this.selectedStudyId.set(null);
      this.selectedAnalysis.set(null);
      this.compareOriginStudyId.set(studyId);
      return;
    }

    if (studyId) {
      this.compareMode.set(false);
      this.compareIds.set([]);
      this.selectedAnalysis.set(null);
      this.selectedStudyId.set(studyId);
      this.compareOriginStudyId.set(null);
      return;
    }

    this.compareMode.set(false);
    this.compareIds.set([]);
    this.selectedStudyId.set(null);
    this.compareOriginStudyId.set(null);
    if (analysisId) {
      this.sharedAnalysisId.set(analysisId);
      this.hasDeepLink.set(true);
    } else {
      this.selectedAnalysis.set(null);
    }
  }

  dismissError() {
    this.errorService.clearError();
  }

  dismissPathologyWarning() {
    this.dismissedPathologyWarning.set(true);
  }

  // COMPARE MODE

  clearCompareSelection() {
    this.compareIds.set([]);
    this.syncCompareUrl([]);
  }

  onCompareToggled(id: string) {
    const ids = this.compareIds();
    const next = ids.includes(id)
      ? ids.filter((existing) => existing !== id)
      : ids.length >= 3
        ? ids
        : [...ids, id];
    if (next === ids) return;
    this.compareIds.set(next);
    if (!this.compareMode()) return;
    if (next.length < 2) {
      // Same exit as Done: drop ?compare= and put a run back in the pane openCompare cleared.
      this.closeCompare();
      return;
    }
    this.syncCompareUrl(next);
  }

  openCompare() {
    if (this.compareIds().length < 2) return;
    this.selectedStudyId.set(null);
    this.selectedAnalysis.set(null);
    this.compareOriginStudyId.set(null);
    this.compareMode.set(true);
    this.syncCompareUrl(this.compareIds());
  }

  closeCompare() {
    this.compareMode.set(false);
    this.compareOriginStudyId.set(null);
    updateDashboardQuery({ compare: null });
    if (this.selectedAnalysis()) return;
    const ids = this.compareIds();
    const list = this.analysesService.analyses();
    const restored = list.find((analysis) => ids.includes(analysis.id)) ?? list[0];
    if (!restored) return;
    this.selectedAnalysis.set(restored);
    this.syncSelectionUrl(restored.id);
  }

  readonly compareOriginStudyName = computed(() => {
    const id = this.compareOriginStudyId();
    return id ? this.studiesService.studyById(id)?.name ?? null : null;
  });

  removeFromCompare(analysisId: string) {
    const ids = this.compareIds().filter((id) => id !== analysisId);
    this.compareIds.set(ids);
    this.syncCompareUrl(ids);
  }

  getAlgorithmLabel(code: string | null | undefined): string {
    if (!code) return 'Unknown algorithm';
    return this.analysisStudioService.backendAlgorithms?.()?.[code]?.label || code;
  }

  /** Order follows `compareIds`, so a study keeps its numbered order in the workspace and
   *  manual picks keep the order they were clicked in. */
  readonly analysesForCompare = computed(() => {
    const ids = this.compareIds();
    const list = this.analysesService.analyses();
    const current = this.selectedAnalysis();
    return ids
      .map((id) => list.find((analysis) => analysis.id === id) || (current?.id === id ? current : undefined))
      .filter((analysis): analysis is Analysis => !!analysis);
  });

  readonly compareDiffRows = computed(() => {
    const analyses = this.analysesForCompare();
    const fields: { k: string; value: (analysis: Analysis) => string }[] = [
      { k: 'Algorithm', value: (analysis) => this.getAlgorithmLabel(analysis.algorithmName) },
      { k: 'Outcome (y)', value: (analysis) => analysis.variables?.join(', ') || '—' },
      { k: 'Predictors (x)', value: (analysis) => analysis.covariates?.join(', ') || '—' },
      { k: 'Datasets', value: (analysis) => analysis.datasets?.join(', ') || '—' },
      { k: 'Filters', value: (analysis) => analysis.filters?.length ? analysis.filters.join(', ') : 'None' },
      { k: 'Status', value: (analysis) => statusChip(analysis.status).label },
    ];
    return fields.map((field) => {
      const vals = analyses.map((analysis) => field.value(analysis));
      const same = vals.every((value) => value === vals[0]);
      return { k: field.k, same, vals };
    });
  });

  // click on list row
  onAnalysisSelected(analysis: Analysis) {
    this.selectedAnalysis.set(analysis);
    this.selectedStudyId.set(null);
    this.compareMode.set(false);
    this.syncSelectionUrl(analysis.id);
  }

  onStudySelected(studyId: string | null) {
    this.selectedStudyId.set(studyId);
    // A study opened from the strip is a fresh look, not a compare back-path.
    this.compareOriginStudyId.set(null);
    if (!studyId) {
      updateDashboardQuery({ study: null });
      return;
    }

    // The canvas replaces both other centre-pane views, so leave compare mode cleanly.
    this.compareMode.set(false);
    this.compareIds.set([]);
    this.selectedAnalysis.set(null);
    updateDashboardQuery({ study: studyId, analysis: null, compare: null });
  }

  /**
   * Handoff to the compare workspace. Members on another page are fetched and upserted
   * first: `analysesForCompare` only resolves the loaded page, so without this an
   * off-page member would vanish from the comparison. The study id rides along, so its
   * groups section the workspace — including groups made after this handoff.
   */
  onStudyCompare(memberIds: string[]) {
    if (memberIds.length < 2) return;

    const originStudyId = this.selectedStudyId();

    this.analysesService.hydrateAnalyses(memberIds).subscribe({
      next: (analyses) => {
        this.selectedStudyId.set(null);
        this.selectedAnalysis.set(null);
        this.compareMode.set(true);
        const ids = analyses.map((analysis) => analysis.id);
        this.compareIds.set(ids);
        this.compareOriginStudyId.set(originStudyId);
        updateDashboardQuery({ study: originStudyId, analysis: null, compare: ids.join(',') });
      },
      error: (err) => {
        console.error('[Studies] Compare handoff failed', err);
        this.errorService.setError('Could not load the analyses in this study.');
      },
    });
  }

  /** Go back to the study the comparison was built from; a deleted study is simply no way back. */
  onBackToOriginStudy() {
    const studyId = this.compareOriginStudyId();
    if (!studyId || !this.studiesService.studyById(studyId)) return;
    this.onStudySelected(studyId);
  }

  closeMobileDetail() {
    this.suppressDefaultOpen.set(true);
    this.selectedAnalysis.set(null);
    this.selectedStudyId.set(null);
    this.compareMode.set(false);
    this.compareIds.set([]);
    this.compareOriginStudyId.set(null);
    updateDashboardQuery({ analysis: null, study: null, compare: null });
  }

  onRunAnalysis(analysisId: string) {
    this.router.navigate(['/analysis-studio'], {
      queryParams: { analysisId: analysisId, mode: 'edit' }
    });
  }

  onNameUpdated(update: { id: string; name: string }) {
    const current = this.selectedAnalysis();
    if (current?.id === update.id) {
      this.selectedAnalysis.set({ ...current, name: update.name });
    }
  }

  goToNewAnalysis() {
    this.router.navigate(['/analysis-studio']);
  }

  onDeleteRequested() {
    const analysis = this.selectedAnalysis();
    if (!analysis) return;

    this.analysisToDeleteId = analysis.id;
    this.isConfirmingDelete = true;
  }

  confirmDelete(analysisId: string) {
    if (!analysisId) return;

    // Membership is dropped from the mirror only after the backend confirms the delete: the
    // delete request is optimistic and can roll back, and study membership must not be lost
    // on a failed delete. `pruneAnalysis` is local-only — the cascade has already removed the
    // rows behind it.
    this.analysesService.deleteAnalysis(analysisId, (deletedId) => {
      this.studiesService.pruneAnalysis(deletedId);
    });

    if (this.selectedAnalysis()?.id === analysisId) {
      const next = this.analysesService.analyses().find((analysis) => analysis.id !== analysisId) ?? null;
      this.selectedAnalysis.set(next);
      if (next) this.syncSelectionUrl(next.id);
    }

    this.compareIds.set(this.compareIds().filter(id => id !== analysisId));

    this.analysisToDeleteId = null;
    this.isConfirmingDelete = false;
  }

  deleteTargetName(): string {
    const id = this.analysisToDeleteId;
    if (!id) return 'this analysis';
    const selected = this.selectedAnalysis();
    if (selected?.id === id) return selected.name || 'Untitled Investigation';
    return (
      this.analysesService.analyses().find((analysis) => analysis.id === id)?.name ||
      'this analysis'
    );
  }

  cancelDelete() {
    this.isConfirmingDelete = false;
    this.analysisToDeleteId = null;
  }
}
