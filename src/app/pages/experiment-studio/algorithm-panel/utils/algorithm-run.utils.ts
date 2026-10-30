import { AlgorithmAvailabilityDetail, AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { AlgorithmNeedItem, AlgorithmRunRequirement, StudioVariable } from '../algorithm-panel.models';
import { needsRequirementText } from './algorithm-availability-text.utils';

/** What the needs list is built from. */
interface AlgorithmNeedsInput {
  algorithm: AlgorithmConfig;
  details: readonly AlgorithmAvailabilityDetail[];
  /** An outcome is assigned (it is ignored by methods without one). */
  hasOutcome: boolean;
  /** "Remove variables not available in: …", or ''. */
  unavailableVariablesReason: string;
  requirements: readonly AlgorithmRunRequirement[];
}

/** The needs list: one line per role (outcome, then predictors), unavailable variables, then run blockers with actions. */
export function buildAlgorithmNeeds(input: AlgorithmNeedsInput): AlgorithmNeedItem[] {
  const needs: AlgorithmNeedItem[] = [];
  const detailByRole = new Map(input.details.map((detail) => [detail.role, detail]));

  for (const role of ['y', 'x'] as const) {
    const detail = detailByRole.get(role);
    if (detail) {
      needs.push({
        key: `needs-${role}`,
        met: detail.messages.length === 0,
        title: needsRequirementText(detail),
        messages: [...detail.messages],
      });
    } else if (role === 'y' && !('y' in (input.algorithm.inputdata ?? {}))) {
      needs.push({
        key: 'needs-y',
        met: true,
        title: 'No outcome needed',
        messages: input.hasOutcome ? ['Your outcome is ignored'] : [],
      });
    }
  }

  if (input.unavailableVariablesReason) {
    needs.push({ key: 'unavailable-variables', met: false, title: input.unavailableVariablesReason, messages: [] });
  }

  input.requirements.forEach((requirement) => {
    needs.push({ key: `run-${requirement.id}`, met: false, title: requirement.message, messages: [], action: requirement });
  });

  return needs;
}

/** What the run bar's status line is built from. */
interface ReadinessInput {
  algorithm: AlgorithmConfig | null;
  canRun: boolean;
  needs: readonly AlgorithmNeedItem[];
  y: readonly StudioVariable[];
  x: readonly StudioVariable[];
}

/** "Pick a method to continue", "2 things left — …", or "Ready · Method · y Outcome · 2 predictors". */
export function readinessText({ algorithm, canRun, needs, y, x }: ReadinessInput): string {
  if (!algorithm) return 'Pick a method to continue';

  if (!canRun) {
    const reasons = needs
      .filter((need) => !need.met)
      .flatMap((need) => (need.action ? [need.title] : need.messages))
      .filter((message) => !!message);
    if (!reasons.length) return 'Not ready to run yet';
    return `${reasons.length} ${reasons.length === 1 ? 'thing' : 'things'} left — ${reasons.slice(0, 2).join(' · ')}${reasons.length > 2 ? ` +${reasons.length - 2}` : ''}`;
  }

  const outcome = y[0] ? ` · y ${y[0].label ?? y[0].name ?? y[0].code}` : '';
  const predictors = ` · ${x.length} ${x.length === 1 ? 'predictor' : 'predictors'}`;
  return `Ready · ${algorithm.label}${outcome}${predictors}`;
}

/** Cross-validation lookups of ExperimentStudioService the run naming needs. */
export interface CrossValidationCatalog {
  isCrossValidationOnly(name: string): boolean;
  getCrossValidationBase(name: string): string | null;
  getCrossValidationVariant(baseName: string): string | null;
}

/** Which algorithm names a run uses. */
export interface RunAlgorithmNames {
  /** The base method; its config is stored under this name. */
  baseName: string;
  /** The cross-validation variant when it runs, else the base. */
  effectiveName: string;
  /** The name sent and recorded as the run's algorithm. */
  finalName: string;
  /** Whether `n_splits` stays in the parameters. */
  includeSplits: boolean;
}

/** Resolves base, variant and sent names for running `algorithmName` with cross-validation on or off. */
export function resolveRunAlgorithmNames(
  algorithmName: string,
  crossValidationEnabled: boolean,
  catalog: CrossValidationCatalog,
): RunAlgorithmNames {
  const isCvOnly = catalog.isCrossValidationOnly(algorithmName);
  const baseName = isCvOnly ? algorithmName : catalog.getCrossValidationBase(algorithmName) ?? algorithmName;
  const variant = catalog.getCrossValidationVariant(baseName);
  const includeSplits = crossValidationEnabled || isCvOnly;
  const effectiveName = includeSplits && variant ? variant : baseName;
  return { baseName, effectiveName, finalName: isCvOnly ? algorithmName : effectiveName, includeSplits };
}
