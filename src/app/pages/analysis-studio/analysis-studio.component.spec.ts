import type { Mock } from 'vitest';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ErrorService } from '../../services/error.service';
import { AnalysisStudioService } from '../../services/analysis-studio.service';
import { AnalysesDashboardService } from '../../services/analyses-dashboard.service';
import { AuthService } from '../../services/auth.service';
import { AnalysisStudioNavigationService } from '../../services/analysis-studio-navigation.service';
import { AnalysisStudioComponent } from './analysis-studio.component';

describe('AnalysisStudioComponent view switching', () => {
  let fixture: ComponentFixture<AnalysisStudioComponent>;
  let component: AnalysisStudioComponent;
  let router: Router;
  let navService: AnalysisStudioNavigationService;
  let analysisStudioService: {
    isRunning: ReturnType<typeof signal<boolean>>;
    hasRunStarted: ReturnType<typeof signal<boolean>>;
    runResult: ReturnType<typeof signal<any>>;
    selectedDataModel: ReturnType<typeof signal<any>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    selectedAlgorithm: ReturnType<typeof signal<any>>;
    selectedVariables: ReturnType<typeof signal<any[]>>;
    dataExclusionWarnings: ReturnType<typeof signal<string[]>>;
    pathologyAccessWarning: ReturnType<typeof signal<any>>;
    clearDataExclusionWarnings: Mock;
    setEditingExistingAnalysis: Mock;
    loadAndCategorizeModels: Mock;
    resetStudioState: Mock;
    filterLogic: any;
    algorithmY: ReturnType<typeof signal<any[]>>;
    algorithmX: ReturnType<typeof signal<any[]>>;
    availableDatasets: ReturnType<typeof signal<any[]>>;
    getDatasetLabelMap: Mock;
  };

  beforeEach(async () => {
    analysisStudioService = {
      isRunning: signal(false),
      hasRunStarted: signal(false),
      runResult: signal<any>(null),
      selectedDataModel: signal<any>(null),
      selectedDatasets: signal<string[]>([]),
      selectedAlgorithm: signal<any>(null),
      selectedVariables: signal<any[]>([]),
      dataExclusionWarnings: signal<string[]>([]),
      pathologyAccessWarning: signal<any>(null),
      clearDataExclusionWarnings: vi.fn(),
      setEditingExistingAnalysis: vi.fn(),
      loadAndCategorizeModels: vi.fn().mockReturnValue(of([])),
      resetStudioState: vi.fn(),
      filterLogic: signal<any>(null),
      algorithmY: signal<any[]>([]),
      algorithmX: signal<any[]>([]),
      availableDatasets: signal([]),
      getDatasetLabelMap: vi.fn().mockReturnValue({}),
    };

    await TestBed.configureTestingModule({
      imports: [AnalysisStudioComponent],
      providers: [
        provideRouter([]),
        AnalysisStudioNavigationService,
        { provide: AnalysisStudioService, useValue: analysisStudioService },
        { provide: AnalysesDashboardService, useValue: { getAnalysis: vi.fn() } },
        { provide: ErrorService, useValue: { error: signal(null), clearError: vi.fn() } },
        { provide: AuthService, useValue: {} },
      ],
    })
      .overrideComponent(AnalysisStudioComponent, { set: { template: '' } })
      .compileComponents();

    navService = TestBed.inject(AnalysisStudioNavigationService);
    fixture = TestBed.createComponent(AnalysisStudioComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    document.querySelectorAll('.studio-section-test-target').forEach((element) => element.remove());
  });

  it('starts on the variables view', () => {
    expect(component.activeSection()).toBe('variables-top');
  });

  it('publishes state to AnalysisStudioNavigationService on changes', () => {
    expect(navService.state().activeSection).toBe('variables-top');
    expect(navService.state().railStatus['statistics-section']).toBe('locked');

    analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
    analysisStudioService.selectedDatasets.set(['d']);
    analysisStudioService.selectedVariables.set([{ code: 'v' }]);
    fixture.detectChanges();

    expect(navService.state().railStatus['statistics-section']).toBe('available');
  });

  it('switchSection activates the requested view', () => {
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));

    analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
    analysisStudioService.selectedDatasets.set(['d']);
    analysisStudioService.selectedVariables.set([{ code: 'v' }]);

    component.switchSection('statistics-section');

    expect(component.activeSection()).toBe('statistics-section');
  });

  it('switchSection ignores clicks on locked steps (hard lock)', () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.switchSection('statistics-section');
    expect(component.activeSection()).toBe('variables-top');
    component.switchSection('algorithm-section');
    expect(component.activeSection()).toBe('variables-top');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('railStatus locks statistics until a variable or covariate is selected', () => {
    expect(component.railStatus()['statistics-section']).toBe('locked');
    expect(component.railStatus()['algorithm-section']).toBe('locked');

    analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
    analysisStudioService.selectedDatasets.set(['d']);
    analysisStudioService.selectedVariables.set([{ code: 'v' }]);

    expect(component.railStatus()['statistics-section']).toBe('available');
    expect(component.railStatus()['algorithm-section']).toBe('available');
    expect(component.railStatus()['variables-top']).toBe('active');
  });

  it('railStatus only marks a step complete when its work is actually done', () => {
    analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
    analysisStudioService.selectedDatasets.set(['d']);
    analysisStudioService.selectedVariables.set([{ code: 'v' }]);

    expect(component.railStatus()['variables-top']).toBe('active');
    component.activeSection.set('statistics-section');
    expect(component.railStatus()['variables-top']).toBe('complete');

    expect(component.railStatus()['statistics-section']).toBe('active');
    component.activeSection.set('variables-top');
    expect(component.railStatus()['statistics-section']).toBe('available');
    component.descriptiveProgress.set({
      pendingChangeCount: 0,
      preprocessingStatus: 'applied',
      transformationStatusLabel: 'Not defined',
    });
    expect(component.railStatus()['statistics-section']).toBe('complete');

    expect(component.railStatus()['algorithm-section']).toBe('available');
    analysisStudioService.selectedAlgorithm.set({ name: 'logistic' });
    expect(component.railStatus()['algorithm-section']).toBe('complete');
  });

  it('keeps data review available until the user actually does work', () => {
    analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
    analysisStudioService.selectedDatasets.set(['d']);
    analysisStudioService.selectedVariables.set([{ code: 'v' }]);
    component.activeSection.set('variables-top');

    expect(component.railStatus()['statistics-section']).toBe('available');
    expect(component.dataReviewWorked()).toBe(false);

    component.descriptiveProgress.set({
      pendingChangeCount: 0,
      preprocessingStatus: 'none',
      transformationStatusLabel: 'Not defined',
    });
    expect(component.dataReviewWorked()).toBe(false);
    expect(component.railStatus()['statistics-section']).toBe('available');

    analysisStudioService.filterLogic.set({ rules: [{ code: 'x' }] });
    expect(component.dataReviewWorked()).toBe(true);
    expect(component.railStatus()['statistics-section']).toBe('complete');
  });

  it('explains why a locked step is locked', () => {
    expect(component.hasDatasetContext()).toBe(false);
    expect(component.lockedStepReason).toBe('Add a dataset to unlock');

    analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
    analysisStudioService.selectedDatasets.set(['d']);
    expect(component.hasDatasetContext()).toBe(true);
    expect(component.railStatus()['statistics-section']).toBe('locked');
    expect(component.lockedStepReason).toBe('Add a variable to unlock');
  });

  it('activateGuideTarget reveals the view owning a guide section', () => {
    component.activateGuideTarget('Explore');
    expect(component.activeSection()).toBe('variables-top');

    component.activateGuideTarget('Analysis');
    expect(component.activeSection()).toBe('statistics-section');

    component.activateGuideTarget('Algorithm');
    expect(component.activeSection()).toBe('algorithm-section');

    component.activateGuideTarget('Results');
    expect(component.activeSection()).toBe('execution-section');
  });

  it('activateGuideTarget opens the matching statistics sub-tab for Analysis steps', () => {
    const goToSection = vi.fn();
    const sectionOpen = signal<Record<string, boolean>>({
      raw: false, setup: false, filters: false, processed: false, transformation: false,
    });
    (component as any).statisticPanel = signal({ goToSection, sectionOpen });

    component.activateGuideTarget('Analysis', 'analysis-filtering');
    expect(goToSection).toHaveBeenCalledWith('filters');

    component.activateGuideTarget('Analysis', 'analysis-raw-statistics');
    expect(goToSection).toHaveBeenCalledWith('raw');

    component.activateGuideTarget('Analysis', 'analysis-preprocessing');
    expect(goToSection).toHaveBeenCalledWith('setup');

    component.activateGuideTarget('Analysis', 'analysis-processed-summary');
    expect(goToSection).toHaveBeenCalledWith('processed');

    component.activateGuideTarget('Explore');
    expect(goToSection.mock.calls.length).toBe(4);
  });

  it('goToDescriptiveStep ignores in-step anchors while statistics is locked', () => {
    const goToSection = vi.fn();
    const sectionOpen = signal<Record<string, boolean>>({
      raw: false, setup: false, filters: false, processed: false, transformation: false,
    });
    const statisticPanel = { goToSection, sectionOpen };
    (component as any).statisticPanel = signal(statisticPanel);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.goToDescriptiveStep('setup');

    expect(component.activeSection()).toBe('variables-top');
    expect(statisticPanel.goToSection).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('goToDescriptiveStep activates the statistics view and scrolls the panel', async () => {
    const goToSection = vi.fn();
    const sectionOpen = signal<Record<string, boolean>>({
      raw: false, setup: false, filters: false, processed: false, transformation: false,
    });
    const statisticPanel = { goToSection, sectionOpen };
    (component as any).statisticPanel = signal(statisticPanel);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
      queueMicrotask(() => callback(0));
      return 0;
    });

    analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
    analysisStudioService.selectedDatasets.set(['d']);
    analysisStudioService.selectedVariables.set([{ code: 'v' }]);
    fixture.detectChanges();

    component.goToDescriptiveStep('processed');

    expect(component.activeSection()).toBe('statistics-section');
    await Promise.resolve();
    await Promise.resolve();
    expect(statisticPanel.goToSection).toHaveBeenCalledWith('processed');
  });

  describe('stepper navigation service state publication', () => {
    it('publishes the four-step rail state to navService', () => {
      fixture.detectChanges();
      expect(navService.state().activeSection).toBe('variables-top');
      expect(navService.state().railStatus['statistics-section']).toBe('locked');
      expect(navService.state().railStatus['execution-section']).toBe('locked');

      analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
      analysisStudioService.selectedDatasets.set(['d']);
      analysisStudioService.selectedVariables.set([{ code: 'v' }]);
      fixture.detectChanges();

      // Unlocked, not active: the user is still on Data Exploration.
      expect(component.railStatus()['statistics-section']).toBe('available');
      expect(navService.state().railStatus['statistics-section']).toBe('available');
    });

    it('keeps execution locked until a run has started, then completes it on a result', () => {
      analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
      analysisStudioService.selectedDatasets.set(['d']);
      analysisStudioService.selectedVariables.set([{ code: 'v' }]);
      fixture.detectChanges();

      expect(component.railStatus()['execution-section']).toBe('locked');

      analysisStudioService.hasRunStarted.set(true);
      fixture.detectChanges();
      expect(component.railStatus()['execution-section']).toBe('available');

      analysisStudioService.runResult.set({ status: 'success' });
      fixture.detectChanges();
      expect(component.railStatus()['execution-section']).toBe('complete');
    });

    it('refuses to switch to execution before a run', () => {
      component.activeSection.set('variables-top');

      component.switchSection('execution-section');

      expect(component.activeSection()).toBe('variables-top');
    });
  });

  describe('sub-header Continue CTA', () => {
    it('stays disabled until data review is ready, then advances to statistics', () => {
      expect(component.canContinue()).toBe(false);
      expect(component.ctaLabel()).toBe('Continue');

      analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
      analysisStudioService.selectedDatasets.set(['d']);
      analysisStudioService.selectedVariables.set([{ code: 'v' }]);
      fixture.detectChanges();

      expect(component.canContinue()).toBe(true);
      expect(component.ctaLabel()).toBe('Continue with 1 variable');
      component.onCtaClick();
      expect(component.activeSection()).toBe('statistics-section');
      expect(component.ctaLabel()).toBe('Continue to Algorithm Selection');
    });

    it('labels the CTA Run analysis on the algorithm step', () => {
      analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
      analysisStudioService.selectedDatasets.set(['d']);
      analysisStudioService.selectedVariables.set([{ code: 'v' }]);
      analysisStudioService.selectedAlgorithm.set({ name: 'logistic' });
      component.activeSection.set('algorithm-section');
      fixture.detectChanges();

      expect(component.ctaLabel()).toBe('Run analysis');
    });
  });

  describe('sub-header Previous Step button', () => {
    it('exposes no previous section on the first step (variables-top)', () => {
      component.activeSection.set('variables-top');
      fixture.detectChanges();

      expect(component.previousSection()).toBeNull();
    });

    it('navigates back from statistics to variables-top on click', () => {
      component.activeSection.set('statistics-section');
      fixture.detectChanges();

      expect(component.previousSection()).toBe('variables-top');
      component.onBackClick();
      expect(component.activeSection()).toBe('variables-top');
    });

    it('navigates back from algorithm to statistics on click', () => {
      analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
      analysisStudioService.selectedDatasets.set(['d']);
      analysisStudioService.selectedVariables.set([{ code: 'v' }]);
      component.activeSection.set('algorithm-section');
      fixture.detectChanges();

      expect(component.previousSection()).toBe('statistics-section');
      component.onBackClick();
      expect(component.activeSection()).toBe('statistics-section');
    });
  });

  describe('unlock announcement', () => {
    it('announces once when statistics goes from locked to unlocked', () => {
      vi.useFakeTimers();
      try {
        fixture.detectChanges();
        expect(component.unlockAnnouncement()).toBeNull();

        analysisStudioService.selectedDataModel.set({ code: 'm', version: '1' });
        analysisStudioService.selectedDatasets.set(['d']);
        analysisStudioService.selectedVariables.set([{ code: 'v' }]);
        fixture.detectChanges();

        expect(component.unlockAnnouncement()).toBe(
          'Data Handling and Algorithm Selection are now available.'
        );

        vi.advanceTimersByTime(1600);
        expect(component.unlockAnnouncement()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
