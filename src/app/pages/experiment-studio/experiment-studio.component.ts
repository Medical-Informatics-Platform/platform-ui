import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal, ViewChild, computed } from '@angular/core';
import { CommonModule, ViewportScroller } from '@angular/common';
import { VariablesPanelComponent } from './variables-panel/variables-panel.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ExperimentStudioService } from '../../services/experiment-studio.service';
import { AlgorithmPanelComponent } from './algorithm-panel/algorithm-panel.component';
import { AuthService } from '../../services/auth.service';
import { ExperimentsDashboardService } from '../../services/experiments-dashboard.service';
import { ErrorService } from '../../services/error.service';
import {
  DescriptiveProgressState,
  StatisticAnalysisPanelComponent,
} from './statistic-analysis-panel/statistic-analysis-panel.component';
import { Subject, takeUntil } from 'rxjs';
import { ExperimentStudioGuideComponent } from './guide/experiment-studio-guide.component';
import { getExperimentStudioScrollOffset } from './experiment-studio-scroll.util';

@Component({
  selector: 'app-experiment-studio',
  imports: [
    CommonModule,
    VariablesPanelComponent,
    AlgorithmPanelComponent,
    StatisticAnalysisPanelComponent,
    RouterLink,
    ExperimentStudioGuideComponent
  ],
  templateUrl: './experiment-studio.component.html',
  styleUrls: ['./experiment-studio.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onResize()',
    '(window:scroll)': 'onScroll()',
  }
})
export class ExperimentStudioComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dashboardService = inject(ExperimentsDashboardService);
  public auth = inject(AuthService);
  private errorService = inject(ErrorService);
  private viewportScroller = inject(ViewportScroller);

  // Public service for telemetry/ribbon signals
  public expStudioService = inject(ExperimentStudioService);
  readonly isRunning = this.expStudioService.isRunning;
  readonly selectedDataModel = this.expStudioService.selectedDataModel;
  readonly selectedDatasets = this.expStudioService.selectedDatasets;
  readonly selectedAlgorithm = this.expStudioService.selectedAlgorithm;
  readonly dataExclusionWarnings = this.expStudioService.dataExclusionWarnings;
  readonly pathologyAccessWarning = this.expStudioService.pathologyAccessWarning;
  readonly dismissedPathologyWarning = signal(false);
  readonly visiblePathologyAccessWarning = computed(() => {
    const warning = this.pathologyAccessWarning();
    return warning && !this.dismissedPathologyWarning() ? warning : null;
  });
  @ViewChild(AlgorithmPanelComponent) algorithmPanel?: AlgorithmPanelComponent;
  @ViewChild(StatisticAnalysisPanelComponent) statisticPanel?: StatisticAnalysisPanelComponent;

  onRunClick() {
    this.algorithmPanel?.onClickRunExp();
  }

  isRunDisabled() {
    return this.algorithmPanel?.isRunButtonDisabled() ?? true;
  }

  goToDescriptiveStep(section: 'raw' | 'setup' | 'filters' | 'processed'): void {
    void this.router.navigate([], {
      fragment: 'statistics-section',
      queryParamsHandling: 'preserve',
    }).then(
      () => this.scrollToDescriptiveStep(section),
      () => this.scrollToDescriptiveStep(section),
    );
  }

  private destroy$ = new Subject<void>();
  errorMessage = computed(() => this.errorService.error() ?? '');
  activeSection = signal('variables-top');
  sidebarCollapsed = signal(false);
  readonly hasDatasetContext = computed(() => (
    !!this.selectedDataModel() && this.selectedDatasets().length > 0
  ));
  readonly hasAnalysisSelection = computed(() => (
    this.expStudioService.selectedVariables().length > 0 ||
    this.expStudioService.selectedCovariates().length > 0
  ));
  readonly isDataReviewReady = computed(() => this.hasDatasetContext() && this.hasAnalysisSelection());
  readonly isAlgorithmReady = computed(() => this.isDataReviewReady());
  descriptiveProgress = signal<DescriptiveProgressState>({
    pendingChangeCount: 0,
    preprocessingStatus: 'none',
  });
  private readonly sectionIds = [
    'variables-top',
    'statistics-section',
    'algorithm-section',
  ] as const;
  private sectionObserver?: IntersectionObserver;
  private observedSections: HTMLElement[] = [];





  onResize() {
    this.checkSidebarCollapse();
    this.updateActiveSection();
  }

  onScroll() {
    this.updateActiveSection();
  }

  private checkSidebarCollapse() {
    const width = window.innerWidth;
    if (width >= 1650) {
      // Large Desktop: User can toggle, default to expanded
      this.sidebarCollapsed.set(false);
    } else if (width >= 1200) {
      // Medium Screens: Force Icon Rail
      this.sidebarCollapsed.set(true);
    } else {
      // Narrow screens: Fully hidden (handled via CSS), sidebar itself is expanded in drawer
      this.sidebarCollapsed.set(false);
    }
  }

  ngOnInit(): void {
    this.viewportScroller.setOffset(() => [0, this.getSectionScrollOffset()]);
    this.checkSidebarCollapse();
    // Reset any lingering global errors when arriving on the studio
    this.errorService.clearError();
    this.dismissedPathologyWarning.set(false);
    this.expStudioService.clearDataExclusionWarnings();
    const initialMode = this.route.snapshot.queryParamMap.get('mode');
    const initialExperimentId = this.route.snapshot.queryParamMap.get('experimentId');
    if (initialMode === 'edit' && initialExperimentId) {
      this.expStudioService.setEditingExistingExperiment(true);
    }
    this.expStudioService.loadAndCategorizeModels().subscribe();

    this.route.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        const experimentId = params.get('experimentId');
        const mode = params.get('mode');

        if (mode === 'edit' && experimentId) {
          // EDIT MODE
          this.loadExperimentForEdit(experimentId);
        } else {
          // CREATE MODE
          this.initCreateMode();
        }
      });
  }

  ngAfterViewInit(): void {
    this.setupSectionObserver();
    this.scrollToHash(this.route.snapshot.fragment);

    this.route.fragment
      .pipe(takeUntil(this.destroy$))
      .subscribe((fragment) => this.scrollToHash(fragment));
  }

  ngOnDestroy(): void {
    this.viewportScroller.setOffset([0, 0]);
    this.sectionObserver?.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }



  dismissError(): void {
    this.errorService.clearError();
    this.expStudioService.loadAndCategorizeModels().subscribe();
  }

  dismissDataExclusionWarnings(): void {
    this.expStudioService.clearDataExclusionWarnings();
  }

  dismissPathologyWarning(): void {
    this.dismissedPathologyWarning.set(true);
  }

  private setupSectionObserver(): void {
    const observerCallback: IntersectionObserverCallback = () => this.updateActiveSection();

    // Retry setup for dynamic content
    let attempts = 0;
    const tryObserve = () => {
      const targets = this.sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el);

      if (targets.length === this.sectionIds.length || attempts > 5) {
        if (this.sectionObserver) this.sectionObserver.disconnect();
        this.observedSections = targets;

        this.sectionObserver = new IntersectionObserver(observerCallback, {
          root: null,
          threshold: [0, 0.25, 0.5, 1],
        });

        targets.forEach((el) => this.sectionObserver?.observe(el));
        this.updateActiveSection();
      } else {
        attempts++;
        setTimeout(tryObserve, 200);
      }
    };

    tryObserve();
  }

  private scrollToHash(fragment: string | null): void {
    if (!fragment) return;
    const target = document.getElementById(this.getScrollTargetId(fragment));
    if (!target) return;
    requestAnimationFrame(() => {
      const top = Math.max(window.scrollY + target.getBoundingClientRect().top - this.getSectionScrollOffset(), 0);
      window.scrollTo({ top, behavior: 'smooth' });
    });
  }

  private updateActiveSection(): void {
    const sections = this.observedSections.length
      ? this.observedSections
      : this.sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;

    if (this.isScrolledToPageBottom()) {
      this.activeSection.set(sections[sections.length - 1].id);
      return;
    }

    const offset = this.getActiveSectionOffset();
    const currentSection = [...sections]
      .reverse()
      .find((section) => section.getBoundingClientRect().top <= offset);

    this.activeSection.set((currentSection ?? sections[0]).id);
  }

  private getActiveSectionOffset(): number {
    return this.getSectionScrollOffset();
  }

  private getSectionScrollOffset(): number {
    return getExperimentStudioScrollOffset();
  }

  private scrollToDescriptiveStep(section: 'raw' | 'setup' | 'filters' | 'processed'): void {
    requestAnimationFrame(() => this.statisticPanel?.goToSection(section));
  }

  private isScrolledToPageBottom(): boolean {
    const scrollBottom = window.scrollY + window.innerHeight;
    const pageHeight = document.documentElement.scrollHeight;
    return scrollBottom >= pageHeight - 2;
  }

  private getScrollTargetId(fragment: string): string {
    return fragment === 'studio-top' ? 'variables-top' : fragment;
  }

  // Clean create mode.
  private initCreateMode(): void {
    this.expStudioService.setEditingExistingExperiment(false);
  }

  private loadExperimentForEdit(uuid: string): void {
    this.expStudioService.setEditingExistingExperiment(true);
    this.dashboardService.getExperiment(uuid).subscribe({
      next: (backendExp) => {
        // Prefill Experiment Studio (datasets, domain, variables, filters, algo, params)
        this.expStudioService.hydrateFromBackendExperiment(backendExp);
      },
      error: (err) => {
        console.error('Failed to load experiment for edit:', err);
        // fallback turns to create mode if something goes wrong
        this.initCreateMode();
      },
    });
  }

  onBackToDashboard(): void {
    // If an experiment is running, ignore the click
    if (this.isRunning()) {
      return;
    }

    // Clean up experiment studio state
    this.expStudioService.resetStudioState();
    this.expStudioService.setEditingExistingExperiment(false);
    this.errorService.clearError();
    this.expStudioService.loadAndCategorizeModels().subscribe();

    // Go to experiments dashboard
    this.router.navigate(['/experiments-dashboard']);
  }

}
