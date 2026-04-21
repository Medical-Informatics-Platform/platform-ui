import { CommonModule, DOCUMENT } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  EXPERIMENT_STUDIO_GUIDE_LABELS,
  EXPERIMENT_STUDIO_GUIDE_STEPS,
  ExperimentStudioGuideStep,
} from './experiment-studio-guide.content';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { GuideOnboardingService } from '../../../services/guide-onboarding.service';
import { ExperimentStudioGuideStateService } from './experiment-studio-guide-state.service';

interface GuideRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

@Component({
  selector: 'app-experiment-studio-guide',
  imports: [CommonModule],
  templateUrl: './experiment-studio-guide.component.html',
  styleUrls: ['./experiment-studio-guide.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onViewportChange()',
    '(window:scroll)': 'onViewportChange()',
    '(window:keydown)': 'onWindowKeydown($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ExperimentStudioGuideComponent implements AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly experimentStudioService = inject(ExperimentStudioService);
  private readonly guideOnboarding = inject(GuideOnboardingService);
  private readonly guideState = inject(ExperimentStudioGuideStateService);
  private layoutTimer: number | null = null;
  private autoAdvanceTimer: number | null = null;
  private targetResizeObserver: ResizeObserver | null = null;
  private observedTarget: HTMLElement | null = null;
  private domMutationObserver: MutationObserver | null = null;

  @ViewChild('guideCard')
  private guideCard?: ElementRef<HTMLElement>;

  readonly labels = EXPERIMENT_STUDIO_GUIDE_LABELS;
  readonly guideCovariateLabel = this.guideState.guideCovariate.label;
  readonly guideVariableLabel = this.guideState.guideVariable.label;
  readonly isOpen = signal(false);
  readonly activeSteps = signal<ExperimentStudioGuideStep[]>([]);
  readonly currentIndex = signal(0);
  readonly highlightRect = signal<GuideRect | null>(null);
  readonly isCollapsed = signal(false);
  private readonly domRevision = signal(0);
  private readonly experimentSaveBaselineUuid = signal<string | null | undefined>(undefined);

  readonly currentStep = computed(() => this.activeSteps()[this.currentIndex()] ?? null);
  readonly previousStep = computed(() => this.activeSteps()[this.currentIndex() - 1] ?? null);
  readonly totalSteps = computed(() => this.activeSteps().length);
  readonly currentStepNumber = computed(() => (this.currentStep() ? this.currentIndex() + 1 : 0));
  readonly progressPercent = computed(() => {
    const total = this.totalSteps();
    return total ? (this.currentStepNumber() / total) * 100 : 0;
  });
  readonly hasPrevious = computed(() => this.currentIndex() > 0);
  readonly canGoToPrevious = computed(() => this.hasPrevious() && !this.previousStep()?.requirement);
  readonly isLastStep = computed(() => this.currentIndex() >= this.totalSteps() - 1);
  readonly canGoToNext = computed(() => this.isStepRequirementSatisfied(this.currentStep()));
  readonly stepNeedsAction = computed(() => !!this.currentStep()?.requirement && !this.canGoToNext());
  readonly isDashboardStep = computed(() => this.currentStep()?.id === 'experiment-finish');
  readonly nextButtonLabel = computed(() =>
    this.stepNeedsAction()
      ? 'Action required'
      : this.isDashboardStep()
        ? this.labels.moveToDashboard
        : this.isLastStep()
          ? this.labels.done
          : this.labels.next
  );
  readonly pendingRequirementHint = computed(() => {
    const step = this.currentStep();
    if (!step?.requirement || this.canGoToNext()) {
      return null;
    }

    switch (step.requirement) {
      case 'selected-sex':
        return this.replaceGuideTargets('Either use the search bar to find the Sex variable or click the green-highlighted variable through the bubble chart to continue.');
      case 'covariate-sex':
        return 'Click "+ Covariates" button in order to continue.';
      case 'selected-age':
        return this.replaceGuideTargets('Either use the search bar to find the Age variable or click the green-highlighted variable through the bubble chart to continue.');
      case 'variable-age':
        return 'Click "+ Variables" button in order to continue.';
      case 'algorithm-selected':
        return 'Select any available algorithm with a green tick to continue.';
      case 'experiment-result-ready':
        return 'Run the experiment and wait for the result view to load before continuing.';
      case 'save-as-opened':
        return 'Click Save As to open the save form and continue.';
      case 'experiment-saved-as':
        return 'Enter a name and click Save. The guide continues automatically once the experiment has been saved.';
      default:
        return null;
    }
  });

  constructor() {
    effect(() => {
      this.guideState.setActiveStep(this.isOpen() ? this.currentStep()?.id ?? null : null);
    });

    effect(() => {
      const step = this.currentStep();

      if (!this.isOpen() || step?.requirement !== 'experiment-saved-as') {
        this.experimentSaveBaselineUuid.set(undefined);
        return;
      }

      const currentUuid = this.experimentStudioService.currentExperimentUUID();
      if (this.experimentSaveBaselineUuid() === undefined) {
        this.experimentSaveBaselineUuid.set(currentUuid);
      }
    });

    effect(() => {
      this.experimentStudioService.selectedVariables();
      this.experimentStudioService.selectedCovariates();
      this.experimentStudioService.selectedAlgorithm();
      this.experimentStudioService.currentExperimentUUID();
      this.guideState.selectedHierarchyNode();
      const step = this.currentStep();

      if (
        !this.isOpen() ||
        !step?.requirement ||
        !this.shouldAutoAdvance(step) ||
        !this.isStepRequirementSatisfied(step)
      ) {
        this.clearAutoAdvanceTimer();
        return;
      }

      this.clearAutoAdvanceTimer();
      this.autoAdvanceTimer = window.setTimeout(() => {
        if (this.isOpen() && this.currentStep()?.id === step.id && this.isStepRequirementSatisfied(step)) {
          this.goToNextStep();
        }
      }, 320);
    });
  }

  ngAfterViewInit(): void {
    window.setTimeout(() => this.startGuide(false), 900);
  }

  ngOnDestroy(): void {
    this.disconnectTargetObserver();
    this.disconnectDomObserver();
    this.clearLayoutTimer();
    this.clearAutoAdvanceTimer();
  }

  startGuide(manual = true): void {
    if (!manual && this.guideOnboarding.hasSeenStudioGuide()) {
      return;
    }

    const warning = this.experimentStudioService.pathologyAccessWarning();
    let resolvedSteps: ExperimentStudioGuideStep[];

    if (warning) {
      resolvedSteps = [{
        id: 'no-pathology-access',
        section: 'Explore',
        title: 'No Access to Federation Pathologies',
        body: '',
        selector: '.pathology-warning-banner',
        allowTargetInteraction: false
      }];
    } else {
      resolvedSteps = this.resolveSteps();
      if (!resolvedSteps.length) {
        return;
      }
    }

    this.activeSteps.set(resolvedSteps);
    this.currentIndex.set(0);
    this.isCollapsed.set(false);
    this.isOpen.set(true);
    this.startDomObserver();
    this.syncStepLayout();
  }

  closeGuide(): void {
    this.guideOnboarding.markStudioGuideSeen();
    this.isOpen.set(false);
    this.isCollapsed.set(false);
    this.activeSteps.set([]);
    this.currentIndex.set(0);
    this.highlightRect.set(null);
    this.disconnectTargetObserver();
    this.disconnectDomObserver();
    this.clearLayoutTimer();
    this.clearAutoAdvanceTimer();
  }

  goToNextStep(): void {
    if (!this.canGoToNext()) {
      return;
    }

    if (this.isDashboardStep()) {
      this.closeGuide();
      void this.router.navigate(['/experiments-dashboard']);
      return;
    }

    if (this.isLastStep()) {
      this.closeGuide();
      return;
    }

    const nextIndex = this.currentIndex() + 1;
    this.currentIndex.set(nextIndex);
    this.syncStepLayout();
  }

  goToPreviousStep(): void {
    if (!this.canGoToPrevious()) {
      return;
    }

    const previousIndex = this.currentIndex() - 1;
    this.currentIndex.set(previousIndex);
    this.syncStepLayout();
  }

  toggleCollapsed(): void {
    this.isCollapsed.update((collapsed) => !collapsed);
    this.scheduleLayoutUpdate(0);
  }

  onViewportChange(): void {
    if (!this.isOpen()) {
      return;
    }

    this.scheduleLayoutUpdate(0);
  }

  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeGuide();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.goToNextStep();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.goToPreviousStep();
    }
  }

  onDocumentClick(event: MouseEvent): void {
    const step = this.currentStep();
    if (!this.isOpen() || !step?.advanceOnTargetClick || !step.selector) {
      return;
    }

    const clickedNode = event.target;
    if (!(clickedNode instanceof Node)) {
      return;
    }

    const target = this.findTarget(step.selector);
    if (!target || !target.contains(clickedNode)) {
      return;
    }

    window.setTimeout(() => {
      if (this.isOpen() && this.currentStep()?.id === step.id) {
        this.goToNextStep();
      }
    }, 260);
  }

  private resolveSteps(): ExperimentStudioGuideStep[] {
    return EXPERIMENT_STUDIO_GUIDE_STEPS.map((step) => ({
      ...step,
      title: this.replaceGuideTargets(step.title),
      body: this.replaceGuideTargets(step.body),
    }));
  }

  private replaceGuideTargets(text: string): string {
    return text
      .replace(/\bSex\b/g, this.guideCovariateLabel)
      .replace(/\bAge\b/g, this.guideVariableLabel)
      .replace(/\{\{GUIDE_COVARIATE\}\}/g, this.guideCovariateLabel)
      .replace(/\{\{GUIDE_VARIABLE\}\}/g, this.guideVariableLabel);
  }

  private syncStepLayout(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    const target = step.selector ? this.findTarget(step.selector) : null;
    this.observeTarget(target);
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: this.getScrollBlock(step),
        inline: 'nearest',
      });
    }

    this.scheduleLayoutUpdate(target ? 260 : 0);
  }

  private scheduleLayoutUpdate(delayMs: number): void {
    this.clearLayoutTimer();
    this.layoutTimer = window.setTimeout(() => this.updateLayout(), delayMs);
  }

  private clearLayoutTimer(): void {
    if (this.layoutTimer !== null) {
      window.clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
  }

  private clearAutoAdvanceTimer(): void {
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  private observeTarget(target: HTMLElement | null): void {
    if (this.observedTarget === target) {
      return;
    }

    this.disconnectTargetObserver();
    this.observedTarget = target;

    if (!target || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.targetResizeObserver = new ResizeObserver(() => {
      if (this.isOpen()) {
        this.scheduleLayoutUpdate(0);
      }
    });
    this.targetResizeObserver.observe(target);
  }

  private disconnectTargetObserver(): void {
    this.targetResizeObserver?.disconnect();
    this.targetResizeObserver = null;
    this.observedTarget = null;
  }

  private startDomObserver(): void {
    if (this.domMutationObserver || typeof MutationObserver === 'undefined') {
      return;
    }

    const root = this.document.querySelector('.studio-main');
    if (!(root instanceof HTMLElement)) {
      return;
    }

    this.domMutationObserver = new MutationObserver(() => {
      this.domRevision.update((revision) => revision + 1);
      if (this.isOpen()) {
        this.scheduleLayoutUpdate(0);
      }
    });

    this.domMutationObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  private disconnectDomObserver(): void {
    this.domMutationObserver?.disconnect();
    this.domMutationObserver = null;
  }

  private updateLayout(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    const target = step.selector ? this.findTarget(step.selector) : null;
    this.highlightRect.set(target ? this.expandRect(target.getBoundingClientRect()) : null);
    window.setTimeout(() => this.guideCard?.nativeElement.focus(), 0);
  }

  private getScrollBlock(step: ExperimentStudioGuideStep): ScrollLogicalPosition {
    return step.selector === '[data-guide="analysis-section"]'
      || step.selector === '[data-guide="experiment-workspace"]'
      ? 'start'
      : 'center';
  }

  private expandRect(rect: DOMRect, padding = 10): GuideRect {
    const left = rect.left - padding;
    const top = rect.top - padding;
    const right = rect.right + padding;
    const bottom = rect.bottom + padding;

    return {
      top,
      left,
      right,
      bottom,
      width: Math.max(right - left, 0),
      height: Math.max(bottom - top, 0),
    };
  }

  private findTarget(selector: string): HTMLElement | null {
    const target = this.document.querySelector(selector);
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return target;
  }

  private isStepRequirementSatisfied(step: ExperimentStudioGuideStep | null): boolean {
    if (!step?.requirement) {
      return true;
    }

    this.domRevision();

    switch (step.requirement) {
      case 'selected-sex':
        return this.hasSelectedHierarchyNode(this.guideState.guideCovariate.value);
      case 'covariate-sex':
        return this.hasCovariate(this.guideState.guideCovariate.value);
      case 'selected-age':
        return this.hasCovariate(this.guideState.guideCovariate.value)
          && this.hasSelectedHierarchyNode(this.guideState.guideVariable.value);
      case 'variable-age':
        return this.hasCovariate(this.guideState.guideCovariate.value)
          && this.hasVariable(this.guideState.guideVariable.value);
      case 'algorithm-selected':
        return !!this.experimentStudioService.selectedAlgorithm();
      case 'experiment-result-ready':
        return !!this.findTarget('[data-guide="experiment-result"]');
      case 'save-as-opened':
        return !!this.findTarget('[data-guide="save-as-form"]');
      case 'experiment-saved-as': {
        const baselineUuid = this.experimentSaveBaselineUuid();
        const currentUuid = this.experimentStudioService.currentExperimentUUID();
        return baselineUuid !== undefined
          && !!currentUuid
          && currentUuid !== baselineUuid
          && !this.findTarget('[data-guide="experiment-result"]');
      }
      default:
        return true;
    }
  }

  private shouldAutoAdvance(step: ExperimentStudioGuideStep | null): boolean {
    return step?.requirement === 'selected-sex'
      || step?.requirement === 'covariate-sex'
      || step?.requirement === 'selected-age'
      || step?.requirement === 'variable-age'
      || step?.requirement === 'algorithm-selected'
      || step?.requirement === 'experiment-result-ready'
      || step?.requirement === 'save-as-opened'
      || step?.requirement === 'experiment-saved-as';
  }

  private hasCovariate(expected: string): boolean {
    return this.experimentStudioService.selectedCovariates().some((node) =>
      this.guideState.matchesTutorialCovariate(node, expected)
    );
  }

  private hasVariable(expected: string): boolean {
    return this.experimentStudioService.selectedVariables().some((node) =>
      this.guideState.matchesTutorialCovariate(node, expected)
    );
  }

  private hasSelectedHierarchyNode(expected: string): boolean {
    return this.guideState.matchesTutorialCovariate(this.guideState.selectedHierarchyNode(), expected);
  }

}
