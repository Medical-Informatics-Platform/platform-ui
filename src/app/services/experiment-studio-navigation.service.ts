import { Injectable } from '@angular/core';

export type ExperimentStudioSection = 'variables-top' | 'statistics-section' | 'algorithm-section';
export type DescriptiveStep = 'raw' | 'setup' | 'filters' | 'processed';

export interface ExperimentStudioNavigationHost {
  navigateToSection(sectionId: ExperimentStudioSection, anchorId?: string): void;
  navigateToDescriptiveStep(step: DescriptiveStep): void;
}

@Injectable({ providedIn: 'root' })
export class ExperimentStudioNavigationService {
  private host: ExperimentStudioNavigationHost | null = null;

  register(host: ExperimentStudioNavigationHost): void {
    this.host = host;
  }

  unregister(host: ExperimentStudioNavigationHost): void {
    if (this.host === host) {
      this.host = null;
    }
  }

  goToVariableSelection(anchorId = 'parameters-listing'): void {
    this.host?.navigateToSection('variables-top', anchorId);
  }

  goToPreprocessing(): void {
    this.host?.navigateToSection('statistics-section');
    this.host?.navigateToDescriptiveStep('setup');
  }
}
