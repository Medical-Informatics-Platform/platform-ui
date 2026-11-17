import { Injectable, signal } from '@angular/core';

export type AnalysisStudioSection =
  | 'variables-top'
  | 'statistics-section'
  | 'algorithm-section'
  | 'execution-section';
export type DescriptiveStep = 'raw' | 'setup' | 'filters' | 'processed' | 'transformation';

export type StepState = 'active' | 'available' | 'complete' | 'locked';

interface StudioStepperState {
  activeSection: AnalysisStudioSection;
  railStatus: Record<AnalysisStudioSection, StepState>;
  lockedStepReason: string;
  /** Per-step override of `lockedStepReason` for steps that unlock on something else. */
  lockedStepReasons: Partial<Record<AnalysisStudioSection, string>>;
  isRunning: boolean;
}

export interface AnalysisStudioNavigationHost {
  navigateToSection(sectionId: AnalysisStudioSection, anchorId?: string): void;
  navigateToDescriptiveStep(step: DescriptiveStep): void;
  runAnalysis(): void;
  backToDashboard(): void;
}

const DEFAULT_STATE: StudioStepperState = {
  activeSection: 'variables-top',
  railStatus: {
    'variables-top': 'active',
    'statistics-section': 'locked',
    'algorithm-section': 'locked',
    'execution-section': 'locked',
  },
  lockedStepReason: 'Add a dataset to unlock',
  lockedStepReasons: {},
  isRunning: false,
};

@Injectable({ providedIn: 'root' })
export class AnalysisStudioNavigationService {
  private host: AnalysisStudioNavigationHost | null = null;

  readonly state = signal<StudioStepperState>(DEFAULT_STATE);

  register(host: AnalysisStudioNavigationHost): void {
    this.host = host;
  }

  unregister(host: AnalysisStudioNavigationHost): void {
    if (this.host === host) {
      this.host = null;
      this.state.set(DEFAULT_STATE);
    }
  }

  publishState(partial: Partial<StudioStepperState>): void {
    this.state.update((current) => ({ ...current, ...partial }));
  }

  navigateToSection(sectionId: AnalysisStudioSection, anchorId?: string): void {
    this.host?.navigateToSection(sectionId, anchorId);
  }

  navigateToDescriptiveStep(step: DescriptiveStep): void {
    this.host?.navigateToDescriptiveStep(step);
  }

  runAnalysis(): void {
    this.host?.runAnalysis();
  }

  backToDashboard(): void {
    this.host?.backToDashboard();
  }

  goToPreprocessing(): void {
    this.host?.navigateToSection('statistics-section');
    this.host?.navigateToDescriptiveStep('setup');
  }
}
