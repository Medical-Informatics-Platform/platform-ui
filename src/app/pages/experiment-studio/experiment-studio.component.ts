import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal, ViewChild, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VariablesPanelComponent } from './variables-panel/variables-panel.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ExperimentStudioService } from '../../services/experiment-studio.service';
import { AlgorithmPanelComponent } from './algorithm-panel/algorithm-panel.component';
import { AuthService } from '../../services/auth.service';
import { ExperimentsDashboardService } from '../../services/experiments-dashboard.service';
import { ErrorService } from '../../services/error.service';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel/statistic-analysis-panel.component';
import { Subject, takeUntil } from 'rxjs';
import { FilterConfigModalComponent } from './variables-panel/filter-config-modal/filter-config-modal.component';
import { ExperimentStudioGuideComponent } from './guide/experiment-studio-guide.component';

@Component({
  selector: 'app-experiment-studio',
  imports: [
    CommonModule,
    VariablesPanelComponent,
    AlgorithmPanelComponent,
    StatisticAnalysisPanelComponent,
    RouterLink,
    FilterConfigModalComponent,
    ExperimentStudioGuideComponent
  ],
  templateUrl: './experiment-studio.component.html',
  styleUrls: ['./experiment-studio.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onResize()'
  }
})
export class ExperimentStudioComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dashboardService = inject(ExperimentsDashboardService);
  public auth = inject(AuthService);
  private errorService = inject(ErrorService);

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

  onRunClick() {
    this.algorithmPanel?.onClickRunExp();
  }

  isRunDisabled() {
    return this.algorithmPanel?.isRunButtonDisabled() ?? true;
  }
  private destroy$ = new Subject<void>();
  errorMessage = computed(() => this.errorService.error() ?? '');
  activeSection = signal('variables-top');
  sidebarCollapsed = signal(false);
  private sectionObserver?: IntersectionObserver;





  onResize() {
    this.checkSidebarCollapse();
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
    this.checkSidebarCollapse();
    // Reset any lingering global errors when arriving on the studio
    this.errorService.clearError();
    this.dismissedPathologyWarning.set(false);
    this.expStudioService.clearDataExclusionWarnings();
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
    const sectionIds = [
      'variables-top',
      'data-model-visualization',
      'distribution-graph',
      'parameters-listing',
      'statistics-section',
      'algorithm-section',
    ];

    const observerCallback: IntersectionObserverCallback = (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (!visible.length) return;

      const inView = visible
        .map((entry) => ({
          id: entry.target.id,
          top: entry.boundingClientRect.top,
        }))
        .sort((a, b) => a.top - b.top);

      const firstBelowTop = inView.find((entry) => entry.top >= 0);
      this.activeSection.set((firstBelowTop ?? inView[0]).id);
    };

    // Retry setup for dynamic content
    let attempts = 0;
    const tryObserve = () => {
      const targets = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el);

      if (targets.length === sectionIds.length || attempts > 5) {
        if (this.sectionObserver) this.sectionObserver.disconnect();

        this.sectionObserver = new IntersectionObserver(observerCallback, {
          root: null,
          threshold: [0.1, 0.2, 0.4],
          rootMargin: '0px 0px -60% 0px',
        });

        targets.forEach((el) => this.sectionObserver?.observe(el));
      } else {
        attempts++;
        setTimeout(tryObserve, 200);
      }
    };

    tryObserve();
  }

  private scrollToHash(fragment: string | null): void {
    if (!fragment) return;
    const target = document.getElementById(fragment);
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Clean create mode.
  private initCreateMode(): void {
    this.expStudioService.setEditingExistingExperiment(false);
  }

  private loadExperimentForEdit(uuid: string): void {
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
