import { Injectable, computed, inject, signal } from '@angular/core';
import { RuntimeEnvService } from '../../../services/runtime-env.service';

@Injectable({ providedIn: 'root' })
export class ExperimentStudioGuideStateService {
  private readonly runtimeEnv = inject(RuntimeEnvService);
  private readonly activeStepIdSignal = signal<string | null>(null);
  private readonly selectedHierarchyNodeSignal = signal<{ code?: unknown; label?: unknown; name?: unknown } | null>(null);

  readonly activeStepId = this.activeStepIdSignal.asReadonly();
  readonly selectedHierarchyNode = this.selectedHierarchyNodeSignal.asReadonly();
  readonly guideCovariate = this.runtimeEnv.guideCovariate;
  readonly guideVariable = this.runtimeEnv.guideVariable;
  readonly expectedTutorialCovariate = computed(() => {
    switch (this.activeStepIdSignal()) {
      case 'select-sex-variable':
      case 'add-sex-covariate':
        return this.guideCovariate.value;
      case 'select-age-variable':
      case 'add-age-variable':
        return this.guideVariable.value;
      default:
        return null;
    }
  });

  setActiveStep(stepId: string | null): void {
    this.activeStepIdSignal.set(stepId);
  }

  setSelectedHierarchyNode(node: { code?: unknown; label?: unknown; name?: unknown } | null): void {
    this.selectedHierarchyNodeSignal.set(node);
  }

  matchesTutorialCovariate(node: { code?: unknown; label?: unknown; name?: unknown } | null | undefined, expected?: string | null): boolean {
    const target = expected ?? this.expectedTutorialCovariate();
    if (!node || !target) {
      return false;
    }

    const aliases = this.getTutorialAliases(target);
    const candidates = [node.code, node.label, node.name]
      .map((value) => this.normalize(value))
      .filter((value): value is string => !!value);

    return candidates.some((value) => aliases.has(value));
  }

  private getTutorialAliases(target: string): Set<string> {
    switch (this.normalize(target)) {
      case 'sex':
      case 'biolsex':
      case 'biologicalsex':
      case 'sexatbirth':
        return new Set(['sex', 'biolsex', 'biologicalsex', 'sexatbirth']);
      case 'age':
        return new Set(['age']);
      default:
        return new Set([this.normalize(target)]);
    }
  }

  private normalize(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }
}
