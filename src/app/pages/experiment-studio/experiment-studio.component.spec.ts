import { ViewportScroller } from '@angular/common';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ErrorService } from '../../services/error.service';
import { ExperimentStudioService } from '../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../services/experiments-dashboard.service';
import { AuthService } from '../../services/auth.service';
import { ExperimentStudioComponent } from './experiment-studio.component';
import { getExperimentStudioScrollOffset } from './experiment-studio-scroll.util';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly observed: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  unobserve(): void { }

  disconnect(): void { }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(): void {
    this.callback([], this as unknown as IntersectionObserver);
  }
}

describe('ExperimentStudioComponent sidebar tracking', () => {
  let fixture: ComponentFixture<ExperimentStudioComponent>;
  let component: ExperimentStudioComponent;
  let router: Router;
  let viewportScroller: jasmine.SpyObj<ViewportScroller>;
  let originalIntersectionObserver: typeof IntersectionObserver;
  let experimentStudioService: {
    isRunning: ReturnType<typeof signal<boolean>>;
    selectedDataModel: ReturnType<typeof signal<any>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    selectedAlgorithm: ReturnType<typeof signal<any>>;
    selectedVariables: ReturnType<typeof signal<any[]>>;
    selectedCovariates: ReturnType<typeof signal<any[]>>;
    dataExclusionWarnings: ReturnType<typeof signal<string[]>>;
    pathologyAccessWarning: ReturnType<typeof signal<any>>;
    clearDataExclusionWarnings: jasmine.Spy;
    setEditingExistingExperiment: jasmine.Spy;
    loadAndCategorizeModels: jasmine.Spy;
    resetStudioState: jasmine.Spy;
  };

  beforeEach(async () => {
    originalIntersectionObserver = window.IntersectionObserver;
    MockIntersectionObserver.instances = [];
    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    setScrollState(0, 800, 5000);
    viewportScroller = jasmine.createSpyObj<ViewportScroller>('ViewportScroller', [
      'setOffset',
      'getScrollPosition',
      'scrollToPosition',
      'scrollToAnchor',
      'setHistoryScrollRestoration',
    ]);
    viewportScroller.getScrollPosition.and.returnValue([0, 0]);

    experimentStudioService = {
      isRunning: signal(false),
      selectedDataModel: signal<any>(null),
      selectedDatasets: signal<string[]>([]),
      selectedAlgorithm: signal<any>(null),
      selectedVariables: signal<any[]>([]),
      selectedCovariates: signal<any[]>([]),
      dataExclusionWarnings: signal<string[]>([]),
      pathologyAccessWarning: signal<any>(null),
      clearDataExclusionWarnings: jasmine.createSpy('clearDataExclusionWarnings'),
      setEditingExistingExperiment: jasmine.createSpy('setEditingExistingExperiment'),
      loadAndCategorizeModels: jasmine.createSpy('loadAndCategorizeModels').and.returnValue(of([])),
      resetStudioState: jasmine.createSpy('resetStudioState'),
    };

    await TestBed.configureTestingModule({
      imports: [ExperimentStudioComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ViewportScroller, useValue: viewportScroller },
        { provide: ExperimentStudioService, useValue: experimentStudioService },
        { provide: ExperimentsDashboardService, useValue: { getExperiment: jasmine.createSpy('getExperiment') } },
        { provide: ErrorService, useValue: { error: signal(null), clearError: jasmine.createSpy('clearError') } },
        { provide: AuthService, useValue: {} },
      ],
    })
      .overrideComponent(ExperimentStudioComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ExperimentStudioComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    window.IntersectionObserver = originalIntersectionObserver;
    document.querySelectorAll('.studio-section-test-target').forEach((element) => element.remove());
  });

  it('observes only the three top-level studio sections', () => {
    createSection('variables-top', 0);
    createSection('data-model-visualization', 24);
    createSection('parameters-listing', 48);
    createSection('statistics-section', 400);
    createSection('algorithm-section', 800);

    (component as any).setupSectionObserver();

    expect(MockIntersectionObserver.instances.length).toBe(1);
    expect(MockIntersectionObserver.instances[0].observed.map((element) => element.id)).toEqual([
      'variables-top',
      'statistics-section',
      'algorithm-section',
    ]);
  });

  it('sets the active section to the section nearest the top offset', () => {
    createSection('variables-top', -600);
    createSection('statistics-section', 80);
    createSection('algorithm-section', 700);

    (component as any).setupSectionObserver();

    expect(component.activeSection()).toBe('statistics-section');
  });

  it('uses the final section when scrolled to the bottom of the page', () => {
    createSection('variables-top', -1200);
    createSection('statistics-section', -400);
    createSection('algorithm-section', 180);
    setScrollState(1200, 800, 2000);

    (component as any).setupSectionObserver();

    expect(component.activeSection()).toBe('algorithm-section');
  });

  it('maps the legacy studio-top fragment to the variables section', () => {
    expect((component as any).getScrollTargetId('studio-top')).toBe('variables-top');
    expect((component as any).getScrollTargetId('algorithm-section')).toBe('algorithm-section');
  });

  it('registers the header-aware router scroll offset while active', () => {
    fixture.detectChanges();

    const offsetFactory = viewportScroller.setOffset.calls.first().args[0] as () => [number, number];
    expect(offsetFactory()).toEqual([0, getExperimentStudioScrollOffset()]);

    fixture.destroy();

    expect(viewportScroller.setOffset).toHaveBeenCalledWith([0, 0]);
  });

  it('scrolls fragment targets below the fixed header', () => {
    createSection('variables-top', 250);
    setScrollState(300, 800, 5000);
    spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
      callback(0);
      return 0;
    });
    const scrollSpy = spyOn(window, 'scrollTo');

    (component as any).scrollToHash('variables-top');

    expect(scrollSpy).toHaveBeenCalled();
    expect(scrollSpy.calls.mostRecent().args[0] as ScrollToOptions).toEqual({
      top: Math.max(window.scrollY + 250 - getExperimentStudioScrollOffset(), 0),
      behavior: 'smooth',
    });
  });

  it('waits for statistics fragment navigation before scrolling a nested descriptive step', async () => {
    const statisticPanel = { goToSection: jasmine.createSpy('goToSection') };
    (component as any).statisticPanel = statisticPanel;
    const navigateSpy = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
      callback(0);
      return 0;
    });

    component.goToDescriptiveStep('processed');

    expect(statisticPanel.goToSection).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(navigateSpy).toHaveBeenCalledWith([], {
      fragment: 'statistics-section',
      queryParamsHandling: 'preserve',
    });
    expect(statisticPanel.goToSection).toHaveBeenCalledWith('processed');
  });

  function createSection(id: string, top: number): HTMLElement {
    const section = document.createElement('section');
    section.id = id;
    section.className = 'studio-section-test-target';
    section.getBoundingClientRect = () => ({
      top,
      bottom: top + 300,
      left: 0,
      right: 100,
      width: 100,
      height: 300,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    document.body.appendChild(section);
    return section;
  }

  function setScrollState(scrollY: number, innerHeight: number, scrollHeight: number): void {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: scrollY,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: innerHeight,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: scrollHeight,
    });
  }
});
