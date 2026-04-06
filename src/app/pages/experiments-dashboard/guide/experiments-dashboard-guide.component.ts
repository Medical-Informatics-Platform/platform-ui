import { CommonModule, DOCUMENT } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import {
  EXPERIMENTS_DASHBOARD_GUIDE_STEPS,
  EXPERIMENT_STUDIO_GUIDE_LABELS,
  ExperimentsDashboardGuideStep,
} from './experiments-dashboard-guide.content';

interface GuideRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

@Component({
  selector: 'app-experiments-dashboard-guide',
  imports: [CommonModule],
  templateUrl: './experiments-dashboard-guide.component.html',
  styleUrls: ['./experiments-dashboard-guide.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onViewportChange()',
    '(window:scroll)': 'onViewportChange()',
    '(window:keydown)': 'onWindowKeydown($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ExperimentsDashboardGuideComponent implements AfterViewInit {
  private readonly document = inject(DOCUMENT);
  private readonly autoStartStorageKey = 'mip.guide.experiments-dashboard.autostarted';
  private layoutTimer: number | null = null;

  @ViewChild('guideCard')
  private guideCard?: ElementRef<HTMLElement>;

  readonly labels = EXPERIMENT_STUDIO_GUIDE_LABELS;
  readonly isOpen = signal(false);
  readonly activeSteps = signal<ExperimentsDashboardGuideStep[]>([]);
  readonly currentIndex = signal(0);
  readonly highlightRect = signal<GuideRect | null>(null);
  readonly isCollapsed = signal(false);

  readonly currentStep = computed(() => this.activeSteps()[this.currentIndex()] ?? null);
  readonly previousStep = computed(() => {
    const previousIndex = this.getNavigableStepIndex(this.currentIndex() - 1, -1);
    return previousIndex === null ? null : this.activeSteps()[previousIndex] ?? null;
  });
  readonly totalSteps = computed(() => this.countVisibleSteps());
  readonly currentStepNumber = computed(() => this.getCurrentStepNumber());
  readonly progressPercent = computed(() => {
    const total = this.totalSteps();
    return total ? (this.currentStepNumber() / total) * 100 : 0;
  });
  readonly hasPrevious = computed(() => this.previousStep() !== null);
  readonly canGoToPrevious = computed(() => this.hasPrevious() && !this.previousStep()?.advanceOnTargetClick);
  readonly isLastStep = computed(() => this.getNavigableStepIndex(this.currentIndex() + 1, 1) === null);
  readonly canGoToNext = computed(() => this.isStepRequirementSatisfied(this.currentStep()));
  readonly stepNeedsAction = computed(() => !!this.currentStep()?.advanceOnTargetClick && !this.canGoToNext());
  readonly nextButtonLabel = computed(() =>
    this.stepNeedsAction() ? 'Action required' : (this.isLastStep() ? this.labels.done : this.labels.next)
  );
  readonly pendingRequirementHint = computed(() => {
    const step = this.currentStep();
    if (!step || this.canGoToNext()) {
      return null;
    }

    return step.requirementHint ?? 'Use the highlighted element to continue.';
  });

  ngAfterViewInit(): void {
    window.setTimeout(() => this.startGuide(false), 900);
  }

  startGuide(manual = true): void {
    if (!manual && this.hasAutoStarted()) {
      return;
    }

    const resolvedSteps = this.resolveSteps();
    if (!resolvedSteps.length) {
      return;
    }

    if (!this.hasAutoStarted()) {
      this.markAutoStarted();
    }

    this.activeSteps.set(resolvedSteps);
    this.currentIndex.set(this.getNavigableStepIndex(0, 1) ?? 0);
    this.isCollapsed.set(false);
    this.isOpen.set(true);
    this.syncStepLayout();
  }

  closeGuide(): void {
    this.isOpen.set(false);
    this.activeSteps.set([]);
    this.currentIndex.set(0);
    this.highlightRect.set(null);
    this.isCollapsed.set(false);
    this.clearLayoutTimer();
  }

  goToNextStep(force = false): void {
    if (!force && !this.canGoToNext()) {
      return;
    }

    const nextIndex = this.getNavigableStepIndex(this.currentIndex() + 1, 1);
    if (nextIndex === null) {
      this.closeGuide();
      return;
    }

    this.currentIndex.set(nextIndex);
    this.syncStepLayout();
  }

  goToPreviousStep(): void {
    if (!this.canGoToPrevious()) {
      return;
    }

    const previousIndex = this.getNavigableStepIndex(this.currentIndex() - 1, -1);
    if (previousIndex === null) {
      return;
    }

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
        this.goToNextStep(true);
      }
    }, 260);
  }

  private resolveSteps(): ExperimentsDashboardGuideStep[] {
    return [...EXPERIMENTS_DASHBOARD_GUIDE_STEPS];
  }

  private syncStepLayout(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    const target = step.selector ? this.findTarget(step.selector) : null;
    if (target) {
      const headerOffset = this.getHeaderOffset();
      const top = Math.max(window.scrollY + target.getBoundingClientRect().top - headerOffset, 0);
      window.scrollTo({ top, behavior: 'smooth' });
    }

    this.scheduleLayoutUpdate(target ? 260 : 0);
  }

  private getHeaderOffset(): number {
    const rootStyles = getComputedStyle(this.document.documentElement);
    const headerHeight = Number.parseFloat(rootStyles.getPropertyValue('--header-height')) || 0;
    return headerHeight + 12;
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

  private updateLayout(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    const target = step.selector ? this.findTarget(step.selector) : null;
    this.highlightRect.set(target ? this.expandRect(target.getBoundingClientRect()) : null);

    window.setTimeout(() => {
      this.guideCard?.nativeElement.focus();
    }, 0);
  }

  private isStepRequirementSatisfied(step: ExperimentsDashboardGuideStep | null): boolean {
    return !step?.advanceOnTargetClick;
  }

  private countVisibleSteps(): number {
    let count = 0;
    const steps = this.activeSteps();

    for (let index = 0; index < steps.length; index += 1) {
      if (this.isStepVisible(steps[index], index)) {
        count += 1;
      }
    }

    return count;
  }

  private getCurrentStepNumber(): number {
    if (!this.currentStep()) {
      return 0;
    }

    let visibleIndex = 0;
    const steps = this.activeSteps();

    for (let index = 0; index < steps.length; index += 1) {
      if (this.isStepVisible(steps[index], index)) {
        visibleIndex += 1;
      }

      if (index === this.currentIndex()) {
        return visibleIndex;
      }
    }

    return 0;
  }

  private isStepVisible(step: ExperimentsDashboardGuideStep | undefined, index: number): boolean {
    if (!step) {
      return false;
    }

    return index === this.currentIndex() || !this.isOptionalStepUnavailable(step);
  }

  private isOptionalStepUnavailable(step: ExperimentsDashboardGuideStep): boolean {
    return !!step.optional && !!step.selector && !this.findTarget(step.selector);
  }

  private getNavigableStepIndex(startIndex: number, direction: 1 | -1): number | null {
    const steps = this.activeSteps();

    for (let index = startIndex; index >= 0 && index < steps.length; index += direction) {
      if (!this.isOptionalStepUnavailable(steps[index])) {
        return index;
      }
    }

    return null;
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

  private hasAutoStarted(): boolean {
    try {
      return localStorage.getItem(this.autoStartStorageKey) === 'true';
    } catch {
      return false;
    }
  }

  private markAutoStarted(): void {
    try {
      localStorage.setItem(this.autoStartStorageKey, 'true');
    } catch {
      // Ignore storage failures and keep the guide functional.
    }
  }
}
